"use client";

import { useEffect, useMemo, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
import { saveGameRecord } from "@/app/lib/gameHistory";
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

// ════════════════════════════════════════════════════════════════════
// CONSTANTS & HELPERS
// ════════════════════════════════════════════════════════════════════

type MainView = "chat" | "mail" | "docs" | "context";

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
  const [showContactPicker, setShowContactPicker] = useState<"to" | "cc" | null>(null);
  const [debriefData, setDebriefData] = useState<any>(null);
  const [debriefLoading, setDebriefLoading] = useState(false);
  const [debriefError, setDebriefError] = useState<string | null>(null);
  const debriefCalledRef = useRef(false);
  const debriefSavedRef = useRef(false);

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
      ? localStorage.getItem(`sjg_playerName_${scenarioId}`) || "Joueur"
      : "Joueur";

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
  const mailLockedForNow = scenarioHasMail && !canComposeMail;
  const simulatedTime = view?.simulatedTime ? fmtTime(view.simulatedTime) : "--:--";
  const actors = scenario?.actors || [];
  const visibleContacts = actors.filter((a: any) => a.visible_in_contacts || a.actor_id === "player");

  // ── Keep refs in sync for closures ──
  sessionRef.current = session;
  scenarioRef.current = scenario;
  viewRef.current = view;
  isSendingRef.current = isSending;

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
  const filteredConversation = useMemo(() => {
    if (!selectedContact) return conversation;
    return conversation.filter((msg: any) => {
      if (msg.role === "system") return false; // system messages go to all
      if (msg.role === "player") return msg.toActor === selectedContact;
      if (msg.role === "npc") return msg.actor === selectedContact;
      return false;
    });
  }, [conversation, selectedContact]);

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

  // ── Call AI debrief when game finishes (once only) ──
  useEffect(() => {
    if (!view?.isFinished || !scenario || !session || debriefCalledRef.current) return;
    debriefCalledRef.current = true;
    setDebriefLoading(true);
    setDebriefError(null);

    fetch("/api/debrief", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        playerName: displayPlayerName,
        scenarioTitle: scenario.meta?.title || "Scénario",
        phases: scenario.phases,
        conversation: session.chatMessages,
        sentMails: session.sentMails,
        inboxMails: session.inboxMails,
        endings: scenario.endings || [],
        defaultEnding: (scenario as any).default_ending || null,
      }),
    })
      .then((r) => {
        if (!r.ok) {
          if (r.status === 429) throw new Error("Trop de requêtes. Veuillez patienter quelques instants.");
          if (r.status === 400) throw new Error("Données invalides pour le débrief.");
          throw new Error(`Erreur serveur (${r.status})`);
        }
        return r.json();
      })
      .then((data) => {
        setDebriefData(data);
        setDebriefLoading(false);
      })
      .catch((err) => {
        setDebriefError(err.message || "Erreur lors du débrief");
        setDebriefLoading(false);
      });
  }, [view?.isFinished]);

  // ── Save debrief to game history (once only) — localStorage + server ──
  useEffect(() => {
    if (!debriefData || debriefSavedRef.current || !scenario) return;
    debriefSavedRef.current = true;

    const phases = debriefData.phases || [];
    const avgScore =
      phases.length > 0
        ? Math.round(
            phases.reduce((s: number, p: any) => s + (p.phase_score || 0), 0) /
              phases.length
          )
        : 0;

    // Save to localStorage (legacy)
    saveGameRecord({
      scenarioId: scenarioId as string,
      scenarioTitle: scenario.meta?.title || "Scenario",
      playerName: displayPlayerName,
      ending: debriefData.ending || "failure",
      avgScore,
      debrief: debriefData,
    });

    // Save to server (for profile/history/PDF)
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
    if (token) {
      fetch("/api/profile/save-game", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          scenarioId: scenarioId as string,
          scenarioTitle: scenario.meta?.title || "Scenario",
          playerName: displayPlayerName,
          ending: debriefData.ending || "failure",
          avgScore,
          durationMin: Math.max(1, Math.round(
            (Date.now() - (session.realStartTime || Date.now())) / 60000
          )),
          phasesCompleted: session.completedPhases?.length || 0,
          totalPhases: scenario.phases?.length || 0,
          debrief: { ...debriefData, scenarioCompetencies: scenario.meta?.competencies || [] },
          jobFamily: scenario.meta?.job_family || "",
          difficulty: scenario.meta?.difficulty || "junior",
          organizationId: typeof window !== "undefined" ? localStorage.getItem("active_org_id") || undefined : undefined,
        }),
      }).then(async (res) => {
        if (!res || !res.ok) {
          const errBody = await res?.json().catch(() => ({}));
          console.error("Erreur sauvegarde partie:", res?.status, errBody);
          return;
        }
        const data = await res.json();
        // Trigger async skill extraction
        if (data.record?.id && token) {
          fetch("/api/profile/extract-skills", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ recordId: data.record.id }),
          }).catch((err) => console.error("Skill extraction failed:", err));
        }
      }).catch((err) => console.error("Failed to save game to server:", err));
    }
  }, [debriefData]);

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
        // Refresh the auth ref in case it was stale
        authTokenRef.current = token;

        const res = await fetch(`/api/scenarios/${scenarioId}`);
        if (!res.ok) throw new Error("Impossible de charger le scénario");
        const data: ScenarioDefinition = await res.json();
        setScenario(data);

        const s = initializeSession(data);
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
        setSession(s);
        setLoading(false);

        // Auto-select the first AI actor of phase 1 as the active conversation
        const phase1Actor = data.phases[0]?.ai_actors?.[0];
        if (phase1Actor) setSelectedContact(phase1Actor);

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

  // ── Simulated clock ──
  useEffect(() => {
    if (!session || !scenario) return;
    const iv = setInterval(() => {
      setSession((prev: any) => {
        if (!prev) return prev;
        const next = cloneSession(prev);
        tickSimulatedTime(next, 1000);
        return next;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [!!session, !!scenario]);

  // ── Auto-advance ──
  useEffect(() => {
    if (!session || !scenario || !view) return;
    const phase = scenario.phases[session.currentPhaseIndex];
    if (phase?.auto_advance && view.canAdvance) {
      const next = cloneSession(session);
      completeCurrentPhaseAndAdvance(next);
      injectPhaseEntryEvents(next);
      const newPhase = scenario.phases[next.currentPhaseIndex];
      if (newPhase?.mail_config?.defaults) {
        updateMailDraft(next, newPhase.phase_id, {
          to: "",
          cc: "",
          subject: newPhase.mail_config.defaults.subject || "",
          body: "", attachments: [],
        });
      }
      setSession(next);
    }
  }, [view?.canAdvance, view?.phaseId]);

  // ── Time-based auto-advance (e.g., phase 1 ends at 15:00) ──
  const timeAdvanceTriggeredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!session || !scenario || !view) return;
    const phase = scenario.phases[session.currentPhaseIndex];
    const advanceAtKey = (phase as any)?.auto_advance_at;
    if (!advanceAtKey) return;
    const timeline = (scenario as any).timeline;
    if (!timeline || !timeline[advanceAtKey]) return;
    const deadlineIso = timeline[advanceAtKey];
    const deadlineMs = new Date(deadlineIso).getTime();
    const simMs = new Date(session.simulatedTime).getTime();
    // Prevent re-triggering for same phase
    const phaseId = phase?.phase_id || `phase_${session.currentPhaseIndex}`;
    if (simMs >= deadlineMs && timeAdvanceTriggeredRef.current !== phaseId) {
      timeAdvanceTriggeredRef.current = phaseId;
      const next = cloneSession(session);
      // Set simulated time to the exact deadline
      next.simulatedTime = deadlineIso;
      completeCurrentPhaseAndAdvance(next);
      injectPhaseEntryEvents(next);
      const newPhase = scenario.phases[next.currentPhaseIndex];
      if (newPhase?.mail_config?.defaults) {
        updateMailDraft(next, newPhase.phase_id, {
          to: "", cc: "",
          subject: newPhase.mail_config.defaults.subject || "",
          body: "", attachments: [],
        });
      }
      // Auto-select the first AI actor of the new phase
      const newPhaseActor = newPhase?.ai_actors?.[0];
      if (newPhaseActor) setSelectedContact(newPhaseActor);
      setSession(next);
    }
  }, [session?.simulatedTime, session?.currentPhaseIndex]);

  // ── Reset phase start real time when phase changes ──
  useEffect(() => {
    if (!session) return;
    phaseStartRealTimeRef.current = Date.now();
  }, [session?.currentPhaseIndex]);

  // ── Auto-advance based on max_duration_sec (real wall-clock time) ──
  useEffect(() => {
    if (!session || !scenario) return;
    const phase = scenario.phases[session.currentPhaseIndex] as any;
    const maxSec = phase?.max_duration_sec;
    if (!maxSec || typeof maxSec !== "number") return;
    const phaseId = phase?.phase_id || `phase_${session.currentPhaseIndex}`;
    if (phaseMaxDurationTriggeredRef.current === phaseId) return;

    const iv = setInterval(() => {
      const elapsed = (Date.now() - phaseStartRealTimeRef.current) / 1000;
      if (elapsed >= maxSec && phaseMaxDurationTriggeredRef.current !== phaseId) {
        phaseMaxDurationTriggeredRef.current = phaseId;
        // Check if there's a next phase
        const isLastPhase = session.currentPhaseIndex >= scenario.phases.length - 1;
        if (isLastPhase) {
          // End the scenario — complete last phase + trigger finish
          setSession((prev: any) => {
            if (!prev) return prev;
            const next = cloneSession(prev);
            addAIMessage(next, "⏱ Le temps imparti est écoulé.", "system");
            // Mark last phase as completed
            const lastPhaseId = scenario.phases[next.currentPhaseIndex]?.phase_id;
            if (lastPhaseId && !next.completedPhases.includes(lastPhaseId)) {
              next.completedPhases.push(lastPhaseId);
            }
            finishScenario(next);
            return next;
          });
        } else {
          setSession((prev: any) => {
            if (!prev) return prev;
            const next = cloneSession(prev);
            addAIMessage(next, "⏱ Le temps imparti pour cette phase est écoulé. Passons à la suite.", "system");
            completeCurrentPhaseAndAdvance(next);
            injectPhaseEntryEvents(next);
            const newPhase = scenario.phases[next.currentPhaseIndex];
            if (newPhase?.ai_actors?.[0]) setSelectedContact(newPhase.ai_actors[0]);
            return next;
          });
        }
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [session?.currentPhaseIndex, !!session, !!scenario]);

  // ── Flush timed events ──
  useEffect(() => {
    if (!session || !scenario) return;
    const iv = setInterval(() => {
      setSession((prev: any) => {
        if (!prev) return prev;
        const next = cloneSession(prev);
        const changed = flushDueTimedEvents(next);
        return changed ? next : prev;
      });
    }, 500);
    return () => clearInterval(iv);
  }, [!!session, !!scenario]);

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
    if (newPhase?.ai_actors?.[0]) setSelectedContact(newPhase.ai_actors[0]);
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
        // Randomly lower a hand (20% chance)
        if (updated.length > 1 && Math.random() < 0.2) {
          updated.splice(Math.floor(Math.random() * updated.length), 1);
        }
        // Randomly raise a hand (40% chance)
        if (available.length > 0 && updated.length < maxHands && Math.random() < 0.4) {
          updated.push(available[Math.floor(Math.random() * available.length)]);
        }
        return updated;
      });
    }, (config.hand_raise_interval_sec || 15) * 1000);
    return () => clearInterval(iv);
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

  // ── Auto-start mic in voice_qa mode ──
  // Only auto-start when native SpeechRecognition is available (silence-based
  // auto-send requires real-time interim results). When only MediaRecorder is
  // available (Firefox), the user must click the mic button to submit each
  // turn — the UI indicator shows "Mode tour-par-tour" to make this explicit.
  useEffect(() => {
    if (!session || !scenario) return;
    const phase = scenario.phases[session.currentPhaseIndex] as any;
    if (phase?.interaction_mode !== "voice_qa") return;
    if (isRecording || presentationDone) return;
    const caps = voiceCapabilities || detectVoiceCapabilities();
    if (!caps.hasSpeechRecognition) return; // backend mode → manual mic click
    const t = setTimeout(() => startRecognition("fr-FR", true), 1500);
    return () => clearTimeout(t);
  }, [session?.currentPhaseIndex, voiceCapabilities?.recommendedMode]);

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

  // Shared helper used by voice_qa onSilence to push the accumulated
  // transcript as a player message and trigger the AI reply.
  function dispatchVoiceQAMessage(newText: string) {
    if (!newText || isSendingRef.current) return;
    const sess = sessionRef.current;
    const scen = scenarioRef.current;
    const v = viewRef.current;
    if (!sess || !scen || !v) return;
    const targetActor = scen.phases[sess.currentPhaseIndex]?.ai_actors?.[0] || "enfants_cmj";
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
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: apiHeaders(),
          body: JSON.stringify({
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
          }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(res.status === 429
            ? "Trop de requêtes. Veuillez patienter."
            : errBody.message || `Erreur chat (${res.status})`);
        }
        const data = await res.json();
        playNotificationSound();
        const final2 = cloneSession(next);
        addAIMessage(final2, data.reply, targetActor);
        applyEvaluation(final2, data.matched_criteria || [], data.score_delta || 0, data.flags_to_set || {});
        setSession(final2);
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
        body: JSON.stringify({ text, voice, speed: 1.0 }),
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
      utterance.rate = 0.95;
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
    const text = playerInput;
    setPlayerInput("");
    // Re-focus immediately so player can keep typing
    setTimeout(() => inputRef.current?.focus(), 0);

    // Determine which AI actor will respond
    const targetActor = selectedContact || scenario.phases[session.currentPhaseIndex]?.ai_actors?.[0] || "npc";

    // Add player message to session immediately (optimistic)
    const next = cloneSession(session);
    addPlayerMessage(next, text, targetActor);
    setSession(next);

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

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({
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
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(res.status === 429
          ? "Trop de requêtes. Veuillez patienter quelques instants."
          : errBody.message || `Erreur chat (${res.status})`);
      }

      const data = await res.json();
      playNotificationSound();

      // Use sessionRef for latest state (player may have sent more messages since)
      const latestSession = sessionRef.current || next;
      const final = cloneSession(latestSession);
      addAIMessage(final, data.reply, targetActor);
      applyEvaluation(
        final,
        data.matched_criteria || [],
        data.score_delta || 0,
        data.flags_to_set || {}
      );
      updateAdaptiveMode(final);
      scheduleInterruption(final);
      setSession(final);
    } catch (err) {
      console.error("Erreur chat:", err);
    } finally {
      setIsSending(false);
    }
  }

  function handleSendMail() {
    if (!session || !scenario || !view || !canActuallySendMail) return;
    const phase = scenario.phases[session.currentPhaseIndex];
    const next = cloneSession(session);
    sendCurrentPhaseMail(next, phase?.mail_config?.kind || "other");
    playNotificationSound();

    if (phase?.mail_config?.send_advances_phase) {
      completeCurrentPhaseAndAdvance(next);
      injectPhaseEntryEvents(next);
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
    setSession(next);
    setShowCompose(false);
  }

  function updateDraft(patch: any) {
    if (!session || !view) return;
    const next = cloneSession(session);
    updateMailDraft(next, view.phaseId, { ...currentMailDraft, ...patch });
    setSession(next);
  }

  function handleToggleAttachment(docId: string, label: string) {
    if (!session || !view) return;
    const next = cloneSession(session);
    toggleMailAttachment(next, view.phaseId, { id: docId, label });
    setSession(next);
  }

  // ════════════════════════════════════════════════════════════════════
  // RENDER HELPERS
  // ════════════════════════════════════════════════════════════════════

  function getActorInfo(actorId: string) {
    const a = actors.find((x: any) => x.actor_id === actorId);
    return {
      name: a?.name || actorId,
      color: a?.avatar?.color || "#666",
      initials: a?.avatar?.initials || getInitials(a?.name || actorId),
      status: (a as any)?.contact_status || "offline",
    };
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
    // ── Rating badge helper ──
    const ratingConfig: Record<string, { label: string; color: string; bg: string; icon: string }> = {
      maitrise: { label: "Maîtrisé", color: "#1a7f37", bg: "#dcfce7", icon: "★" },
      acquis: { label: "Acquis", color: "#2563eb", bg: "#dbeafe", icon: "●" },
      en_cours: { label: "En cours", color: "#b45309", bg: "#fef3c7", icon: "◐" },
      non_acquis: { label: "Non acquis", color: "#991b1b", bg: "#fee2e2", icon: "○" },
    };

    // ── Determine ending from AI debrief or fallback ──
    const aiEnding = debriefData?.ending || "failure";
    const endingColor = aiEnding === "success" ? "#16a34a" : aiEnding === "partial_success" ? "#d97706" : "#dc2626";
    const endingEmoji = aiEnding === "success" ? "🎉" : aiEnding === "partial_success" ? "⚠️" : "💡";
    const endingLabel = aiEnding === "success" ? "Succès" : aiEnding === "partial_success" ? "Succès partiel" : "Échec";

    // ── Loading state ──
    if (debriefLoading) {
      return (
        <div style={{ minHeight: "100vh", background: "#f3f2f1", fontFamily: "'Segoe UI', system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center", maxWidth: 400 }}>
            <div style={{ width: 48, height: 48, border: "4px solid #e0e0e0", borderTopColor: "#5b5fc7", borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto 20px" }} />
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#333", marginBottom: 8 }}>Analyse en cours...</h2>
            <p style={{ fontSize: 14, color: "#888", lineHeight: 1.5 }}>
              L'IA évalue ta performance phase par phase. Cela peut prendre quelques secondes.
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
            <p style={{ fontSize: 14, color: "#888", marginBottom: 20 }}>Le débrief IA n'a pas pu être généré : {debriefError}</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button onClick={() => router.push(`/scenarios/${scenarioId}`)} style={{ padding: "10px 24px", background: "#5b5fc7", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
                Rejouer
              </button>
              <button onClick={() => router.push("/")} style={{ padding: "10px 24px", background: "#fff", color: "#666", border: "1px solid #ddd", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
                Accueil
              </button>
            </div>
          </div>
        </div>
      );
    }

    // ── AI Debrief screen ──
    if (debriefData) {
      const avgScore = debriefData.phases?.length > 0
        ? Math.round(debriefData.phases.reduce((s: number, p: any) => s + (p.phase_score || 0), 0) / debriefData.phases.length)
        : 0;

      return (
        <div style={{ minHeight: "100vh", background: "#f3f2f1", fontFamily: "'Segoe UI', system-ui, sans-serif", overflowY: "auto" }}>
          {/* Header banner */}
          <div style={{ background: endingColor, padding: "36px 24px", textAlign: "center", color: "#fff" }}>
            <div style={{ fontSize: 44, marginBottom: 8 }}>{endingEmoji}</div>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 8px" }}>{endingLabel}</h1>
            <p style={{ fontSize: 15, opacity: 0.92, maxWidth: 650, margin: "0 auto", lineHeight: 1.6 }}>
              {debriefData.ending_narrative || debriefData.overall_summary}
            </p>
          </div>

          <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 20px" }}>

            {/* Global summary */}
            {debriefData.overall_summary && (
              <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,.05)", marginBottom: 20 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: "#333", margin: "0 0 10px" }}>Résumé global</h2>
                <p style={{ margin: 0, fontSize: 14, color: "#444", lineHeight: 1.7 }}>{debriefData.overall_summary}</p>
              </div>
            )}

            {/* Per-phase AI analysis */}
            {debriefData.phases?.map((phase: any, idx: number) => {
              return (
                <div key={idx} style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,.05)", marginBottom: 16 }}>
                  {/* Phase header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#333" }}>
                      Phase {idx + 1} — {phase.phase_title}
                    </h3>
                  </div>
                  {/* Phase summary */}
                  {phase.phase_summary && (
                    <p style={{ margin: "0 0 14px", fontSize: 13, color: "#555", lineHeight: 1.6, fontStyle: "italic" }}>{phase.phase_summary}</p>
                  )}
                  {/* Competencies */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {phase.competencies?.map((comp: any, ci: number) => {
                      const cfg = ratingConfig[comp.rating] || ratingConfig.non_acquis;
                      return (
                        <div key={ci} style={{ padding: "10px 14px", background: "#fafafa", borderRadius: 8, borderLeft: `3px solid ${cfg.color}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>{comp.name}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg, padding: "2px 10px", borderRadius: 12 }}>
                              {cfg.icon} {cfg.label}
                            </span>
                          </div>
                          <p style={{ margin: 0, fontSize: 12, color: "#666", lineHeight: 1.5 }}>{comp.justification}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Strengths & Improvements side by side */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
              {debriefData.strengths?.length > 0 && (
                <div style={{ background: "#f0fdf4", borderRadius: 12, padding: 20, border: "1px solid #bbf7d0" }}>
                  <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: "#16a34a" }}>Points forts</h3>
                  {debriefData.strengths.map((s: string, i: number) => (
                    <p key={i} style={{ margin: "0 0 6px", fontSize: 13, color: "#333", lineHeight: 1.5 }}>• {s}</p>
                  ))}
                </div>
              )}
              {debriefData.improvements?.length > 0 && (
                <div style={{ background: "#fffbeb", borderRadius: 12, padding: 20, border: "1px solid #fde68a" }}>
                  <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: "#b45309" }}>Axes d'amélioration</h3>
                  {debriefData.improvements.map((s: string, i: number) => (
                    <p key={i} style={{ margin: "0 0 6px", fontSize: 13, color: "#333", lineHeight: 1.5 }}>• {s}</p>
                  ))}
                </div>
              )}
            </div>

            {/* Pedagogical advice */}
            {debriefData.pedagogical_advice && (
              <div style={{ background: "#f0f0ff", borderRadius: 12, padding: 20, border: "1px solid #c7d2fe", marginBottom: 24 }}>
                <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#5b5fc7" }}>Conseil pédagogique</h3>
                <p style={{ margin: 0, fontSize: 13, color: "#444", lineHeight: 1.6 }}>{debriefData.pedagogical_advice}</p>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", paddingBottom: 40 }}>
              <button
                onClick={() => router.push(`/scenarios/${scenarioId}`)}
                style={{ padding: "12px 28px", background: "#5b5fc7", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14, boxShadow: "0 2px 8px rgba(91,95,199,.3)" }}
              >
                Rejouer le scénario
              </button>
              <button
                onClick={() => router.push("/history")}
                style={{ padding: "12px 28px", background: "#fff", color: "#5b5fc7", border: "1px solid #5b5fc7", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14 }}
              >
                Historique
              </button>
              <button
                onClick={() => router.push("/")}
                style={{ padding: "12px 28px", background: "#fff", color: "#666", border: "1px solid #ddd", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14 }}
              >
                Retour à l'accueil
              </button>
            </div>
          </div>
        </div>
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
                  return hasPDF ? (
                    <a
                      key={doc.doc_id}
                      href={`/api/download?file=${encodeURIComponent(doc.file_path)}`}
                      style={{
                        padding: 14, borderRadius: 10, cursor: "pointer",
                        background: "#fff", border: "1px solid #e2e4ea",
                        transition: "all .15s", display: "flex", flexDirection: "column", gap: 8,
                        textDecoration: "none", color: "inherit",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#5b5fc7"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(91,95,199,0.12)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e2e4ea"; e.currentTarget.style.boxShadow = "none"; }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>
                        {docIcon} {doc.label}
                      </div>
                      <span style={{ fontSize: 10, color: "#5b5fc7", fontWeight: 600 }}>⬇ Cliquez pour télécharger</span>
                    </a>
                  ) : (
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
                      <span style={{ fontSize: 10, color: "#5b5fc7", fontWeight: 600 }}>Cliquer pour consulter →</span>
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

          {/* Children row */}
          <div style={{ padding: "20px 24px 12px", flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
              🏫 Les enfants du CMJ
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {((currentPhaseConfig as any)?.voice_qa_config?.children_names || []).map((childName: string) => {
                const hasHand = raisedHands.includes(childName);
                const childColors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F"];
                const colorIdx = childName.charCodeAt(0) % childColors.length;
                return (
                  <button
                    key={childName}
                    onClick={async () => {
                      if (!hasHand || qaWaiting || isSpeakingTTS) return;
                      setQaWaiting(true);
                      // Remove hand
                      setRaisedHands(prev => prev.filter(n => n !== childName));
                      try {
                        // Generate child question
                        const question = await generateNPCMessage(
                          "enfants_cmj",
                          `INSTRUCTION: C'est ${childName} qui lève la main. Réponds UNIQUEMENT avec la réplique de ${childName}. UN SEUL enfant (${childName}), UNE question courte (1-2 phrases). Ne fais parler AUCUN autre enfant.`
                        );
                        // Add to conversation
                        const next = cloneSession(session);
                        addAIMessage(next, question, "enfants_cmj");
                        setSession(next);
                        // TTS will auto-trigger via the effect
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
                      <Avatar initials={getInitials(displayPlayerName)} color="#5b5fc7" size={36} />
                    )}
                    <div>
                      <div style={{ fontSize: 11, color: "#888", marginBottom: 3, textAlign: isPlayer ? "right" : "left" }}>
                        {isPlayer ? displayPlayerName : actor?.name}
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

          {/* Yuki sidebar + mic area */}
          <div style={{ padding: "12px 24px 20px", borderTop: "1px solid #e0e0e0", background: "#fff", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>

              {/* Yuki avatar */}
              {(() => {
                const yukiActor = actors.find((a: any) => a.actor_id === "yuki_tanaka");
                if (!yukiActor) return null;
                return (
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
                );
              })()}

              <div style={{ flex: 1 }} />

              {/* Mic indicator + mute toggle */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: isRecording ? "#fef2f2" : "#f0f0f0",
                  padding: "8px 16px", borderRadius: 20,
                  border: isRecording ? "1px solid #fca5a5" : "1px solid #ddd",
                }}>
                  <div style={{
                    width: 12, height: 12, borderRadius: "50%",
                    background: isRecording ? "#e94b3c" : "#999",
                    animation: isRecording ? "micBlink 1s ease-in-out infinite" : "none",
                  }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: isRecording ? "#e94b3c" : "#999" }}>
                    {voiceTranscribing
                      ? "Transcription..."
                      : isRecording
                        ? (isSending ? "Analyse en cours..." : "Micro actif — Parlez librement")
                        : "Micro coupé"}
                  </span>
                </div>
                {/* Voice_qa warns if native SR is missing — auto-send-on-silence
                    only works with native. Backend-only users must tap the mic
                    button to submit each turn. */}
                {voiceCapabilities && !voiceCapabilities.hasSpeechRecognition && voiceCapabilities.hasMediaRecorder && (
                  <span style={{ fontSize: 11, color: "#b87500", fontWeight: 600 }} title="Sans reconnaissance temps réel, appuyez sur le micro pour envoyer chaque tour.">
                    📢 Mode tour-par-tour
                  </span>
                )}
                {voiceFatalError && (
                  <span style={{ fontSize: 11, color: "#c62828", fontWeight: 600 }} title={voiceFatalError.message}>
                    ⚠️ {voiceFatalError.category === "permission_denied" ? "Micro refusé"
                       : voiceFatalError.category === "mic_missing" ? "Aucun micro"
                       : voiceFatalError.category === "mic_busy" ? "Micro occupé"
                       : "Indisponible"}
                  </span>
                )}
                <button
                  onClick={() => {
                    if (isRecording) {
                      // Mute — stop session (backend transcription result
                      // ignored here; the last message was already dispatched
                      // via onSilence or the final stop is just for "pause")
                      if (autoSendTimerRef.current) { clearTimeout(autoSendTimerRef.current); autoSendTimerRef.current = null; }
                      stopRecognition().then((result) => {
                        // If backend produced a trailing transcript that hadn't
                        // been auto-sent yet, dispatch it now so no input is lost.
                        const pending = result.transcript.trim();
                        const already = lastSentTranscriptRef.current.trim();
                        if (pending && pending !== already && result.source !== "error") {
                          dispatchVoiceQAMessage(pending);
                        }
                      }).catch(() => {});
                    } else {
                      // Unmute — restart with auto-send (if supported)
                      startRecognition("fr-FR", true);
                    }
                  }}
                  style={{
                    width: 44, height: 44, borderRadius: "50%",
                    background: isRecording ? "#e94b3c" : "#5b5fc7",
                    border: "none", color: "#fff", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 20, transition: "all .2s",
                  }}
                >
                  {isRecording ? "🔇" : "🎙️"}
                </button>
              </div>
            </div>

            {/* Live transcription subtitle */}
            {(voiceTranscript || interimText) && isRecording && (
              <div style={{ marginTop: 10, padding: "8px 12px", background: "#f8f8ff", borderRadius: 8, border: "1px solid #e8e8ff" }}>
                <span style={{ fontSize: 12, color: "#555", lineHeight: 1.4 }}>
                  {voiceTranscript}
                  {interimText && <span style={{ color: "#aaa", fontStyle: "italic" }}>{interimText}</span>}
                </span>
                {voiceTranscript && !isSending && (
                  <span style={{ fontSize: 10, color: "#7b7fff", marginLeft: 8 }}>
                    (envoi auto apres une pause)
                  </span>
                )}
              </div>
            )}
          </div>
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
              { key: "mail" as MainView, icon: mailLockedForNow ? "🔒" : "📧", label: "Email", badge: unreadMails },
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
              {visibleContacts.filter((a: any) => a.actor_id !== "player").map((actor: any) => {
                const status = actor.contact_status || (actor.interaction_modes?.includes("unreachable") ? "offline" : "available");
                const color = actor.avatar?.color || "#666";
                const ini = actor.avatar?.initials || getInitials(actor.name);
                const isSelected = selectedContact === actor.actor_id;
                const unread = contactUnreadCounts[actor.actor_id] || 0;
                // Last message preview
                const lastMsg = [...conversation].reverse().find((m: any) => m.actor === actor.actor_id && m.role === "npc");
                const preview = lastMsg ? (lastMsg.content.length > 40 ? lastMsg.content.slice(0, 40) + "..." : lastMsg.content) : (actor.contact_preview || "");
                return (
                  <li
                    key={actor.actor_id}
                    onClick={() => { setSelectedContact(actor.actor_id); setMainView("chat"); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 8px", borderRadius: 8,
                      marginBottom: 2, cursor: "pointer",
                      background: isSelected ? "#f0f0ff" : "transparent",
                      borderLeft: isSelected ? "3px solid #5b5fc7" : "3px solid transparent",
                      transition: "all .1s",
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "#f8f8fb"; }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{ position: "relative" }}>
                      <Avatar initials={ini} color={color} size={36} status={status} />
                      {unread > 0 && (
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
                      <div style={{ fontSize: 13, fontWeight: isSelected ? 700 : 600, color: isSelected ? "#5b5fc7" : "#333", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
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
            <>
              {/* Chat header */}
              <div style={{ padding: "10px 16px", borderBottom: "1px solid #e8e8e8", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                {(() => {
                  if (selectedContact) {
                    const contactActor = actors.find((a: any) => a.actor_id === selectedContact);
                    const cColor = contactActor?.avatar?.color || "#666";
                    const cIni = contactActor?.avatar?.initials || getInitials(contactActor?.name || "");
                    return (
                      <>
                        <Avatar initials={cIni} color={cColor} size={28} status={contactActor?.contact_status || "available"} />
                        <span style={{ fontSize: 15, fontWeight: 600, color: "#333" }}>{contactActor?.name || selectedContact}</span>
                        <span style={{ fontSize: 12, color: "#999" }}>— {phaseTitle}</span>
                      </>
                    );
                  }
                  return <span style={{ fontSize: 15, fontWeight: 600, color: "#333" }}>💬 Messagerie — {phaseTitle}</span>;
                })()}
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                {filteredConversation.map((msg: any) => {
                  const isPlayer = msg.role === "player";
                  const isSystem = msg.role === "system";
                  const actor = !isPlayer && !isSystem ? getActorInfo(msg.actor || "npc") : null;
                  const msgType = msg.type || "";

                  if (isSystem) {
                    return (
                      <div key={msg.id} style={{ textAlign: "center", padding: "6px 0" }}>
                        <span style={{ background: "#f0f0f0", color: "#888", fontSize: 11, padding: "4px 12px", borderRadius: 12 }}>
                          {msg.content}
                        </span>
                      </div>
                    );
                  }

                  // Type badge for non-chat messages
                  const typeBadgeMap: Record<string, string> = { phone_call: "📞 Appel", whatsapp_message: "📱 WhatsApp", sms: "📱 SMS", visio: "📹 Visio" };
                  const typeBadge = typeBadgeMap[msgType] || null;

                  return (
                    <div
                      key={msg.id}
                      style={{
                        display: "flex", gap: 8, alignItems: "flex-start",
                        flexDirection: isPlayer ? "row-reverse" : "row",
                        maxWidth: "85%", alignSelf: isPlayer ? "flex-end" : "flex-start",
                      }}
                    >
                      {!isPlayer && actor && (
                        <Avatar initials={actor.initials} color={actor.color} size={32} status={actor.status} />
                      )}
                      {isPlayer && (
                        <Avatar initials={getInitials(displayPlayerName)} color="#5b5fc7" size={32} />
                      )}
                      <div>
                        {/* Sender name */}
                        <div style={{ fontSize: 11, color: "#888", marginBottom: 2, textAlign: isPlayer ? "right" : "left" }}>
                          {isPlayer ? displayPlayerName : actor?.name}
                          {typeBadge && <span style={{ marginLeft: 6, fontSize: 10, color: "#5b5fc7" }}>{typeBadge}</span>}
                        </div>
                        {/* Bubble */}
                        <div
                          style={{
                            background: isPlayer ? "#5b5fc7" : "#f3f2f1",
                            color: isPlayer ? "#fff" : "#333",
                            padding: "8px 14px", borderRadius: 12,
                            borderTopRightRadius: isPlayer ? 4 : 12,
                            borderTopLeftRadius: isPlayer ? 12 : 4,
                            fontSize: 13, lineHeight: 1.5, wordBreak: "break-word",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {isSending && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#ddd", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <TypingDots />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input bar */}
              <div style={{ padding: "10px 16px", borderTop: "1px solid #e8e8e8", display: "flex", gap: 8, flexShrink: 0, background: "#fafafa" }}>
                <input
                  ref={inputRef}
                  type="text"
                  value={playerInput}
                  onChange={(e) => setPlayerInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }}
                  placeholder="Votre message..."
                  style={{
                    flex: 1, padding: "10px 14px", border: "1px solid #ddd", borderRadius: 20,
                    fontSize: 13, fontFamily: "inherit", outline: "none", background: "#fff", color: "#111",
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!playerInput.trim()}
                  style={{
                    padding: "8px 20px", borderRadius: 20, border: "none",
                    background: playerInput.trim() ? "#5b5fc7" : "#ccc",
                    color: "#fff", cursor: playerInput.trim() ? "pointer" : "not-allowed",
                    fontWeight: 600, fontSize: 13,
                  }}
                >
                  Envoyer
                </button>
              </div>
            </>
          )}

          {/* ─── MAIL VIEW ─── */}
          {mainView === "mail" && (
            <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
              {/* Mail list sidebar */}
              <div style={{ width: 280, borderRight: "1px solid #e8e8e8", display: "flex", flexDirection: "column", overflowY: "auto", flexShrink: 0 }}>
                <div style={{ padding: "12px 14px", borderBottom: "1px solid #e8e8e8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>📧 Boîte de réception</h3>
                  {canComposeMail && (
                    <button
                      onClick={() => { setShowCompose(true); setSelectedMailId(null); }}
                      style={{
                        padding: "4px 12px", background: "#5b5fc7", color: "#fff",
                        border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 600,
                      }}
                    >
                      + Nouveau
                    </button>
                  )}
                </div>

                {inboxMails.length === 0 && !showCompose && (
                  <div style={{ padding: 20, textAlign: "center", color: "#999", fontSize: 13 }}>
                    {mailLockedForNow ? (
                      <div style={{ padding: "24px 16px" }}>
                        <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.5 }}>🔒</div>
                        <div style={{ fontWeight: 600, color: "#888", marginBottom: 8, fontSize: 14 }}>
                          Messagerie verrouillée
                        </div>
                        <div style={{ color: "#aaa", fontSize: 12, lineHeight: 1.5 }}>
                          La messagerie se déverrouillera dans la suite du scénario.
                          Concentrez-vous sur la conversation pour le moment.
                        </div>
                        <div style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "#f0f7ff", borderRadius: 8, fontSize: 11, color: "#5b8fbf" }}>
                          📧 Disponible prochainement
                        </div>
                      </div>
                    ) : (
                      "Aucun email reçu pour le moment"
                    )}
                  </div>
                )}

                {inboxMails.map((mail: any) => {
                  const sender = getActorInfo(mail.from);
                  const isActive = selectedMailId === mail.id && !showCompose;
                  return (
                    <div
                      key={mail.id}
                      onClick={() => { setSelectedMailId(mail.id); setShowCompose(false); }}
                      style={{
                        padding: "10px 14px", cursor: "pointer",
                        background: isActive ? "#f0f0ff" : "#fff",
                        borderBottom: "1px solid #f0f0f0",
                        borderLeft: isActive ? "3px solid #5b5fc7" : "3px solid transparent",
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#333", marginBottom: 2 }}>
                        {sender.name}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {mail.subject}
                      </div>
                      <div style={{ fontSize: 11, color: "#999", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {mail.body.slice(0, 60)}...
                      </div>
                    </div>
                  );
                })}

                {/* Sent mails */}
                {view.sentMails && view.sentMails.length > 0 && (
                  <>
                    <div style={{ padding: "10px 14px", borderBottom: "1px solid #e8e8e8", borderTop: "1px solid #e8e8e8", marginTop: 8 }}>
                      <h4 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Envoyés</h4>
                    </div>
                    {view.sentMails.map((mail: any) => (
                      <div key={mail.id} style={{ padding: "8px 14px", borderBottom: "1px solid #f0f0f0", opacity: 0.7 }}>
                        <div style={{ fontSize: 11, color: "#888" }}>→ {mail.to}</div>
                        <div style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>{mail.subject}</div>
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* Mail content / compose */}
              <div style={{ flex: 1, overflowY: "auto", padding: 0 }}>

                {/* Reading a mail */}
                {selectedMail && !showCompose && (
                  <div style={{ padding: 24 }}>
                    <h2 style={{ fontSize: 18, color: "#333", marginBottom: 16 }}>{selectedMail.subject}</h2>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #e8e8e8" }}>
                      <Avatar initials={getActorInfo(selectedMail.from).initials} color={getActorInfo(selectedMail.from).color} size={36} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{getActorInfo(selectedMail.from).name}</div>
                        <div style={{ fontSize: 11, color: "#888" }}>
                          À : {selectedMail.to || displayPlayerName}
                          {selectedMail.cc && <span> — Cc : {selectedMail.cc}</span>}
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.7, color: "#333", whiteSpace: "pre-wrap" }}>
                      {selectedMail.body}
                    </div>
                    {selectedMail.attachments && selectedMail.attachments.length > 0 && (
                      <div style={{ marginTop: 16, padding: 14, background: "#f8f9fa", borderRadius: 8, border: "1px solid #e8e8e8" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.3px" }}>
                          📎 Pièces jointes ({selectedMail.attachments.length})
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {selectedMail.attachments.map((a: any) => {
                            // Match attachment to scenario document
                            const doc = scenario?.resources?.documents?.find((d: any) => d.doc_id === a.id);
                            const hasFile = doc?.file_path;
                            const hasImage = doc?.image_path;
                            const isPDF = hasFile && doc.file_path!.endsWith(".pdf");
                            const isImage = !!hasImage;
                            const fileIcon = isPDF ? "📄" : isImage ? "🖼️" : "📁";
                            const fileType = isPDF ? "PDF" : isImage ? "Image" : "Document";

                            return (
                              <div
                                key={a.id}
                                style={{
                                  display: "flex", alignItems: "center", gap: 8,
                                  padding: "8px 12px", background: "#fff", borderRadius: 6,
                                  border: "1px solid #ddd", cursor: hasFile || hasImage ? "pointer" : "default",
                                  transition: "all .15s", minWidth: 180, maxWidth: 280,
                                }}
                                onMouseEnter={(e) => { if (hasFile || hasImage) e.currentTarget.style.borderColor = "#5b5fc7"; e.currentTarget.style.background = "#f0f0ff"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#ddd"; e.currentTarget.style.background = "#fff"; }}
                                onClick={() => {
                                  if (isPDF && hasFile) {
                                    window.open(`/api/download?file=${encodeURIComponent(doc.file_path!)}`, "_blank");
                                  } else if (isImage && hasImage) {
                                    // Switch to docs tab and select this document
                                    setMainView("docs");
                                  }
                                }}
                              >
                                <span style={{ fontSize: 22, flexShrink: 0 }}>{fileIcon}</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: "#333", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {a.label}
                                  </div>
                                  <div style={{ fontSize: 10, color: "#888" }}>{fileType}</div>
                                </div>
                                {(hasFile || hasImage) && (
                                  <span style={{ fontSize: 14, color: "#5b5fc7", flexShrink: 0 }} title="Ouvrir">⬇</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Reply All button if mail is enabled */}
                    {canComposeMail && (
                      <button
                        onClick={() => {
                          // Reply All: pre-fill To with sender, Cc from mail_config defaults + original Cc
                          const senderEmail = (() => {
                            const a = actors.find((x: any) => x.actor_id === selectedMail.from);
                            return (a as any)?.email || getActorInfo(selectedMail.from).name;
                          })();
                          // Gather Cc: original mail cc + phase mail_config defaults cc
                          const ccParts: string[] = [];
                          if (selectedMail.cc) ccParts.push(selectedMail.cc);
                          const currentPhase = scenario.phases[session.currentPhaseIndex];
                          const defaultCc = currentPhase?.mail_config?.defaults?.cc || "";
                          if (defaultCc && !ccParts.includes(defaultCc)) ccParts.push(defaultCc);
                          const reSubject = selectedMail.subject.startsWith("Re:") ? selectedMail.subject : `Re: ${selectedMail.subject}`;
                          updateDraft({ to: senderEmail, cc: ccParts.join(", "), subject: reSubject });
                          setShowCompose(true);
                        }}
                        style={{ marginTop: 20, padding: "8px 20px", background: "#5b5fc7", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 600, fontSize: 13 }}
                      >
                        Répondre à tous
                      </button>
                    )}
                  </div>
                )}

                {/* Compose form */}
                {showCompose && canComposeMail && (
                  <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#333" }}>
                      {view.sendMailLabel || "Nouveau message"}
                    </h3>

                    {/* To */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
                      <label style={{ width: 40, fontSize: 12, fontWeight: 600, color: "#666" }}>À :</label>
                      <input
                        type="text" value={currentMailDraft.to}
                        onChange={(e) => updateDraft({ to: e.target.value })}
                        placeholder="Saisissez ou choisissez un contact"
                        style={{ flex: 1, padding: "8px 10px", border: "1px solid #ddd", borderRadius: 4, fontSize: 13, fontFamily: "inherit" }}
                      />
                      <button
                        onClick={() => setShowContactPicker(showContactPicker === "to" ? null : "to")}
                        title="Répertoire de contacts"
                        style={{
                          background: showContactPicker === "to" ? "#5b5fc7" : "#f0f0f0",
                          color: showContactPicker === "to" ? "#fff" : "#555",
                          border: "1px solid #ddd", borderRadius: 4, padding: "6px 10px",
                          cursor: "pointer", fontSize: 16, lineHeight: 1, flexShrink: 0,
                        }}
                      >
                        📇
                      </button>
                      {showContactPicker === "to" && (
                        <div style={{
                          position: "absolute", top: "100%", right: 0, marginTop: 4, zIndex: 100,
                          background: "#fff", border: "1px solid #ddd", borderRadius: 8,
                          boxShadow: "0 4px 16px rgba(0,0,0,.12)", width: 300, maxHeight: 280, overflowY: "auto",
                        }}>
                          <div style={{ padding: "8px 12px", borderBottom: "1px solid #eee", fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>
                            Répertoire — Destinataire
                          </div>
                          {actors
                            .filter((a: any) => a.actor_id !== "player" && (a.visible_in_contacts || a.email))
                            .map((a: any) => {
                              const contactEmail = a.email || a.name;
                              const isAlreadyAdded = currentMailDraft.to.toLowerCase().includes(contactEmail.toLowerCase());
                              return (
                                <div
                                  key={a.actor_id}
                                  onClick={() => {
                                    if (isAlreadyAdded) {
                                      // Remove from To field
                                      const parts = currentMailDraft.to.split(",").map((s: string) => s.trim()).filter((s: string) => s.toLowerCase() !== contactEmail.toLowerCase());
                                      updateDraft({ to: parts.join(", ") });
                                    } else {
                                      const existing = currentMailDraft.to.trim();
                                      updateDraft({ to: existing ? `${existing}, ${contactEmail}` : contactEmail });
                                    }
                                  }}
                                  style={{
                                    padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                                    borderBottom: "1px solid #f5f5f5", transition: "background .1s",
                                    background: isAlreadyAdded ? "#f0f0ff" : "#fff",
                                  }}
                                  onMouseEnter={(e) => { if (!isAlreadyAdded) e.currentTarget.style.background = "#fafafa"; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = isAlreadyAdded ? "#f0f0ff" : "#fff"; }}
                                >
                                  <Avatar initials={a.avatar?.initials || getInitials(a.name)} color={a.avatar?.color || "#666"} size={28} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>{a.name}</div>
                                    <div style={{ fontSize: 11, color: "#888", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                      {a.role?.slice(0, 40)}{a.role?.length > 40 ? "..." : ""}
                                    </div>
                                    {a.email && <div style={{ fontSize: 10, color: "#5b5fc7" }}>{a.email}</div>}
                                  </div>
                                  {isAlreadyAdded && <span style={{ fontSize: 16, color: "#5b5fc7", flexShrink: 0 }}>✓</span>}
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                    {/* Cc */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
                      <label style={{ width: 40, fontSize: 12, fontWeight: 600, color: "#666" }}>Cc :</label>
                      <input
                        type="text" value={currentMailDraft.cc}
                        onChange={(e) => updateDraft({ cc: e.target.value })}
                        placeholder="Copie (optionnel)"
                        style={{ flex: 1, padding: "8px 10px", border: "1px solid #ddd", borderRadius: 4, fontSize: 13, fontFamily: "inherit" }}
                      />
                      <button
                        onClick={() => setShowContactPicker(showContactPicker === "cc" ? null : "cc")}
                        title="Répertoire de contacts"
                        style={{
                          background: showContactPicker === "cc" ? "#5b5fc7" : "#f0f0f0",
                          color: showContactPicker === "cc" ? "#fff" : "#555",
                          border: "1px solid #ddd", borderRadius: 4, padding: "6px 10px",
                          cursor: "pointer", fontSize: 16, lineHeight: 1, flexShrink: 0,
                        }}
                      >
                        📇
                      </button>
                      {showContactPicker === "cc" && (
                        <div style={{
                          position: "absolute", top: "100%", right: 0, marginTop: 4, zIndex: 100,
                          background: "#fff", border: "1px solid #ddd", borderRadius: 8,
                          boxShadow: "0 4px 16px rgba(0,0,0,.12)", width: 300, maxHeight: 280, overflowY: "auto",
                        }}>
                          <div style={{ padding: "8px 12px", borderBottom: "1px solid #eee", fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>
                            Répertoire — Copie (Cc)
                          </div>
                          {actors
                            .filter((a: any) => a.actor_id !== "player" && (a.visible_in_contacts || a.email))
                            .map((a: any) => {
                              const contactEmail = a.email || a.name;
                              const isAlreadyAdded = currentMailDraft.cc.toLowerCase().includes(contactEmail.toLowerCase());
                              return (
                                <div
                                  key={a.actor_id}
                                  onClick={() => {
                                    if (isAlreadyAdded) {
                                      const parts = currentMailDraft.cc.split(",").map((s: string) => s.trim()).filter((s: string) => s.toLowerCase() !== contactEmail.toLowerCase());
                                      updateDraft({ cc: parts.join(", ") });
                                    } else {
                                      const existing = currentMailDraft.cc.trim();
                                      updateDraft({ cc: existing ? `${existing}, ${contactEmail}` : contactEmail });
                                    }
                                  }}
                                  style={{
                                    padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                                    borderBottom: "1px solid #f5f5f5", transition: "background .1s",
                                    background: isAlreadyAdded ? "#f0f0ff" : "#fff",
                                  }}
                                  onMouseEnter={(e) => { if (!isAlreadyAdded) e.currentTarget.style.background = "#fafafa"; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = isAlreadyAdded ? "#f0f0ff" : "#fff"; }}
                                >
                                  <Avatar initials={a.avatar?.initials || getInitials(a.name)} color={a.avatar?.color || "#666"} size={28} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>{a.name}</div>
                                    <div style={{ fontSize: 11, color: "#888", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                      {a.role?.slice(0, 40)}{a.role?.length > 40 ? "..." : ""}
                                    </div>
                                    {a.email && <div style={{ fontSize: 10, color: "#5b5fc7" }}>{a.email}</div>}
                                  </div>
                                  {isAlreadyAdded && <span style={{ fontSize: 16, color: "#5b5fc7", flexShrink: 0 }}>✓</span>}
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                    {/* Subject */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <label style={{ width: 40, fontSize: 12, fontWeight: 600, color: "#666" }}>Objet :</label>
                      <input
                        type="text" value={currentMailDraft.subject}
                        onChange={(e) => updateDraft({ subject: e.target.value })}
                        style={{ flex: 1, padding: "8px 10px", border: "1px solid #ddd", borderRadius: 4, fontSize: 13, fontFamily: "inherit" }}
                      />
                    </div>
                    {/* Body */}
                    <textarea
                      value={currentMailDraft.body}
                      onChange={(e) => updateDraft({ body: e.target.value })}
                      placeholder="Rédigez votre message ici..."
                      style={{ flex: 1, padding: 12, border: "1px solid #ddd", borderRadius: 4, fontSize: 13, fontFamily: "inherit", resize: "none", minHeight: 180 }}
                    />

                    {/* Attachments */}
                    {attachableDocs.length > 0 && (
                      <div style={{ padding: 10, background: "#fafafa", borderRadius: 6, border: "1px solid #eee" }}>
                        <strong style={{ fontSize: 12, color: "#555" }}>📎 Pièces jointes :</strong>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                          {attachableDocs.map((doc: any) => {
                            const isAttached = currentMailDraft.attachments.some((a: any) => a.id === doc.doc_id);
                            return (
                              <label
                                key={doc.doc_id}
                                style={{
                                  display: "flex", alignItems: "center", gap: 6,
                                  padding: "4px 10px", borderRadius: 16, cursor: "pointer",
                                  background: isAttached ? "#e8e5ff" : "#f0f0f0",
                                  border: isAttached ? "1px solid #5b5fc7" : "1px solid #ddd",
                                  fontSize: 12, color: isAttached ? "#5b5fc7" : "#555",
                                  fontWeight: isAttached ? 600 : 400,
                                  transition: "all .15s",
                                }}
                              >
                                <input
                                  type="checkbox" checked={isAttached}
                                  onChange={() => handleToggleAttachment(doc.doc_id, doc.label)}
                                  style={{ display: "none" }}
                                />
                                {isAttached ? "✓" : "+"} {doc.label}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Send */}
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button
                        onClick={() => setShowCompose(false)}
                        style={{ padding: "8px 16px", background: "#f0f0f0", color: "#666", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 }}
                      >
                        Annuler
                      </button>
                      <button
                        onClick={handleSendMail}
                        disabled={!canActuallySendMail}
                        title={mailSendBlockReason || undefined}
                        style={{
                          padding: "8px 24px", borderRadius: 4, border: "none",
                          background: canActuallySendMail ? "#5b5fc7" : "#ccc",
                          color: "#fff", cursor: canActuallySendMail ? "pointer" : "not-allowed",
                          fontWeight: 600, fontSize: 13,
                        }}
                      >
                        {view.sendMailLabel || "Envoyer"}
                      </button>
                      {!canActuallySendMail && mailSendBlockReason && (
                        <div style={{ fontSize: 11, color: "#e74c3c", marginTop: 4, textAlign: "right" }}>
                          {mailSendBlockReason}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {!selectedMail && !showCompose && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#999", fontSize: 14 }}>
                    {inboxMails.length > 0
                      ? "Sélectionnez un email pour le lire"
                      : canComposeMail
                        ? "Cliquez sur « + Nouveau » pour rédiger un email"
                        : "Aucun email pour le moment"
                    }
                  </div>
                )}
              </div>
            </div>
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
              <div>
                {selectedDoc ? (
                  /* Document detail view */
                  <div>
                    <button
                      onClick={() => setSelectedDocId(null)}
                      style={{ background: "none", border: "none", color: "#5b5fc7", cursor: "pointer", fontSize: 12, fontWeight: 600, marginBottom: 12, padding: 0 }}
                    >
                      ← Retour à la liste
                    </button>
                    <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "#333" }}>
                      📄 {selectedDoc.label}
                    </h3>
                    {/* PDF: direct download only — no iframe, no abstract */}
                    {(selectedDoc as any).file_path && (selectedDoc as any).file_path.endsWith(".pdf") ? (
                      <a
                        href={`/api/download?file=${encodeURIComponent((selectedDoc as any).file_path)}`}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 8,
                          padding: "12px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600,
                          background: "#5b5fc7", color: "#fff", textDecoration: "none",
                        }}
                      >
                        ⬇ Télécharger le PDF
                      </a>
                    ) : (
                      <>
                        {/* Image display */}
                        {(selectedDoc as any).image_path && (
                          <div style={{ marginBottom: 12, textAlign: "center" }}>
                            <img
                              src={(selectedDoc as any).image_path}
                              alt={(selectedDoc as any).label}
                              style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid #e8e8e8", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}
                            />
                          </div>
                        )}
                        {/* Text content */}
                        {(selectedDoc as any).content ? (
                          <div style={{ fontSize: 12, lineHeight: 1.6, color: "#333", whiteSpace: "pre-wrap", background: "#fff", padding: 12, borderRadius: 6, border: "1px solid #e8e8e8" }}>
                            {(selectedDoc as any).content}
                          </div>
                        ) : !(selectedDoc as any).image_path ? (
                          <div style={{ fontSize: 12, color: "#999", fontStyle: "italic" }}>
                            Ce document est disponible dans votre dossier de travail.
                          </div>
                        ) : null}
                      </>
                    )}
                    {((selectedDoc as any).usable_as_pj || (selectedDoc as any).usable_as_attachment) && (
                      <div style={{ marginTop: 10, fontSize: 11, color: "#44b553", fontWeight: 600 }}>
                        ✓ Joignable en pièce jointe
                      </div>
                    )}
                  </div>
                ) : (
                  /* Document list */
                  <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                    {allDocuments.map((doc: any) => {
                      const hasPJ = doc.usable_as_pj || doc.usable_as_attachment;
                      const hasContent = !!(doc as any).content;
                      const hasImage = !!(doc as any).image_path;
                      const hasPDF = !!(doc as any).file_path && (doc as any).file_path.endsWith(".pdf");
                      const icon = hasImage ? "🖼️" : hasPDF ? "📑" : hasContent ? "📄" : "📋";
                      return hasPDF ? (
                        <li key={doc.doc_id} style={{ padding: "10px", marginBottom: 4, borderRadius: 6, background: "#fff", border: "1px solid #e8e8e8" }}>
                          <a
                            href={`/api/download?file=${encodeURIComponent((doc as any).file_path)}`}
                            style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 8, color: "#333" }}
                          >
                            <span style={{ fontSize: 22 }}>📑</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 500 }}>{doc.label}</div>
                              <span style={{ fontSize: 10, color: "#5b5fc7", fontWeight: 600 }}>⬇ Cliquez pour télécharger</span>
                            </div>
                          </a>
                        </li>
                      ) : (
                        <li
                          key={doc.doc_id}
                          onClick={() => setSelectedDocId(doc.doc_id)}
                          style={{
                            padding: "10px", marginBottom: 4, borderRadius: 6,
                            cursor: "pointer", background: "#fff",
                            border: "1px solid #e8e8e8",
                            transition: "all .1s",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#5b5fc7")}
                          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e8e8e8")}
                        >
                          <div style={{ fontSize: 13, fontWeight: 500, color: "#333", display: "flex", alignItems: "center", gap: 6 }}>
                            <span>{icon}</span>
                            {doc.label}
                          </div>
                          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                            {hasPJ && (
                              <span style={{ fontSize: 10, color: "#5b5fc7", background: "#f0f0ff", padding: "1px 6px", borderRadius: 8 }}>
                                PJ
                              </span>
                            )}
                            {(hasContent || hasImage) && (
                              <span style={{ fontSize: 10, color: "#44b553", background: "#f0fff4", padding: "1px 6px", borderRadius: 8 }}>
                                Consultable
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
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
                <div style={{ marginTop: 4, color: "#555", fontSize: 10 }}>?debug=1 | Ctrl+D toggle</div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
