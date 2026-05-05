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
  handlePhaseFailure,
} from "@/app/lib/runtime";
import type { ScenarioDefinition } from "@/app/lib/types";
import {
  startVoiceCapture,
  detectVoiceCapabilities,
  type VoiceCaptureSession,
  type VoiceCaptureResult,
  type VoiceCaptureCapabilities,
  type VoiceCaptureErrorCategory,
} from "@/app/lib/voiceCapture";
import { useDebrief } from "./hooks/useDebrief";
import DocumentsView from "./DocumentsView";
import MailView from "./MailView";
import DebriefView from "./DebriefView";
import NotesView from "./NotesView";
import ChatView from "./ChatView";
import { usePhaseTimer } from "./hooks/usePhaseTimer";
import { resolvePhaseHandler, InterviewHandler, ContractHandler, resolveModules, dispatch, buildModuleContext } from "./handlers";
import type { ModuleAction, ContractModuleContext } from "./handlers";
import type { MailModuleExtra } from "./handlers";
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

/* ═══ Establishment mapping (reused across scenarios 3 & 4) ═══ */
const ESTABLISHMENT_MAP: Record<string, { name: string; email: string; label: string }> = {
  chose_chu: { name: "Dr. Pierre Lemaire", email: "p.lemaire@chu-bordeaux.fr", label: "le CHU de Bordeaux" },
  chose_saint_martin: { name: "Laurent Castex", email: "l.castex@hp-saintmartin.fr", label: "l'Hôpital Saint-Martin" },
  chose_clinique: { name: "Dr. Claire Renaud-Picard", email: "c.renaud-picard@clinique-saint-augustin.fr", label: "la Clinique Saint-Augustin" },
};
function resolveEstablishment(flags: Record<string, any>): { name: string; email: string; label: string } {
  const key = flags.chose_chu ? "chose_chu" : flags.chose_saint_martin ? "chose_saint_martin" : "chose_clinique";
  return ESTABLISHMENT_MAP[key];
}

/** Replace {{establishment_email}} and {{establishment_name}} placeholders in mail_config defaults */
function resolveMailPlaceholders(mailConfig: any, flags: Record<string, any>) {
  if (!mailConfig?.defaults) return;
  const est = resolveEstablishment(flags);
  if (mailConfig.defaults.to?.includes("{{establishment_email}}")) {
    mailConfig.defaults.to = est.email;
  }
  if (mailConfig.defaults.subject?.includes("{{establishment_name}}")) {
    mailConfig.defaults.subject = mailConfig.defaults.subject.replace("{{establishment_name}}", est.label);
  }
  // Also resolve in entry_events content if needed
}

/* ═══ Mind Map / Outline types ═══ */
type OutlineItem = { id: string; text: string; depth: number };
let _outlineIdCounter = 0;
function mkOutlineId() { return `ol_${++_outlineIdCounter}_${Date.now()}`; }

/** Parse raw textarea text into structured outline items.
 *  Recognises indentation via: leading spaces/tabs, bullet chars (•◦▪▸‣·-*), numbered prefixes.
 *  Each 2 spaces or 1 tab = 1 depth level. */
function parseOutlineText(raw: string): OutlineItem[] {
  if (!raw.trim()) return [];
  const lines = raw.split("\n");
  const items: OutlineItem[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    // Count leading whitespace to determine depth
    const leadMatch = line.match(/^([\t ]*)/);
    const leadStr = leadMatch ? leadMatch[1] : "";
    // Each tab = 1 level, each 2 spaces = 1 level
    const tabCount = (leadStr.match(/\t/g) || []).length;
    const spaceCount = (leadStr.replace(/\t/g, "").length);
    let depth = tabCount + Math.floor(spaceCount / 2);
    // Strip leading bullet/number prefixes from the text
    let text = line.slice(leadStr.length);
    text = text.replace(/^(?:[•◦▪▫▸‣·\-\*]|\d+[.)]\s?)\s*/, "").trim();
    if (!text) continue;
    depth = Math.min(depth, 5);
    items.push({ id: mkOutlineId(), text, depth });
  }
  return items;
}

function outlineToText(items: OutlineItem[]): string {
  const bullets = ["•", "  ◦", "    ▪", "      ▸", "        ‣", "          ·"];
  return items
    .filter((i) => i.text.trim())
    .map((i) => {
      const prefix = bullets[Math.min(i.depth, bullets.length - 1)];
      return `${prefix} ${i.text.trim()}`;
    })
    .join("\n");
}

const STATUS_COLORS: Record<string, string> = {
  available: "#44b553",
  busy: "#e94b3c",
  away: "#f5a623",
  offline: "#999",
};

function cloneSession(prev: any) {
  return {
    ...prev,
    chatMessages: [...prev.chatMessages],
    inboxMails: [...prev.inboxMails],
    sentMails: [...prev.sentMails],
    actionLog: [...prev.actionLog],
    scores: { ...prev.scores },
    flags: { ...prev.flags },
    completedPhases: [...prev.completedPhases],
    unlockedPhases: [...prev.unlockedPhases],
    triggeredInterruptions: [...prev.triggeredInterruptions],
    injectedPhaseEntryEvents: [...prev.injectedPhaseEntryEvents],
    pendingTimedEvents: prev.pendingTimedEvents.map((e: any) => ({ ...e })),
    mailDrafts: JSON.parse(JSON.stringify(prev.mailDrafts || {})),
  };
}

function playNotificationSound() {
  if (typeof window === "undefined") return;
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
    osc.onended = () => ctx.close().catch(() => {});
  } catch {}
}

function fmtTime(iso: string | null) {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ════════════════════════════════════════════════════════════════════

function TypingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 3, marginLeft: 6 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 5, height: 5, borderRadius: "50%", background: "#888",
            animation: "dotPulse 1.4s infinite", animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
      <style>{`@keyframes dotPulse{0%,80%,100%{opacity:.3}40%{opacity:1}}`}</style>
    </span>
  );
}

/** Small colored circle for contact status */
function StatusDot({ status }: { status: string }) {
  return (
    <span
      style={{
        width: 10, height: 10, borderRadius: "50%",
        background: STATUS_COLORS[status] || STATUS_COLORS.offline,
        border: "2px solid #fff",
        position: "absolute", bottom: -1, right: -1,
        boxShadow: "0 0 0 1px #e0e0e0",
      }}
    />
  );
}

/** Avatar circle */
function Avatar({ initials, color, size = 36, status }: {
  initials: string; color: string; size?: number; status?: string;
}) {
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <div
        style={{
          width: size, height: size, borderRadius: "50%", background: color,
          color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 700, fontSize: size > 32 ? 13 : 11, userSelect: "none",
        }}
      >
        {initials}
      </div>
      {status && <StatusDot status={status} />}
    </div>
  );
}

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
  const [session, setSession] = useState<any>(null);
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
  const [toasts, setToasts] = useState<Array<{ id: string; text: string; icon: string; type: "chat" | "mail" }>>([]);
  const [pacteSigned, setPacteSigned] = useState(false);
  const [inlineDocContent, setInlineDocContent] = useState<{ title: string; content: string } | null>(null);
  const [showSignatureView, setShowSignatureView] = useState(false);
  const [pacteArticles, setPacteArticles] = useState<ContractClause[]>([]);
  const [amendmentInput, setAmendmentInput] = useState("");
  const [pacteThread, setPacteThread] = useState<ContractThreadMessage[]>([]);
  const [pacteThreadLoading, setPacteThreadLoading] = useState(false);
  // ── Mind Map / Outline tool (scenario 4+) ──
  const [outlineRawText, setOutlineRawText] = useState("");
  const outlineItems = useMemo(() => parseOutlineText(outlineRawText), [outlineRawText]);
  const hasMindmapTool = scenario?.meta?.tags?.includes("priorisation") || scenarioId === "founder_04_v1" || (scenario?.meta as any)?.notes_tool === true;
  const [outlineCopiedFeedback, setOutlineCopiedFeedback] = useState("");
  const [mindmapView, setMindmapView] = useState<"split" | "editor" | "map">("split");
  // ── Devis NovaDev negotiation (scenario 4, phase 3) ──
  const [showDevisNego, setShowDevisNego] = useState(false);
  const [devisSigned, setDevisSigned] = useState(false);
  const [devisNegoMessages, setDevisNegoMessages] = useState<Array<{ role: "player" | "npc"; content: string }>>([]);
  const [devisNegoInput, setDevisNegoInput] = useState("");
  const [devisNegoLoading, setDevisNegoLoading] = useState(false);
  const [devisFeatures, setDevisFeatures] = useState<Record<string, boolean>>({
    bug_fix: true,
    notifications: true,
    dashboard: true,
    materiel: true,
    api_si: true,
  });
  const [devisLocked, setDevisLocked] = useState(false); // Lock checkboxes after first message
  const [dealTerms, setDealTerms] = useState<{
    interessement: { pct: number; cap: number | null; duration: number } | null;
    bsa: number | null;
    discount: number;
  }>({ interessement: null, bsa: null, discount: 0 });
  const [prevDealTerms, setPrevDealTerms] = useState<{
    interessement: { pct: number; cap: number | null; duration: number } | null;
    bsa: number | null;
    discount: number;
  } | null>(null);
  const devisNegoChatRef = useRef<HTMLDivElement>(null);
  // ── Contract signature (scenario 2+) ──
  const [showContractSignature, setShowContractSignature] = useState(false);
  const [contractSigned, setContractSigned] = useState(false);
  const [contractVars, setContractVars] = useState<{
    price: string;
    features: string[];
    equity: string | null;
    rawMailBody: string;
  }>({ price: "", features: [], equity: null, rawMailBody: "" });
  const [novadevArticles, setNovadevArticles] = useState<ContractClause[]>([]);
  const [novadevThread, setNovadevThread] = useState<ContractThreadMessage[]>([]);
  const [novadevThreadLoading, setNovadevThreadLoading] = useState(false);
  const [novadevNegInput, setNovadevNegInput] = useState("");
  // ── Bon de commande exceptions (scenario 5) ──
  const [showExceptionsOverlay, setShowExceptionsOverlay] = useState(false);
  const [exceptionsArticles, setExceptionsArticles] = useState<ContractClause[]>([]);
  const [exceptionsThread, setExceptionsThread] = useState<ContractThreadMessage[]>([]);
  const [exceptionsThreadLoading, setExceptionsThreadLoading] = useState(false);
  const [exceptionsNegInput, setExceptionsNegInput] = useState("");
  const [exceptionsSigned, setExceptionsSigned] = useState(false);
  // ── Clinical contract signature (scenario 3) ──
  const [showClinicalContract, setShowClinicalContract] = useState(false);
  const [clinicalContractSigned, setClinicalContractSigned] = useState(false);
  const [clinicalContractArticles, setClinicalContractArticles] = useState<Array<{
    id: string; title: string; content: string; modifiedContent: string | null;
    toxic: boolean; moderate: boolean;
  }>>([]);
  const [clinicalNegThread, setClinicalNegThread] = useState<Array<{ role: "player" | "juriste"; content: string }>>([]);
  const [clinicalNegLoading, setClinicalNegLoading] = useState(false);
  const [clinicalNegInput, setClinicalNegInput] = useState("");
  const [clinicalContractRefused, setClinicalContractRefused] = useState(false);
  // ── One-pager editor (scenario 1+) ──
  const [showOnePagerEditor, setShowOnePagerEditor] = useState(false);
  const [onePagerEdited, setOnePagerEdited] = useState(false);
  const [onePagerSubmitted, setOnePagerSubmitted] = useState(false);
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
  const [isSpeakingTTS, setIsSpeakingTTS] = useState(false);
  const [speakingActorId, setSpeakingActorId] = useState<string | null>(null);
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
  const visibleContacts = actors.filter((a: any) => a.visible_in_contacts || a.actor_id === "player");

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

  // Resolve "chosen_cto" placeholder in phase config
  const resolveActor = (actorId: string) => actorId === "chosen_cto" && chosenCtoId ? chosenCtoId : actorId;

  // Patch a session's scenario phase entry_events/ai_actors to replace "chosen_cto" with the real actor.
  // This is called before injectPhaseEntryEvents so that runtime.ts sees the resolved actor.
  function resolveDynamicActors(sess: any) {
    if (!chosenCtoId || !sess?.scenario?.phases) return;
    for (const phase of sess.scenario.phases) {
      if (phase.dynamic_actor === "chosen_cto") {
        // Replace in ai_actors
        if (Array.isArray(phase.ai_actors)) {
          phase.ai_actors = phase.ai_actors.map((a: string) => a === "chosen_cto" ? chosenCtoId : a);
        }
        // Replace in entry_events
        if (Array.isArray(phase.entry_events)) {
          for (const ev of phase.entry_events) {
            if (ev.actor === "chosen_cto") ev.actor = chosenCtoId;
          }
        }
        // Replace in mail_config defaults "to"
        if (phase.mail_config?.defaults && !phase.mail_config.defaults.to) {
          // Auto-fill "to" with chosen CTO's name for convenience
          const ctoActor = actors.find((a: any) => a.actor_id === chosenCtoId);
          if (ctoActor) {
            phase.mail_config.defaults.to = ctoActor.name;
          }
        }
        // Mark as resolved so we don't re-process
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

  // ── Founder checkpoint: notify server on phase advance ──
  function notifyCheckpointAdvance(completedPhaseId: string, newPhaseIndex: number) {
    if (!isFounderScenario) return;
    fetch("/api/founder/checkpoint", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        scenarioId,
        action: "advance",
        completedPhaseId,
        phaseIndex: newPhaseIndex,
      }),
    }).catch((e) => console.warn("[founder] checkpoint advance failed:", e));
  }

  function notifyCheckpointClear() {
    if (!isFounderScenario) return;
    fetch("/api/founder/checkpoint", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ scenarioId, action: "clear" }),
    }).catch((e) => console.warn("[founder] checkpoint clear failed:", e));
  }

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
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        ttsAudioRef.current = null;
      }
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setIsSpeakingTTS(false);
      setSpeakingActorId(null);
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

  // ── Toast helper ──
  function addToast(text: string, icon: string, type: "chat" | "mail") {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, text, icon, type }]);
    playNotificationSound();
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
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

  useEffect(() => {
    async function init() {
      try {
        // ── Auth guard: un compte est requis pour jouer ──
        const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
        if (!token) {
          router.push("/login?redirect=" + encodeURIComponent(window.location.pathname));
          return;
        }

        // Validate the token is still valid server-side BEFORE starting the game.
        // This prevents the "dead chat" bug where a player has a stale token in
        // localStorage (from a previous session) and every API call fails silently.
        try {
          const authCheck = await fetch("/api/auth/session", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!authCheck.ok) {
            // Token is expired or invalid — force re-login
            localStorage.removeItem("auth_token");
            localStorage.removeItem("user_name");
            localStorage.removeItem("user_role");
            router.push("/login?redirect=" + encodeURIComponent(window.location.pathname));
            return;
          }
        } catch {
          // Network error — continue anyway, the retry logic in sendMessage will handle it
        }

        // Refresh the auth ref in case it was stale
        authTokenRef.current = token;

        const res = await fetch(`/api/scenarios/${scenarioId}`);
        if (!res.ok) throw new Error("Impossible de charger le scénario");
        const data: ScenarioDefinition = await res.json();

        // ── Founder lock guard (classic mode) ──
        // If this is a Founder scenario, verify the player either:
        // (a) has an active Founder campaign (playing in Founder mode), OR
        // (b) has already completed it in Founder mode (playing classic replay)
        const isFounderMeta = ((data.meta as any)?.job_family || "") === "founder";
        let activeCampaign: any = null;
        if (isFounderMeta) {
          try {
            const fRes = await fetch("/api/founder/campaigns", {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (fRes.ok) {
              const fData = await fRes.json();
              const campaigns = fData.campaigns || (fData.campaign ? [fData.campaign] : []);
              activeCampaign = campaigns.find((c: any) => c.status !== "completed");
              const hasActiveCampaign = !!activeCampaign;
              const hasCompletedScenario = campaigns.some((c: any) =>
                (c.completedScenarios || []).some((cs: any) => cs.scenarioId === scenarioId)
              );
              // Persist campaign ID for debrief redirects
              if (activeCampaign?.id) {
                localStorage.setItem("founder_campaign_id", activeCampaign.id);
              }
              // If no active campaign AND scenario not completed → blocked
              if (!hasActiveCampaign && !hasCompletedScenario) {
                router.replace("/?locked=founder");
                return;
              }
            }
          } catch {
            // Non-blocking: allow play if check fails
          }
        }

        setScenario(data);

        const s = initializeSession(data);

        // ── Scenario 4: Import establishment choice from Scenario 3 outcome ──
        if (scenarioId?.startsWith("founder_04") && activeCampaign) {
          const s3Completion = (activeCampaign.completedScenarios || []).find(
            (cs: any) => cs.scenarioId === "founder_03_clinical"
          );
          if (s3Completion?.outcomeId) {
            // Infer establishment from scenario 3 outcome
            if (s3Completion.outcomeId === "pilot_toxic") {
              s.flags.chose_chu = true; s.flags.chose_saint_martin = false; s.flags.chose_clinique = false;
            } else if (s3Completion.outcomeId === "pilot_slow") {
              s.flags.chose_saint_martin = true; s.flags.chose_chu = false; s.flags.chose_clinique = false;
            } else {
              // pilot_clean or pilot_switched → clinique
              s.flags.chose_clinique = true; s.flags.chose_chu = false; s.flags.chose_saint_martin = false;
            }
          }
        }

        const p1 = data.phases[0];
        if (p1?.mail_config?.defaults) {
          updateMailDraft(s, p1.phase_id, {
            to: "",
            cc: "",
            subject: p1.mail_config.defaults.subject || "",
            body: "",
            attachments: [],
          });
        }

        // ── Founder anti-rollback: check for resume ──
        if (scenarioId.startsWith("founder_") && !checkpointDoneRef.current) {
          checkpointDoneRef.current = true;
          try {
            const cpRes = await fetch("/api/founder/checkpoint", {
              method: "POST",
              headers: apiHeaders(),
              body: JSON.stringify({ scenarioId, action: "enter" }),
            });
            if (cpRes.ok) {
              const cpData = await cpRes.json();

              // Scenario 0 abandon → campaign deleted, redirect to intro
              if (cpData.resetCampaign) {
                router.replace("/founder/intro");
                return;
              }

              if (cpData.isResume && cpData.resumePhaseIndex > 0) {
                // Fast-forward: mark earlier phases as completed and jump to resume phase
                for (let i = 0; i < cpData.resumePhaseIndex; i++) {
                  const ph = data.phases[i];
                  const phId = ph?.phase_id || (ph as any)?.id;
                  if (phId && !s.completedPhases.includes(phId)) {
                    s.completedPhases.push(phId);
                  }
                }
                s.currentPhaseIndex = cpData.resumePhaseIndex;
                injectPhaseEntryEvents(s);
                // Set up mail draft for resume phase
                const resumePhase = data.phases[cpData.resumePhaseIndex];
                if (resumePhase?.mail_config?.defaults) {
                  updateMailDraft(s, resumePhase.phase_id, {
                    to: "",
                    cc: "",
                    subject: resumePhase.mail_config.defaults.subject || "",
                    body: "",
                    attachments: [],
                  });
                }
              }
              if (cpData.penaltyApplied) {
                setResumeBanner({
                  penaltyMonths: cpData.penaltyMonths,
                  phaseIndex: cpData.resumePhaseIndex,
                });
              }
            }
          } catch (e) {
            console.warn("[founder] checkpoint check failed:", e);
          }
        }

        // ── Inject entry_events for the active phase (critical for phase 0!) ──
        const activePhaseData = data.phases[s.currentPhaseIndex || 0];
        if (InterviewHandler.matches(activePhaseData)) {
          // Interview phase: only inject intro events (delay_ms=0)
          injectIntroEventsOnly(s);
          setInterviewStarted(false);
        } else {
          injectPhaseEntryEvents(s);
        }

        setSession(s);
        setLoading(false);

        // ── Passive logging: session_started + initial phase_started ──
        try {
          const t = authTokenRef.current || "";
          const gSid = gameSessionIdRef.current;
          const pName = (typeof window !== "undefined" ? localStorage.getItem("user_name") : null) || "";
          const campId = activeCampaign?.id || null;
          fireSessionStarted(t, gSid, scenarioId as string, pName, !!isFounderMeta, campId);
          const p0 = data.phases[s.currentPhaseIndex || 0];
          firePhaseStarted(t, gSid, scenarioId as string, p0?.phase_id || "phase_0", s.currentPhaseIndex || 0, p0?.title || "", (p0 as any)?.modules || []);
        } catch { /* never break the game */ }

        // Auto-select the first AI actor of the active phase
        // For interview phases, select the briefing actor (not the candidate)
        const initBriefing = InterviewHandler.getBriefingActor(activePhaseData);
        const activePhaseActor = initBriefing || activePhaseData?.ai_actors?.[0];
        if (activePhaseActor) setSelectedContact(activePhaseActor);

        // Load ALL AI actor prompts
        const aiActors = data.actors.filter((a: any) => a.controlled_by === "ai" && a.prompt_file);
        const promptMap: Record<string, string> = {};
        await Promise.all(
          aiActors.map(async (actor: any) => {
            try {
              const pr = await fetch(`/api/scenarios/${scenarioId}/prompts/${actor.actor_id}`);
              if (pr.ok) {
                const pd = await pr.json();
                promptMap[actor.actor_id] = pd.prompt || "";
              }
            } catch {}
          })
        );
        aiPromptsMapRef.current = promptMap;
        // Set initial prompt to first phase's primary AI actor
        const firstPhaseActor = data.phases[0]?.ai_actors?.[0];
        if (firstPhaseActor && promptMap[firstPhaseActor]) {
          aiPromptRef.current = promptMap[firstPhaseActor];
        } else {
          // Fallback: first AI actor found
          const firstAI = aiActors[0];
          if (firstAI) aiPromptRef.current = promptMap[firstAI.actor_id] || "";
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
        setLoading(false);
      }
    }
    init();
  }, [scenarioId]);

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

  // ── OpenAI TTS with per-actor voice mapping ──
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

  /** Resolve the OpenAI TTS voice for a given actor.
   *  1. Check actor's tts_voice field in scenario JSON
   *  2. Fall back to a curated default per actor_id
   *  3. Ultimate fallback: "nova"  */
  function resolveVoice(actorId?: string): string {
    // Check scenario actor definition first
    if (actorId && scenario?.actors) {
      const actor = (scenario.actors as any[]).find((a: any) => a.actor_id === actorId);
      if (actor?.tts_voice) return actor.tts_voice;
    }
    // Curated defaults per actor for art_du_malentendu & others
    const defaults: Record<string, string> = {
      yuki_tanaka: "nova",       // warm, expressive female — fits Yuki
      sophie_renard: "shimmer",  // calm, mature female
      nathalie_morel: "coral",   // professional female
      enfants_cmj: "fable",      // expressive, lighter — fits children
      player: "echo",
    };
    if (actorId && defaults[actorId]) return defaults[actorId];
    return "nova";
  }

  async function speakTTS(text: string, _lang: string, actorId?: string): Promise<void> {
    if (typeof window === "undefined") return;

    // Stop any currently playing TTS
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }

    if (actorId) setSpeakingActorId(actorId);
    setIsSpeakingTTS(true);

    try {
      const voice = resolveVoice(actorId);
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ text, voice, speed: 1.15 }),
      });

      if (!res.ok) {
        console.warn("TTS API error, falling back to Web Speech API");
        await speakTTSFallback(text, _lang, actorId);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      ttsAudioRef.current = audio;

      await new Promise<void>((resolve) => {
        audio.onended = () => {
          URL.revokeObjectURL(url);
          setIsSpeakingTTS(false);
          setSpeakingActorId(null);
          ttsAudioRef.current = null;
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          setIsSpeakingTTS(false);
          setSpeakingActorId(null);
          ttsAudioRef.current = null;
          resolve();
        };
        audio.play().catch(() => {
          setIsSpeakingTTS(false);
          setSpeakingActorId(null);
          ttsAudioRef.current = null;
          resolve();
        });
      });
    } catch (err) {
      console.warn("TTS fetch failed, falling back to Web Speech API:", err);
      await speakTTSFallback(text, _lang, actorId);
    }
  }

  /** Fallback to browser Web Speech API if OpenAI TTS is unavailable */
  function speakTTSFallback(text: string, lang: string, actorId?: string): Promise<void> {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) { setIsSpeakingTTS(false); setSpeakingActorId(null); resolve(); return; }
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = 1.1;
      utterance.pitch = 1.0;
      const voices = speechSynthesis.getVoices();
      const langPrefix = lang.split("-")[0];
      const preferred = voices.find(v => v.lang.startsWith(langPrefix) && (v.name.includes("Google") || v.name.includes("Microsoft")))
        || voices.find(v => v.lang.startsWith(langPrefix));
      if (preferred) utterance.voice = preferred;

      if (actorId) setSpeakingActorId(actorId);
      setIsSpeakingTTS(true);

      utterance.onend = () => { setIsSpeakingTTS(false); setSpeakingActorId(null); resolve(); };
      utterance.onerror = () => { setIsSpeakingTTS(false); setSpeakingActorId(null); resolve(); };
      speechSynthesis.speak(utterance);
    });
  }

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

      // ── Failure loop-back: NPC refusal triggers return to previous phase ──
      if (checkNpcFailureKeywords(final, data.reply)) {
        const handled = handlePhaseFailure(final);
        if (handled) {
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
    for (const action of actions) {
      switch (action.type) {
        case "set_flags":
          Object.assign(next.flags, action.flags);
          break;
        case "add_ai_message":
          addAIMessage(next, action.content, action.actor);
          break;
        case "set_contact":
          setSelectedContact(action.actorId);
          break;
        case "set_view":
          setMainView(action.view as MainView);
          break;
        case "set_compose":
          setShowCompose(action.show);
          break;
        case "play_sound":
          playNotificationSound();
          break;
        case "set_contract_vars":
          setContractVars(action.vars as any);
          break;
        case "add_inbox_mail": {
          const mail = { ...action.mail };
          // Resolve __next_phase__ placeholder
          if (mail.phaseId === "__next_phase__") {
            const newPhase = scenario!.phases[next.currentPhaseIndex];
            mail.phaseId = newPhase?.phase_id || mail.phaseId;
          }
          addInboxMail(next, mail);
          break;
        }
        case "complete_advance_phase": {
          const prevPhaseIdx = next.currentPhaseIndex;
          const prevPhase = scenario!.phases[prevPhaseIdx];
          completeCurrentPhaseAndAdvance(next);
          // ── Passive logging: phase_completed ──
          try {
            const t = authTokenRef.current || "", gSid = gameSessionIdRef.current, sId = scenarioId as string;
            const dur = phaseStartRealTimeRef.current ? Date.now() - phaseStartRealTimeRef.current : 0;
            firePhaseCompleted(t, gSid, sId, prevPhase?.phase_id || "", prevPhaseIdx, next.score || 0, dur);
          } catch { /* never break */ }
          // If we just finished the scenario (last phase), skip phase-entry work
          // and clear checkpoint immediately to avoid race with redirect.
          if (next.isFinished) {
            // ── Passive logging: scenario_completed ──
            try {
              const t = authTokenRef.current || "", gSid = gameSessionIdRef.current, sId = scenarioId as string;
              const totalDur = Date.now() - sessionStartTimeRef.current;
              fireScenarioCompleted(t, gSid, sId, next.ending || "unknown", next.score || 0, next.completedPhases || [], totalDur);
            } catch { /* never break */ }
            notifyCheckpointClear();
            break;
          }
          // ── Passive logging: phase_started (new phase) ──
          try {
            const t = authTokenRef.current || "", gSid = gameSessionIdRef.current, sId = scenarioId as string;
            const np = scenario!.phases[next.currentPhaseIndex];
            firePhaseStarted(t, gSid, sId, np?.phase_id || "", next.currentPhaseIndex, np?.title || "", (np as any)?.modules || []);
          } catch { /* never break */ }
          resolveDynamicActors(next);
          resolveEstablishmentPlaceholders(next);
          injectPhaseEntryEvents(next);
          dispatchEnterPhase(next); // Module system: run enter_phase on new phase
          const newPhase = scenario!.phases[next.currentPhaseIndex];
          if (newPhase?.mail_config?.defaults) {
            updateMailDraft(next, newPhase.phase_id, {
              to: "",
              cc: "",
              subject: newPhase.mail_config.defaults.subject || "",
              body: "", attachments: [],
            });
          }
          break;
        }
        case "schedule_timed_event": {
          const ev = { ...action.event } as any;
          // Resolve __next_phase__ placeholders
          if (ev.phaseId === "__next_phase__") {
            const newPhase = scenario!.phases[next.currentPhaseIndex];
            ev.phaseId = newPhase?.phase_id || ev.phaseId;
          }
          if (typeof ev.id === "string" && ev.id.startsWith("__next_phase__::")) {
            const newPhase = scenario!.phases[next.currentPhaseIndex];
            ev.id = ev.id.replace("__next_phase__", newPhase?.phase_id || "unknown");
          }
          next.pendingTimedEvents.push(ev);
          break;
        }
        case "delayed_actions":
          setTimeout(() => {
            const delayed = cloneSession(next);
            applyModuleActions(action.actions, delayed);
            setSession(delayed);
          }, action.delayMs);
          break;
        case "async_effect":
          executeMailAsyncEffect(action.effect as any, next);
          break;
        case "advance_phase":
          completeCurrentPhaseAndAdvance(next);
          break;
        case "finish_scenario":
          finishScenario(next);
          // ── Passive logging: scenario_completed ──
          try {
            const t = authTokenRef.current || "", gSid = gameSessionIdRef.current, sId = scenarioId as string;
            const totalDur = Date.now() - sessionStartTimeRef.current;
            fireScenarioCompleted(t, gSid, sId, next.ending || "unknown", next.score || 0, next.completedPhases || [], totalDur);
          } catch { /* never break */ }
          notifyCheckpointClear(); // Clear checkpoint immediately to avoid race with redirect
          break;
        // ── New actions for InterviewModule / ContractModule ──
        case "mark_unavailable":
          // Store unavailability as a session flag for downstream consumers
          next.flags[`unavailable_${action.actorId}`] = true;
          break;
        case "open_contract":
          // Signal to open the contract overlay for the given type.
          // Stored as a flag — the JSX reads it to show the overlay.
          next.flags[`pending_contract_open`] = action.contractType;
          break;
        case "set_mail_draft": {
          const phase = scenario!.phases[next.currentPhaseIndex];
          const phaseId = phase?.phase_id || "unknown";
          updateMailDraft(next, phaseId, {
            to: action.draft.to,
            cc: action.draft.cc,
            subject: action.draft.subject,
            body: action.draft.body,
            attachments: action.draft.attachments,
          });
          break;
        }
        case "send_mail": {
          // Trigger the full mail send flow: record the mail in session
          // and set the flag so downstream logic knows mail was sent.
          // The draft should already be set via a preceding set_mail_draft action.
          sendCurrentPhaseMail(next, action.kind);
          next.flags[`mail_sent_${action.kind}`] = true;
          break;
        }
        case "inject_events":
          // Add timed events directly to the pending queue
          for (const ev of action.events) {
            next.pendingTimedEvents.push(ev);
          }
          break;
        default:
          break;
      }
    }
  }

  // ── Execute async effects described by MailModule ──
  function executeMailAsyncEffect(effect: any, next: any) {
    switch (effect.kind) {
      case "mail_auto_reply": {
        // Scope proposal auto-reply from Thomas
        const mailSummary = effect.mailSummary;
        (async () => {
          try {
            const res = await fetch("/api/chat", {
              method: "POST",
              headers: apiHeaders(),
              body: JSON.stringify({
                playerName: effect.displayPlayerName,
                message: mailSummary,
                phaseTitle: (effect.runtimeView as any).phaseTitle,
                phaseObjective: (effect.runtimeView as any).phaseObjective,
                phaseFocus: (effect.runtimeView as any).phaseFocus,
                phasePrompt: (effect.runtimeView as any).phasePrompt,
                criteria: (effect.runtimeView as any).criteria,
                mode: (effect.runtimeView as any).adaptiveMode,
                narrative: effect.narrative,
                recentConversation: [],
                playerMessages: [effect.mailBody],
                roleplayPrompt: effect.roleplayPrompt,
              }),
            });
            if (res.ok) {
              const data = await res.json();
              playNotificationSound();
              const final2 = cloneSession(next);
              addPlayerMessage(final2, effect.playerMessageSummary, effect.actorId);
              addAIMessage(final2, data.reply, effect.actorId);
              applyEvaluation(final2, data.matched_criteria || [], data.score_delta || 0, data.flags_to_set || {});
              setSession(final2);
            }
          } catch (err) {
            console.error("Error in mail_auto_reply async effect:", err);
          }
        })();
        break;
      }
      case "negotiation_chat_reply": {
        // Thomas chat response to negotiation mail
        (async () => {
          try {
            const res = await fetch("/api/chat", {
              method: "POST",
              headers: apiHeaders(),
              body: JSON.stringify({
                playerName: effect.displayPlayerName,
                message: effect.mailSummary,
                phaseTitle: (effect.runtimeView as any).phaseTitle,
                phaseObjective: (effect.runtimeView as any).phaseObjective,
                phaseFocus: (effect.runtimeView as any).phaseFocus,
                phasePrompt: (effect.runtimeView as any).phasePrompt,
                criteria: (effect.runtimeView as any).criteria,
                mode: (effect.runtimeView as any).adaptiveMode,
                narrative: effect.narrative,
                recentConversation: effect.recentConversation,
                playerMessages: effect.playerMessages,
                roleplayPrompt: effect.roleplayPrompt,
              }),
            });
            if (res.ok) {
              const data = await res.json();
              playNotificationSound();
              const final2 = cloneSession(next);
              addPlayerMessage(final2, effect.playerMessageSummary, effect.actorId);
              addAIMessage(final2, data.reply, effect.actorId);
              applyEvaluation(final2, data.matched_criteria || [], data.score_delta || 0, data.flags_to_set || {});
              setSession(final2);
            }
          } catch (err) {
            console.error("Error in negotiation_chat_reply async effect:", err);
          }
        })();
        break;
      }
      case "fourviere_dynamic_mail": {
        // Generate dynamic Claire mail via API
        const nextPhase = scenario!.phases[next.currentPhaseIndex];
        const dynConfig = (nextPhase as any)?.dynamic_entry_mail;
        const p4Id = nextPhase?.phase_id || "phase_4";
        const truncatedAnalyse = effect.analyseBody;
        (async () => {
          try {
            const prompt = `Tu es Claire Beaumont, directrice d'ImmoLyon Patrimoine. Écris un mail interne COURT (max 12 lignes) à ton agent junior.

L'agent t'a envoyé cette analyse du RDV Delvaux (85m² Fourvière) :
---
${truncatedAnalyse}
---

Ton mail doit :
- Remercier brièvement
- Résumer les travaux que Delvaux a faits suite aux recommandations (cuisine refaite si mentionnée, meubles retirés/remplacés si demandé, régime fiscal choisi, etc. — invente les détails cohérents)
- Dire que quelques semaines ont passé, tout est prêt
- Demander de rédiger une annonce Le Bon Coin (points forts : vue Saône, parquet chêne, cheminée, Fourvière)
- Demander d'envoyer par mail pour validation

Tutoie l'agent. Signe "Claire Beaumont — Directrice — ImmoLyon Patrimoine". Réponds UNIQUEMENT le corps du mail.`;

            const res = await fetch("/api/chat", {
              method: "POST",
              headers: apiHeaders(),
              body: JSON.stringify({
                playerName: effect.displayPlayerName,
                message: prompt,
                phaseTitle: "Génération mail transition",
                phaseObjective: "",
                phaseFocus: "",
                phasePrompt: "",
                criteria: [],
                mode: "default",
                narrative: scenario!.narrative,
                recentConversation: [],
                playerMessages: [],
                roleplayPrompt: prompt,
                skipEvaluation: true,
              }),
            });
            if (res.ok) {
              const data = await res.json();
              const mailBody = data.reply || "Bonjour,\n\nBon travail pour l'analyse. M. Delvaux a effectué les travaux nécessaires suite à tes recommandations. Il faut maintenant publier une annonce sur Le Bon Coin.\n\nRédige un texte attractif mais honnête. Mets en avant les vrais points forts : vue sur la Saône, parquet chêne massif, cheminée d'époque, quartier Fourvière.\n\nEnvoie-moi l'annonce par mail pour validation.\n\nClaire Beaumont\nDirectrice — ImmoLyon Patrimoine";
              const updated = cloneSession(next);
              addInboxMail(updated, {
                from: dynConfig?.actor || "claire_beaumont",
                subject: dynConfig?.subject || "Annonce Le Bon Coin — Bien Delvaux Fourvière",
                body: mailBody,
                phaseId: p4Id,
              });
              setSession(updated);
              setMainView("mail");
              playNotificationSound();
            }
          } catch (err) {
            // Fallback: inject a generic mail
            console.error("Error generating dynamic Claire mail:", err);
            const fallback = cloneSession(next);
            addInboxMail(fallback, {
              from: "claire_beaumont",
              subject: "Annonce Le Bon Coin — Bien Delvaux Fourvière",
              body: "Bonjour,\n\nBon travail pour l'analyse du rendez-vous Delvaux. M. Delvaux a effectué les travaux nécessaires suite à tes recommandations — le bien est maintenant prêt pour la location.\n\nIl faut publier rapidement une annonce sur Le Bon Coin. Rédige un texte attractif mais honnête. Mets en avant les vrais points forts : la vue sur la Saône, le parquet chêne massif, la cheminée d'époque, le quartier Fourvière.\n\nN'exagère pas et ne mens pas sur l'état du bien.\n\nEnvoie-moi l'annonce par mail pour validation.\n\nClaire Beaumont\nDirectrice — ImmoLyon Patrimoine",
              phaseId: p4Id,
            });
            setSession(fallback);
            setMainView("mail");
          }
        })();
        break;
      }
      default:
        console.warn("Unknown mail async effect kind:", effect.kind);
    }
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
  // PACTE NEGOTIATION — send amendment message to CTO via contracts module
  // ════════════════════════════════════════════════════════════════════
  async function sendPacteNegotiationMessage(textOverride?: string) {
    const text = textOverride || amendmentInput.trim();
    if (!text || pacteThreadLoading) return;
    if (!textOverride) setAmendmentInput("");
    setPacteThread((prev) => [...prev, { role: "player", content: text }]);
    // Detect exclusivity mention (S0 pedagogical trap)
    const mentionsExcl = detectsExclusivity(text);
    if (session) {
      const flagUpdates: Record<string, any> = { asked_modification: true };
      if (mentionsExcl) flagUpdates.pacte_signed_clean = true;
      setSession({ ...session, flags: { ...session.flags, ...flagUpdates } });
    }
    // Get CTO response via module
    setPacteThreadLoading(true);
    const negConfig = ContractHandler.getNegotiationConfig("s0_pacte");
    try {
      const ctoId = chosenCtoId || "sofia_renault";
      const activePrompt = aiPromptsMapRef.current[ctoId] || aiPromptRef.current;
      const result = await sendNegotiationMessage(text, pacteArticles, pacteThread, {
        roleplayPrompt: activePrompt,
        phaseTitle: negConfig.phaseTitle,
        phaseFocus: negConfig.phaseFocus,
        narrative: scenario?.narrative || {},
        playerName: displayPlayerName,
        apiHeaders,
      });
      // Apply modifications to articles
      if (result.modifications.length > 0) {
        setPacteArticles((prev) => applyModifications(prev, result.modifications));
      }
      setPacteThread((prev) => [...prev, { role: "counterpart", content: result.displayReply }]);
      // Check acceptance of exclusivity amendment
      if (detectsAcceptance(result.displayReply) && mentionsExcl) {
        if (session) {
          setSession({ ...session, flags: { ...session.flags, pacte_signed_clean: true } });
        }
      }
    } catch {
      setPacteThread((prev) => [...prev, { role: "counterpart", content: negConfig.fallbackError }]);
    }
    setPacteThreadLoading(false);
  }

  // ════════════════════════════════════════════════════════════════════
  // NOVADEV NEGOTIATION — send message to Thomas Vidal via contracts module
  // ════════════════════════════════════════════════════════════════════
  async function sendNovadevNegotiationMessage(textOverride?: string) {
    const text = textOverride || novadevNegInput.trim();
    if (!text || novadevThreadLoading || !session || !scenario) return;
    if (!textOverride) setNovadevNegInput("");
    setNovadevThread((prev) => [...prev, { role: "player", content: text }]);
    setNovadevThreadLoading(true);
    const negConfig = ContractHandler.getNegotiationConfig("s2_novadev");
    try {
      const activePrompt = aiPromptsMapRef.current[negConfig.actorId] || aiPromptRef.current;
      const result = await sendNegotiationMessage(text, novadevArticles, novadevThread, {
        roleplayPrompt: activePrompt,
        phaseTitle: negConfig.phaseTitle,
        phaseFocus: negConfig.phaseFocus,
        narrative: scenario?.narrative || {},
        playerName: displayPlayerName,
        apiHeaders,
      });
      if (result.modifications.length > 0) {
        setNovadevArticles((prev) => applyModifications(prev, result.modifications));
      }
      setNovadevThread((prev) => [...prev, { role: "counterpart", content: result.displayReply }]);
    } catch {
      setNovadevThread((prev) => [...prev, { role: "counterpart", content: negConfig.fallbackError }]);
    }
    setNovadevThreadLoading(false);
  }

  // ════════════════════════════════════════════════════════════════════
  // EXCEPTIONS NEGOTIATION — send message to Me Vasseur via contracts module (S5)
  // ════════════════════════════════════════════════════════════════════
  async function sendExceptionsNegotiationMessage(textOverride?: string) {
    const text = textOverride || exceptionsNegInput.trim();
    if (!text || exceptionsThreadLoading || !session || !scenario) return;
    if (!textOverride) setExceptionsNegInput("");
    setExceptionsThread((prev) => [...prev, { role: "player", content: text }]);
    setExceptionsThreadLoading(true);
    const negConfig = ContractHandler.getNegotiationConfig("s5_exceptions");
    try {
      const activePrompt = aiPromptsMapRef.current[negConfig.actorId] || aiPromptRef.current;
      const result = await sendNegotiationMessage(text, exceptionsArticles, exceptionsThread, {
        roleplayPrompt: activePrompt,
        phaseTitle: negConfig.phaseTitle,
        phaseFocus: negConfig.phaseFocus,
        narrative: scenario?.narrative || {},
        playerName: displayPlayerName,
        apiHeaders,
      });
      if (result.modifications.length > 0) {
        setExceptionsArticles((prev) => applyModifications(prev, result.modifications));
      }
      setExceptionsThread((prev) => [...prev, { role: "counterpart", content: result.displayReply }]);
      // Track negotiation in session messages
      if (session) {
        const next = cloneSession(session);
        addPlayerMessage(next, `[Négo contrat] ${text}`, negConfig.actorId);
        addAIMessage(next, result.displayReply, negConfig.actorId);
        setSession(next);
      }
    } catch {
      setExceptionsThread((prev) => [...prev, { role: "counterpart", content: negConfig.fallbackError }]);
    }
    setExceptionsThreadLoading(false);
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
      {toasts.length > 0 && (
        <div style={{ position: "fixed", top: 60, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
          {toasts.map((toast) => (
            <div
              key={toast.id}
              onClick={() => {
                setMainView(toast.type);
                setToasts((prev) => prev.filter((t) => t.id !== toast.id));
              }}
              style={{
                background: "#fff",
                border: "1px solid #e0e0e0",
                borderLeft: `4px solid ${toast.type === "mail" ? "#f5a623" : "#5b5fc7"}`,
                borderRadius: 8,
                padding: "10px 16px",
                boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                display: "flex",
                alignItems: "center",
                gap: 10,
                minWidth: 280,
                maxWidth: 360,
                cursor: "pointer",
                animation: "toastSlideIn 0.3s ease-out",
              }}
            >
              <span style={{ fontSize: 20, flexShrink: 0 }}>{toast.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#333", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {toast.text}
                </div>
                <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>
                  {toast.type === "mail" ? "Cliquez pour voir l'email" : "Cliquez pour voir le message"}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setToasts((prev) => prev.filter((t) => t.id !== toast.id));
                }}
                style={{ background: "none", border: "none", color: "#999", cursor: "pointer", fontSize: 16, padding: "0 4px", flexShrink: 0 }}
              >
                ×
              </button>
            </div>
          ))}
          <style>{`@keyframes toastSlideIn{from{opacity:0;transform:translateX(100px)}to{opacity:1;transform:translateX(0)}}`}</style>
        </div>
      )}

      {/* ═══════ FOUNDER RESUME PENALTY BANNER ═══════ */}
      {resumeBanner && (
        <div
          style={{
            background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
            border: "1px solid #f59e0b",
            borderRadius: 0,
            padding: "12px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexShrink: 0,
            zIndex: 100,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>⏱</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#92400e" }}>
                Reprise après interruption
              </div>
              <div style={{ fontSize: 12, color: "#78350f", marginTop: 2 }}>
                Vous reprenez au début de cette phase. Cette interruption vous a coûté{" "}
                <strong>15 jours</strong> et <strong>125 €</strong> de charges.
              </div>
            </div>
          </div>
          <button
            onClick={() => setResumeBanner(null)}
            style={{
              background: "rgba(146,64,14,0.1)",
              border: "1px solid rgba(146,64,14,0.2)",
              borderRadius: 6,
              padding: "4px 12px",
              color: "#92400e",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Compris
          </button>
        </div>
      )}

      {/* ═══════ FOUNDER SAVE INFO (persistent) ═══════ */}
      {isFounderScenario && !resumeBanner && !view.isFinished && (
        <div
          style={{
            background: "#f0f0ff",
            borderBottom: "1px solid rgba(91,95,199,0.15)",
            padding: "6px 20px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
            zIndex: 99,
          }}
        >
          <span style={{ fontSize: 12, color: "#5b5fc7" }}>💾</span>
          <span style={{ fontSize: 11, color: "#5b5fc7", fontWeight: 500 }}>
            Votre progression est sauvegardée au début de chaque phase.
          </span>
        </div>
      )}

      {/* ═══════ TOP BAR ═══════ */}
      <header style={{ display: "flex", alignItems: "center", height: 48, background: "#292929", color: "#fff", padding: "0 16px", gap: 16, flexShrink: 0 }}>
        {/* Home button */}
        <button
          onClick={() => router.push("/")}
          title="Retour à l'accueil"
          style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 18, padding: "4px 8px", borderRadius: 4, display: "flex", alignItems: "center", gap: 6 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        </button>

        <div style={{ height: 24, width: 1, background: "#555" }} />

        {/* Title + phase */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
            {scenario.meta?.title || "Scénario"}
          </span>
        </div>

        {/* Phase progression */}
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {phases.map((p: any, i: number) => {
            const pid = p.phase_id || p.id;
            const done = session.completedPhases.includes(pid);
            const current = i === currentPhaseIndex;
            return (
              <div
                key={pid}
                title={p.title}
                style={{
                  width: current ? "auto" : 8, height: 8, borderRadius: current ? 10 : "50%",
                  background: done ? "#44b553" : current ? "#5b5fc7" : "#555",
                  padding: current ? "2px 10px" : 0,
                  color: "#fff", fontSize: 11, fontWeight: 600,
                  display: "flex", alignItems: "center", transition: "all .2s",
                }}
              >
                {current ? p.title : ""}
              </div>
            );
          })}
        </div>

        <div style={{ height: 24, width: 1, background: "#555" }} />

        {/* Briefing button — opens overlay with context + documents */}
        <button
          onClick={() => setShowBriefingOverlay(true)}
          title="Consulter le briefing et vos documents"
          style={{
            background: showBriefingOverlay ? "rgba(91,95,199,0.3)" : "none",
            border: "1px solid rgba(255,255,255,0.2)", color: "#fff", cursor: "pointer",
            fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 6,
            display: "flex", alignItems: "center", gap: 5, transition: "all .15s",
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(91,95,199,0.3)"}
          onMouseLeave={(e) => e.currentTarget.style.background = showBriefingOverlay ? "rgba(91,95,199,0.3)" : "none"}
        >
          📁 Briefing
        </button>

        <div style={{ height: 24, width: 1, background: "#555" }} />

        {/* Clock */}
        <div style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#7b7fff", minWidth: 52, textAlign: "right" }}>
          {simulatedTime}
        </div>
      </header>

      {/* ═══════ BRIEFING OVERLAY ═══════ */}
      {/* ── Inline document content modal ── */}
      {inlineDocContent && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.5)", zIndex: 10000,
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setInlineDocContent(null)}>
          <div style={{
            background: "#fff", borderRadius: 12, padding: 24,
            maxWidth: 700, width: "90%", maxHeight: "80vh",
            overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: "#333" }}>{inlineDocContent.title}</h3>
              <button onClick={() => setInlineDocContent(null)} style={{
                background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#999",
              }}>✕</button>
            </div>
            <pre style={{
              whiteSpace: "pre-wrap", wordBreak: "break-word",
              fontFamily: "'Segoe UI', system-ui, sans-serif", fontSize: 13,
              lineHeight: 1.6, color: "#444", margin: 0,
              background: "#fafafa", padding: 16, borderRadius: 8,
            }}>{inlineDocContent.content}</pre>
          </div>
        </div>
      )}
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
      {showOnePagerEditor && (() => {
        const onePagerDoc = scenario?.resources?.documents?.find((d: any) => d.doc_id === "one_pager_template");
        const onePagerPdfPath = (onePagerDoc as any)?.file_path || "";
        return (
          <div style={{
            position: "fixed", inset: 0, zIndex: 10001,
            background: "rgba(0,0,0,0.7)", display: "flex",
            alignItems: "center", justifyContent: "center", padding: 20,
          }}>
            <div style={{
              background: "#fff", borderRadius: 16, maxWidth: 800, width: "100%",
              maxHeight: "92vh", display: "flex", flexDirection: "column",
              boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
            }}>
              {/* Header bar */}
              <div style={{
                padding: "14px 24px", background: "linear-gradient(135deg, #1a1a2e, #16213e)",
                borderRadius: "16px 16px 0 0",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: "#5b5fc7", display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: 16, fontWeight: 700, color: "#fff",
                  }}>📝</div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#fff" }}>
                      One-Pager — Orisio
                    </h2>
                    <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                      Remplis chaque section puis soumets au jury
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowOnePagerEditor(false)}
                  style={{
                    background: "rgba(255,255,255,0.1)", border: "none", fontSize: 18,
                    color: "#fff", cursor: "pointer", padding: "4px 10px", borderRadius: 6,
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Progress indicator */}
              <div style={{
                padding: "8px 24px", background: "#f8f9fa", borderBottom: "1px solid #e8e8e8",
                display: "flex", alignItems: "center", gap: 12, fontSize: 12,
              }}>
                <span style={{ color: "#16a34a", fontWeight: 700 }}>1. Remplir le document</span>
                <span style={{ color: "#ccc" }}>→</span>
                <span style={{ color: onePagerEdited ? "#16a34a" : "#666", fontWeight: onePagerEdited ? 700 : 500 }}>2. Relire</span>
                <span style={{ color: "#ccc" }}>→</span>
                <span style={{ color: onePagerSubmitted ? "#16a34a" : "#666", fontWeight: onePagerSubmitted ? 700 : 500 }}>3. Soumettre</span>
              </div>

              {/* Instruction banner */}
              {!onePagerSubmitted && (
                <div style={{
                  padding: "10px 24px", background: "#eff6ff", borderBottom: "1px solid #bfdbfe",
                  display: "flex", alignItems: "center", gap: 10, fontSize: 12,
                }}>
                  <span style={{ fontSize: 16 }}>✏️</span>
                  <span style={{ color: "#1e40af", fontWeight: 600 }}>
                    Cliquez sur le texte entre crochets pour le remplacer par vos informations.
                  </span>
                  {onePagerEdited && (
                    <span style={{ marginLeft: "auto", color: "#16a34a", fontWeight: 700, fontSize: 11 }}>
                      Modifié
                    </span>
                  )}
                </div>
              )}

              {/* Editable one-pager content */}
              <div
                ref={onePagerContentRef}
                contentEditable={!onePagerSubmitted}
                suppressContentEditableWarning
                onInput={() => { if (!onePagerEdited) setOnePagerEdited(true); }}
                style={{
                  flex: 1, overflow: "auto", background: "#fff", padding: "32px 40px",
                  fontSize: 14, lineHeight: 1.8, color: "#1a1a2e",
                  fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
                  outline: "none",
                  cursor: !onePagerSubmitted ? "text" : "default",
                }}
              >
                {/* Title */}
                <div style={{ textAlign: "center", marginBottom: 28 }}>
                  <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 8px", color: "#1a1a2e", letterSpacing: -0.5 }}>
                    <span style={{ color: "#9ca3af", fontStyle: "italic" }}>[NOM DE LA STARTUP]</span>
                  </h1>
                  <p style={{ fontSize: 14, color: "#9ca3af", fontStyle: "italic", margin: 0 }}>
                    [Tagline — une phrase qui résume ce que vous faites]
                  </p>
                </div>
                <hr style={{ border: "none", borderTop: "2px solid #5b5fc7", margin: "16px 0 24px", width: 60 }} />

                {/* Problème */}
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: "24px 0 8px", color: "#5b5fc7" }}>Problème</h2>
                <p style={{ color: "#9ca3af", fontStyle: "italic" }}>
                  [Décrivez le problème que vous résolvez. Soyez concret : qui souffre, pourquoi, combien ça coûte. 3-4 phrases max.]
                </p>

                {/* Solution */}
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: "24px 0 8px", color: "#5b5fc7" }}>Solution</h2>
                <p style={{ color: "#9ca3af", fontStyle: "italic" }}>
                  [Décrivez votre produit/service. Ce qu&apos;il fait, comment il fonctionne, en quoi il est différent. Pas de jargon. 3-4 phrases max.]
                </p>

                {/* Marché */}
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: "24px 0 8px", color: "#5b5fc7" }}>Marché</h2>
                <p style={{ color: "#9ca3af", fontStyle: "italic" }}>
                  [Taille du marché cible. Nombre d&apos;établissements/utilisateurs potentiels. Segment initial visé. Chiffrez.]
                </p>

                {/* Modèle économique */}
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: "24px 0 8px", color: "#5b5fc7" }}>Modèle économique</h2>
                <p style={{ color: "#9ca3af", fontStyle: "italic" }}>
                  [Comment vous gagnez de l&apos;argent. Prix, récurrence, panier moyen. Soyez précis.]
                </p>

                {/* Traction */}
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: "24px 0 8px", color: "#5b5fc7" }}>Traction</h2>
                <p style={{ color: "#9ca3af", fontStyle: "italic" }}>
                  [Ce que vous avez déjà accompli. Entretiens, pilotes, lettres d&apos;intention, premiers revenus. Chiffres concrets uniquement.]
                </p>

                {/* Équipe */}
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: "24px 0 8px", color: "#5b5fc7" }}>Équipe</h2>
                <p style={{ color: "#9ca3af", fontStyle: "italic" }}>
                  [Qui vous êtes. Noms, rôles, pourquoi vous êtes les bonnes personnes pour ce projet. 2-3 lignes par personne.]
                </p>

                {/* Demande */}
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: "24px 0 8px", color: "#5b5fc7" }}>Demande</h2>
                <p style={{ color: "#9ca3af", fontStyle: "italic" }}>
                  [Ce que vous attendez de l&apos;incubateur. Soyez spécifique : mentorat, réseau, financement, locaux, introductions.]
                </p>

                {/* Contact */}
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: "24px 0 8px", color: "#5b5fc7" }}>Contact</h2>
                <p style={{ color: "#9ca3af", fontStyle: "italic" }}>
                  [Nom — email — téléphone]
                </p>
              </div>

              {/* PDF link */}
              {onePagerPdfPath && (
                <div style={{ padding: "6px 24px", borderTop: "1px solid #e8e8e8", background: "#fafafa", textAlign: "center" }}>
                  <a
                    href={onePagerPdfPath.startsWith("/") ? onePagerPdfPath : `/api/download?file=${encodeURIComponent(onePagerPdfPath)}&scenarioId=${encodeURIComponent(scenarioId)}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{
                      fontSize: 11, padding: "4px 12px", borderRadius: 6,
                      background: "#f0f0ff", color: "#5b5fc7", textDecoration: "none",
                      border: "1px solid rgba(91,95,199,0.2)",
                    }}
                  >
                    Voir aussi le template PDF original
                  </a>
                </div>
              )}

              {/* Submit area */}
              <div style={{
                padding: "16px 24px", borderTop: "2px solid #5b5fc7",
                background: onePagerSubmitted ? "#f0fdf4" : "#f8f9fa",
              }}>
                {!onePagerSubmitted ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 4 }}>
                        {onePagerEdited
                          ? "Votre one-pager est prêt à être soumis."
                          : "Remplissez le document avant de soumettre."}
                      </div>
                      <div style={{ fontSize: 11, color: "#888" }}>
                        Le one-pager sera envoyé au jury de Technowest.
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        // 1. Mark as submitted
                        setOnePagerSubmitted(true);
                        // 2. Extract the one-pager text from the contentEditable div
                        const onePagerText = onePagerContentRef.current?.innerText || "";
                        // 3. Set flags and send mail
                        if (session && scenario) {
                          const next = cloneSession(session);
                          next.flags.one_pager_submitted = true;
                          // Fill the mail draft
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
                            // Send the mail
                            const mailKind = phase?.mail_config?.kind || "one_pager_submission";
                            sendCurrentPhaseMail(next, mailKind);
                            // Advance phase
                            if (phase?.mail_config?.send_advances_phase) {
                              completeCurrentPhaseAndAdvance(next);
                              resolveDynamicActors(next);
      resolveEstablishmentPlaceholders(next);
                              injectPhaseEntryEvents(next);
                              dispatchEnterPhase(next); // Module system: run enter_phase on new phase
                              const newPhase = scenario.phases[next.currentPhaseIndex];
                              if (newPhase?.mail_config?.defaults) {
                                updateMailDraft(next, newPhase.phase_id, {
                                  to: "", cc: "",
                                  subject: newPhase.mail_config.defaults.subject || "",
                                  body: "", attachments: [],
                                });
                              }
                              // Notify checkpoint for Founder mode
                              if (isFounderScenario && phaseId) {
                                notifyCheckpointAdvance(phaseId, next.currentPhaseIndex);
                              }
                            }
                          }
                          setSession(next);
                        }
                        // Close the editor
                        setShowOnePagerEditor(false);
                        playNotificationSound();
                      }}
                      disabled={!onePagerEdited}
                      style={{
                        padding: "12px 32px", flexShrink: 0,
                        background: onePagerEdited
                          ? "linear-gradient(135deg, #5b5fc7, #4a4eb3)"
                          : "#ccc",
                        border: onePagerEdited ? "2px solid rgba(91,95,199,0.4)" : "2px solid #ddd",
                        borderRadius: 10,
                        color: "#fff", fontSize: 15, fontWeight: 800,
                        cursor: onePagerEdited ? "pointer" : "not-allowed",
                        boxShadow: onePagerEdited ? "0 4px 16px rgba(91,95,199,0.3)" : "none",
                        transition: "all 0.2s",
                        opacity: onePagerEdited ? 1 : 0.5,
                      }}
                      onMouseEnter={(e) => { if (onePagerEdited) { e.currentTarget.style.transform = "scale(1.02)"; e.currentTarget.style.boxShadow = "0 6px 24px rgba(91,95,199,0.4)"; } }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = onePagerEdited ? "0 4px 16px rgba(91,95,199,0.3)" : "none"; }}
                    >
                      📤 Soumettre le one-pager
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 0" }}>
                    <span style={{ fontSize: 20 }}>✅</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#16a34a" }}>
                        One-pager soumis au jury
                      </div>
                      <div style={{ fontSize: 11, color: "#666" }}>
                        Le jury va maintenant l&apos;examiner. Prépare ton pitch.
                      </div>
                    </div>
                    <button
                      onClick={() => setShowOnePagerEditor(false)}
                      style={{
                        marginLeft: "auto", padding: "8px 16px",
                        background: "#5b5fc7", border: "none", borderRadius: 8,
                        color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      Fermer
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {showBriefingOverlay && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 10000,
            background: "rgba(0,0,0,0.5)", display: "flex",
            alignItems: "center", justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setShowBriefingOverlay(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 14, maxWidth: 900,
              width: "100%", maxHeight: "85vh", overflow: "hidden",
              boxShadow: "0 8px 40px rgba(0,0,0,0.25)",
              display: "flex", flexDirection: "column",
            }}
          >
            {/* Overlay header */}
            <div style={{
              padding: "16px 24px", background: "#292929", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              borderRadius: "14px 14px 0 0", flexShrink: 0,
            }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#7b7fff", textTransform: "uppercase", letterSpacing: 1 }}>Briefing</span>
                <h2 style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 700 }}>{scenario.meta?.title}</h2>
              </div>
              <button
                onClick={() => setShowBriefingOverlay(false)}
                style={{ background: "none", border: "none", color: "#fff", fontSize: 24, cursor: "pointer", padding: "4px 8px" }}
              >
                ×
              </button>
            </div>

            {/* Overlay body — scrollable */}
            <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
              {/* Narrative sections */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
                {scenario.narrative?.context && (
                  <div style={{ padding: 16, background: "#f8f9fc", borderRadius: 10, border: "1px solid #e2e4ea" }}>
                    <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#1a3c6e" }}>Contexte</h3>
                    <p style={{ margin: 0, fontSize: 13, color: "#444", lineHeight: 1.6 }}>{scenario.narrative.context}</p>
                  </div>
                )}
                {scenario.narrative?.mission && (
                  <div style={{ padding: 16, background: "#f8f9fc", borderRadius: 10, border: "1px solid #e2e4ea" }}>
                    <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#1a3c6e" }}>Mission</h3>
                    <p style={{ margin: 0, fontSize: 13, color: "#444", lineHeight: 1.6 }}>{scenario.narrative.mission}</p>
                  </div>
                )}
              </div>
              {scenario.narrative?.initial_situation && (
                <div style={{ padding: 16, background: "#fffbeb", borderRadius: 10, border: "1px solid #fde68a", marginBottom: 24 }}>
                  <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#92400e" }}>Situation initiale</h3>
                  <p style={{ margin: 0, fontSize: 13, color: "#78350f", lineHeight: 1.6 }}>{scenario.narrative.initial_situation}</p>
                </div>
              )}

              {/* Documents */}
              <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: "#1a3c6e" }}>📁 Documents de travail</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                {allDocuments.map((doc: any) => {
                  const hasImage = !!doc.image_path;
                  const hasPDF = !!doc.file_path && doc.file_path.endsWith(".pdf");
                  const docIcon = hasImage ? "🖼️" : hasPDF ? "📑" : "📄";
                  return (
                    <div
                      key={doc.doc_id}
                      onClick={() => { setSelectedDocId(doc.doc_id); setRightPanel("docs"); setShowBriefingOverlay(false); }}
                      style={{
                        padding: 14, borderRadius: 10, cursor: "pointer",
                        background: "#fff", border: "1px solid #e2e4ea",
                        transition: "all .15s", display: "flex", flexDirection: "column", gap: 8,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#5b5fc7"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(91,95,199,0.12)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e2e4ea"; e.currentTarget.style.boxShadow = "none"; }}
                    >
                      {hasImage && (
                        <div style={{ height: 100, borderRadius: 6, overflow: "hidden", background: "#eee" }}>
                          <img src={doc.image_path} alt={doc.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        </div>
                      )}
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>
                        {docIcon} {doc.label}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {hasPDF && (
                          <span style={{ fontSize: 10, color: "#c2410c", background: "#fff7ed", padding: "1px 6px", borderRadius: 8, fontWeight: 600 }}>PDF</span>
                        )}
                        <span style={{ fontSize: 10, color: "#5b5fc7", fontWeight: 600 }}>Cliquer pour consulter →</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

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
        <aside style={{ width: 240, flexShrink: 0, background: "#fff", borderRight: "1px solid #e0e0e0", display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Navigation tabs */}
          <nav style={{ display: "flex", borderBottom: "1px solid #e8e8e8", flexShrink: 0 }}>
            {([
              { key: "chat" as MainView, icon: "💬", label: "Chat", badge: 0 },
              { key: "mail" as MainView, icon: "📧", label: "Email", badge: unreadMails },
              ...(hasMindmapTool ? [{ key: "notes" as MainView, icon: "🗒️", label: "Notes", badge: 0 }] : []),
            ]).map((tab) => {
              const isLocked = tab.key === "mail" && mailLockedForNow;
              return (
              <button
                key={tab.key}
                onClick={() => setMainView(tab.key)}
                style={{
                  flex: 1, padding: "10px 4px", border: "none", cursor: "pointer",
                  background: mainView === tab.key ? "#f0f0ff" : "#fff",
                  borderBottom: mainView === tab.key ? "2px solid #5b5fc7" : "2px solid transparent",
                  fontSize: 12, fontWeight: mainView === tab.key ? 700 : 500,
                  color: isLocked ? "#bbb" : mainView === tab.key ? "#5b5fc7" : "#666",
                  position: "relative",
                  opacity: isLocked ? 0.7 : 1,
                }}
              >
                {tab.icon} {tab.label}
                {tab.badge ? (
                  <span style={{ position: "absolute", top: 4, right: 8, background: "#e94b3c", color: "#fff", borderRadius: 10, fontSize: 10, fontWeight: 700, padding: "1px 5px", minWidth: 16, textAlign: "center" }}>
                    {tab.badge}
                  </span>
                ) : null}
              </button>
              );
            })}
          </nav>

          {/* Contacts section */}
          <div style={{ padding: "12px", flex: 1, overflowY: "auto" }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Contacts
            </h3>
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {visibleContacts.filter((a: any) => a.actor_id !== "player" && !a.mail_only).map((actor: any) => {
                const resolvedId = resolveActor(actor.actor_id);
                const isInPhase = currentPhaseAiActors.includes(resolvedId);
                // busy_after_phase: lock actor after a specific phase completes
                const busyAfterPhase = (actor as any).busy_after_phase;
                const isBusyAfterPhase = busyAfterPhase && session && (() => {
                  const phaseIdx = scenario?.phases?.findIndex((p: any) => p.phase_id === busyAfterPhase);
                  return phaseIdx !== undefined && phaseIdx >= 0 && session.currentPhaseIndex > phaseIdx;
                })();
                const baseStatus = actor.contact_status || (actor.interaction_modes?.includes("unreachable") ? "offline" : "available");
                const isAvailable = isInPhase && !isBusyAfterPhase;
                const status = isAvailable ? baseStatus : "busy";
                const color = actor.avatar?.color || "#666";
                const ini = actor.avatar?.initials || getInitials(actor.name);
                const isSelected = selectedContact === actor.actor_id;
                const unread = contactUnreadCounts[actor.actor_id] || 0;
                // Last message preview
                const lastMsg = [...conversation].reverse().find((m: any) => m.actor === actor.actor_id && m.role === "npc");
                const busyMsg = isBusyAfterPhase ? ((actor as any).busy_message || "Occupé") : "Occupé";
                const preview = isAvailable
                  ? (lastMsg ? (lastMsg.content.length > 40 ? lastMsg.content.slice(0, 40) + "..." : lastMsg.content) : (actor.contact_preview || ""))
                  : busyMsg;
                return (
                  <li
                    key={actor.actor_id}
                    onClick={() => { setSelectedContact(actor.actor_id); setMainView("chat"); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 8px", borderRadius: 8,
                      marginBottom: 2, cursor: "pointer",
                      background: isSelected ? (isAvailable ? "#f0f0ff" : "#f5f5f5") : "transparent",
                      borderLeft: isSelected ? (isAvailable ? "3px solid #5b5fc7" : "3px solid #ccc") : "3px solid transparent",
                      opacity: isAvailable ? 1 : 0.55,
                      transition: "all .1s",
                    }}
                    onMouseEnter={(e) => { if (!isSelected && isAvailable) e.currentTarget.style.background = "#f8f8fb"; }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{ position: "relative" }}>
                      <Avatar initials={ini} color={color} size={36} status={status} />
                      {unread > 0 && isAvailable && (
                        <span style={{
                          position: "absolute", top: -2, right: -4,
                          background: "#e94b3c", color: "#fff", borderRadius: 10,
                          fontSize: 10, fontWeight: 700, padding: "1px 5px", minWidth: 16, textAlign: "center",
                        }}>
                          {unread}
                        </span>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: isSelected && isAvailable ? 700 : 600, color: !isAvailable ? "#aaa" : (isSelected ? "#5b5fc7" : "#333"), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {actor.name}
                      </div>
                      <div style={{ fontSize: 11, color: "#999", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {preview}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Phase objective — hidden if show_objective is false at scenario or phase level */}
            {(() => {
              const phase = scenario.phases[session.currentPhaseIndex];
              const globalShow = (scenario.meta as any).show_objective !== false;
              const phaseShow = (phase as any).show_objective;
              // Phase-level overrides global: if phase defines it, use it; otherwise fall back to global
              const shouldShow = phaseShow !== undefined ? phaseShow !== false : globalShow;
              if (!shouldShow) return null;
              return (
                <div style={{ marginTop: 16, padding: "10px", background: "#f8f8ff", borderRadius: 8, borderLeft: "3px solid #5b5fc7" }}>
                  <h4 style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, color: "#5b5fc7", textTransform: "uppercase" }}>
                    Objectif
                  </h4>
                  <p style={{ margin: 0, fontSize: 12, color: "#444", lineHeight: 1.4 }}>
                    {phaseObjective}
                  </p>
                </div>
              );
            })()}
          </div>
        </aside>

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
        <aside style={{ width: 280, flexShrink: 0, background: "#fafafa", borderLeft: "1px solid #e0e0e0", display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Panel tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid #e8e8e8", flexShrink: 0 }}>
            <button
              onClick={() => setRightPanel("info")}
              style={{
                flex: 1, padding: "10px", border: "none", cursor: "pointer",
                background: rightPanel === "info" ? "#fff" : "transparent",
                borderBottom: rightPanel === "info" ? "2px solid #5b5fc7" : "2px solid transparent",
                fontSize: 12, fontWeight: rightPanel === "info" ? 700 : 500,
                color: rightPanel === "info" ? "#5b5fc7" : "#666",
              }}
            >
              📋 Contexte
            </button>
            <button
              onClick={() => setRightPanel("docs")}
              style={{
                flex: 1, padding: "10px", border: "none", cursor: "pointer",
                background: rightPanel === "docs" ? "#fff" : "transparent",
                borderBottom: rightPanel === "docs" ? "2px solid #5b5fc7" : "2px solid transparent",
                fontSize: 12, fontWeight: rightPanel === "docs" ? 700 : 500,
                color: rightPanel === "docs" ? "#5b5fc7" : "#666",
              }}
            >
              📁 Documents ({allDocuments.length})
            </button>
          </div>

          {/* Panel content */}
          <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>

            {/* ── Context panel ── */}
            {rightPanel === "info" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Narrative sections */}
                {scenario.narrative?.context && (
                  <div>
                    <h4 style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, color: "#5b5fc7", textTransform: "uppercase" }}>Contexte</h4>
                    <p style={{ margin: 0, fontSize: 12, color: "#444", lineHeight: 1.5 }}>{scenario.narrative.context}</p>
                  </div>
                )}
                {scenario.narrative?.mission && (
                  <div>
                    <h4 style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, color: "#5b5fc7", textTransform: "uppercase" }}>Mission</h4>
                    <p style={{ margin: 0, fontSize: 12, color: "#444", lineHeight: 1.5 }}>{scenario.narrative.mission}</p>
                  </div>
                )}
                {scenario.narrative?.initial_situation && (
                  <div>
                    <h4 style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, color: "#5b5fc7", textTransform: "uppercase" }}>Situation initiale</h4>
                    <p style={{ margin: 0, fontSize: 12, color: "#444", lineHeight: 1.5 }}>{scenario.narrative.initial_situation}</p>
                  </div>
                )}
                {scenario.narrative?.trigger && (
                  <div>
                    <h4 style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, color: "#5b5fc7", textTransform: "uppercase" }}>Déclencheur</h4>
                    <p style={{ margin: 0, fontSize: 12, color: "#444", lineHeight: 1.5 }}>{scenario.narrative.trigger}</p>
                  </div>
                )}
                {scenario.narrative?.background_fact && (scenario.meta as any).show_background_fact !== false && (
                  <div style={{ padding: 10, background: "#fff8e6", borderRadius: 6, border: "1px solid #f5d680" }}>
                    <h4 style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, color: "#b8860b", textTransform: "uppercase" }}>Info vérifiée</h4>
                    <p style={{ margin: 0, fontSize: 12, color: "#444", lineHeight: 1.5 }}>{scenario.narrative.background_fact}</p>
                  </div>
                )}

                {/* Score hidden globally */}
              </div>
            )}

            {/* ── Documents panel ── */}
            {rightPanel === "docs" && (
              <DocumentsView
                documents={allDocuments}
                scenarioId={scenarioId}
                currentPhaseId={currentPhaseId}
                pacteSigned={pacteSigned}
                onOpenInlineDoc={(title, content) => setInlineDocContent({ title, content })}
              />
            )}
          </div>
        </aside>
      </div>
      )}

      {/* ═══════ DEBUG PANEL (only with ?debug=1) ═══════ */}
      {debugMode && view && session && scenario && (() => {
        const phase = scenario.phases[session.currentPhaseIndex];
        const pid = phase?.phase_id || "?";
        const rules = phase?.completion_rules || {};
        const mc = phase?.mail_config;
        const flagEntries = Object.entries(session.flags).filter(([, v]) => v);
        return (
          <div
            style={{
              position: "fixed", bottom: 12, left: 12, zIndex: 9999,
              background: "rgba(15,15,30,0.95)", color: "#e0e0e0",
              borderRadius: 10, border: "1px solid rgba(91,95,199,0.5)",
              fontSize: 11, fontFamily: "monospace", maxWidth: 380,
              boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
              backdropFilter: "blur(8px)",
            }}
          >
            {/* Header — always visible */}
            <div
              onClick={() => setDebugCollapsed(!debugCollapsed)}
              style={{
                padding: "6px 12px", cursor: "pointer", display: "flex",
                justifyContent: "space-between", alignItems: "center",
                borderBottom: debugCollapsed ? "none" : "1px solid rgba(255,255,255,0.1)",
                userSelect: "none",
              }}
            >
              <span style={{ fontWeight: 700, color: "#a5a8ff" }}>
                DEBUG {pid}
              </span>
              <span style={{ color: "rgba(255,255,255,0.4)" }}>
                {debugCollapsed ? "+" : "-"}
              </span>
            </div>
            {/* Body */}
            {!debugCollapsed && (
              <div style={{ padding: "8px 12px", lineHeight: 1.7 }}>
                <div><span style={{ color: "#888" }}>Phase:</span> <span style={{ color: "#fff", fontWeight: 600 }}>{pid}</span> <span style={{ color: "#888" }}>({phase?.title})</span></div>
                <div><span style={{ color: "#888" }}>Focus:</span> <span style={{ color: phase?.phase_focus ? "#a5a8ff" : "#555" }}>{phase?.phase_focus ? phase.phase_focus.slice(0, 80) + (phase.phase_focus.length > 80 ? "..." : "") : "(aucun)"}</span></div>
                <div><span style={{ color: "#888" }}>Score:</span> {session.scores[pid] || 0} | <span style={{ color: "#888" }}>canAdvance:</span> <span style={{ color: view.canAdvance ? "#22c55e" : "#ef4444", fontWeight: 600 }}>{view.canAdvance ? "OUI" : "NON"}</span></div>
                <div><span style={{ color: "#888" }}>Rules:</span> {rules.min_score !== undefined ? `min_score=${rules.min_score}` : ""}{rules.any_flags ? `any_flags=[${rules.any_flags.join(", ")}]` : ""}{rules.all_flags ? `all_flags=[${rules.all_flags.join(", ")}]` : ""}{!rules.min_score && !rules.any_flags && !rules.all_flags ? "fallback (2 msgs)" : ""}</div>
                {mc && <div><span style={{ color: "#888" }}>Mail:</span> send_advances={mc.send_advances_phase ? "true" : "false"} | flags={JSON.stringify(mc.on_send_flags)}</div>}
                <div><span style={{ color: "#888" }}>Docs:</span> {allDocuments.length}/{allDocumentsRaw.length} visibles{allDocumentsRaw.length > allDocuments.length ? ` (${allDocumentsRaw.length - allDocuments.length} locked)` : ""}</div>
                {flagEntries.length > 0 && (
                  <div><span style={{ color: "#888" }}>Flags:</span> {flagEntries.map(([k]) => k).join(", ")}</div>
                )}
                {/* ── Skip to Phase buttons ── */}
                <div style={{ marginTop: 6, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 6 }}>
                  <div style={{ color: "#888", marginBottom: 4 }}>Jump to phase:</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {scenario.phases.map((p: any, idx: number) => (
                      <button
                        key={p.phase_id}
                        disabled={idx === session.currentPhaseIndex}
                        onClick={() => {
                          const updated = { ...session, currentPhaseIndex: idx };
                          // Mark previous phases as completed in scores so completion checks pass
                          for (let i = 0; i < idx; i++) {
                            const prevPhase = scenario.phases[i];
                            if (prevPhase && !updated.scores[prevPhase.phase_id]) {
                              updated.scores[prevPhase.phase_id] = 100;
                            }
                          }
                          // injectPhaseEntryEvents mutates in place and returns void
                          injectPhaseEntryEvents(updated);
                          dispatchEnterPhase(updated); // Module system
                          setSession({ ...updated });
                        }}
                        style={{
                          padding: "2px 8px", fontSize: 10, borderRadius: 4,
                          border: idx === session.currentPhaseIndex ? "1px solid #a5a8ff" : "1px solid rgba(255,255,255,0.2)",
                          background: idx === session.currentPhaseIndex ? "rgba(91,95,199,0.3)" : "rgba(255,255,255,0.05)",
                          color: idx === session.currentPhaseIndex ? "#a5a8ff" : "#ccc",
                          cursor: idx === session.currentPhaseIndex ? "default" : "pointer",
                          opacity: idx === session.currentPhaseIndex ? 0.6 : 1,
                        }}
                      >
                        P{idx + 1}: {p.phase_id.slice(0, 15)}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: 4, color: "#555", fontSize: 10 }}>?debug=1 | Ctrl+D toggle</div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
