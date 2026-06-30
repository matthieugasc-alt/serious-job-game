"use client";

import { useEffect, useMemo, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
import {
  initializeSession,
  buildRuntimeView,
  addPlayerMessage,
  addAIMessage,
  applyEvaluation,
  updateAdaptiveMode,
  scheduleInterruption,
  flushDueTimedEvents,
  tickSimulatedTime,
  injectPhaseEntryEvents,
  completeCurrentPhaseAndAdvance,
  finishScenario,
  updateMailDraft,
  toggleMailAttachment,
  sendCurrentPhaseMail,
  filterDocumentsByPhase,
  addInboxMail,
  checkNpcFailureKeywords,
  checkNpcSuccessKeywords,
  handlePhaseFailure,
  isCurrentPhaseValidatedByRules,
  unlockCurrentPhase,
  addSystemMessage,
} from "@/app/lib/runtime";
import type { ScenarioDefinition } from "@/app/lib/types";
import { computeVisibleContacts } from "@/app/lib/contactVisibility";
import { buildChatContext } from "@/app/lib/chatContextEnrichment";
import {
  startVoiceCapture,
  detectVoiceCapabilities,
  type VoiceCaptureSession,
  type VoiceCaptureResult,
  type VoiceCaptureCapabilities,
  type VoiceCaptureErrorCategory,
} from "@/app/lib/voiceCapture";
import { useDebrief } from "./hooks/useDebrief";
import { useScenarioInit } from "./hooks/useScenarioInit";
import DocumentsView from "./DocumentsView";
import MailView from "./MailView";
import DebriefView from "./DebriefView";
import NotesView from "./NotesView";
import ChatView from "./ChatView";
import { usePhaseTimer } from "./hooks/usePhaseTimer";
import { resolvePhaseHandler, InterviewHandler, ContractHandler, resolveModules, dispatch, buildModuleContext } from "./handlers";
import { runContractNegotiation, detectsExclusivity as detectsExcl } from "./handlers/contractNegotiationSenders";
import type { ModuleAction, ContractModuleContext } from "./handlers";
import type { MailModuleExtra } from "./handlers";
import { applyModuleActions as applyModuleActionsImpl, type ApplyModuleActionsDeps } from "./handlers/applyModuleActions";
import { executeMailAsyncEffect as executeMailAsyncEffectImpl, type ExecuteMailAsyncEffectDeps } from "./handlers/executeMailAsyncEffect";
import { cloneSession, playNotificationSound, fmtTime, getInitials, STATUS_COLORS } from "./lib/playerUtils";
import { parseOutlineText, outlineToText, mkOutlineId, type OutlineItem } from "./lib/outlineParser";
import { ESTABLISHMENT_MAP, resolveEstablishment, resolveMailPlaceholders } from "./lib/establishmentMap";
import { Avatar, TypingDots, StatusDot } from "./components/Avatars";
import { ToastContainer } from "./components/ToastContainer";
import { ResumeBanner, SaveInfo } from "./components/ResumeBanner";
import { PlayerHeader } from "./components/PlayerHeader";
import { DebugPanel } from "./components/DebugPanel";
import { InlineDocModal } from "./components/InlineDocModal";
import { BriefingOverlay } from "./components/BriefingOverlay";
import { OnePagerEditor } from "./components/OnePagerEditor";
import { RightPanel } from "./components/RightPanel";
import { LeftSidebar } from "./components/LeftSidebar";
import { useToasts } from "./hooks/useToasts";
import { useFounderCheckpoint } from "./hooks/useFounderCheckpoint";
import { useOnePagerEditor } from "./hooks/useOnePagerEditor";
import { useTTS } from "./hooks/useTTS";
import { useOutlineNotes } from "./hooks/useOutlineNotes";
import { useExceptionsContract } from "./hooks/useExceptionsContract";
import { useClinicalContract } from "./hooks/useClinicalContract";
import { useDevisNegotiation } from "./hooks/useDevisNegotiation";
import { useNovadevContract } from "./hooks/useNovadevContract";
import { usePacteContract } from "./hooks/usePacteContract";
import {
  fireSessionStarted,
  firePhaseStarted,
  firePlayerMessage,
  fireAIMessage,
  fireMailSent,
  fireContractSigned,
  firePhaseCompleted,
  fireScenarioCompleted,
  firePhaseAbandoned,
} from "@/app/lib/gameEvents/client";
import {
  type ContractClause,
  type ContractThreadMessage,
  type DealTerms,
  detectsExclusivity,
  detectsAcceptance,
  sendNegotiationMessage,
  applyModifications,
  ContractOverlay,
  ContractOverlayHost,
  ClinicalContractOverlay,
  DEVIS_FEATURES_DATA,
  parseDealTag,
} from "./contracts";

// ════════════════════════════════════════════════════════════════════
// CONSTANTS & HELPERS
// ════════════════════════════════════════════════════════════════════

type MainView = "chat" | "mail" | "docs" | "context" | "notes";

// Helpers + visual atoms extracted to ./lib/* and ./components/Avatars.

// ════════════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ════════════════════════════════════════════════════════════════════

export default function PlayPage({ params }: { params: Promise<{ scenarioId: string }> }) {
  const router = useRouter();
  const { scenarioId } = use(params);

  // ── Debug mode: activate with ?debug=1 in URL, toggle with Ctrl+D ──
  const [debugMode, setDebugMode] = useState(false);
  const [debugCollapsed, setDebugCollapsed] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const u = new URL(window.location.href);
    if (u.searchParams.get("debug") === "1") setDebugMode(true);
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "d") {
        e.preventDefault();
        setDebugMode((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── State ──
  const [scenario, setScenario] = useState<ScenarioDefinition | null>(null);
  const [session, setSessionRaw] = useState<any>(null);
  // ⚠ TEMPORARY DEBUG WRAPPER — logs every setSession call with the resulting
  // currentPhaseIndex + a stack trace, so we can identify which caller is
  // bouncing the phase from 0 back to 1 after a HARD_REJECT rollback.
  // To remove once the bug is identified.
  const setSession = (next: any) => {
    // ── Defensive validator ────────────────────────────────────────
    // Reject any setSession that would bump the phase index FORWARD
    // into a phase whose prerequisites aren't met. This makes the
    // "HARD_REJECT bounce" bug structurally impossible: any stale
    // closure trying to revive a previous phase-2 state after we
    // rolled back to phase-1 is silently dropped, and the culprit
    // is logged with a full stack trace so we can pin down the
    // offending call site.
    const validate = (candidate: any, prev: any) => {
      if (!candidate || !prev) return candidate;
      const newIdx = candidate.currentPhaseIndex;
      const oldIdx = prev.currentPhaseIndex;
      if (typeof newIdx !== "number" || typeof oldIdx !== "number") return candidate;
      if (newIdx <= oldIdx) return candidate; // never reject rollbacks / no-ops
      const newPhase = candidate.scenario?.phases?.[newIdx];
      const advancement = (newPhase as any)?.advancement;
      // Only guard phases that declare a deterministic prerequisite
      // (advancement.failure_phase + needs chosen_kol_id).
      if (!advancement?.failure_phase) return candidate;
      const chosen = (candidate.flags as any)?.chosen_kol_id;
      if (typeof chosen === "string" && chosen.length > 0) return candidate;
      // eslint-disable-next-line no-console
      console.warn("[S5_SETSESSION_REJECT_BUMP]", {
        attempted_cpi: newIdx,
        prev_cpi: oldIdx,
        new_phase_id: (newPhase as any)?.phase_id,
        chosen_kol_id: chosen,
        stack: new Error().stack,
      });
      // Return the candidate but FORCE its currentPhaseIndex back to prev's
      // value. We preserve the rest of the mutations (e.g. flushDueTimedEvents
      // additions) so we don't drop legitimate side-effects.
      return { ...candidate, currentPhaseIndex: oldIdx };
    };
    try {
      const isFunc = typeof next === "function";
      const stack = new Error().stack?.split("\n").slice(2, 8).join(" | ");
      // eslint-disable-next-line no-console
      console.log("[S5_SET_SESSION]", {
        form: isFunc ? "callback" : "value",
        newPhaseIndex: isFunc ? undefined : next?.currentPhaseIndex,
        burned_kol_ids: isFunc ? undefined : next?.flags?.burned_kol_ids,
        chosen_kol_id: isFunc ? undefined : next?.flags?.chosen_kol_id,
        kol_interested: isFunc ? undefined : next?.flags?.kol_interested,
        stack,
      });
    } catch {}
    if (typeof next === "function") {
      setSessionRaw((prev: any) => {
        const candidate = next(prev);
        return validate(candidate, prev);
      });
    } else {
      setSessionRaw((prev: any) => validate(next, prev));
    }
  };
  const [mainView, setMainView] = useState<MainView>("chat");
  const [playerInput, setPlayerInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMailId, setSelectedMailId] = useState<string | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [rightPanel, setRightPanel] = useState<"info" | "docs">("info");
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [showBriefingOverlay, setShowBriefingOverlay] = useState(false);
  const [unreadMails, setUnreadMails] = useState(0);
  // Toast queue extracted to hooks/useToasts. The hook exposes the
  // queue + push/dismiss; we wrap push in addToast() below so the
  // notification sound stays bundled with the visual notification.
  const { toasts, addToast: pushToast, dismissToast } = useToasts();
  // S0 pacte d'associés state extracted to hooks/usePacteContract.
  const _pacteHook = usePacteContract();
  const pacteSigned = _pacteHook.pacteSigned;
  const setPacteSigned = _pacteHook.setPacteSigned;
  const inlineDocContent = _pacteHook.inlineDocContent;
  const setInlineDocContent = _pacteHook.setInlineDocContent;
  const showSignatureView = _pacteHook.showSignatureView;
  const setShowSignatureView = _pacteHook.setShowSignatureView;
  const pacteArticles = _pacteHook.pacteArticles;
  const setPacteArticles = _pacteHook.setPacteArticles;
  const amendmentInput = _pacteHook.amendmentInput;
  const setAmendmentInput = _pacteHook.setAmendmentInput;
  const pacteThread = _pacteHook.pacteThread;
  const setPacteThread = _pacteHook.setPacteThread;
  const pacteThreadLoading = _pacteHook.pacteThreadLoading;
  const setPacteThreadLoading = _pacteHook.setPacteThreadLoading;
  // ── Mind Map / Outline tool (scenario 4+) ──
  // Outline / mindmap notes state extracted to hooks/useOutlineNotes.
  const _outlineHook = useOutlineNotes();
  const outlineRawText = _outlineHook.outlineRawText;
  const setOutlineRawText = _outlineHook.setOutlineRawText;
  const outlineItems = _outlineHook.outlineItems;
  const hasMindmapTool = scenario?.meta?.tags?.includes("priorisation") || scenarioId === "founder_04_v1" || (scenario?.meta as any)?.notes_tool === true;
  const outlineCopiedFeedback = _outlineHook.outlineCopiedFeedback;
  const setOutlineCopiedFeedback = _outlineHook.setOutlineCopiedFeedback;
  const mindmapView = _outlineHook.mindmapView;
  const setMindmapView = _outlineHook.setMindmapView;
  // ── Devis NovaDev negotiation (scenario 4, phase 3) ──
  // S2 devis negotiation state extracted to hooks/useDevisNegotiation.
  const _devisHook = useDevisNegotiation();
  const showDevisNego = _devisHook.showDevisNego;
  const setShowDevisNego = _devisHook.setShowDevisNego;
  const devisSigned = _devisHook.devisSigned;
  const setDevisSigned = _devisHook.setDevisSigned;
  const devisNegoMessages = _devisHook.devisNegoMessages;
  const setDevisNegoMessages = _devisHook.setDevisNegoMessages;
  const devisNegoInput = _devisHook.devisNegoInput;
  const setDevisNegoInput = _devisHook.setDevisNegoInput;
  const devisNegoLoading = _devisHook.devisNegoLoading;
  const setDevisNegoLoading = _devisHook.setDevisNegoLoading;
  const devisFeatures = _devisHook.devisFeatures;
  const setDevisFeatures = _devisHook.setDevisFeatures;
  const devisLocked = _devisHook.devisLocked;
  const setDevisLocked = _devisHook.setDevisLocked;
  const dealTerms = _devisHook.dealTerms;
  const setDealTerms = _devisHook.setDealTerms;
  const prevDealTerms = _devisHook.prevDealTerms;
  const setPrevDealTerms = _devisHook.setPrevDealTerms;
  const devisNegoChatRef = _devisHook.devisNegoChatRef;
  // ── Contract signature (scenario 2+) ──
  // S2 NovaDev contract state extracted to hooks/useNovadevContract.
  const _novadevHook = useNovadevContract();
  const showContractSignature = _novadevHook.showContractSignature;
  const setShowContractSignature = _novadevHook.setShowContractSignature;
  const contractSigned = _novadevHook.contractSigned;
  const setContractSigned = _novadevHook.setContractSigned;
  const contractVars = _novadevHook.contractVars;
  const setContractVars = _novadevHook.setContractVars;
  const novadevArticles = _novadevHook.novadevArticles;
  const setNovadevArticles = _novadevHook.setNovadevArticles;
  const novadevThread = _novadevHook.novadevThread;
  const setNovadevThread = _novadevHook.setNovadevThread;
  const novadevThreadLoading = _novadevHook.novadevThreadLoading;
  const setNovadevThreadLoading = _novadevHook.setNovadevThreadLoading;
  const novadevNegInput = _novadevHook.novadevNegInput;
  const setNovadevNegInput = _novadevHook.setNovadevNegInput;
  // ── Bon de commande exceptions (scenario 5) ──
  // S5 exceptions CGV state extracted to hooks/useExceptionsContract.
  const {
    showExceptionsOverlay, setShowExceptionsOverlay,
    exceptionsArticles, setExceptionsArticles,
    exceptionsThread, setExceptionsThread,
    exceptionsThreadLoading, setExceptionsThreadLoading,
    exceptionsNegInput, setExceptionsNegInput,
    exceptionsSigned, setExceptionsSigned,
  } = useExceptionsContract();
  // ── Clinical contract signature (scenario 3) ──
  // S3 clinical contract state extracted to hooks/useClinicalContract.
  const _clinicalHook = useClinicalContract();
  const showClinicalContract = _clinicalHook.showClinicalContract;
  const setShowClinicalContract = _clinicalHook.setShowClinicalContract;
  const clinicalContractSigned = _clinicalHook.clinicalContractSigned;
  const setClinicalContractSigned = _clinicalHook.setClinicalContractSigned;
  const clinicalContractArticles = _clinicalHook.clinicalContractArticles;
  const setClinicalContractArticles = _clinicalHook.setClinicalContractArticles;
  const clinicalNegThread = _clinicalHook.clinicalNegThread;
  const setClinicalNegThread = _clinicalHook.setClinicalNegThread;
  const clinicalNegLoading = _clinicalHook.clinicalNegLoading;
  const setClinicalNegLoading = _clinicalHook.setClinicalNegLoading;
  const clinicalNegInput = _clinicalHook.clinicalNegInput;
  const setClinicalNegInput = _clinicalHook.setClinicalNegInput;
  const clinicalContractRefused = _clinicalHook.clinicalContractRefused;
  const setClinicalContractRefused = _clinicalHook.setClinicalContractRefused;
  // (former clinical inline useStates removed — see _clinicalHook above)
  // ── One-pager editor (scenario 1+) ──
  // S1 one-pager editor state extracted to hooks/useOnePagerEditor.
  const {
    showOnePagerEditor, setShowOnePagerEditor,
    onePagerEdited, setOnePagerEdited,
    onePagerSubmitted, setOnePagerSubmitted,
  } = useOnePagerEditor();
  const onePagerContentRef = useRef<HTMLDivElement>(null);
  const [showContactPicker, setShowContactPicker] = useState<"to" | "cc" | null>(null);
  const [interviewStarted, setInterviewStarted] = useState(false);
  // (docContent state removed — Founder documents are now served as PDFs directly)
  // debriefData, debriefLoading, debriefError → moved to useDebrief hook

  // ── Anti-rollback (Founder mode) ──
  const isFounderScenario = scenarioId.startsWith("founder_");
  const [resumeBanner, setResumeBanner] = useState<{
    penaltyMonths: number;
    phaseIndex: number;
  } | null>(null);
  const checkpointDoneRef = useRef(false);

  // ── Voice mode state ──
  const [isRecording, setIsRecording] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const recordingStartRef = useRef<number | null>(null);
  const voiceSessionRef = useRef<VoiceCaptureSession | null>(null);
  const voiceTranscriptRef = useRef("");
  const [voiceCapabilities, setVoiceCapabilities] = useState<VoiceCaptureCapabilities | null>(null);
  const [voiceFatalError, setVoiceFatalError] = useState<{
    category: VoiceCaptureErrorCategory;
    message: string;
  } | null>(null);
  // When true, we're awaiting backend transcription after a stop()
  const [voiceTranscribing, setVoiceTranscribing] = useState(false);
  // TTS state extracted to hooks/useTTS (wired below, after apiHeaders).
  const spokenMsgIdsRef = useRef<Set<string>>(new Set());
  const [raisedHands, setRaisedHands] = useState<string[]>([]);
  const [qaWaiting, setQaWaiting] = useState(false);
  const phaseStartRealTimeRef = useRef<number>(Date.now());
  const phaseMaxDurationTriggeredRef = useRef<string | null>(null);
  const [presentationDone, setPresentationDone] = useState(false);
  const [presentationError, setPresentationError] = useState<{
    category: "empty_transcript" | "timeout" | "network" | "server_error" | "invalid_response";
    message: string;
  } | null>(null);
  const autoSendTimerRef = useRef<any>(null);
  const lastSentTranscriptRef = useRef("");
  const isSendingRef = useRef(false);

  // ── Pitch timer (40s countdown) ──
  const [pitchTimerActive, setPitchTimerActive] = useState(false);
  const [pitchSecondsLeft, setPitchSecondsLeft] = useState(40);
  const [pitchCutoff, setPitchCutoff] = useState(false); // true after 40s or manual stop
  const pitchTimerRef = useRef<any>(null);
  const pitchStartRef = useRef<number | null>(null);

  // ── Game events: session ID for passive logging ──
  const gameSessionIdRef = useRef<string>(
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)
  );
  const sessionStartTimeRef = useRef<number>(Date.now());

  // ── Auth token for API calls ──
  const authTokenRef = useRef<string | null>(
    typeof window !== "undefined" ? localStorage.getItem("auth_token") : null
  );
  /** Build headers for authenticated API calls */
  function apiHeaders(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json", ...extra };
    if (authTokenRef.current) h["Authorization"] = `Bearer ${authTokenRef.current}`;
    return h;
  }

  // ── TTS (text-to-speech) — extracted to hooks/useTTS ──
  const {
    isSpeakingTTS,
    speakingActorId,
    speakTTS,
    speakTTSFallback,
    resolveVoice,
    cancel: cancelTTS,
    ttsAudioRef,
  } = useTTS({ scenario, apiHeaders });

  // ── Refs for auto-send closures ──
  const sessionRef = useRef<any>(null);
  const scenarioRef = useRef<any>(null);
  const viewRef = useRef<any>(null);

  // ── Refs ──
  const aiPromptRef = useRef("");
  const aiPromptsMapRef = useRef<Record<string, string>>({});
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevMailCountRef = useRef(-1);
  const prevChatCountRef = useRef(-1);

  // ── Runtime view ──
  const view = useMemo(
    () => (session && scenario ? buildRuntimeView(session) : null),
    [session, scenario]
  );

  // ── Derived values ──
  const displayPlayerName =
    typeof window !== "undefined"
      ? (isFounderScenario
          ? localStorage.getItem("founder_username") || ""
          : localStorage.getItem(`sjg_playerName_${scenarioId}`) || "Joueur")
      : "";

  const allDocumentsRaw = scenario?.resources?.documents || [];
  const currentPhaseId = scenario?.phases?.[session?.currentPhaseIndex]?.phase_id ?? null;
  // ── LOG #4 — fired on every render that touches the phase, the
  // selectedContact, the selectedMailId or the showCompose. Lets us see
  // whether the new session actually propagates to the rendered output
  // after a HARD_REJECT — or whether something else snaps it back.
  //
  // ⚠ TEMPORARILY enabled in production for HARD_REJECT diagnosis. The
  // earlier `process.env.NODE_ENV === "production" return;` guard caused
  // Turbopack to dead-code-eliminate this log in prod builds, leaving us
  // blind to the actual phase / UI state in the deployed bundle.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!session || !scenario) return;
    const cp = scenario.phases[session.currentPhaseIndex];
    // eslint-disable-next-line no-console
    console.log("[S5_RENDER_PHASE]", {
      currentPhaseIndex: session.currentPhaseIndex,
      currentPhaseId: cp?.phase_id,
      phaseTitle: cp?.title,
      selectedContact,
      selectedMailId,
      showCompose,
      currentMailDraft: session.mailDrafts?.[cp?.phase_id || ""],
      flags_kol_interested: session.flags?.kol_interested,
      flags_chosen_kol_id: session.flags?.chosen_kol_id,
      flags_burned_kol_ids: (session.flags as any)?.burned_kol_ids,
    });
  }, [
    session?.currentPhaseIndex,
    selectedContact,
    selectedMailId,
    showCompose,
  ]);

  // ── HARD_REJECT runtime guard cooldown ref ──────────────────────────
  const guardCooldownRef = useRef<number>(0);

  // ── HARD_REJECT runtime guard ────────────────────────────────────────
  // Last-resort consistency check on phases that declare an
  // `advancement.failure_phase`. We detect TWO impossibility classes:
  //
  //  (A) "Burnt actor still active" — chosen_kol_id is also in
  //      burned_kol_ids. Means a previous rollback wrote half-state.
  //
  //  (B) "Phase entered without prerequisite" — we're in a phase that
  //      requires a chosen actor, but none is set AND the phase has
  //      already been entered (we have at least one inbox mail or
  //      action history for this phase). This is the symptom we get
  //      when the server checkpoint is at phase N but the local session
  //      is rebuilt from defaults — leaving chosen_kol_id undefined.
  //
  // In either case we re-run handlePhaseFailure to push the player back
  // to a coherent state. The guard is a no-op in nominal cases so it
  // doesn't disturb normal play.
  useEffect(() => {
    if (!session || !scenario) return;
    const cp = scenario.phases[session.currentPhaseIndex];
    if (!cp) return;
    const advancement = (cp as any).advancement;
    if (!advancement?.failure_phase) return;
    const chosenKolNow = (session.flags as any)?.chosen_kol_id;
    const burned = Array.isArray((session.flags as any)?.burned_kol_ids)
      ? ((session.flags as any).burned_kol_ids as string[])
      : [];
    const chosenIsBurned =
      typeof chosenKolNow === "string" &&
      chosenKolNow.length > 0 &&
      burned.includes(chosenKolNow);

    // (B) prerequisite missing — only a problem if this isn't the very
    // first render (the regular advance pipeline sets chosen_kol_id
    // before bumping phase, but the guard runs slightly later in some
    // races; we wait until we observe the phase has been "lived in").
    const hasPhaseActivity =
      (session.inboxMails || []).some((m: any) => m.phaseId === cp.phase_id) ||
      (session.sentMails || []).some((m: any) => m.phaseId === cp.phase_id);
    const missingChosen =
      (typeof chosenKolNow !== "string" || chosenKolNow.length === 0) &&
      hasPhaseActivity;

    if (chosenIsBurned || missingChosen) {
      // Cooldown — defensive validator should already prevent the bounce,
      // but in case it doesn't (e.g. validator was bypassed), cap the
      // guard at one fire per 2s so we don't melt the render thread.
      const nowGuard = Date.now();
      if (nowGuard < guardCooldownRef.current) return;
      guardCooldownRef.current = nowGuard + 2000;
      // ⚠ Log enabled in production too, see [S5_RENDER_PHASE] comment.
      // eslint-disable-next-line no-console
      console.warn("[S5_GUARD_INCONSISTENT_STATE]", {
        reason: chosenIsBurned ? "chosen_is_burned" : "missing_chosen_with_activity",
        currentPhaseIndex: session.currentPhaseIndex,
        currentPhaseId: cp.phase_id,
        chosenKolNow,
        burned,
        hasPhaseActivity,
      });
      const repaired = cloneSession(session);
      const result = handlePhaseFailure(repaired);
      if (result.applied) {
        setSelectedMailId(null);
        setShowCompose(false);
        setSelectedContact("alexandre_morel");
        setSession(repaired);
        if (result.newPhaseId) {
          notifyCheckpointRollback(
            result.newPhaseId,
            repaired.currentPhaseIndex,
          );
        }
      }
    }
    // We deliberately depend on a stringified summary of the flags so the
    // effect doesn't fire on every flag mutation — only when the burned
    // list or chosen actor change.
  }, [
    session?.currentPhaseIndex,
    (session?.flags as any)?.chosen_kol_id,
    JSON.stringify((session?.flags as any)?.burned_kol_ids || []),
    session?.inboxMails?.length,
    session?.sentMails?.length,
    scenario,
  ]);

  const allDocuments = filterDocumentsByPhase(
    scenario?.phases || [],
    allDocumentsRaw,
    currentPhaseId
  );
  const attachableDocs = allDocuments.filter(
    (d: any) => d.usable_as_attachment || d.usable_as_pj
  );
  const inboxMails = view?.inboxMails || [];
  const conversation = view?.conversation || [];
  const currentMailDraft = view?.currentMailDraft || { to: "", cc: "", subject: "", body: "", attachments: [] };
  const canComposeMail = view?.canSendMail;
  const scenarioHasMail = view?.scenarioHasMail || false;
  const mailLockedForNow = false; // Mail is never locked — always accessible
  const simulatedTime = view?.simulatedTime ? fmtTime(view.simulatedTime) : "--:--";
  const actors = scenario?.actors || [];

  // ── Chosen CTO detection (Founder scenario 0) ──
  // After the player sends the offer mail (phase_2_offer), detect which candidate was chosen
  // by looking at the "to" field of the sent offer mail or the player's last toActor in phase_2.
  const chosenCtoId = useMemo(() => {
    if (!session || !scenario) return null;
    // Strategy 1: look at sent mails with kind "offer_cto"
    const offerMail = session.sentMails?.find((m: any) => m.kind === "offer_cto");
    if (offerMail?.to) {
      // Match "to" field against actor emails or actor_ids
      const toField = offerMail.to.toLowerCase();
      const candidates = ["sofia_renault", "marc_lefevre", "karim_benzarti"];
      for (const cid of candidates) {
        if (toField.includes(cid.replace("_", ".")) || toField.includes(cid.replace("_", " ")) || toField.includes(cid)) {
          return cid;
        }
      }
      // Fuzzy: match first name
      for (const cid of candidates) {
        const firstName = cid.split("_")[0];
        if (toField.includes(firstName)) return cid;
      }
    }
    // Strategy 2: look at the last player message sent to a candidate in chat during phase_2_offer
    const phase2Messages = session.chatMessages?.filter((m: any) => m.phaseId === "phase_2_offer" && m.role === "player" && m.toActor);
    if (phase2Messages?.length > 0) {
      const lastTarget = phase2Messages[phase2Messages.length - 1].toActor;
      if (["sofia_renault", "marc_lefevre", "karim_benzarti"].includes(lastTarget)) {
        return lastTarget;
      }
    }
    return null;
  }, [session?.sentMails?.length, session?.chatMessages?.length]);

  // ── Chosen KOL detection (Founder scenario 5) ──
  // After a cold email triggers a positive KOL response (kol_interested flag),
  // the mail_inbox_reply handler stores the actor_id as chosen_kol_id flag.
  const chosenKolId = useMemo(() => {
    if (!session?.flags?.chosen_kol_id) return null;
    return session.flags.chosen_kol_id as string;
  }, [session?.flags?.chosen_kol_id]);

  // Resolve "chosen_cto" / "chosen_kol" placeholders in phase config
  const resolveActor = (actorId: string) => {
    if (actorId === "chosen_cto" && chosenCtoId) return chosenCtoId;
    if (actorId === "chosen_kol" && chosenKolId) return chosenKolId;
    return actorId;
  };

  // Visible contacts in the left-hand panel.
  // Uses contact_visibility_mode (explicit) when set on the scenario,
  // otherwise falls back to the legacy `visible_in_contacts` filter.
  // See app/lib/contactVisibility.ts.
  const visibleContacts = computeVisibleContacts({
    scenario: (scenario || { actors: [] }) as any,
    currentPhase: scenario?.phases?.[session?.currentPhaseIndex ?? 0],
    resolveActorId: resolveActor,
  });

  // Patch a session's scenario phase entry_events/ai_actors to replace "chosen_cto"/"chosen_kol" with the real actor.
  // This is called before injectPhaseEntryEvents so that runtime.ts sees the resolved actor.
  function resolveDynamicActors(sess: any) {
    if (!sess?.scenario?.phases) return;
    for (const phase of sess.scenario.phases) {
      // ── chosen_cto resolution (S0) ──
      if (phase.dynamic_actor === "chosen_cto" && chosenCtoId) {
        if (Array.isArray(phase.ai_actors)) {
          phase.ai_actors = phase.ai_actors.map((a: string) => a === "chosen_cto" ? chosenCtoId : a);
        }
        if (Array.isArray(phase.entry_events)) {
          for (const ev of phase.entry_events) {
            if (ev.actor === "chosen_cto") ev.actor = chosenCtoId;
          }
        }
        if (phase.mail_config?.defaults && !phase.mail_config.defaults.to) {
          const ctoActor = actors.find((a: any) => a.actor_id === chosenCtoId);
          if (ctoActor) {
            phase.mail_config.defaults.to = ctoActor.name;
          }
        }
        phase.dynamic_actor = "resolved";
      }
      // ── chosen_kol resolution (S5) ──
      if (phase.dynamic_actor === "chosen_kol" && chosenKolId) {
        if (Array.isArray(phase.ai_actors)) {
          phase.ai_actors = phase.ai_actors.map((a: string) => a === "chosen_kol" ? chosenKolId : a);
        }
        if (Array.isArray(phase.entry_events)) {
          for (const ev of phase.entry_events) {
            if (ev.actor === "chosen_kol") ev.actor = chosenKolId;
          }
        }
        // Auto-fill mail "to" with chosen KOL's email/name
        if (phase.mail_config?.defaults && !phase.mail_config.defaults.to) {
          const kolActor = actors.find((a: any) => a.actor_id === chosenKolId);
          if (kolActor) {
            phase.mail_config.defaults.to = (kolActor as any).email || kolActor.name;
          }
        }
        // NOTE: do NOT mutate the chosen KOL's `visible_in_contacts` / `contact_status` here.
        // Contact panel visibility is now handled declaratively by the scenario via
        // `contact_visibility_mode: "explicit"` + per-phase `chat_visible_actors`.
        // See app/lib/contactVisibility.ts and computeVisibleContacts(...).
        phase.dynamic_actor = "resolved";
      }
    }
  }

  /** Resolve {{establishment_email}} placeholders in mail_config for scenario 4 */
  function resolveEstablishmentPlaceholders(sess: any) {
    if (!sess?.scenario?.phases || !sess?.flags) return;
    for (const phase of sess.scenario.phases) {
      if (phase.dynamic_mail_to === "establishment" && phase.dynamic_mail_to !== "resolved") {
        const est = resolveEstablishment(sess.flags);
        // Resolve mail_config defaults
        if (phase.mail_config?.defaults) {
          resolveMailPlaceholders(phase.mail_config, sess.flags);
        }
        // Resolve entry_events content (replace establishment references)
        if (Array.isArray(phase.entry_events)) {
          for (const ev of phase.entry_events) {
            if (typeof ev.content === "string" && ev.content.includes("{{establishment_label}}")) {
              ev.content = ev.content.replace(/\{\{establishment_label\}\}/g, est.label);
            }
          }
        }
        phase.dynamic_mail_to = "resolved";
      }
    }
  }

  // ── Manual interview start: inject only the intro (delay_ms=0) events ──
  // Delegates to InterviewHandler — zero logic change.
  function injectIntroEventsOnly(sess: any) {
    InterviewHandler.injectIntroEventsOnly(sess, addAIMessage);
  }

  // ── Handle "Faire entrer le candidat" click ──
  // Delegates to InterviewHandler — zero logic change.
  function handleStartInterview() {
    if (!session || !scenario) return;
    setInterviewStarted(true);
    phaseStartRealTimeRef.current = Date.now();
    const next = InterviewHandler.startInterview(session, scenario, cloneSession);
    setSession(next);
    // Switch to the target actor's conversation (the candidate)
    const targetActor = InterviewHandler.getTargetActor(scenario.phases[session.currentPhaseIndex]);
    if (targetActor) setSelectedContact(targetActor);
  }

  // ── Founder checkpoint server sync (advance / clear / rollback) ──
  // Extracted to hooks/useFounderCheckpoint. Each notifier is a no-op
  // when isFounderScenario is false. The rollback notifier is what
  // keeps server checkpoint in sync with React state after HARD_REJECT.
  const {
    notifyAdvance: notifyCheckpointAdvance,
    notifyClear: notifyCheckpointClear,
    notifyRollback: notifyCheckpointRollback,
  } = useFounderCheckpoint({
    scenarioId: scenarioId as string,
    isFounderScenario,
    apiHeaders,
  });

  // ── Debrief hook (extracted from page.tsx — zero logic change) ──
  const { debriefData, debriefLoading, debriefError } = useDebrief({
    view,
    scenario,
    session,
    scenarioId: scenarioId as string,
    isFounderScenario,
    displayPlayerName,
    apiHeaders,
    authTokenRef,
    onDebriefStart: () => {
      // Stop any TTS audio still playing from the last phase
      cancelTTS();
      // Stop mic if still recording
      if (voiceSessionRef.current) {
        voiceSessionRef.current.cancel().catch(() => {});
        voiceSessionRef.current = null;
      }
      setIsRecording(false);
    },
    notifyCheckpointClear,
  });

  // ── Keep refs in sync for closures ──
  sessionRef.current = session;
  scenarioRef.current = scenario;
  viewRef.current = view;
  isSendingRef.current = isSending;

  // ── Block browser back button during gameplay ──
  const viewIsFinishedRef = useRef(false);
  useEffect(() => { viewIsFinishedRef.current = view?.isFinished || false; }, [view?.isFinished]);

  useEffect(() => {
    if (!scenario) return; // Wait until scenario is loaded

    // Push a dummy state so back button triggers popstate instead of leaving
    window.history.pushState({ inGame: true }, "");

    function handlePopState() {
      if (viewIsFinishedRef.current) {
        // Scenario is finished (debrief showing) — allow back by redirecting properly
        const isFounder = scenarioId.startsWith("founder_");
        if (isFounder) {
          const cid = localStorage.getItem("founder_campaign_id");
          window.location.replace(cid ? `/founder/${cid}` : "/");
        } else {
          window.location.replace("/");
        }
        return;
      }
      // Still in game — re-push state to trap
      window.history.pushState({ inGame: true }, "");
    }

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      // Don't block unload if scenario is finished
      if (viewIsFinishedRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    }

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [scenario]);

  // ── Debug logs (only when ?debug=1) ──
  const prevPhaseIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!debugMode || !view || !scenario || !session) return;
    const phase = scenario.phases[session.currentPhaseIndex];
    const pid = phase?.phase_id || "?";
    const isTransition = prevPhaseIdRef.current !== null && prevPhaseIdRef.current !== pid;
    if (isTransition) {
      console.log(
        `%c[DEBUG] TRANSITION: ${prevPhaseIdRef.current} → ${pid}`,
        "background:#5b5fc7;color:#fff;padding:2px 8px;border-radius:3px;font-weight:bold"
      );
    }
    prevPhaseIdRef.current = pid;
    console.log(
      `%c[DEBUG] Phase: ${pid}`,
      "color:#5b5fc7;font-weight:bold",
      {
        title: phase?.title,
        focus: phase?.phase_focus || "(aucun)",
        completionRules: phase?.completion_rules,
        autoAdvance: phase?.auto_advance,
        mailConfig: phase?.mail_config ? {
          sendAdvances: phase.mail_config.send_advances_phase,
          onSendFlags: phase.mail_config.on_send_flags,
        } : "(aucun)",
        canAdvance: view.canAdvance,
        flags: { ...session.flags },
        score: session.scores[pid] || 0,
        docs: allDocuments.map((d: any) => d.doc_id),
        hiddenDocs: allDocumentsRaw.filter((d: any) => !allDocuments.includes(d)).map((d: any) => d.doc_id + " (locked until " + d.available_from_phase + ")"),
      }
    );
  }, [debugMode, view?.phaseId, view?.canAdvance, session?.currentPhaseIndex, allDocuments.length]);

  // ── Interaction mode ──
  const currentInteractionMode: string = scenario?.phases?.[session?.currentPhaseIndex]?.interaction_mode || "chat";
  const currentPhaseConfig = scenario?.phases?.[session?.currentPhaseIndex];

  // Per-contact conversation filtering
  // For interview phases (single ai_actor), show only messages from the CURRENT PHASE
  // so conversations from previous interviews don't bleed into the current one.
  const rawPhaseAiActors = scenario?.phases?.[session?.currentPhaseIndex]?.ai_actors || [];
  const currentPhaseAiActors = rawPhaseAiActors.map((a: string) => resolveActor(a));
  const filteredConversation = useMemo(() => {
    // No contact selected → show only system error messages (never show raw mixed feed)
    if (!selectedContact) {
      return conversation.filter((msg: any) => msg.role === "system" && msg.type === "error");
    }

    // Universal per-contact filtering: each contact has its own private thread.
    // Player messages are shown if they were sent TO this contact.
    // NPC messages are shown if they came FROM this contact.
    //
    // Special case: entry_event messages (phase transitions like "Sofia just arrived")
    // are said by one NPC but relevant to the current phase's primary actor.
    // These "announcement" messages (type = "incoming" / "phase_intro") from the
    // current phase are shown in the selected contact's thread if that contact
    // is a primary actor of the current phase.
    const isSelectedInPhase = currentPhaseAiActors.includes(selectedContact);

    return conversation.filter((msg: any) => {
      if (msg.role === "system") return msg.type === "error"; // show errors inline
      if (msg.role === "player") return msg.toActor === selectedContact;
      if (msg.role === "npc") {
        // Direct match: message is from the selected contact
        if (msg.actor === selectedContact) return true;
        // Phase announcement: entry_event from another NPC in the current phase
        // (e.g. Alexandre saying "Sofia just arrived" should appear in Sofia's thread)
        if (isSelectedInPhase && msg.phaseId === currentPhaseId &&
            (msg.type === "incoming" || msg.type === "phase_intro") &&
            msg.actor !== selectedContact) {
          return true;
        }
        return false;
      }
      return false;
    });
  }, [conversation, selectedContact, currentPhaseAiActors.join(","), currentPhaseId]);

  // Track which contacts have unread messages (messages the player hasn't "seen" by clicking on them)
  const lastSeenRef = useRef<Record<string, number>>({});
  const contactUnreadCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const msg of conversation) {
      if (msg.role !== "npc" || !msg.actor) continue;
      const actorId = msg.actor;
      const lastSeen = lastSeenRef.current[actorId] || 0;
      if (msg.timestamp > lastSeen && actorId !== selectedContact) {
        counts[actorId] = (counts[actorId] || 0) + 1;
      }
    }
    return counts;
  }, [conversation, selectedContact]);

  // Mark selected contact as read
  useEffect(() => {
    if (selectedContact) {
      lastSeenRef.current[selectedContact] = Date.now();
    }
  }, [selectedContact, conversation.length]);

  const canActuallySendMail = (() => {
    if (!canComposeMail || !session || !scenario) return false;
    const d = currentMailDraft;
    if (!d.to.trim() || !d.subject.trim() || !d.body.trim()) return false;
    const phase = scenario.phases[session.currentPhaseIndex];
    if (phase?.mail_config?.require_attachments && (!d.attachments || d.attachments.length === 0)) return false;
    // Minimum body length when mail advances phase (prevents accidental/empty sends)
    if (phase?.mail_config?.send_advances_phase && d.body.trim().length < 20) return false;
    return true;
  })();
  // Human-readable reason why send is disabled (for tooltip / UX)
  const mailSendBlockReason = (() => {
    if (!canComposeMail || !session || !scenario) return "";
    const d = currentMailDraft;
    if (!d.to.trim()) return "Destinataire requis";
    if (!d.subject.trim()) return "Objet requis";
    if (!d.body.trim()) return "Contenu du mail requis";
    const phase = scenario.phases[session.currentPhaseIndex];
    if (phase?.mail_config?.require_attachments && (!d.attachments || d.attachments.length === 0))
      return "Pièce jointe requise";
    if (phase?.mail_config?.send_advances_phase && d.body.trim().length < 20)
      return "Le contenu du mail est trop court (20 caractères minimum)";
    return "";
  })();

  // Page-level wrapper that also fires the notification sound.
  function addToast(text: string, icon: string, type: "chat" | "mail") {
    pushToast(text, icon, type);
    playNotificationSound();
  }

  // ── Track new mails for unread badge + notification ──
  useEffect(() => {
    // First render: initialize without notifying
    if (prevMailCountRef.current === -1) {
      prevMailCountRef.current = inboxMails.length;
      return;
    }
    if (inboxMails.length > prevMailCountRef.current) {
      const newCount = inboxMails.length - prevMailCountRef.current;
      setUnreadMails((u) => u + newCount);
      // Show toast for each new mail
      const newMails = inboxMails.slice(-newCount);
      for (const mail of newMails) {
        const senderInfo = getActorInfo(mail.from);
        addToast(`${senderInfo.name} : ${mail.subject}`, "📧", "mail");
      }
    }
    prevMailCountRef.current = inboxMails.length;
  }, [inboxMails.length]);

  // ── Track new chat messages for notification ──
  useEffect(() => {
    const nonPlayerMsgs = conversation.filter((m: any) => m.role !== "player" && m.role !== "system");
    // First render: initialize without notifying
    if (prevChatCountRef.current === -1) {
      prevChatCountRef.current = nonPlayerMsgs.length;
      return;
    }
    if (nonPlayerMsgs.length > prevChatCountRef.current) {
      const newCount = nonPlayerMsgs.length - prevChatCountRef.current;
      const newMsgs = nonPlayerMsgs.slice(-newCount);
      for (const msg of newMsgs) {
        const actorInfo = getActorInfo(msg.actor || "npc");
        const typeBadge: Record<string, string> = { phone_call: "📞", whatsapp_message: "📱", sms: "📱", visio: "📹", interruption: "⚡" };
        const icon = typeBadge[msg.type || ""] || "💬";
        const preview = msg.content.length > 60 ? msg.content.slice(0, 57) + "..." : msg.content;
        // Only notify if not on chat tab
        if (mainView !== "chat") {
          addToast(`${actorInfo.name} : ${preview}`, icon, "chat");
        }
      }
    }
    prevChatCountRef.current = nonPlayerMsgs.length;
  }, [conversation.length]);

  // Clear unread when viewing mail
  useEffect(() => {
    if (mainView === "mail") setUnreadMails(0);
  }, [mainView]);

  // ── Debrief effects moved to useDebrief hook ──

  // ════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ════════════════════════════════════════════════════════════════════

  // Scenario boot sequence — extracted to hooks/useScenarioInit.ts.
  useScenarioInit({
    scenarioId: scenarioId as string,
    router,
    authTokenRef,
    gameSessionIdRef,
    aiPromptsMapRef,
    aiPromptRef,
    checkpointDoneRef,
    setScenario,
    setSession,
    setLoading,
    setError,
    setSelectedContact,
    setInterviewStarted,
    setResumeBanner,
    apiHeaders,
    injectIntroEventsOnly,
  });

  // ── Phase timer effects (extracted to usePhaseTimer — zero logic change) ──
  usePhaseTimer({
    session,
    scenario,
    view,
    setSession,
    interviewStarted,
    setInterviewStarted,
    setSelectedContact,
    isFounderScenario,
    chosenCtoId,
    phaseStartRealTimeRef,
    phaseMaxDurationTriggeredRef,
    resolveDynamicActors,
    resolveEstablishmentPlaceholders,
    injectIntroEventsOnly,
    notifyCheckpointAdvance,
    cloneSession,
  });

  // ── Detect voice capture capabilities on mount ──
  // Runs once, client-side only. Used to warn the user proactively if
  // their browser cannot support either native SR or backend transcription.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const caps = detectVoiceCapabilities();
    setVoiceCapabilities(caps);
    // Log a short diagnostic to the console so we can help users debug
    console.info("[voice] capabilities:", {
      getUserMedia: caps.hasGetUserMedia,
      mediaRecorder: caps.hasMediaRecorder,
      speechRecognition: caps.hasSpeechRecognition,
      mimeType: caps.preferredMimeType,
      mode: caps.recommendedMode,
    });
  }, []);

  // (Markdown document fetch removed — all Founder documents are now served as PDFs)

  // ── Auto-scroll chat ──
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [filteredConversation.length]);

  // ── Schedule interruptions after each message ──
  useEffect(() => {
    if (!session || !scenario) return;
    const next = cloneSession(session);
    scheduleInterruption(next);
    // Only update if pending events changed
    if (next.pendingTimedEvents.length !== session.pendingTimedEvents.length) {
      setSession(next);
    }
  }, [conversation.length]);

  // ── Recording timer ──
  useEffect(() => {
    if (!isRecording || !recordingStartRef.current) return;
    const iv = setInterval(() => {
      setRecordingElapsed(Math.floor((Date.now() - (recordingStartRef.current || 0)) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, [isRecording]);

  // ════════════════════════════════════════════════════════════════════
  // PRESENTATION END FLOW — shared by manual stop + auto-stop
  // ════════════════════════════════════════════════════════════════════
  const presentationAutoStoppedRef = useRef(false);

  /**
   * Ends the current presentation phase.
   * Guarantees:
   *  - The spinner never gets stuck (presentationDone is always cleared
   *    when we either advance the phase OR set an explicit error).
   *  - Phase 3 always starts when there is a usable transcript,
   *    EVEN if the background evaluation fails or times out.
   *  - Empty transcripts trigger an explicit error + retry UI
   *    (instead of silently blocking on a spinner).
   */
  async function endPresentation(trigger: "manual" | "auto") {
    setPresentationDone(true);
    setPresentationError(null);
    const result = await stopRecognition();
    const trimmed = result.transcript.trim();

    // ── Case 1: explicit error from capture pipeline ──
    if (result.source === "error") {
      console.warn(`[presentation:${trigger}] capture error:`, result.errorCategory, result.errorMessage);
      setPresentationError({
        category:
          result.errorCategory === "transcribe_timeout" ? "timeout"
          : result.errorCategory === "transcribe_network" ? "network"
          : result.errorCategory === "transcribe_invalid_response" ? "invalid_response"
          : "server_error",
        message: result.errorMessage || "Erreur de transcription.",
      });
      presentationAutoStoppedRef.current = false;
      return;
    }

    // ── Case 2: no transcript at all (silence / mic didn't work) ──
    if (!trimmed) {
      console.warn(`[presentation:${trigger}] empty transcript (source=${result.source})`);
      setPresentationError({
        category: "empty_transcript",
        message:
          "Aucun son n'a été capté pendant votre présentation. Vérifiez l'autorisation micro dans votre navigateur, fermez les autres applis qui l'utilisent, et réessayez.",
      });
      // Reset the auto-stop guard so the user can restart
      presentationAutoStoppedRef.current = false;
      return;
    }

    // ── Case 3: usable transcript → advance phase synchronously ──
    if (!session || !scenario || !view) {
      // Should not happen, but guard anyway
      setPresentationError({
        category: "server_error",
        message: "État de session invalide. Rechargez la page.",
      });
      return;
    }

    const targetActor = (currentPhaseConfig as any)?.ai_actors?.[0] || "sophie_renard";
    const next = cloneSession(session);
    addPlayerMessage(next, trimmed, targetActor);
    addAIMessage(next, "Présentation terminée. Passons à la suite !", targetActor);
    completeCurrentPhaseAndAdvance(next);
    injectPhaseEntryEvents(next);
    const newPhase = scenario.phases[next.currentPhaseIndex];
    // Module system: dispatch enter_phase (may set contact, open contract, etc.)
    const modulesHandled = dispatchEnterPhase(next);
    // Legacy fallback: manual contact selection if modules didn't handle it
    if (!modulesHandled) {
      const newBriefing = InterviewHandler.getBriefingActor(newPhase);
      if (newBriefing) {
        setSelectedContact(newBriefing);
      } else if (newPhase?.ai_actors?.[0]) {
        setSelectedContact(newPhase.ai_actors[0]);
      }
    }
    setSession(next);

    // Clear UI state — the new phase will render its own mode
    setPresentationDone(false);
    setVoiceTranscript("");
    presentationAutoStoppedRef.current = false;

    // ── Background evaluation with timeout + explicit error categories ──
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45_000);

    fetch("/api/evaluate-presentation", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        transcript: trimmed,
        phaseTitle: view.phaseTitle,
        phaseObjective: view.phaseObjective,
        criteria: view.criteria,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        clearTimeout(timeoutId);
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`server_error:${res.status}:${errText.slice(0, 120)}`);
        }
        let data: any;
        try {
          data = await res.json();
        } catch {
          throw new Error("invalid_response");
        }
        if (!data || typeof data !== "object") throw new Error("invalid_response");
        const updated = cloneSession(sessionRef.current);
        applyEvaluation(
          updated,
          data.matched_criteria || [],
          data.score_delta || 0,
          data.flags_to_set || {}
        );
        setSession(updated);
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        const msg = String(err?.message || err);
        let category: "timeout" | "network" | "server_error" | "invalid_response" = "network";
        if (err?.name === "AbortError") category = "timeout";
        else if (msg.startsWith("server_error")) category = "server_error";
        else if (msg === "invalid_response") category = "invalid_response";
        console.error(`[presentation:${trigger}] background eval failed (${category}):`, err);
        // The phase already advanced — surface a discreet toast so the
        // user knows their score wasn't updated, but don't block progression.
        const toastText =
          category === "timeout"
            ? "Analyse de présentation expirée (45 s). Progression conservée, critères non évalués."
            : category === "server_error"
              ? "Erreur serveur d'analyse. Progression conservée, critères non évalués."
              : category === "invalid_response"
                ? "Réponse d'analyse invalide. Progression conservée, critères non évalués."
                : "Analyse indisponible (réseau). Progression conservée, critères non évalués.";
        addToast(toastText, "⚠️", "chat");
      });
  }

  // ── Auto-stop presentation when max_duration_sec reached ──
  useEffect(() => {
    if (!isRecording || currentInteractionMode !== "presentation") return;
    const maxSec = (currentPhaseConfig as any)?.presentation_config?.max_duration_sec || 300;
    if (recordingElapsed >= maxSec && !presentationAutoStoppedRef.current) {
      presentationAutoStoppedRef.current = true;
      endPresentation("auto");
    }
  }, [recordingElapsed, currentInteractionMode]);

  // ── Children hand-raising (voice_qa mode) ──
  useEffect(() => {
    if (!session || !scenario) return;
    const phase = scenario.phases[session.currentPhaseIndex] as any;
    if (phase?.interaction_mode !== "voice_qa") return;
    const config = phase?.voice_qa_config;
    if (!config?.children_names) return;
    const names: string[] = config.children_names;
    const maxHands = config.max_simultaneous_hands || 3;
    // Start with 2 raised hands
    setRaisedHands(names.slice(0, 2));
    const iv = setInterval(() => {
      setRaisedHands(prev => {
        const available = names.filter(n => !prev.includes(n));
        const updated = [...prev];
        // Randomly lower a hand (10% chance)
        if (updated.length > 1 && Math.random() < 0.1) {
          updated.splice(Math.floor(Math.random() * updated.length), 1);
        }
        // Randomly raise a hand (60% chance)
        if (available.length > 0 && updated.length < maxHands && Math.random() < 0.6) {
          updated.push(available[Math.floor(Math.random() * available.length)]);
        }
        return updated;
      });
    }, (config.hand_raise_interval_sec || 15) * 1000);
    return () => clearInterval(iv);
  }, [session?.currentPhaseIndex]);

  // ── Pitch timer: countdown + auto-cutoff at 40s ──
  useEffect(() => {
    if (!pitchTimerActive) return;
    pitchStartRef.current = Date.now();
    setPitchSecondsLeft(40);
    setPitchCutoff(false);
    const iv = setInterval(() => {
      const elapsed = Math.floor((Date.now() - (pitchStartRef.current || Date.now())) / 1000);
      const remaining = Math.max(0, 40 - elapsed);
      setPitchSecondsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(iv);
        setPitchTimerActive(false);
        setPitchCutoff(true);
        // Auto-stop mic and dispatch transcript
        if (voiceSessionRef.current) {
          stopRecognition().then((result) => {
            const pending = result.transcript.trim();
            if (pending && result.source !== "error") {
              dispatchVoiceQAMessage(pending);
            }
          }).catch(() => {});
        }
      }
    }, 250);
    pitchTimerRef.current = iv;
    return () => { clearInterval(iv); pitchTimerRef.current = null; };
  }, [pitchTimerActive]);

  // ── Reset pitch state on phase transition ──
  useEffect(() => {
    setPitchTimerActive(false);
    setPitchCutoff(false);
    setPitchSecondsLeft(40);
    if (pitchTimerRef.current) { clearInterval(pitchTimerRef.current); pitchTimerRef.current = null; }
  }, [session?.currentPhaseIndex]);

  // ── Auto-TTS for AI messages in voice_qa mode ──
  useEffect(() => {
    if (!session || !scenario) return;
    const phase = scenario.phases[session.currentPhaseIndex] as any;
    if (phase?.interaction_mode !== "voice_qa") return;
    const lastMsg = conversation[conversation.length - 1];
    if (!lastMsg || lastMsg.role === "player" || lastMsg.role === "system") return;
    if (spokenMsgIdsRef.current.has(lastMsg.id)) return;
    spokenMsgIdsRef.current.add(lastMsg.id);
    const lang = lastMsg.actor === "yuki_tanaka" ? "en-US" : "fr-FR";
    speakTTS(lastMsg.content, lang, lastMsg.actor);
  }, [conversation.length, session?.currentPhaseIndex]);

  // ── Push-to-talk: mic starts OFF ──
  // Player reads the instructions first, then clicks the mic button to start.
  // No auto-start, no silence-based auto-send.
  useEffect(() => {
    if (!session || !scenario) return;
    const phase = scenario.phases[session.currentPhaseIndex] as any;
    if (phase?.interaction_mode !== "voice_qa") return;
    // Reset isSending on phase transition to avoid stale state blocking dispatch
    setIsSending(false);
    // Mic stays OFF — player clicks to start when ready
  }, [session?.currentPhaseIndex]);

  // ════════════════════════════════════════════════════════════════════
  // SPEECH UTILITIES
  // ════════════════════════════════════════════════════════════════════

  // ══════════════════════════════════════════════════════════════════
  // VOICE CAPTURE — unified cross-browser via lib/voiceCapture
  //
  // Native SpeechRecognition is used when available (real-time interim
  // + auto-send on silence for voice_qa). MediaRecorder always runs in
  // parallel as a safety net — when native returns empty, the audio blob
  // is sent to /api/transcribe (Whisper) and we use that transcript
  // instead. Result: Firefox and other browsers without SR can still
  // play the scenario.
  // ══════════════════════════════════════════════════════════════════

  // ── Jury round-robin index for voice_qa with multiple ai_actors ──
  const juryTurnIndexRef = useRef(0);

  // Shared helper used by voice_qa onSilence to push the accumulated
  // transcript as a player message and trigger the AI reply.
  function dispatchVoiceQAMessage(newText: string) {
    if (!newText || isSendingRef.current) return;
    const sess = sessionRef.current;
    const scen = scenarioRef.current;
    const v = viewRef.current;
    if (!sess || !scen || !v) return;
    const phaseActors: string[] = scen.phases[sess.currentPhaseIndex]?.ai_actors || [];
    // Don't dispatch during pitch phases (no active AI actors)
    if (phaseActors.length === 0) return;
    // Round-robin through jury members (or single actor for simpler scenarios)
    let targetActor: string;
    if (phaseActors.length > 1) {
      // Find who asked the last question (entry event or AI message) and pick the NEXT one
      const lastAiMsg = [...(v.conversation || [])].reverse().find((m: any) => m.role === "npc" && phaseActors.includes(m.actor));
      if (lastAiMsg) {
        const lastIdx = phaseActors.indexOf(lastAiMsg.actor);
        targetActor = phaseActors[(lastIdx + 1) % phaseActors.length];
      } else {
        targetActor = phaseActors[0];
      }
    } else {
      targetActor = phaseActors[0] || "npc";
    }
    const next = cloneSession(sess);
    addPlayerMessage(next, newText, targetActor);
    setSession(next);
    voiceTranscriptRef.current = "";
    setVoiceTranscript("");
    lastSentTranscriptRef.current = "";
    (async () => {
      setIsSending(true);
      try {
        const activePrompt = aiPromptsMapRef.current[targetActor] || aiPromptRef.current;
        const convNow = v.conversation || [];
        const recentConv = convNow.slice(-10).map((m: any) => ({
          role: m.role === "player" ? "user" : "assistant",
          content: m.content,
        }));
        const playerOnlyMsgs = convNow
          .filter((m: any) => m.role === "player")
          .slice(-6)
          .map((m: any) => m.content);
        const voicePayload = {
            playerName: displayPlayerName,
            message: newText,
            phaseTitle: v.phaseTitle,
            phaseObjective: v.phaseObjective,
            phaseFocus: v.phaseFocus,
            phasePrompt: v.phasePrompt,
            criteria: v.criteria,
            mode: v.adaptiveMode,
            narrative: scen.narrative,
            recentConversation: recentConv,
            playerMessages: playerOnlyMsgs,
            roleplayPrompt: activePrompt,
        };

        let voiceData: any = null;
        for (let attempt = 0; attempt <= 2; attempt++) {
          try {
            if (attempt > 0) {
              const freshToken = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
              if (freshToken) authTokenRef.current = freshToken;
              await new Promise(r => setTimeout(r, 800 * attempt));
            }
            const res = await fetch("/api/chat", {
              method: "POST",
              headers: apiHeaders(),
              body: JSON.stringify(voicePayload),
            });
            if (res.status === 401 && attempt < 2) continue;
            if (res.status >= 500 && attempt < 2) continue;
            if (res.status === 429 && attempt < 2) {
              await new Promise(r => setTimeout(r, 3000));
              continue;
            }
            if (!res.ok) break;
            voiceData = await res.json();
            break;
          } catch { if (attempt >= 2) break; }
        }

        if (voiceData) {
          playNotificationSound();
          const final2 = cloneSession(sessionRef.current || next);
          addAIMessage(final2, voiceData.reply, targetActor);
          applyEvaluation(final2, voiceData.matched_criteria || [], voiceData.score_delta || 0, voiceData.flags_to_set || {});
          setSession(final2);
        } else {
          // Show error in chat so the player knows something went wrong
          const errSession = cloneSession(sessionRef.current || next);
          errSession.chatMessages.push({
            role: "system", actor: "system",
            content: "⚠️ Impossible d'obtenir une réponse. Veuillez réessayer.",
            type: "error", phaseId: scen.phases[sess.currentPhaseIndex]?.phase_id || "", timestamp: Date.now(),
          });
          setSession(errSession);
        }
      } catch (err) {
        console.error("Erreur dispatch vocal:", err);
      } finally {
        setIsSending(false);
      }
    })();
  }

  /**
   * Start voice capture. Returns a promise that resolves once the mic is
   * granted and recording has started (or rejects with a fatal error).
   *
   * `autoSendMode=true` enables silence-based auto-send used in voice_qa.
   */
  async function startRecognition(lang: string, autoSendMode: boolean = false): Promise<void> {
    // Stop any previous session first
    if (voiceSessionRef.current) {
      try { await voiceSessionRef.current.cancel(); } catch {}
      voiceSessionRef.current = null;
    }

    setVoiceFatalError(null);
    voiceTranscriptRef.current = "";
    setVoiceTranscript("");
    setInterimText("");
    lastSentTranscriptRef.current = "";
    if (autoSendTimerRef.current) { clearTimeout(autoSendTimerRef.current); autoSendTimerRef.current = null; }

    try {
      const session = await startVoiceCapture({
        lang,
        preferNative: true,
        onInterim: (text) => setInterimText(text),
        onFinal: (fullAccumulated) => {
          voiceTranscriptRef.current = fullAccumulated;
          setVoiceTranscript(fullAccumulated);
        },
        onSilence: autoSendMode
          ? (accumulated) => {
              const newText = accumulated
                .slice(lastSentTranscriptRef.current.length)
                .trim();
              if (!newText) return;
              lastSentTranscriptRef.current = accumulated;
              dispatchVoiceQAMessage(newText);
            }
          : undefined,
        silenceTimeoutMs: autoSendMode ? 2000 : undefined,
        onError: (category, message) => {
          // Fatal pre-start error — surface to UI
          setVoiceFatalError({ category, message });
          setIsRecording(false);
          recordingStartRef.current = null;
        },
      });
      voiceSessionRef.current = session;
      setIsRecording(true);
      recordingStartRef.current = Date.now();
      setRecordingElapsed(0);
    } catch (err) {
      // onError has already set voiceFatalError; nothing more to do
      console.warn("[voice] startRecognition failed:", err);
      setIsRecording(false);
    }
  }

  /**
   * Stop voice capture and return the best available transcript (native or
   * backend-Whisper). Never throws — errors are returned in the result.
   *
   * Callers should check `result.source`:
   *   - "native" | "backend" → use `result.transcript`
   *   - "empty"              → no audio / silence
   *   - "error"              → display `result.errorMessage`
   */
  async function stopRecognition(): Promise<VoiceCaptureResult> {
    const session = voiceSessionRef.current;
    voiceSessionRef.current = null;
    setIsRecording(false);
    recordingStartRef.current = null;
    setInterimText("");
    if (autoSendTimerRef.current) { clearTimeout(autoSendTimerRef.current); autoSendTimerRef.current = null; }
    if (!session) {
      // No active session (already stopped, or never started)
      const fallback = voiceTranscriptRef.current.trim();
      return { transcript: fallback, source: fallback ? "native" : "empty" };
    }
    // If session is in backend mode, show the transcribing spinner
    const needsBackend = session.mode === "backend" || !session.nativeWorking();
    if (needsBackend) setVoiceTranscribing(true);
    try {
      const result = await session.stop();
      return result;
    } finally {
      setVoiceTranscribing(false);
    }
  }

  // ── OpenAI TTS — extracted to hooks/useTTS (see declaration above) ──

  // Generate an NPC message without a player message (for triggering child questions)
  async function generateNPCMessage(actorId: string, trigger: string): Promise<string> {
    const activePrompt = aiPromptsMapRef.current[actorId] || aiPromptRef.current;
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        message: trigger,
        playerName: displayPlayerName,
        phaseTitle: view?.phaseTitle || "",
        phaseObjective: view?.phaseObjective || "",
        phaseFocus: view?.phaseFocus || "",
        phasePrompt: view?.phasePrompt || "",
        criteria: view?.criteria || [],
        narrative: scenario?.narrative || {},
        recentConversation: conversation.slice(-6).map((m: any) => ({
          role: m.role === "player" ? "user" : "assistant",
          content: m.content,
        })),
        playerMessages: conversation.filter((m: any) => m.role === "player").slice(-6).map((m: any) => m.content),
        roleplayPrompt: activePrompt,
        mode: view?.adaptiveMode || "autonomy",
      }),
    });
    if (!res.ok) {
      console.error(`Erreur NPC chat (${res.status})`);
      return "";
    }
    const data = await res.json();
    return data.reply || "";
  }

  // ════════════════════════════════════════════════════════════════════
  // HANDLERS
  // ════════════════════════════════════════════════════════════════════

  async function sendMessage() {
    if (!playerInput.trim() || !session || !scenario || !view) return;
    // Block sending if the phase timer has already fired (hard stop)
    const curPhase = scenario.phases[session.currentPhaseIndex] as any;
    const curPhaseId = curPhase?.phase_id || `phase_${session.currentPhaseIndex}`;
    if (phaseMaxDurationTriggeredRef.current === curPhaseId) return;
    const text = playerInput;
    setPlayerInput("");
    // Re-focus immediately so player can keep typing
    setTimeout(() => inputRef.current?.focus(), 0);

    // Determine which AI actor will respond (resolve chosen_cto placeholder)
    const rawTarget = selectedContact || scenario.phases[session.currentPhaseIndex]?.ai_actors?.[0] || "npc";
    const targetActor = resolveActor(rawTarget);

    // Block sending to actors not active in the current phase
    if (!currentPhaseAiActors.includes(targetActor)) {
      setPlayerInput(text); // restore the message
      return;
    }
    // Block chat with mail-only actors (e.g. establishment contacts)
    const targetActorDef = actors.find((a: any) => a.actor_id === targetActor);
    if ((targetActorDef as any)?.mail_only) {
      setPlayerInput(text);
      return;
    }

    // Add player message to session immediately (optimistic)
    const next = cloneSession(session);
    addPlayerMessage(next, text, targetActor);
    setSession(next);

    // ── Passive logging: player_message ──
    try { firePlayerMessage(authTokenRef.current || "", gameSessionIdRef.current, scenarioId as string, curPhaseId, targetActor, text); } catch { /* never break */ }

    // Fire AI request in background — don't block input
    setIsSending(true);
    try {
      // Use only messages from this conversation for context
      const relevantConv = conversation.filter((m: any) => {
        if (m.role === "player") return m.toActor === targetActor;
        if (m.role === "npc") return m.actor === targetActor;
        return false;
      });
      const recentConv = relevantConv.slice(-10).map((m: any) => ({
        role: m.role === "player" ? "user" : "assistant",
        content: m.content,
      }));
      // Player-only messages for evaluation (no NPC responses)
      const playerOnlyMessages = relevantConv
        .filter((m: any) => m.role === "player")
        .slice(-6)
        .map((m: any) => m.content);

      // Pick the right prompt for the target actor
      const activePrompt = aiPromptsMapRef.current[targetActor] || aiPromptRef.current;

      // ── C3: chat context enrichment (cofounder/colleague awareness) ──
      // Pure declarative wiring: scenario.json opts in via
      // `phase.chat_context_enrichment[targetActor] = [...keys]`. The helper
      // computes the corresponding blocks (sent mails, KOL profiles, …) or
      // returns null when nothing to inject. No scenario-specific code here.
      const chatContext = buildChatContext({
        scenario: scenario as any,
        currentPhase: scenario.phases[session.currentPhaseIndex] as any,
        session,
        contactId: targetActor,
      });

      const chatPayload = {
          playerName: displayPlayerName,
          message: text,
          phaseTitle: view.phaseTitle,
          phaseObjective: view.phaseObjective,
          phaseFocus: view.phaseFocus,
          phasePrompt: view.phasePrompt,
          criteria: view.criteria,
          mode: view.adaptiveMode,
          narrative: scenario.narrative,
          recentConversation: recentConv,
          playerMessages: playerOnlyMessages,
          roleplayPrompt: activePrompt,
          ...(chatContext ? { chat_context: chatContext } : {}),
      };

      // ── Robust fetch with auto-retry on 401/500/network errors ──
      let data: any = null;
      let lastError = "";
      const MAX_RETRIES = 2;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          // On retry after 401, refresh token from localStorage
          if (attempt > 0) {
            const freshToken = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
            if (freshToken) authTokenRef.current = freshToken;
            // Small delay before retry to avoid hammering
            await new Promise(r => setTimeout(r, 800 * attempt));
          }

          const res = await fetch("/api/chat", {
            method: "POST",
            headers: apiHeaders(),
            body: JSON.stringify(chatPayload),
          });

          if (res.status === 401 && attempt < MAX_RETRIES) {
            lastError = "Session expirée, nouvelle tentative...";
            continue; // retry with fresh token
          }

          if (res.status === 429) {
            // Rate limited — wait and retry once
            if (attempt < MAX_RETRIES) {
              const retryBody = await res.json().catch(() => ({}));
              const waitMs = retryBody.retryAfterMs || 3000;
              lastError = "Trop de requêtes, patientez...";
              await new Promise(r => setTimeout(r, Math.min(waitMs, 5000)));
              continue;
            }
            lastError = "Trop de requêtes. Veuillez patienter quelques instants.";
            break;
          }

          if (res.status >= 500 && attempt < MAX_RETRIES) {
            lastError = "Erreur serveur, nouvelle tentative...";
            continue; // retry on server errors
          }

          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            lastError = errBody.message || errBody.error || `Erreur chat (${res.status})`;
            break;
          }

          data = await res.json();
          break; // success!
        } catch (fetchErr: any) {
          lastError = fetchErr.message || "Erreur réseau";
          if (attempt < MAX_RETRIES) continue; // retry on network errors
        }
      }

      // If all retries failed, show error to the player in the chat
      if (!data) {
        const latestSession = sessionRef.current || next;
        const errFinal = cloneSession(latestSession);
        errFinal.chatMessages.push({
          role: "system",
          actor: "system",
          content: `⚠️ Impossible d'obtenir une réponse. ${lastError || "Vérifiez votre connexion et réessayez."}`,
          type: "error",
          phaseId: curPhaseId,
          timestamp: Date.now(),
        });
        setSession(errFinal);
        return;
      }

      // Discard AI response if timer has fired while waiting for the API
      if (phaseMaxDurationTriggeredRef.current === curPhaseId) return;
      playNotificationSound();

      // Use sessionRef for latest state (player may have sent more messages since)
      const latestSession = sessionRef.current || next;
      const final = cloneSession(latestSession);
      addAIMessage(final, data.reply, targetActor);

      // ── Passive logging: ai_message ──
      try { fireAIMessage(authTokenRef.current || "", gameSessionIdRef.current, scenarioId as string, curPhaseId, targetActor, data.reply); } catch { /* never break */ }
      applyEvaluation(
        final,
        data.matched_criteria || [],
        data.score_delta || 0,
        data.flags_to_set || {}
      );

      // ── Success keywords: NPC positive response sets flags (e.g., KOL interested) ──
      const successFlags = checkNpcSuccessKeywords(final, data.reply);
      if (successFlags) {
        for (const [key, value] of Object.entries(successFlags)) {
          if (value === true) final.flags[key] = true;
        }
      }

      // ── Failure loop-back: NPC refusal triggers return to previous phase ──
      if (checkNpcFailureKeywords(final, data.reply)) {
        const handled = handlePhaseFailure(final);
        if (handled.applied) {
          resolveDynamicActors(final);
          resolveEstablishmentPlaceholders(final);
          // Reset phase start time for the new phase
          phaseStartRealTimeRef.current = Date.now();
          phaseMaxDurationTriggeredRef.current = null;
          updateAdaptiveMode(final);
          setSession(final);
          return;
        }
      }

      // ── Scénario 3 Phase 3: detect pivot to clinique via chat with Alexandre ──
      if (scenarioId?.startsWith("founder_03") && final.flags.switched_to_clinique && !final.flags.pivot_contract_sent) {
        final.flags.pivot_contract_sent = true;
        // Update choice flags
        final.flags.chose_chu = false;
        final.flags.chose_saint_martin = false;
        final.flags.chose_clinique = true;
        // Inject clinique contract mail after a delay
        const curPhaseId2 = scenario.phases[final.currentPhaseIndex]?.phase_id || "phase_3_contract";
        final.pendingTimedEvents.push({
          id: `${curPhaseId2}::pivot_contrat_mail`,
          actor: "contact_clinique",
          content: "Suite à votre demande transmise par le Dr. Morel, veuillez trouver ci-joint la convention type pour le test pilote. Merci de retourner le document signé ou vos observations.",
          dueAt: Date.now() + 5000,
          phaseId: curPhaseId2,
          type: "mail",
          subject: "Convention de test — Clinique Saint-Augustin",
          attachments: [{ id: "contrat_clinique", label: "Convention de test — Clinique Saint-Augustin" }],
        });
      }

      updateAdaptiveMode(final);
      scheduleInterruption(final);
      setSession(final);
    } catch (err) {
      // Last resort: show error in chat so player is never left hanging
      console.error("Erreur chat:", err);
      try {
        const latestSession = sessionRef.current || next;
        const errFinal = cloneSession(latestSession);
        errFinal.chatMessages.push({
          role: "system",
          actor: "system",
          content: `⚠️ Une erreur inattendue s'est produite. Veuillez réessayer.`,
          type: "error",
          phaseId: curPhaseId,
          timestamp: Date.now(),
        });
        setSession(errFinal);
      } catch {}
    } finally {
      setIsSending(false);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // applyModuleActions — Execute ModuleAction[] from any module
  // ══════════════════════════════════════════════════════════════════
  // Generic action executor. Handles all ModuleAction types returned
  // by MailModule, InterviewModule, ContractModule, etc.
  // ══════════════════════════════════════════════════════════════════
  function applyModuleActions(actions: ModuleAction[], next: any) {
    if (!scenario) return;
    const deps: ApplyModuleActionsDeps = {
      scenario,
      scenarioId: scenarioId as string,
      cloneSession,
      setSession,
      setSelectedContact,
      setMainView,
      setShowCompose,
      setContractVars,
      playNotificationSound,
      resolveDynamicActors,
      resolveEstablishmentPlaceholders,
      dispatchEnterPhase,
      notifyCheckpointClear,
      executeMailAsyncEffect,
      authTokenRef,
      gameSessionIdRef,
      phaseStartRealTimeRef,
      sessionStartTimeRef,
    };
    applyModuleActionsImpl(actions, next, deps);
  }

  // ── Execute async effects described by MailModule ──
  // Implementation extracted to handlers/executeMailAsyncEffect.ts.
  function executeMailAsyncEffect(effect: any, next: any) {
    if (!scenario) return;
    const deps: ExecuteMailAsyncEffectDeps = {
      scenario,
      sessionRef,
      apiHeaders,
      cloneSession,
      setSession,
      setSelectedMailId,
      setShowCompose,
      setSelectedContact,
      setMainView,
      playNotificationSound,
      resolveDynamicActors,
      resolveEstablishmentPlaceholders,
      dispatchEnterPhase,
      notifyCheckpointClear,
      notifyCheckpointRollback,
    };
    executeMailAsyncEffectImpl(effect, next, deps);
  }

  // ══════════════════════════════════════════════════════════════════
  // dispatchEnterPhase — Run orchestrator on phase entry
  // ══════════════════════════════════════════════════════════════════
  // Called after injectPhaseEntryEvents. If modules are registered for
  // the new phase, dispatches enter_phase and applies actions.
  // Returns true if modules handled it (caller can skip legacy code).
  // ══════════════════════════════════════════════════════════════════
  function dispatchEnterPhase(next: any): boolean {
    if (!scenario) return false;
    const phase = scenario.phases[next.currentPhaseIndex];
    if (!phase) return false;

    const modules = resolveModules(phase, scenario);
    if (!modules) return false;

    const ctx = buildModuleContext({
      session: next,
      scenario,
      phase,
      playerName: displayPlayerName,
      scenarioId: scenarioId || "",
    });

    const result = dispatch({ type: "enter_phase" }, modules, ctx);
    if (result.actions.length > 0) {
      applyModuleActions(result.actions, next);
      return true;
    }
    return false;
  }

  // ══════════════════════════════════════════════════════════════════
  // dispatchContractSigned — try ContractModule before legacy code
  // Returns the ModuleResult if modules handled it (actions.length > 0),
  // null otherwise (caller falls back to legacy).
  // Does NOT apply actions — caller must call applyModuleActions().
  // ══════════════════════════════════════════════════════════════════
  function dispatchContractSigned(
    contractType: string,
    extra: ContractModuleContext,
    next: any,
  ): { actions: ModuleAction[]; advance?: boolean; finish?: boolean } | null {
    if (!scenario) return null;
    const phase = scenario.phases[next.currentPhaseIndex];
    if (!phase) return null;

    const modules = resolveModules(phase, scenario);
    if (!modules) return null;

    const ctx = {
      ...buildModuleContext({
        session: next,
        scenario,
        phase,
        playerName: displayPlayerName,
        scenarioId: scenarioId || "",
      }),
      extra,
    };

    const result = dispatch(
      { type: "contract_signed", contractType },
      modules,
      ctx,
    );

    if (result.actions.length > 0) {
      // ── Passive logging: contract_signed ──
      try {
        const phId = phase?.phase_id || "";
        const flagNames = result.actions.filter((a: any) => a.type === "set_flags").flatMap((a: any) => Object.keys(a.flags || {}));
        fireContractSigned(authTokenRef.current || "", gameSessionIdRef.current, scenarioId as string, phId, contractType, 0, flagNames);
      } catch { /* never break */ }
      return result;
    }
    return null;
  }

  function handleSendMail() {
    if (!session || !scenario || !view || !canActuallySendMail) return;
    const phase = scenario.phases[session.currentPhaseIndex];
    const mailKind = phase?.mail_config?.kind || "other";
    const next = cloneSession(session);
    // Clean up saved draft for this recipient since we're sending
    const draftTo = next.mailDrafts[view.phaseId]?.to?.trim().toLowerCase();
    if (draftTo && next.savedDrafts) {
      delete next.savedDrafts[`${view.phaseId}::${draftTo}`];
    }
    sendCurrentPhaseMail(next, mailKind);
    playNotificationSound();

    // ── Passive logging: mail_sent ──
    try {
      const draft = currentMailDraft || { to: "", subject: "", body: "" };
      fireMailSent(
        authTokenRef.current || "", gameSessionIdRef.current, scenarioId as string,
        view.phaseId, mailKind, draft.to || "", draft.subject || "",
        (draft.body || "").length, !!(draft as any).attachments?.length,
      );
    } catch { /* never break */ }

    // ══════════════════════════════════════════════════════════════════
    // Module system — try MailModule BEFORE legacy code
    // If modules are active and return actions, apply them and return.
    // Otherwise, fall through to the legacy code below.
    // ══════════════════════════════════════════════════════════════════
    const mailModules = resolveModules(phase, scenario);
    if (mailModules) {
      const mailCtx = {
        ...buildModuleContext({
          session: next,
          scenario,
          phase,
          playerName: displayPlayerName,
          scenarioId: scenarioId || "",
        }),
        extra: {
          mailBody: currentMailDraft?.body || "",
          mailTo: currentMailDraft?.to || "",
          mailKind,
          isFounderScenario,
          chosenCtoId: chosenCtoId || "sofia_renault",
          actors,
          conversation: view?.conversation || [],
          scores: session.scores || {},
          constraints: (scenario as any)?.constraints || {},
          currentMailDraft: currentMailDraft || { to: "", subject: "", body: "" },
          runtimeView: buildRuntimeView(next),
          activePromptMap: aiPromptsMapRef.current,
          defaultPrompt: aiPromptRef.current,
          displayPlayerName,
        } as MailModuleExtra,
      };
      const mailResult = dispatch(
        { type: "mail_sent", mailKind, mailBody: currentMailDraft?.body || "" },
        mailModules,
        mailCtx,
      );
      if (mailResult.actions.length > 0) {
        applyModuleActions(mailResult.actions, next);
        setSession(next);
        return; // Module handled it — skip legacy code
      }
      // No actions → fall through to legacy code
    }

    // ══════════════════════════════════════════════════════════════════
    // LEGACY FALLBACK — generic send_advances_phase only.
    //
    // All specific mailKind branches (rupture_cto, scope_proposal,
    // choice_confirmation, negotiation_proposal, analyse_rdv,
    // pilot_pitch) are handled by MailModule and were removed here.
    //
    // This fallback only fires for phases that don't declare "mail"
    // in their modules[] array. Currently:
    //   - atterrissage/phase_3_execution (consulate_initial)
    //   - atterrissage/phase_4_rebound (consulate_reply)
    //   - client_qui_hesite/phase_2 (no kind)
    //   - founder_01_incubator/phase_1_onepager (one_pager_submission)
    //
    // These only use the generic advance path (completion rules → advance).
    // Safe to remove once these phases add "mail" to their modules[].
    // ══════════════════════════════════════════════════════════════════

    if (phase?.mail_config?.send_advances_phase) {
      // ── Check completion rules BEFORE advancing ──
      const rulesPass = (() => {
        const rules = (phase as any).completion_rules;
        if (!rules) return true;
        if (Array.isArray(rules.required_npc_evidence) && rules.required_npc_evidence.length > 0) {
          const phaseConv = (view?.conversation || []);
          const npcText = phaseConv
            .filter((m: any) => m.role === "npc")
            .map((m: any) => (m.content || "").toLowerCase())
            .join(" ");
          const allMet = rules.required_npc_evidence.every((ev: any) => {
            const matched = (ev.keywords || []).filter((kw: string) => npcText.includes(kw.toLowerCase()));
            return matched.length >= (ev.min_matches || 1);
          });
          if (!allMet) return false;
        }
        if (Array.isArray(rules.required_player_evidence) && rules.required_player_evidence.length > 0) {
          const phaseConv = (view?.conversation || []);
          const playerText = phaseConv
            .filter((m: any) => m.role === "player")
            .map((m: any) => (m.content || "").toLowerCase())
            .join(" ");
          const allMet = rules.required_player_evidence.every((ev: any) => {
            const matched = (ev.keywords || []).filter((kw: string) => playerText.includes(kw.toLowerCase()));
            return matched.length >= (ev.min_matches || 1);
          });
          if (!allMet) return false;
        }
        if (rules.min_score !== undefined) {
          const phaseScore = session.scores?.[phase.phase_id] || 0;
          if (phaseScore < rules.min_score) return false;
        }
        return true;
      })();

      if (rulesPass) {
        completeCurrentPhaseAndAdvance(next);
        if (next.isFinished) {
          notifyCheckpointClear();
        } else {
          resolveDynamicActors(next);
          resolveEstablishmentPlaceholders(next);
          injectPhaseEntryEvents(next);
          dispatchEnterPhase(next); // Module system: run enter_phase on new phase
          const newPhase = scenario.phases[next.currentPhaseIndex];
          if (newPhase?.mail_config?.defaults) {
            updateMailDraft(next, newPhase.phase_id, {
              to: "",
              cc: "",
              subject: newPhase.mail_config.defaults.subject || "",
              body: "", attachments: [],
            });
          }
        }
      }
    }

    setSession(next);
    setShowCompose(false);
  }

  function updateDraft(patch: any) {
    if (!session || !view) return;
    const next = cloneSession(session);
    // If changing recipient on an empty draft, restore saved draft if available
    if (patch.to && !currentMailDraft.body) {
      const newTo = patch.to.trim().toLowerCase();
      const savedKey = `${view.phaseId}::${newTo}`;
      const saved = next.savedDrafts?.[savedKey];
      if (saved) {
        updateMailDraft(next, view.phaseId, { ...saved });
        // Remove from saved drafts since it's now active
        delete next.savedDrafts[savedKey];
        setSession(next);
        return;
      }
    }
    updateMailDraft(next, view.phaseId, { ...currentMailDraft, ...patch });
    setSession(next);
  }

  function handleToggleAttachment(docId: string, label: string) {
    if (!session || !view) return;
    const next = cloneSession(session);
    toggleMailAttachment(next, view.phaseId, { id: docId, label });
    setSession(next);
  }

  // ── Mail UI callbacks (used by MailView) ──
  function handleNewCompose() {
    if (session && scenario) {
      const phase = scenario.phases[session.currentPhaseIndex];
      const phaseId = phase?.phase_id || view?.phaseId;
      const defaults = (phase?.mail_config?.defaults || {}) as Record<string, any>;
      const next = cloneSession(session);
      const cur = next.mailDrafts[phaseId];
      if (cur && cur.to && cur.body) {
        if (!next.savedDrafts) next.savedDrafts = {};
        next.savedDrafts[`${phaseId}::${cur.to.trim().toLowerCase()}`] = { ...cur };
      }
      updateMailDraft(next, phaseId, {
        to: defaults.to || "",
        cc: defaults.cc || "",
        subject: defaults.subject || "",
        body: "",
        attachments: [],
      });
      setSession(next);
    }
    setShowCompose(true);
    setSelectedMailId(null);
  }

  function handleReplyAll(mail: any) {
    if (!mail || !scenario || !session) return;
    const senderEmail = (() => {
      const a = actors.find((x: any) => x.actor_id === mail.from);
      return (a as any)?.email || getActorInfo(mail.from).name;
    })();
    const ccParts: string[] = [];
    if (mail.cc) ccParts.push(mail.cc);
    const currentPhase = scenario.phases[session.currentPhaseIndex];
    const defaultCc = currentPhase?.mail_config?.defaults?.cc || "";
    if (defaultCc && !ccParts.includes(defaultCc)) ccParts.push(defaultCc);
    const reSubject = mail.subject.startsWith("Re:") ? mail.subject : `Re: ${mail.subject}`;
    updateDraft({ to: senderEmail, cc: ccParts.join(", "), subject: reSubject });
    setShowCompose(true);
  }

  function handleOpenPacteSign() {
    if (pacteArticles.length === 0) {
      const ctoId = chosenCtoId || "sofia_renault";
      const ctoActor = actors.find((a: any) => a.actor_id === ctoId);
      const ctoName = ctoActor?.name || "CTO";
      setPacteArticles(ContractHandler.buildArticles("s0_pacte", { playerName: displayPlayerName, ctoName }));
      setPacteThread([]);
    }
    setShowSignatureView(true);
  }

  function handleOpenContractSign() {
    if (novadevArticles.length === 0) {
      setNovadevArticles(ContractHandler.buildArticles("s2_novadev", {
        playerName: displayPlayerName,
        novadevVars: { price: contractVars.price, features: contractVars.features, equity: contractVars.equity, playerName: displayPlayerName },
      }));
    }
    setShowContractSignature(true);
  }

  function handleOpenClinicalSign() {
    const type = session?.flags?.chose_chu ? "chu" as const : session?.flags?.chose_saint_martin ? "sm" as const : "clinique" as const;
    setClinicalContractArticles(buildClinicalArticles(type));
    setClinicalNegThread([]); setClinicalContractRefused(false); setShowClinicalContract(true);
  }

  function handleOpenDevisSign() {
    setDevisNegoMessages([]);
    setShowDevisNego(true);
  }

  function handleOpenExceptionsSign() {
    if (exceptionsArticles.length === 0) {
      setExceptionsArticles(ContractHandler.buildArticles("s5_exceptions", { playerName: displayPlayerName, establishmentLabel: "l'établissement" }));
    }
    setShowExceptionsOverlay(true);
  }

  function handleInsertOutlineNotes() {
    const text = outlineToText(outlineItems);
    if (!text) return;
    const body = currentMailDraft.body;
    const newBody = body ? body + "\n\n--- Mes notes d'analyse ---\n" + text : text;
    updateDraft({ body: newBody });
  }

  function handleNotesCopy() {
    const text = outlineToText(outlineItems);
    if (!text) return;
    navigator.clipboard.writeText(text);
    setOutlineCopiedFeedback("Copié !");
    setTimeout(() => setOutlineCopiedFeedback(""), 1500);
  }

  function handleNotesInsertInMail() {
    const text = outlineToText(outlineItems);
    if (!text) return;
    const body = currentMailDraft.body;
    const newBody = body ? body + "\n\n--- Mes notes d'analyse ---\n" + text : text;
    updateDraft({ body: newBody });
    setMainView("mail");
    setShowCompose(true);
    setOutlineCopiedFeedback("Inséré dans le mail !");
    setTimeout(() => setOutlineCopiedFeedback(""), 2000);
  }

  function handleInsertNotesInChat() {
    const text = outlineToText(outlineItems);
    setPlayerInput((prev) => prev ? prev + "\n" + text : text);
    inputRef.current?.focus();
  }

  // ════════════════════════════════════════════════════════════════════
  // RENDER HELPERS
  // ════════════════════════════════════════════════════════════════════

  function getActorInfo(actorId: string) {
    // Resolve "chosen_cto" to actual CTO actor
    const resolved = actorId === "chosen_cto" && chosenCtoId ? chosenCtoId : actorId;
    const a = actors.find((x: any) => x.actor_id === resolved);
    return {
      name: a?.name || resolved,
      color: a?.avatar?.color || "#666",
      initials: a?.avatar?.initials || getInitials(a?.name || resolved),
      status: (a as any)?.contact_status || "offline",
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // 3 CONTRACT NEGOTIATION SENDERS (S0/S2/S5) — one mechanism, 3 UX wires
  // ────────────────────────────────────────────────────────────────────
  // All 3 use the same async flow in handlers/contractNegotiationSenders.
  // Per-contract differences are passed as opts:
  //   - S0 pacte:      exclusivity detection + flag updates
  //   - S2 novadev:    no extras (pure standard)
  //   - S5 exceptions: session message logging for the debrief
  // ════════════════════════════════════════════════════════════════════

  async function sendPacteNegotiationMessage(textOverride?: string) {
    const text = textOverride || amendmentInput.trim();
    const ctoId = chosenCtoId || "sofia_renault";
    const activePrompt = aiPromptsMapRef.current[ctoId] || aiPromptRef.current;
    const mentionsExcl = detectsExcl(text);
    await runContractNegotiation({
      contractType: "s0_pacte",
      text,
      isAlreadyLoading: pacteThreadLoading,
      articles: pacteArticles,
      thread: pacteThread,
      setArticles: setPacteArticles,
      setThread: setPacteThread,
      setLoading: setPacteThreadLoading,
      clearInput: textOverride ? undefined : () => setAmendmentInput(""),
      roleplayPrompt: activePrompt,
      narrative: scenario?.narrative || {},
      playerName: displayPlayerName,
      apiHeaders,
      pacteFlagsHook: {
        mentionsExclusivity: mentionsExcl,
        applyFlagsBeforeCall: (updates) => {
          if (session) setSession({ ...session, flags: { ...session.flags, ...updates } });
        },
        onAcceptanceAfterExcl: () => {
          if (session) setSession({ ...session, flags: { ...session.flags, pacte_signed_clean: true } });
        },
      },
    });
  }

  async function sendNovadevNegotiationMessage(textOverride?: string) {
    if (!session || !scenario) return;
    const text = textOverride || novadevNegInput.trim();
    const negConfig = ContractHandler.getNegotiationConfig("s2_novadev");
    const activePrompt = aiPromptsMapRef.current[negConfig.actorId] || aiPromptRef.current;
    await runContractNegotiation({
      contractType: "s2_novadev",
      text,
      isAlreadyLoading: novadevThreadLoading,
      articles: novadevArticles,
      thread: novadevThread,
      setArticles: setNovadevArticles,
      setThread: setNovadevThread,
      setLoading: setNovadevThreadLoading,
      clearInput: textOverride ? undefined : () => setNovadevNegInput(""),
      roleplayPrompt: activePrompt,
      narrative: scenario?.narrative || {},
      playerName: displayPlayerName,
      apiHeaders,
    });
  }

  async function sendExceptionsNegotiationMessage(textOverride?: string) {
    if (!session || !scenario) return;
    const text = textOverride || exceptionsNegInput.trim();
    const negConfig = ContractHandler.getNegotiationConfig("s5_exceptions");
    const activePrompt = aiPromptsMapRef.current[negConfig.actorId] || aiPromptRef.current;
    await runContractNegotiation({
      contractType: "s5_exceptions",
      text,
      isAlreadyLoading: exceptionsThreadLoading,
      articles: exceptionsArticles,
      thread: exceptionsThread,
      setArticles: setExceptionsArticles,
      setThread: setExceptionsThread,
      setLoading: setExceptionsThreadLoading,
      clearInput: textOverride ? undefined : () => setExceptionsNegInput(""),
      roleplayPrompt: activePrompt,
      narrative: scenario?.narrative || {},
      playerName: displayPlayerName,
      apiHeaders,
      sessionLog: {
        actorId: negConfig.actorId,
        log: (playerLine, counterpartReply) => {
          if (!session) return;
          const next = cloneSession(session);
          addPlayerMessage(next, `[Négo contrat] ${playerLine}`, negConfig.actorId);
          addAIMessage(next, counterpartReply, negConfig.actorId);
          setSession(next);
        },
      },
    });
  }

  // ════════════════════════════════════════════════════════════════════
  // DEVIS SIGN — sign the devis and store deal terms (S4)
  // ════════════════════════════════════════════════════════════════════
  function handleDevisSign() {
    if (!ContractHandler.canSign("s4_devis", devisNegoMessages.length)) return;
    setShowDevisNego(false);
    if (session && scenario) {
      const next = cloneSession(session);

      // ── ContractModule handles sign via PhaseOrchestrator ──
      const moduleResult = dispatchContractSigned("s4_devis", {
        contractType: "s4_devis",
        features: devisFeatures,
        dealTerms,
      }, next);

      if (!moduleResult) {
        console.error("[ContractModule] s4_devis: no module result — sign aborted");
        return;
      }
      applyModuleActions(moduleResult.actions, next);
      setSession(next);
    }
    playNotificationSound();
    setDevisSigned(true);
  }

  // ════════════════════════════════════════════════════════════════════
  // DEVIS NEGOTIATION — send message to Thomas Vidal (S4)
  // ════════════════════════════════════════════════════════════════════
  async function sendDevisNegoMsg() {
    if (!devisNegoInput.trim() || devisNegoLoading || !session || !scenario) return;
    const userMsg = devisNegoInput.trim();
    setDevisNegoInput("");
    setDevisNegoMessages((prev) => [...prev, { role: "player", content: userMsg }]);
    setDevisNegoLoading(true);
    // Lock checkboxes on first message
    if (!devisLocked) setDevisLocked(true);
    setTimeout(() => devisNegoChatRef.current?.scrollTo(0, 99999), 50);

    // Compute scope context from current feature selection
    const totalPrice = DEVIS_FEATURES_DATA.reduce((sum, feat) =>
      devisFeatures[feat.key] ? sum + feat.price : sum, 0
    );
    const selectedFeatures = DEVIS_FEATURES_DATA.filter(f => devisFeatures[f.key]).map(f => f.label).join(", ");
    const tierLabel = totalPrice <= 3000 ? "TRANCHE 1 (petit scope)" : totalPrice <= 8000 ? "TRANCHE 2 (scope moyen)" : totalPrice <= 15000 ? "TRANCHE 3 (gros scope)" : "TRANCHE 4 (scope maximal)";
    const scopeContext = `[Scope actuel : ${selectedFeatures || "Aucun module sélectionné"}. Montant total : ${totalPrice}€. ${tierLabel}]`;

    try {
      const activePrompt = aiPromptsMapRef.current["thomas_vidal"] || aiPromptRef.current;
      const recentConv = devisNegoMessages.slice(-10).map((m) => ({
        role: m.role === "player" ? "user" as const : "assistant" as const,
        content: m.content,
      }));
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({
          playerName: displayPlayerName,
          message: `${scopeContext}\n\n${userMsg}`,
          phaseTitle: view?.phaseTitle || "Négociation NovaDev",
          phaseObjective: view?.phaseObjective || "",
          phaseFocus: view?.phaseFocus || "",
          phasePrompt: view?.phasePrompt || "",
          criteria: view?.criteria || [],
          mode: view?.adaptiveMode || "standard",
          narrative: scenario.narrative,
          recentConversation: recentConv,
          playerMessages: devisNegoMessages.filter((m) => m.role === "player").map((m) => m.content).concat([userMsg]),
          roleplayPrompt: activePrompt,
          devisScope: selectedFeatures,
          devisTotal: totalPrice,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const { clean, parsed } = parseDealTag(data.reply, totalPrice);
        if (parsed) {
          setPrevDealTerms(dealTerms);
          setDealTerms(parsed);
        }
        setDevisNegoMessages((prev) => [...prev, { role: "npc", content: clean }]);
        if (session) {
          const next = cloneSession(session);
          addPlayerMessage(next, `[Négo devis] ${userMsg}`, "thomas_vidal");
          addAIMessage(next, clean, "thomas_vidal");
          applyEvaluation(next, data.matched_criteria || [], data.score_delta || 0, data.flags_to_set || {});
          setSession(next);
        }
      }
    } catch (err) {
      console.error("Devis negotiation error:", err);
    } finally {
      setDevisNegoLoading(false);
      setTimeout(() => devisNegoChatRef.current?.scrollTo(0, 99999), 100);
    }
  }

  // ── Clinical contract: build articles per establishment ──
  function buildClinicalArticles(type: "chu" | "sm" | "clinique") {
    const art = (id: string, title: string, content: string, toxic = false, moderate = false) =>
      ({ id, title, content, modifiedContent: null as string | null, toxic, moderate });
    if (type === "chu") return [
      art("article_1", "Article 1 — Objet", "Test pilote du logiciel Orisio (planning temps réel + gestion annulations) dans le service de chirurgie orthopédique du CHU, sur une durée de 8 semaines."),
      art("article_2", "Article 2 — Gratuité", "Le test est réalisé à titre gracieux. Aucune facturation n'est émise pendant la période de test."),
      art("article_3", "Article 3 — Données", "Orisio s'engage à héberger les données sur une infrastructure certifiée HDS. Aucune donnée patient nominative n'est traitée."),
      art("article_4", "Article 4 — Durée et renouvellement", "8 semaines à compter de la mise en service. Renouvelable une fois par accord des parties."),
      art("article_5", "Article 5 — Propriété intellectuelle", "Les développements, adaptations et améliorations réalisés pendant la période de test, y compris ceux réalisés sur les données et dans les locaux du CHU, sont la propriété conjointe du CHU et d'Orisio. Le CHU dispose d'une licence perpétuelle, gratuite et irrévocable sur le code source existant d'Orisio utilisé pendant le test.", true),
      art("article_6", "Article 6 — Intéressement", "En contrepartie de l'accès à l'infrastructure du CHU, Orisio versera au CHU : 5% des revenus générés par les ventes d'Orisio aux établissements publics de santé pendant 3 ans ; 1% du post-money en cas de levée de fonds réalisée dans les 24 mois suivant le test.", true),
      art("article_7", "Article 7 — Confidentialité", "Les parties s'engagent à maintenir la confidentialité des informations échangées."),
      art("article_8", "Article 8 — Référence commerciale", "L'utilisation du nom du CHU de Bordeaux à des fins commerciales ou promotionnelles est interdite sans validation préalable du service communication du CHU.", false, true),
      art("article_9", "Article 9 — Hébergement", "L'hébergement doit être certifié SecNumCloud (et pas uniquement HDS).", false, true),
      art("article_10", "Article 10 — Conformité", "Orisio s'engage à respecter l'ensemble des réglementations applicables (RGPD, HDS, etc.)."),
      art("article_11", "Article 11 — Résiliation", "Le CHU peut résilier la convention à tout moment, sans préavis et sans indemnité.", false, true),
    ];
    if (type === "sm") return [
      art("article_1", "Article 1 — Objet", "Test pilote du logiciel Orisio (planning temps réel + gestion annulations) dans les blocs opératoires de l'Hôpital Saint-Martin, sur une durée de 8 semaines."),
      art("article_2", "Article 2 — Gratuité", "Le test est réalisé à titre gracieux."),
      art("article_3", "Article 3 — Propriété intellectuelle", "La propriété intellectuelle du logiciel Orisio reste la propriété exclusive d'Orisio SAS."),
      art("article_4", "Article 4 — Données", "Hébergement certifié HDS. Aucune donnée patient nominative n'est traitée."),
      art("article_5", "Article 5 — Durée", "8 semaines à compter de la mise en service."),
      art("article_6", "Article 6 — Résiliation", "Préavis de 15 jours par l'une ou l'autre des parties."),
      art("article_7", "Article 7 — Référence commerciale", "Référence anonymisée autorisée (« un hôpital privé de 8 salles »). Toute mention nommée requiert l'accord préalable de la direction de la communication du groupe.", false, true),
      art("article_8", "Article 8 — Non-sollicitation", "Orisio s'engage à ne pas solliciter le personnel de l'établissement pendant le test et les 6 mois suivant la fin du test."),
      art("article_9", "Article 9 — Validation groupe", "La signature définitive est soumise à la non-opposition du groupe Ramsay Santé. Délai indicatif : 15 jours ouvrés.", false, true),
    ];
    return [
      art("article_1", "Article 1 — Objet", "Test pilote du logiciel Orisio (planning temps réel + gestion annulations) dans les blocs opératoires de la Clinique Saint-Augustin, sur une durée de 8 semaines."),
      art("article_2", "Article 2 — Gratuité", "Le test est réalisé à titre gracieux. Aucune facturation n'est émise."),
      art("article_3", "Article 3 — Propriété intellectuelle", "La propriété intellectuelle du logiciel Orisio reste la propriété exclusive d'Orisio SAS."),
      art("article_4", "Article 4 — Données", "Hébergement certifié HDS. Aucune donnée patient nominative n'est traitée."),
      art("article_5", "Article 5 — Durée", "8 semaines à compter de la mise en service, renouvelable par accord des parties."),
      art("article_6", "Article 6 — Résiliation", "Préavis de 7 jours par l'une ou l'autre des parties."),
      art("article_7", "Article 7 — Référence commerciale", "Orisio est autorisée à mentionner la Clinique Saint-Augustin comme établissement pilote."),
      art("article_8", "Article 8 — Confidentialité", "Les parties s'engagent à maintenir la confidentialité des informations échangées."),
    ];
  }

  // ── Clinical contract negotiation (scenario 3 Phase 3) ──
  async function sendClinicalNegotiationMessage() {
    const text = clinicalNegInput.trim();
    if (!text || clinicalNegLoading || !session || !scenario) return;
    setClinicalNegInput("");
    setClinicalNegThread((prev) => [...prev, { role: "player", content: text }]);
    setClinicalNegLoading(true);
    try {
      const contactActor = session.flags.chose_chu ? "contact_chu" : session.flags.chose_saint_martin ? "contact_saint_martin" : "contact_clinique";
      const activePrompt = aiPromptsMapRef.current[contactActor] || aiPromptRef.current;
      const threadContext = clinicalNegThread.slice(-6).map((m) => ({
        role: m.role === "player" ? "user" : "assistant",
        content: m.content,
      }));
      threadContext.push({ role: "user", content: text });

      // Build contract state summary for the AI
      const contractSummary = clinicalContractArticles.map(a =>
        `${a.title}: ${a.modifiedContent ? "[MODIFIÉ] " + a.modifiedContent : a.content}`
      ).join("\n");

      const negotiationSystemPrompt = `${activePrompt}

## CONTRAT ACTUEL
${contractSummary}

## INSTRUCTIONS DE NÉGOCIATION
Le joueur discute d'une clause du contrat. Tu peux :
1. REFUSER la modification (argumente juridiquement, sec, 2-3 phrases max)
2. ACCEPTER la modification — dans ce cas, ajoute à la fin de ta réponse un bloc :
[MODIFICATION article_X]
Nouveau texte complet de l'article ici.
[/MODIFICATION]

Remplace "article_X" par l'id exact de l'article (article_1, article_2, etc.).
Le texte entre les balises remplacera le contenu de l'article dans le contrat.
N'utilise ce bloc QUE si tu acceptes de modifier l'article. Si tu refuses, ne mets PAS de bloc [MODIFICATION].
Tu peux proposer un compromis (texte modifié qui protège aussi l'établissement).`;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({
          playerName: displayPlayerName,
          message: text,
          phaseTitle: "Négociation du contrat de test",
          phaseObjective: "Le joueur négocie les clauses du contrat de test pilote avec le juriste de l'établissement.",
          phaseFocus: "Discussion contractuelle. Réponds de manière sèche et juridique. Maximum 3-4 phrases (hors bloc MODIFICATION).",
          phasePrompt: "",
          criteria: [],
          mode: "standard",
          narrative: scenario?.narrative || {},
          recentConversation: threadContext,
          playerMessages: [text],
          roleplayPrompt: negotiationSystemPrompt,
        }),
      });
      const data = await res.json();
      let reply = data?.reply || data?.response || "Nous allons étudier votre demande.";

      // Parse [MODIFICATION article_X]...[/MODIFICATION] blocks
      const modifRegex = /\[MODIFICATION\s+(article_\d+)\]([\s\S]*?)\[\/MODIFICATION\]/gi;
      let match;
      while ((match = modifRegex.exec(reply)) !== null) {
        const articleId = match[1].toLowerCase();
        const newContent = match[2].trim();
        setClinicalContractArticles((prev) =>
          prev.map((a) => a.id === articleId ? { ...a, modifiedContent: newContent } : a)
        );
      }
      // Strip the modification blocks from the displayed reply
      const cleanReply = reply.replace(/\[MODIFICATION\s+article_\d+\][\s\S]*?\[\/MODIFICATION\]/gi, "").trim();
      setClinicalNegThread((prev) => [...prev, { role: "juriste", content: cleanReply }]);
    } catch {
      setClinicalNegThread((prev) => [...prev, { role: "juriste", content: "Nous reviendrons vers vous." }]);
    }
    setClinicalNegLoading(false);
  }

  // ── Clinical contract sign / refuse handlers ──
  function handleClinicalSign() {
    setClinicalContractSigned(true);
    if (session && scenario) {
      const isCHU = !!session.flags?.chose_chu;
      const next = cloneSession(session);
      if (isCHU) {
        const art5Modified = clinicalContractArticles.find(a => a.id === "article_5")?.modifiedContent !== null;
        const art6Modified = clinicalContractArticles.find(a => a.id === "article_6")?.modifiedContent !== null;
        if (art5Modified && art6Modified) {
          next.flags.contrat_signed_clean = true;
        } else {
          next.flags.contrat_signed_toxic = true;
        }
      } else {
        next.flags.contrat_signed_clean = true;
      }
      next.flags.contrat_received = true;
      finishScenario(next);
      setSession(next);
    }
    setShowClinicalContract(false);
    playNotificationSound();
  }

  function handleClinicalRefused() {
    setShowClinicalContract(false);
    setMainView("chat");
    setSelectedContact("alexandre_morel");
  }

  // ════════════════════════════════════════════════════════════════════
  // LOADING / ERROR
  // ════════════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#f3f2f1", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 40, height: 40, border: "3px solid #e0e0e0", borderTopColor: "#5b5fc7", borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto 16px" }} />
          <p style={{ color: "#666", fontSize: 14 }}>Chargement du scénario...</p>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    );
  }

  if (error || !scenario || !session || !view) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#f3f2f1", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        <div style={{ background: "#fff", padding: 32, borderRadius: 8, boxShadow: "0 2px 12px rgba(0,0,0,.1)", textAlign: "center" }}>
          <p style={{ color: "#e94b3c", fontWeight: 600, marginBottom: 12 }}>Erreur</p>
          <p style={{ color: "#666", fontSize: 14 }}>{error || "Impossible de charger le scénario"}</p>
          <button onClick={() => router.push("/")} style={{ marginTop: 16, padding: "8px 24px", background: "#5b5fc7", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 600 }}>
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // ENDING SCREEN
  // ════════════════════════════════════════════════════════════════════

  if (view.isFinished) {

    // ── Loading state ──
    if (debriefLoading) {
      return (
        <div style={{ minHeight: "100vh", background: "#f3f2f1", fontFamily: "'Segoe UI', system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center", maxWidth: 400 }}>
            <div style={{ width: 48, height: 48, border: "4px solid #e0e0e0", borderTopColor: "#5b5fc7", borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto 20px" }} />
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#333", marginBottom: 8 }}>
              {isFounderScenario ? "Résolution en cours..." : "Analyse en cours..."}
            </h2>
            <p style={{ fontSize: 14, color: "#888", lineHeight: 1.5 }}>
              {isFounderScenario ? "Application des conséquences de ta décision." : "L'IA évalue ta performance phase par phase. Cela peut prendre quelques secondes."}
            </p>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        </div>
      );
    }

    // ── Error state (show basic ending) ──
    if (debriefError && !debriefData) {
      return (
        <div style={{ minHeight: "100vh", background: "#f3f2f1", fontFamily: "'Segoe UI', system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", padding: 40, borderRadius: 12, boxShadow: "0 4px 24px rgba(0,0,0,.12)", maxWidth: 500, textAlign: "center" }}>
            <h2 style={{ fontSize: 18, color: "#333", marginBottom: 8 }}>Scénario terminé</h2>
            <p style={{ fontSize: 14, color: "#888", marginBottom: 20 }}>Le débrief n'a pas pu être généré : {debriefError}</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              {isFounderScenario ? (
                <button onClick={() => { const cid = typeof window !== "undefined" ? localStorage.getItem("founder_campaign_id") : null; router.push(cid ? `/founder/${cid}` : "/founder/intro"); }}
                  style={{ padding: "10px 24px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
                  Continuer la campagne
                </button>
              ) : (
                <button onClick={() => router.push(`/scenarios/${scenarioId}`)} style={{ padding: "10px 24px", background: "#5b5fc7", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
                  Rejouer
                </button>
              )}
              <button onClick={() => router.push("/")} style={{ padding: "10px 24px", background: "#fff", color: "#666", border: "1px solid #ddd", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
                Accueil
              </button>
            </div>
          </div>
        </div>
      );
    }

    // ══════════════════════════════════════════════════════════════
    // FOUNDER MODE — skip play-page debrief, redirect to campaign dashboard
    // The campaign dashboard has its own DebriefOverlay with outcome deltas.
    // Showing a debrief here too would cause a DOUBLE DEBRIEF.
    // ══════════════════════════════════════════════════════════════
    if (debriefData && isFounderScenario && debriefData.isFounderDebrief) {
      // Auto-redirect to campaign dashboard (which shows its own debrief)
      // Use replace so back button won't return to the play page
      const cid = typeof window !== "undefined" ? localStorage.getItem("founder_campaign_id") : null;
      router.replace(cid ? `/founder/${cid}` : "/founder/intro");
      return (
        <div style={{ minHeight: "100vh", background: "#f3f2f1", fontFamily: "'Segoe UI', system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 40, height: 40, border: "3px solid #e0e0e0", borderTopColor: "#5b5fc7", borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto 16px" }} />
            <p style={{ color: "#666", fontSize: 14 }}>Application des conséquences...</p>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        </div>
      );
    }

    // ══════════════════════════════════════════════════════════════
    // CLASSIC DEBRIEF (non-Founder scenarios)
    // ══════════════════════════════════════════════════════════════
    if (debriefData) {
      return (
        <DebriefView
          debriefData={debriefData}
          isFounderScenario={isFounderScenario}
          scenarioId={scenarioId}
          onReplay={() => router.push(`/scenarios/${scenarioId}`)}
          onHistory={() => router.push("/history")}
          onHome={() => router.push("/")}
          onContinueCampaign={() => {
            const cid = typeof window !== "undefined" ? localStorage.getItem("founder_campaign_id") : null;
            router.push(cid ? `/founder/${cid}` : "/founder/intro");
          }}
        />
      );
    }

    // Waiting for debrief to start (brief moment)
    return null;
  }

  // ════════════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ════════════════════════════════════════════════════════════════════

  const phaseTitle = view.phaseTitle;
  const phaseObjective = view.phaseObjective;
  const selectedMail = inboxMails.find((m: any) => m.id === selectedMailId);
  const selectedDoc = allDocuments.find((d: any) => d.doc_id === selectedDocId);
  const phases = scenario.phases || [];
  const currentPhaseIndex = session.currentPhaseIndex;

  // ── Handler resolution + pre-computed values for ChatView ──
  const activeHandler = resolvePhaseHandler(currentPhaseConfig);
  const interviewGateActive = InterviewHandler.isGateActive(currentPhaseConfig, interviewStarted);
  const interviewBriefingActor = InterviewHandler.getBriefingActor(currentPhaseConfig);
  // Show the "Faire entrer" button on the briefing actor's conversation (if configured),
  // or on any conversation if no briefing_actor is set (legacy behavior).
  const chatIsManualStart = interviewGateActive && (
    interviewBriefingActor ? selectedContact === interviewBriefingActor : true
  );
  const chatCandidateFirstName = InterviewHandler.getCandidateFirstName(currentPhaseConfig, actors);
  const chatInterviewButtonLabel = InterviewHandler.getButtonLabel(currentPhaseConfig);
  const chatContactAvailable = (() => {
    if (!selectedContact) return true;
    const contactActor = actors.find((a: any) => a.actor_id === selectedContact);
    const contactResolvedId = resolveActor(selectedContact);
    const contactInPhase = currentPhaseAiActors.includes(contactResolvedId);
    const contactBusyAfter = (contactActor as any)?.busy_after_phase;
    const contactIsBusy = contactBusyAfter && session && (() => {
      const idx = scenario?.phases?.findIndex((p: any) => p.phase_id === contactBusyAfter);
      return idx !== undefined && idx >= 0 && session.currentPhaseIndex > idx;
    })();
    return contactInPhase && !contactIsBusy;
  })();
  const chatContactBusyMessage = (() => {
    if (!selectedContact) return "";
    const contactActor = actors.find((a: any) => a.actor_id === selectedContact);
    const contactBusyAfter = (contactActor as any)?.busy_after_phase;
    const isBusyAfterPhase = contactBusyAfter && session && (() => {
      const idx = scenario?.phases?.findIndex((p: any) => p.phase_id === contactBusyAfter);
      return idx !== undefined && idx >= 0 && session.currentPhaseIndex > idx;
    })();
    return isBusyAfterPhase ? ((contactActor as any).busy_message || "Occupé") : ((contactActor as any)?.busy_message || "Ce contact n'est pas disponible pour le moment.");
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", background: "#f3f2f1", overflow: "hidden" }}>

      {/* ═══════ TOAST NOTIFICATIONS ═══════ */}
      <ToastContainer
        toasts={toasts}
        onDismiss={dismissToast}
        onActivate={(type) => setMainView(type)}
      />

      {/* ═══════ FOUNDER RESUME PENALTY BANNER ═══════ */}
      <ResumeBanner visible={!!resumeBanner} onDismiss={() => setResumeBanner(null)} />

      {/* ═══════ FOUNDER SAVE INFO (persistent) ═══════ */}
      <SaveInfo visible={isFounderScenario && !resumeBanner && !view.isFinished} />

      {/* ═══════ TOP BAR ═══════ */}
      <PlayerHeader
        scenarioTitle={scenario.meta?.title || "Scénario"}
        phases={phases}
        completedPhases={session.completedPhases}
        currentPhaseIndex={currentPhaseIndex}
        simulatedTime={simulatedTime}
        showBriefingOverlay={showBriefingOverlay}
        onHome={() => router.push("/")}
        onOpenBriefing={() => setShowBriefingOverlay(true)}
      />

      {/* ═══════ BRIEFING OVERLAY ═══════ */}
      {/* ── Inline document content modal ── */}
      <InlineDocModal doc={inlineDocContent} onClose={() => setInlineDocContent(null)} />
      {/* ── Contract overlays (S0/S2/S4/S5) — rendered by ContractOverlayHost ── */}
      <ContractOverlayHost
        playerName={displayPlayerName}
        s0={{
          visible: showSignatureView,
          onClose: () => setShowSignatureView(false),
          articles: pacteArticles,
          thread: pacteThread,
          threadLoading: pacteThreadLoading,
          input: amendmentInput,
          onInputChange: setAmendmentInput,
          onSendMessage: sendPacteNegotiationMessage,
          onClauseAction: (msg: string) => sendPacteNegotiationMessage(msg),
          signed: pacteSigned,
          onSign: () => {
            setPacteSigned(true);
            if (session && scenario) {
              const next = cloneSession(session);
              const phase = scenario.phases[next.currentPhaseIndex];

              // ── ContractModule handles sign via PhaseOrchestrator ──
              const moduleResult = dispatchContractSigned("s0_pacte", {
                contractType: "s0_pacte",
                articles: pacteArticles,
                thread: pacteThread,
                currentFlags: next.flags,
                ctoName: getActorInfo(chosenCtoId || "sofia_renault").name,
                phaseMailConfig: phase?.mail_config,
              }, next);

              if (!moduleResult) {
                console.error("[ContractModule] s0_pacte: no module result — sign aborted");
                return;
              }
              applyModuleActions(moduleResult.actions, next);
              setSession(next);
            }
            setShowSignatureView(false);
            playNotificationSound();
          },
          ctoInfo: (() => {
            const info = getActorInfo(chosenCtoId || "sofia_renault");
            return { name: info.name, color: info.color, initials: info.initials };
          })(),
          currentPhaseId,
        }}
        s2={{
          visible: showContractSignature,
          onClose: () => setShowContractSignature(false),
          articles: novadevArticles,
          thread: novadevThread,
          threadLoading: novadevThreadLoading,
          input: novadevNegInput,
          onInputChange: setNovadevNegInput,
          onSendMessage: sendNovadevNegotiationMessage,
          onClauseAction: (msg: string) => sendNovadevNegotiationMessage(msg),
          signed: contractSigned,
          onSign: () => {
            if (!ContractHandler.canSign("s2_novadev", novadevThread.length)) return;
            setContractSigned(true);
            if (session && scenario) {
              const next = cloneSession(session);

              // ── ContractModule handles sign via PhaseOrchestrator ──
              const moduleResult = dispatchContractSigned("s2_novadev", {
                contractType: "s2_novadev",
                articles: novadevArticles,
                contractVars: { price: contractVars.price, equity: contractVars.equity },
              }, next);

              if (!moduleResult) {
                console.error("[ContractModule] s2_novadev: no module result — sign aborted");
                return;
              }
              applyModuleActions(moduleResult.actions, next);
              setSession(next);
            }
            setShowContractSignature(false);
            playNotificationSound();
          },
        }}
        s4={{
          visible: showDevisNego,
          onClose: () => setShowDevisNego(false),
          features: devisFeatures,
          onFeatureChange: setDevisFeatures,
          locked: devisLocked,
          onLock: () => setDevisLocked(true),
          messages: devisNegoMessages,
          input: devisNegoInput,
          onInputChange: setDevisNegoInput,
          loading: devisNegoLoading,
          onSendMessage: sendDevisNegoMsg,
          dealTerms,
          prevDealTerms,
          signed: devisSigned,
          onSign: handleDevisSign,
          chatRef: devisNegoChatRef,
          establishmentLabel: resolveEstablishment(session?.flags || {})?.label || null,
        }}
        s5={{
          visible: showExceptionsOverlay,
          onClose: () => setShowExceptionsOverlay(false),
          articles: exceptionsArticles,
          thread: exceptionsThread,
          threadLoading: exceptionsThreadLoading,
          input: exceptionsNegInput,
          onInputChange: setExceptionsNegInput,
          onSendMessage: sendExceptionsNegotiationMessage,
          onClauseAction: (msg: string) => sendExceptionsNegotiationMessage(msg),
          signed: exceptionsSigned,
          onSign: () => {
            if (!ContractHandler.canSign("s5_exceptions", exceptionsThread.length)) return;
            setExceptionsSigned(true);
            if (session && scenario) {
              const next = cloneSession(session);

              // ── ContractModule handles sign via PhaseOrchestrator ──
              const moduleResult = dispatchContractSigned("s5_exceptions", {
                contractType: "s5_exceptions",
                articles: exceptionsArticles,
              }, next);

              if (!moduleResult) {
                console.error("[ContractModule] s5_exceptions: no module result — sign aborted");
                return;
              }
              applyModuleActions(moduleResult.actions, next);
              setSession(next);
            }
            setShowExceptionsOverlay(false);
            playNotificationSound();
          },
        }}
      />



      {/* ═══════ CLINICAL CONTRACT SIGNATURE OVERLAY (Scenario 3) ═══════ */}
      {(() => {
        const isCHU = !!session?.flags?.chose_chu;
        const isSM = !!session?.flags?.chose_saint_martin;
        const contactActor = isCHU ? "contact_chu" : isSM ? "contact_saint_martin" : "contact_clinique";
        return (
          <ClinicalContractOverlay
            visible={showClinicalContract}
            onClose={() => setShowClinicalContract(false)}
            playerName={displayPlayerName || "CEO"}
            etablissementLabel={isCHU ? "CHU de Bordeaux (Pellegrin)" : isSM ? "Hôpital Privé Saint-Martin" : "Clinique Saint-Augustin"}
            signataireName={isCHU ? "Dr. Pierre Lemaire" : isSM ? "Laurent Castex" : "Dr. Claire Renaud-Picard"}
            juristeName={isCHU ? "Me Laurent Gauthier" : isSM ? "Me Sophie Arnaud" : "Me Pauline Roche"}
            contactInfo={getActorInfo(contactActor)}
            articles={clinicalContractArticles}
            thread={clinicalNegThread}
            threadLoading={clinicalNegLoading}
            inputValue={clinicalNegInput}
            onInputChange={setClinicalNegInput}
            onSendMessage={sendClinicalNegotiationMessage}
            signed={clinicalContractSigned}
            refused={clinicalContractRefused}
            onSign={handleClinicalSign}
            onRefused={handleClinicalRefused}
          />
        );
      })()}

      {/* ═══════ ONE-PAGER EDITOR OVERLAY (Scenario 1+) ═══════ */}
      <OnePagerEditor
        visible={showOnePagerEditor}
        edited={onePagerEdited}
        submitted={onePagerSubmitted}
        pdfPath={
          (scenario?.resources?.documents?.find(
            (d: any) => d.doc_id === "one_pager_template",
          ) as any)?.file_path || ""
        }
        scenarioId={scenarioId as string}
        onClose={() => setShowOnePagerEditor(false)}
        onEditedFirst={() => setOnePagerEdited(true)}
        onSubmit={(onePagerText) => {
          // 1. Mark as submitted
          setOnePagerSubmitted(true);
          // 2. Set flags and send mail
          if (session && scenario) {
            const next = cloneSession(session);
            next.flags.one_pager_submitted = true;
            const phase = scenario.phases[next.currentPhaseIndex];
            const phaseId = phase?.phase_id;
            if (phaseId) {
              const defaults = (phase?.mail_config?.defaults || {}) as any;
              updateMailDraft(next, phaseId, {
                to: defaults.to || "jury@technowest.fr",
                cc: defaults.cc || "",
                subject: defaults.subject || "Candidature Orisio — One-pager",
                body: `Bonjour,\n\nVeuillez trouver ci-dessous le one-pager de notre startup Orisio.\n\n---\n\n${onePagerText}\n\n---\n\nCordialement,\n${displayPlayerName || "CEO"}\nOrisio`,
                attachments: [{ id: "one_pager_template", label: "One-Pager — Orisio" }],
              });
              const mailKind = phase?.mail_config?.kind || "one_pager_submission";
              sendCurrentPhaseMail(next, mailKind);
              if (phase?.mail_config?.send_advances_phase) {
                completeCurrentPhaseAndAdvance(next);
                resolveDynamicActors(next);
                resolveEstablishmentPlaceholders(next);
                injectPhaseEntryEvents(next);
                dispatchEnterPhase(next);
                const newPhase = scenario.phases[next.currentPhaseIndex];
                if (newPhase?.mail_config?.defaults) {
                  updateMailDraft(next, newPhase.phase_id, {
                    to: "",
                    cc: "",
                    subject: newPhase.mail_config.defaults.subject || "",
                    body: "",
                    attachments: [],
                  });
                }
                if (isFounderScenario && phaseId) {
                  notifyCheckpointAdvance(phaseId, next.currentPhaseIndex);
                }
              }
            }
            setSession(next);
          }
          setShowOnePagerEditor(false);
          playNotificationSound();
        }}
      />

      <BriefingOverlay
        visible={showBriefingOverlay}
        scenario={scenario}
        documents={allDocuments}
        onClose={() => setShowBriefingOverlay(false)}
        onSelectDoc={(docId) => {
          setSelectedDocId(docId);
          setRightPanel("docs");
          setShowBriefingOverlay(false);
        }}
      />

      {/* ═══════ BODY ═══════ */}
      {currentInteractionMode === "presentation" ? (
        /* ═══ PRESENTATION MODE ═══ */
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "auto", background: "linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)", padding: 40 }}>

          {!presentationDone ? (
            <div style={{ textAlign: "center", maxWidth: 700, width: "100%" }}>
              {/* Voice capability banner — proactively tells the user which
                  mode will be used (native instant vs backend Whisper). */}
              {voiceCapabilities && voiceCapabilities.recommendedMode === "unavailable" && (
                <div style={{
                  background: "rgba(233,75,60,0.15)", border: "1px solid rgba(233,75,60,0.4)",
                  borderRadius: 10, padding: "12px 16px", marginBottom: 16,
                  color: "#ffb4b4", fontSize: 13, textAlign: "left",
                }}>
                  ⚠️ <strong>Capture audio indisponible sur ce navigateur.</strong> Utilisez
                  une version récente de Chrome, Firefox, Safari ou Edge (HTTPS requis).
                </div>
              )}
              {voiceCapabilities && voiceCapabilities.recommendedMode === "backend" && (
                <div style={{
                  background: "rgba(245,166,35,0.12)", border: "1px solid rgba(245,166,35,0.35)",
                  borderRadius: 10, padding: "12px 16px", marginBottom: 16,
                  color: "#ffd28a", fontSize: 12, textAlign: "left",
                }}>
                  ℹ️ Votre navigateur ne propose pas la transcription temps réel (Firefox, etc.).
                  Pas de souci : l'audio sera enregistré puis transcrit côté serveur quand vous cliquerez sur stop.
                </div>
              )}
              {/* Fatal voice error (mic refused, no device, etc.) */}
              {voiceFatalError && (
                <div style={{
                  background: "rgba(233,75,60,0.15)", border: "1px solid rgba(233,75,60,0.4)",
                  borderRadius: 10, padding: "12px 16px", marginBottom: 16,
                  color: "#ffb4b4", fontSize: 13, textAlign: "left",
                }}>
                  ⚠️ {voiceFatalError.message}
                </div>
              )}
              {/* Instructions */}
              <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 16, padding: "24px 32px", marginBottom: 32, textAlign: "left", border: "1px solid rgba(255,255,255,0.1)" }}>
                <h2 style={{ color: "#7b7fff", fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 12px" }}>
                  🎤 Présentation orale
                </h2>
                <p style={{ color: "#e0e0e0", fontSize: 14, lineHeight: 1.7, margin: 0, whiteSpace: "pre-line" }}>
                  {(currentPhaseConfig as any)?.presentation_config?.instructions || view?.phaseObjective || ""}
                </p>
              </div>

              {/* Mic button */}
              <div style={{ marginBottom: 24 }}>
                <button
                  onClick={() => {
                    if (isRecording) {
                      endPresentation("manual");
                    } else {
                      // Start recording
                      const lang = (currentPhaseConfig as any)?.presentation_config?.language || "fr-FR";
                      startRecognition(lang);
                    }
                  }}
                  style={{
                    width: 120, height: 120, borderRadius: "50%",
                    background: isRecording ? "#e94b3c" : "#5b5fc7",
                    border: isRecording ? "4px solid rgba(233,75,60,0.3)" : "4px solid rgba(91,95,199,0.3)",
                    color: "#fff", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 48, transition: "all .2s",
                    boxShadow: isRecording ? "0 0 40px rgba(233,75,60,0.4)" : "0 0 30px rgba(91,95,199,0.3)",
                  }}
                >
                  {isRecording ? "⏹" : "🎙️"}
                </button>
              </div>

              {/* Status text */}
              <div style={{ color: isRecording ? "#ff8a80" : "#7b7fff", fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
                {isRecording ? "Cliquez sur le micro pour terminer votre présentation" : "Cliquez sur le micro pour commencer"}
              </div>

              {/* Timer */}
              {isRecording && (
                <div style={{ color: "#fff", fontSize: 32, fontWeight: 700, fontVariantNumeric: "tabular-nums", marginBottom: 24 }}>
                  {Math.floor(recordingElapsed / 60).toString().padStart(2, "0")}:{(recordingElapsed % 60).toString().padStart(2, "0")}
                  <span style={{ fontSize: 14, color: "#888", marginLeft: 12 }}>
                    / {Math.floor(((currentPhaseConfig as any)?.presentation_config?.max_duration_sec || 300) / 60)}:00
                  </span>
                </div>
              )}

              {/* Live transcription */}
              {(voiceTranscript || interimText) && (
                <div style={{
                  background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "16px 20px",
                  maxHeight: 200, overflowY: "auto", textAlign: "left",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#7b7fff", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                    Transcription en direct
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: "#ccc", lineHeight: 1.6 }}>
                    {voiceTranscript}
                    {interimText && <span style={{ color: "#888", fontStyle: "italic" }}>{interimText}</span>}
                  </p>
                </div>
              )}
            </div>
          ) : presentationError ? (
            /* Explicit error state — replaces the infinite spinner */
            <div style={{ textAlign: "center", maxWidth: 520 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
              <h3 style={{ color: "#ffb4b4", fontSize: 18, fontWeight: 700, margin: "0 0 12px" }}>
                {presentationError.category === "empty_transcript"
                  ? "Aucun audio détecté"
                  : presentationError.category === "timeout"
                    ? "Analyse expirée"
                    : presentationError.category === "network"
                      ? "Problème de connexion"
                      : presentationError.category === "invalid_response"
                        ? "Réponse invalide du serveur"
                        : "Erreur serveur"}
              </h3>
              <p style={{ color: "#e0e0e0", fontSize: 14, lineHeight: 1.6, margin: "0 0 24px" }}>
                {presentationError.message}
              </p>
              <button
                onClick={() => {
                  setPresentationError(null);
                  setPresentationDone(false);
                  setVoiceTranscript("");
                  voiceTranscriptRef.current = "";
                  setRecordingElapsed(0);
                  presentationAutoStoppedRef.current = false;
                }}
                style={{
                  padding: "12px 28px", borderRadius: 10,
                  background: "#5b5fc7", color: "#fff",
                  border: "none", cursor: "pointer",
                  fontSize: 14, fontWeight: 600,
                }}
              >
                🔄 Réessayer la présentation
              </button>
            </div>
          ) : (
            /* Processing state after recording. If we're waiting on
               backend Whisper transcription (Firefox / no native SR),
               show an explicit message so the user understands why
               the final transcript takes a few seconds. */
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 48, height: 48, border: "4px solid rgba(255,255,255,0.2)", borderTopColor: "#7b7fff", borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto 20px" }} />
              <p style={{ color: "#e0e0e0", fontSize: 16, fontWeight: 600 }}>
                {voiceTranscribing
                  ? "Transcription de votre présentation en cours..."
                  : "Transition en cours..."}
              </p>
              {voiceTranscribing && (
                <p style={{ color: "#888", fontSize: 12, marginTop: 8 }}>
                  Envoi au service de transcription (jusqu'à 60 s)
                </p>
              )}
            </div>
          )}
        </div>

      ) : currentInteractionMode === "voice_qa" ? (
        /* ═══ VOICE Q&A MODE ═══ */
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "linear-gradient(180deg, #f8f9fc 0%, #eef0f5 100%)" }}>

          {/* Participants row — adapts to children (CMJ) or jury (incubator) */}
          {(currentPhaseConfig as any)?.voice_qa_config?.children_names ? (
            /* ── Children mode (CMJ) ── */
            <div style={{ padding: "20px 24px 12px", flexShrink: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
                🏫 Les enfants du CMJ
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {((currentPhaseConfig as any).voice_qa_config.children_names || []).map((childName: string) => {
                  const hasHand = raisedHands.includes(childName);
                  const childColors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F"];
                  const colorIdx = childName.charCodeAt(0) % childColors.length;
                  return (
                    <button
                      key={childName}
                      onClick={async () => {
                        if (!hasHand || qaWaiting || isSpeakingTTS) return;
                        setQaWaiting(true);
                        setRaisedHands(prev => prev.filter(n => n !== childName));
                        try {
                          const question = await generateNPCMessage(
                            "enfants_cmj",
                            `INSTRUCTION: C'est ${childName} qui lève la main. Réponds UNIQUEMENT avec la réplique de ${childName}. UN SEUL enfant (${childName}), UNE question courte (1-2 phrases). Ne fais parler AUCUN autre enfant.`
                          );
                          const next = cloneSession(session);
                          addAIMessage(next, question, "enfants_cmj");
                          setSession(next);
                        } catch (err) {
                          console.error("Erreur génération question:", err);
                        } finally {
                          setQaWaiting(false);
                        }
                      }}
                      disabled={!hasHand || qaWaiting || isSpeakingTTS}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                        padding: "8px 12px", borderRadius: 12,
                        background: hasHand ? "#fff" : "#f0f0f0",
                        border: hasHand ? "2px solid #5b5fc7" : "2px solid transparent",
                        cursor: hasHand && !qaWaiting ? "pointer" : "default",
                        opacity: hasHand ? 1 : 0.5,
                        transition: "all .2s",
                        boxShadow: hasHand ? "0 2px 8px rgba(91,95,199,0.15)" : "none",
                        transform: hasHand ? "translateY(-2px)" : "none",
                      }}
                    >
                      <div style={{
                        width: 44, height: 44, borderRadius: "50%",
                        background: childColors[colorIdx],
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 20, position: "relative",
                      }}>
                        <span style={{ fontWeight: 700, color: "#fff", fontSize: 16 }}>
                          {childName[0]}
                        </span>
                        {hasHand && (
                          <span style={{
                            position: "absolute", top: -8, right: -8, fontSize: 20,
                            animation: "handWave 1s ease-in-out infinite",
                          }}>
                            🙋
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: hasHand ? "#333" : "#999" }}>
                        {childName}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : currentPhaseAiActors.length > 0 ? (
            /* ── Jury / multi-actor panel ── */
            <div style={{ padding: "16px 24px 12px", flexShrink: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
                🎙️ Le jury
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {currentPhaseAiActors.map((actorId: string) => {
                  const info = getActorInfo(actorId);
                  const lastNpc = [...conversation].reverse().find((m: any) => m.role === "npc" && currentPhaseAiActors.includes(m.actor));
                  const isLastSpeaker = lastNpc?.actor === actorId;
                  const isActivelySpeaking = speakingActorId === actorId && isSpeakingTTS;
                  const isHighlighted = isActivelySpeaking || isLastSpeaker;
                  return (
                    <div
                      key={actorId}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                        padding: "8px 14px", borderRadius: 12,
                        background: isHighlighted ? "#fff" : "#f5f5f5",
                        border: isHighlighted ? "2px solid " + info.color : "2px solid transparent",
                        transition: "all .2s",
                        boxShadow: isHighlighted ? "0 2px 8px rgba(0,0,0,0.1)" : "none",
                      }}
                    >
                      <Avatar initials={info.initials} color={info.color} size={40} status={info.status} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: isHighlighted ? "#333" : "#888" }}>
                        {info.name.split(" ")[0]}
                      </span>
                      {isActivelySpeaking ? (
                        <span style={{ fontSize: 9, color: info.color, fontWeight: 700 }}>
                          🔊 En train de parler
                        </span>
                      ) : isSending && isLastSpeaker ? (
                        <span style={{ fontSize: 9, color: "#999", fontWeight: 600 }}>
                          Réflexion...
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Interaction area */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "0 24px", overflow: "auto" }}>

            {/* Recent messages (spoken) */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, padding: "16px 0" }}>
              {conversation.filter((m: any) => m.role !== "system").slice(-8).map((msg: any) => {
                const isPlayer = msg.role === "player";
                const actor = !isPlayer ? getActorInfo(msg.actor || "npc") : null;
                const isCurrentlySpeaking = speakingActorId === msg.actor && isSpeakingTTS;
                return (
                  <div
                    key={msg.id}
                    style={{
                      display: "flex", gap: 10, alignItems: "flex-start",
                      flexDirection: isPlayer ? "row-reverse" : "row",
                      maxWidth: "85%", alignSelf: isPlayer ? "flex-end" : "flex-start",
                      opacity: isCurrentlySpeaking ? 1 : 0.8,
                    }}
                  >
                    {!isPlayer && actor && (
                      <Avatar initials={actor.initials} color={actor.color} size={36} status={actor.status} />
                    )}
                    {isPlayer && (
                      <Avatar initials={displayPlayerName ? getInitials(displayPlayerName) : "CEO"} color="#5b5fc7" size={36} />
                    )}
                    <div>
                      <div style={{ fontSize: 11, color: "#888", marginBottom: 3, textAlign: isPlayer ? "right" : "left" }}>
                        {isPlayer ? (displayPlayerName || "CEO") : actor?.name}
                        {isCurrentlySpeaking && <span style={{ marginLeft: 8, color: "#5b5fc7" }}>🔊 En train de parler...</span>}
                      </div>
                      <div style={{
                        background: isPlayer ? "#5b5fc7" : msg.actor === "yuki_tanaka" ? "#C62828" : "#fff",
                        color: isPlayer || msg.actor === "yuki_tanaka" ? "#fff" : "#333",
                        padding: "10px 16px", borderRadius: 16,
                        borderTopRightRadius: isPlayer ? 4 : 16,
                        borderTopLeftRadius: isPlayer ? 16 : 4,
                        fontSize: 14, lineHeight: 1.5,
                        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                        border: !isPlayer && msg.actor !== "yuki_tanaka" ? "1px solid #e8e8e8" : "none",
                      }}>
                        {msg.content}
                      </div>
                    </div>
                  </div>
                );
              })}
              {qaWaiting && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 0" }}>
                  <div style={{ background: "#f0f0f0", borderRadius: 16, padding: "10px 16px" }}>
                    <TypingDots />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Mic area — push-to-talk with pitch timer */}
          {(() => {
            const isPitchPhase = currentPhaseAiActors.length === 0;
            const micDisabled = isPitchPhase && pitchCutoff;
            const yukiActor = actors.find((a: any) => a.actor_id === "yuki_tanaka");
            // Timer color based on remaining seconds
            const timerColor = pitchSecondsLeft <= 5 ? "#e94b3c" : pitchSecondsLeft <= 15 ? "#f5a623" : "#4ade80";

            return (
              <div style={{ padding: "12px 24px 20px", borderTop: "1px solid #e0e0e0", background: "#fff", flexShrink: 0 }}>

                {/* Pitch timer bar */}
                {isPitchPhase && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: 1 }}>
                        ⏱️ Elevator pitch
                      </span>
                      <span style={{
                        fontSize: 22, fontWeight: 800, fontFamily: "monospace",
                        color: timerColor,
                        transition: "color .3s",
                      }}>
                        {pitchTimerActive || pitchCutoff
                          ? `${String(Math.floor(pitchSecondsLeft / 60)).padStart(1, "0")}:${String(pitchSecondsLeft % 60).padStart(2, "0")}`
                          : "0:40"}
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div style={{ width: "100%", height: 6, borderRadius: 3, background: "#f0f0f0", overflow: "hidden" }}>
                      <div style={{
                        width: `${((40 - pitchSecondsLeft) / 40) * 100}%`,
                        height: "100%", borderRadius: 3,
                        background: timerColor,
                        transition: "width .25s linear, background .3s",
                      }} />
                    </div>
                    {pitchCutoff && (
                      <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: "#e94b3c", textAlign: "center" }}>
                        ⏰ Temps écoulé — Passage aux questions du jury
                      </div>
                    )}
                    {!pitchTimerActive && !pitchCutoff && !isRecording && (
                      <div style={{ marginTop: 8, fontSize: 12, color: "#888", textAlign: "center" }}>
                        Appuyez sur 🎙️ pour démarrer votre pitch (40 secondes)
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>

                  {/* Yuki avatar (if present) */}
                  {yukiActor && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Avatar
                        initials={yukiActor.avatar?.initials || "YT"}
                        color={yukiActor.avatar?.color || "#C62828"}
                        size={40}
                        status={speakingActorId === "yuki_tanaka" ? "busy" : "available"}
                      />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#333" }}>Yuki Tanaka</div>
                        <div style={{ fontSize: 10, color: speakingActorId === "yuki_tanaka" ? "#C62828" : "#999" }}>
                          {speakingActorId === "yuki_tanaka" ? "🔊 Speaking..." : "Ready"}
                        </div>
                      </div>
                    </div>
                  )}

                  <div style={{ flex: 1 }} />

                  {/* Mic indicator + toggle */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      background: micDisabled ? "#f5f5f5" : isRecording ? "#fef2f2" : "#f0f0f0",
                      padding: "8px 16px", borderRadius: 20,
                      border: micDisabled ? "1px solid #e0e0e0" : isRecording ? "1px solid #fca5a5" : "1px solid #ddd",
                    }}>
                      <div style={{
                        width: 12, height: 12, borderRadius: "50%",
                        background: micDisabled ? "#ccc" : isRecording ? "#e94b3c" : "#999",
                        animation: isRecording && !micDisabled ? "micBlink 1s ease-in-out infinite" : "none",
                      }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: micDisabled ? "#bbb" : isRecording ? "#e94b3c" : "#999" }}>
                        {micDisabled
                          ? "⏰ Pitch terminé"
                          : voiceTranscribing
                            ? "Transcription..."
                            : isRecording
                              ? (isSending ? "Analyse en cours..." : "🎤 Parlez puis appuyez sur 🔇 pour envoyer")
                              : isSpeakingTTS
                                ? "🔊 Écoutez le jury..."
                                : "Micro coupé — Appuyez sur 🎙️ pour parler"}
                      </span>
                    </div>
                    {voiceFatalError && (
                      <span style={{ fontSize: 11, color: "#c62828", fontWeight: 600 }} title={voiceFatalError.message}>
                        ⚠️ {voiceFatalError.category === "permission_denied" ? "Micro refusé"
                           : voiceFatalError.category === "mic_missing" ? "Aucun micro"
                           : voiceFatalError.category === "mic_busy" ? "Micro occupé"
                           : "Indisponible"}
                      </span>
                    )}
                    <button
                      disabled={micDisabled || isSending}
                      onClick={() => {
                        if (micDisabled || isSending) return;
                        if (isRecording) {
                          // Push-to-talk STOP: stop recording and dispatch
                          if (autoSendTimerRef.current) { clearTimeout(autoSendTimerRef.current); autoSendTimerRef.current = null; }
                          // For pitch phase: also stop the timer and mark cutoff
                          if (isPitchPhase && pitchTimerActive) {
                            if (pitchTimerRef.current) { clearInterval(pitchTimerRef.current); pitchTimerRef.current = null; }
                            setPitchTimerActive(false);
                            setPitchCutoff(true);
                          }
                          stopRecognition().then((result) => {
                            const pending = result.transcript.trim();
                            if (pending && result.source !== "error") {
                              dispatchVoiceQAMessage(pending);
                            }
                          }).catch(() => {});
                        } else {
                          // Push-to-talk START
                          startRecognition("fr-FR", false);
                          // Start pitch timer on first mic activation
                          if (isPitchPhase && !pitchCutoff && !pitchTimerActive) {
                            setPitchTimerActive(true);
                          }
                        }
                      }}
                      style={{
                        width: 44, height: 44, borderRadius: "50%",
                        background: micDisabled ? "#ccc" : isRecording ? "#e94b3c" : "#5b5fc7",
                        border: "none", color: "#fff",
                        cursor: micDisabled || isSending ? "not-allowed" : "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 20, transition: "all .2s",
                        opacity: micDisabled ? 0.5 : 1,
                      }}
                    >
                      {micDisabled ? "🚫" : isRecording ? "🔇" : "🎙️"}
                    </button>
                  </div>
                </div>

                {/* Live transcription subtitle */}
                {(voiceTranscript || interimText) && isRecording && !micDisabled && (
                  <div style={{ marginTop: 10, padding: "8px 12px", background: "#f8f8ff", borderRadius: 8, border: "1px solid #e8e8ff" }}>
                    <span style={{ fontSize: 12, color: "#555", lineHeight: 1.4 }}>
                      {voiceTranscript}
                      {interimText && <span style={{ color: "#aaa", fontStyle: "italic" }}>{interimText}</span>}
                    </span>
                    {voiceTranscript && !isSending && isRecording && (
                      <span style={{ fontSize: 10, color: "#7b7fff", marginLeft: 8 }}>
                        (appuyez sur 🔇 pour envoyer)
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

      ) : (
        /* ═══ NORMAL CHAT/MAIL MODE (existing code) ═══ */
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ═══════ LEFT SIDEBAR — Nav + Contacts ═══════ */}
        <LeftSidebar
          mainView={mainView}
          onMainViewChange={(v) => setMainView(v as MainView)}
          unreadMails={unreadMails}
          hasMindmapTool={hasMindmapTool}
          mailLockedForNow={mailLockedForNow}
          visibleContacts={visibleContacts}
          selectedContact={selectedContact}
          onSelectContact={(actorId) => {
            setSelectedContact(actorId);
            setMainView("chat");
          }}
          resolveActor={resolveActor}
          currentPhaseAiActors={currentPhaseAiActors}
          conversation={conversation}
          contactUnreadCounts={contactUnreadCounts}
          session={session}
          scenario={scenario}
          phaseObjective={phaseObjective}
        />

        {/* ═══════ CENTER — Main content ═══════ */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#fff" }}>

          {/* ─── CHAT VIEW ─── */}
          {mainView === "chat" && (
            <ChatView
              selectedContact={selectedContact}
              actors={actors}
              phaseTitle={phaseTitle}
              getActorInfo={getActorInfo}
              displayPlayerName={displayPlayerName}
              filteredConversation={filteredConversation}
              isSending={isSending}
              chatEndRef={chatEndRef}
              scenarioId={scenarioId}
              scenarioDocs={scenario?.resources?.documents || []}
              onePagerSubmitted={onePagerSubmitted}
              onOpenOnePager={() => setShowOnePagerEditor(true)}
              playerInput={playerInput}
              onPlayerInputChange={setPlayerInput}
              inputRef={inputRef}
              onSendMessage={sendMessage}
              isManualStart={chatIsManualStart}
              candidateFirstName={chatCandidateFirstName}
              interviewButtonLabel={chatInterviewButtonLabel}
              onStartInterview={handleStartInterview}
              contactAvailable={chatContactAvailable}
              contactBusyMessage={chatContactBusyMessage}
              hasNotesForInsert={hasMindmapTool && outlineItems.filter((i) => i.text.trim()).length > 0}
              onInsertNotesInChat={handleInsertNotesInChat}
            />
          )}

          {/* ─── MAIL VIEW ─── */}
          {mainView === "mail" && (
            <MailView
              inboxMails={inboxMails}
              selectedMailId={selectedMailId}
              selectedMail={selectedMail}
              sentMails={view.sentMails || []}
              showCompose={showCompose}
              canComposeMail={canComposeMail}
              canActuallySendMail={canActuallySendMail}
              mailSendBlockReason={mailSendBlockReason}
              currentMailDraft={currentMailDraft}
              sendMailLabel={view.sendMailLabel || "Envoyer"}
              attachableDocs={attachableDocs}
              showContactPicker={showContactPicker}
              actors={actors}
              getActorInfo={getActorInfo}
              displayPlayerName={displayPlayerName}
              scenarioId={scenarioId}
              currentPhaseId={currentPhaseId}
              scenarioDocs={scenario?.resources?.documents || []}
              pacteSigned={pacteSigned}
              contractSigned={contractSigned}
              clinicalContractSigned={clinicalContractSigned}
              clinicalContractRefused={clinicalContractRefused}
              devisSigned={devisSigned}
              exceptionsSigned={exceptionsSigned}
              onePagerSubmitted={onePagerSubmitted}
              sessionFlags={session?.flags || {}}
              hasMindmapTool={hasMindmapTool}
              outlineItemCount={outlineItems.filter((i) => i.text.trim()).length}
              onSelectMail={(mailId) => { setSelectedMailId(mailId); setShowCompose(false); }}
              onNewCompose={handleNewCompose}
              onSetShowCompose={setShowCompose}
              onUpdateDraft={updateDraft}
              onSendMail={handleSendMail}
              onToggleAttachment={handleToggleAttachment}
              onSetContactPicker={setShowContactPicker}
              onReplyAll={handleReplyAll}
              onInsertOutlineNotes={handleInsertOutlineNotes}
              onOpenPacteSign={handleOpenPacteSign}
              onOpenContractSign={handleOpenContractSign}
              onOpenClinicalSign={handleOpenClinicalSign}
              onOpenDevisSign={handleOpenDevisSign}
              onOpenExceptionsSign={handleOpenExceptionsSign}
              onOpenOnePager={() => setShowOnePagerEditor(true)}
            />
          )}
          {/* ═══ NOTES / MIND MAP VIEW ═══ */}
          {mainView === "notes" && hasMindmapTool && (
            <NotesView
              outlineItems={outlineItems}
              outlineRawText={outlineRawText}
              onOutlineRawTextChange={setOutlineRawText}
              mindmapView={mindmapView}
              onMindmapViewChange={setMindmapView}
              outlineCopiedFeedback={outlineCopiedFeedback}
              onCopy={handleNotesCopy}
              onInsertInMail={handleNotesInsertInMail}
            />
          )}

        </main>

        {/* ═══════ RIGHT PANEL ═══════ */}
        <RightPanel
          tab={rightPanel}
          onTabChange={setRightPanel}
          scenario={scenario}
          allDocuments={allDocuments}
          scenarioId={scenarioId as string}
          currentPhaseId={currentPhaseId}
          pacteSigned={pacteSigned}
          onOpenInlineDoc={(title, content) => setInlineDocContent({ title, content })}
        />
      </div>
      )}

      {/* ═══════ DEBUG PANEL (only with ?debug=1) ═══════ */}
      <DebugPanel
        debugMode={debugMode}
        collapsed={debugCollapsed}
        onToggleCollapsed={() => setDebugCollapsed(!debugCollapsed)}
        scenario={scenario}
        session={session}
        view={view}
        allDocumentsCount={allDocuments.length}
        allDocumentsRawCount={allDocumentsRaw.length}
        onJumpToPhase={(idx) => {
          if (!session || !scenario) return;
          const updated = { ...session, currentPhaseIndex: idx };
          for (let i = 0; i < idx; i++) {
            const prevPhase = scenario.phases[i];
            if (prevPhase && !updated.scores[prevPhase.phase_id]) {
              updated.scores[prevPhase.phase_id] = 100;
            }
          }
          injectPhaseEntryEvents(updated);
          dispatchEnterPhase(updated);
          setSession({ ...updated });
        }}
      />
    </div>
  );
}
