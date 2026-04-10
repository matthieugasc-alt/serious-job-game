"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import scenario from "../scenarios/scenario-atterrissage.json";
import {
  initializeSession,
  buildRuntimeView,
  addPlayerMessage,
  addAIMessage,
  getCurrentPhaseCriteria,
  applyEvaluation,
  updateAdaptiveMode,
  scheduleInterruption,
  flushDueTimedEvents,
  injectPhaseEntryEvents,
  completeCurrentPhaseAndAdvance,
  updateMailDraft,
  toggleMailAttachment,
  sendCurrentPhaseMail,
} from "./lib/runtime";

const scenarioData = scenario as any;
type TabKey = "chat" | "mail";

const PHASE3_DELAYED_INTERRUPT_ID = "phase3_delayed_romain_interrupt";
const SIM_START_HOUR = 9;
const SIM_START_MINUTE = 15;
const SIM_SPEED_MULTIPLIER = 3;
const PHASE4_TIME_JUMP_MINUTES = 15;

function cloneSession(prevSession: any) {
  return {
    ...prevSession,
    chatMessages: [...prevSession.chatMessages],
    inboxMails: [...prevSession.inboxMails],
    sentMails: [...prevSession.sentMails],
    actionLog: [...prevSession.actionLog],
    scores: { ...prevSession.scores },
    flags: { ...prevSession.flags },
    completedPhases: [...prevSession.completedPhases],
    unlockedPhases: [...prevSession.unlockedPhases],
    triggeredInterruptions: [...prevSession.triggeredInterruptions],
    injectedPhaseEntryEvents: [...prevSession.injectedPhaseEntryEvents],
    pendingTimedEvents: prevSession.pendingTimedEvents.map((e: any) => ({ ...e })),
    mailDrafts: JSON.parse(JSON.stringify(prevSession.mailDrafts || {})),
  };
}

function saveDebriefToStorage(payload: any) {
  if (typeof window === "undefined") return;

  const historyKey = "serious_job_game_debriefs";
  const latestKey = "serious_job_game_latest_debrief";

  let history: any[] = [];
  try {
    const raw = window.localStorage.getItem(historyKey);
    history = raw ? JSON.parse(raw) : [];
  } catch {
    history = [];
  }

  const entry = {
    id: `debrief_${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...payload,
  };

  const updated = [entry, ...history].slice(0, 20);

  window.localStorage.setItem(historyKey, JSON.stringify(updated));
  window.localStorage.setItem(latestKey, JSON.stringify(entry));
}

function playNotificationSound() {
  if (typeof window === "undefined") return;

  try {
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;

    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);

    gainNode.gain.setValueAtTime(0.0001, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.18);

    oscillator.onended = () => {
      ctx.close().catch(() => {});
    };
  } catch {
    // silence volontaire
  }
}

function formatSimulatedTime(date: Date | null) {
  if (!date) return "--:--";
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initials(name: string) {
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "J";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function avatarStyle(background: string, size = 38) {
  return {
    width: size,
    height: size,
    minWidth: size,
    borderRadius: 999,
    background,
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700 as const,
    fontSize: size >= 38 ? 14 : 12,
    boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
  };
}

function statusDot(color: string) {
  return {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: color,
    display: "inline-block",
  };
}

function TypingDots() {
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "center", height: 18 }}>
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: "#5b5fc7",
          display: "inline-block",
          opacity: 0.55,
        }}
      />
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: "#5b5fc7",
          display: "inline-block",
          opacity: 0.8,
        }}
      />
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: "#5b5fc7",
          display: "inline-block",
          opacity: 1,
        }}
      />
    </div>
  );
}

const CONTACTS = [
  {
    id: "romain",
    name: "Romain Dufresne",
    role: "Collaborateur",
    preview: "Je t’ai transféré le message de Claudia.",
    color: "#5b5fc7",
    status: "available",
    clickable: true,
  },
  {
    id: "superieure",
    name: "Nathalie Musik",
    role: "Responsable hiérarchique",
    preview: "Je suis en réunion jusqu’à 11h00.",
    color: "#0f766e",
    status: "busy",
    clickable: false,
  },
  {
    id: "support",
    name: "Pôle International",
    role: "Équipe support",
    preview: "Aucun nouvel échange.",
    color: "#a16207",
    status: "offline",
    clickable: false,
  },
];

export default function Home() {
  const router = useRouter();

  const [session, setSession] = useState<any | null>(null);
  const [input, setInput] = useState("");
  const [playerName, setPlayerName] = useState("Joueur");
  const [activeTab, setActiveTab] = useState<TabKey>("chat");
  const [loading, setLoading] = useState(false);
  const [debriefLoading, setDebriefLoading] = useState(false);
  const [lastSeenInboxCount, setLastSeenInboxCount] = useState(0);
  const [lastSeenChatCount, setLastSeenChatCount] = useState(0);
  const [simulatedTime, setSimulatedTime] = useState<Date | null>(null);

  const previousChatCountRef = useRef(0);
  const previousInboxCountRef = useRef(0);
  const conversationBoxRef = useRef<HTMLDivElement | null>(null);
  const phase4JumpDoneRef = useRef(false);

  useEffect(() => {
    const stored = localStorage.getItem("playerName");

    if (!stored) {
      router.push("/introduction");
      return;
    }

    setPlayerName(stored);
  }, [router]);

  useEffect(() => {
    const s = initializeSession(scenarioData);
    injectPhaseEntryEvents(s);
    setSession(s);

    const start = new Date();
    start.setHours(SIM_START_HOUR, SIM_START_MINUTE, 0, 0);
    setSimulatedTime(start);
  }, []);

  useEffect(() => {
    if (!simulatedTime) return;

    const interval = setInterval(() => {
      setSimulatedTime((prev) => {
        if (!prev) return prev;
        return new Date(prev.getTime() + 1000 * SIM_SPEED_MULTIPLIER);
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [simulatedTime]);

  const view = useMemo(() => {
    return session ? buildRuntimeView(session) : null;
  }, [session]);

  const displayPlayerName = useMemo(() => {
    const trimmed = playerName.trim();
    return trimmed.length > 0 ? trimmed : "Joueur";
  }, [playerName]);

  const chatMessages = useMemo(() => {
    return view?.conversation || [];
  }, [view]);

  const inboxMails = useMemo(() => {
    return view?.inboxMails || [];
  }, [view]);

  const currentMailKind = useMemo(() => {
    if (!view) return null;
    if (view.phaseId === "phase_3_execution") return "consulate_initial";
    if (view.phaseId === "phase_4_rebound") return "consulate_reply";
    return null;
  }, [view]);

  const mailDraft = useMemo(() => {
    return (
      view?.currentMailDraft || {
        to: "",
        cc: "",
        subject: "",
        body: "",
        attachments: [],
      }
    );
  }, [view]);

  const selectedAttachmentIds = useMemo(() => {
    return new Set((mailDraft.attachments || []).map((a: any) => a.id));
  }, [mailDraft.attachments]);

  const canSendMailNow = useMemo(() => {
  if (!view) return false;

  // 🔥 Déblocage volontaire phase 3
  if (view.phaseId === "phase_3_execution") {
    return true;
  }

  return !!view.canSendMail;
}, [view]);

  const sendMailLabel = useMemo(() => {
    if (!view) return "Envoyer";
    return view.sendMailLabel || "Envoyer";
  }, [view]);

  const mailFormIsComplete = useMemo(() => {
    return (
      mailDraft.to.trim().length > 0 &&
      mailDraft.subject.trim().length > 0 &&
      mailDraft.body.trim().length > 0
    );
  }, [mailDraft]);

  const hasAttachments = useMemo(() => {
    return (mailDraft.attachments || []).length > 0;
  }, [mailDraft.attachments]);

  const canActuallySendMail = useMemo(() => {
  if (!view) return false;

  // Phase 3 → uniquement besoin du contenu
  if (view.phaseId === "phase_3_execution") {
    return mailFormIsComplete;
  }

  // Phase 4 → pièces obligatoires
  if (view.phaseId === "phase_4_rebound") {
    return mailFormIsComplete && hasAttachments;
  }

  return false;
}, [view, mailFormIsComplete, hasAttachments]);

  const unreadInboxCount = useMemo(() => {
    return Math.max(0, inboxMails.length - lastSeenInboxCount);
  }, [inboxMails.length, lastSeenInboxCount]);
  const unreadChatCount = useMemo(() => {
  return Math.max(0, chatMessages.length - lastSeenChatCount);
}, [chatMessages.length, lastSeenChatCount]);

   useEffect(() => {
  if (activeTab === "mail") {
    setLastSeenInboxCount(inboxMails.length);
  }

  if (activeTab === "chat") {
    setLastSeenChatCount(chatMessages.length);
  }
}, [activeTab, inboxMails.length, chatMessages.length]);

  useEffect(() => {
    if (!view) return;

    const currentChatCount = chatMessages.length;
    const currentInboxCount = inboxMails.length;

    const hadPreviousValues =
      previousChatCountRef.current !== 0 || previousInboxCountRef.current !== 0;

    const hasNewChatMessage = currentChatCount > previousChatCountRef.current;
    const hasNewInboxMail = currentInboxCount > previousInboxCountRef.current;

    if (hadPreviousValues && (hasNewChatMessage || hasNewInboxMail)) {
      playNotificationSound();
    }

    previousChatCountRef.current = currentChatCount;
    previousInboxCountRef.current = currentInboxCount;
  }, [view, chatMessages.length, inboxMails.length]);

  useEffect(() => {
    if (!session?.pendingTimedEvents?.length) return;

    const nextDueAt = Math.min(
      ...session.pendingTimedEvents.map((e: any) => e.dueAt)
    );
    const delay = Math.max(nextDueAt - Date.now(), 0);

    const timer = setTimeout(() => {
      setSession((prevSession: any) => {
        if (!prevSession) return prevSession;
        const newSession = cloneSession(prevSession);
        flushDueTimedEvents(newSession);
        return newSession;
      });
    }, delay);

    return () => clearTimeout(timer);
  }, [session?.pendingTimedEvents]);

  useEffect(() => {
    if (!view) return;
    if (view.isFinished) return;
    if (!view.canAdvance) return;
    if (view.phaseId === "phase_3_execution") return;
    if (view.phaseId === "phase_4_rebound") return;

    const timer = setTimeout(() => {
      setSession((prevSession: any) => {
        if (!prevSession) return prevSession;

        const prevView = buildRuntimeView(prevSession);

        if (prevView.isFinished) return prevSession;
        if (!prevView.canAdvance) return prevSession;
        if (prevView.phaseId === "phase_3_execution") return prevSession;
        if (prevView.phaseId === "phase_4_rebound") return prevSession;

        const newSession = cloneSession(prevSession);
        completeCurrentPhaseAndAdvance(newSession);
        return newSession;
      });
    }, 1200);

    return () => clearTimeout(timer);
  }, [view]);

  useEffect(() => {
    const box = conversationBoxRef.current;
    if (!box) return;
    box.scrollTop = box.scrollHeight;
  }, [chatMessages.length, loading]);

  useEffect(() => {
    if (!session || session.isFinished) return;

    const phaseId =
      session.scenario.phases[session.currentPhaseIndex]?.phase_id ||
      session.scenario.phases[session.currentPhaseIndex]?.id;

    const existing = session.mailDrafts?.[phaseId];
    if (existing) return;

    if (phaseId !== "phase_3_execution" && phaseId !== "phase_4_rebound") {
      return;
    }

    setSession((prevSession: any) => {
      if (!prevSession) return prevSession;

      const currentPhaseId =
        prevSession.scenario.phases[prevSession.currentPhaseIndex]?.phase_id ||
        prevSession.scenario.phases[prevSession.currentPhaseIndex]?.id;

      const alreadyExists = prevSession.mailDrafts?.[currentPhaseId];
      if (alreadyExists) return prevSession;

      const newSession = cloneSession(prevSession);

      if (currentPhaseId === "phase_3_execution") {
        updateMailDraft(newSession, currentPhaseId, {
          to: "consulat-madrid@exemple.fr",
          cc: "paf-bordeaux@exemple.fr",
          subject:
            "Demande urgente relative à l’arrivée de la délégation péruvienne",
          body: "",
          attachments: [],
        });
      }

      if (currentPhaseId === "phase_4_rebound") {
        updateMailDraft(newSession, currentPhaseId, {
          to: "consulat-madrid@exemple.fr",
          cc: "paf-bordeaux@exemple.fr",
          subject:
            "Transmission des pièces complémentaires – dossier Jorge Huamán Quispe",
          body: "",
          attachments: [],
        });
      }

      return newSession;
    });
  }, [session?.currentPhaseIndex, session?.isFinished]);

  useEffect(() => {
    if (!session || !view) return;
    if (view.phaseId !== "phase_3_execution") return;

    const alreadyTriggered =
      session.triggeredInterruptions?.includes(PHASE3_DELAYED_INTERRUPT_ID) ||
      false;

    const alreadyScheduled =
      session.pendingTimedEvents?.some(
        (e: any) => e.id === PHASE3_DELAYED_INTERRUPT_ID
      ) || false;

    if (alreadyTriggered || alreadyScheduled) return;

    setSession((prevSession: any) => {
      if (!prevSession) return prevSession;

      const currentView = buildRuntimeView(prevSession);
      if (currentView.phaseId !== "phase_3_execution") return prevSession;

      const exists =
        prevSession.triggeredInterruptions?.includes(
          PHASE3_DELAYED_INTERRUPT_ID
        ) ||
        prevSession.pendingTimedEvents?.some(
          (e: any) => e.id === PHASE3_DELAYED_INTERRUPT_ID
        );

      if (exists) return prevSession;

      const newSession = cloneSession(prevSession);

      newSession.pendingTimedEvents.push({
        id: PHASE3_DELAYED_INTERRUPT_ID,
        actor: "Romain",
        content:
          "Bon, tu en es où ? J'ai trouvé le numéro de la PAF Mérignac et je pars pour l'aéroport. Tu veux que je les appelle maintenant, ou j'attends ton feu vert ?",
        dueAt: Date.now() + 150000,
        phaseId: "phase_3_execution",
        type: "chat",
      });

      return newSession;
    });
  }, [session, view]);

  useEffect(() => {
    if (!view || !simulatedTime) return;

    if (view.phaseId !== "phase_4_rebound") {
      phase4JumpDoneRef.current = false;
      return;
    }

    if (phase4JumpDoneRef.current) return;

    setSimulatedTime((prev) => {
      if (!prev) return prev;
      return new Date(prev.getTime() + PHASE4_TIME_JUMP_MINUTES * 60000);
    });

    phase4JumpDoneRef.current = true;
  }, [view?.phaseId, simulatedTime]);

  async function sendMessage() {
    if (!session || !view) return;
    if (!input.trim() || loading || view.isFinished) return;

    const playerMessage = input;
    const newSession = cloneSession(session);

    addPlayerMessage(newSession, playerMessage);
    setInput("");
    setSession(newSession);
    setLoading(true);

    try {
      const criteria = getCurrentPhaseCriteria(newSession);
      const recentConversation = newSession.chatMessages.slice(-6);

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          playerName: displayPlayerName,
          message: playerMessage,
          phaseTitle: view.phaseTitle,
          phaseObjective: view.phaseObjective,
          phasePrompt: view.phasePrompt,
          criteria,
          mode: newSession.adaptiveMode,
          narrative: view.narrative,
          initialEvents: view.initialEvents,
          recentConversation,
        }),
      });

      const text = await res.text();
      let data: any = {};

      try {
        data = JSON.parse(text);
      } catch {
        data = { error: "Réponse serveur invalide." };
      }

      if (!res.ok) {
        addAIMessage(
          newSession,
          data.error || "Erreur côté serveur IA",
          "Système"
        );
        setSession({ ...newSession });
        return;
      }

      addAIMessage(newSession, data.reply || "Pas de réponse.", "Romain");
      const romainMessage = data.reply || "";

// 🔥 Détection simple du mode "tu as les éléments"
const shouldAutoAdvance =
  view.phaseId === "phase_1_comprehension" &&
  (
    romainMessage.toLowerCase().includes("tu as les éléments") ||
    romainMessage.toLowerCase().includes("tu as toutes les infos") ||
    romainMessage.toLowerCase().includes("comment tu veux gérer")
  );

if (shouldAutoAdvance) {
  completeCurrentPhaseAndAdvance(newSession);
}

      applyEvaluation(
        newSession,
        data.matched_criteria || [],
        data.score_delta || 0,
        data.flags_to_set || {}
      );

      updateAdaptiveMode(newSession);

      if (view.phaseId !== "phase_3_execution") {
        scheduleInterruption(newSession);
      }

      setSession({ ...newSession });
    } catch (e) {
      console.error(e);
      addAIMessage(
        newSession,
        "Erreur réseau : impossible d’obtenir une réponse.",
        "Système"
      );
      setSession({ ...newSession });
    } finally {
      setLoading(false);
    }
  }

  function handleMailFieldChange(
    field: "to" | "cc" | "subject" | "body",
    value: string
  ) {
    setSession((prevSession: any) => {
      if (!prevSession) return prevSession;

      const phaseId =
        prevSession.scenario.phases[prevSession.currentPhaseIndex]?.phase_id ||
        prevSession.scenario.phases[prevSession.currentPhaseIndex]?.id;

      const newSession = cloneSession(prevSession);
      updateMailDraft(newSession, phaseId, { [field]: value });
      return newSession;
    });
  }

  function handleToggleAttachment(doc: any) {
    setSession((prevSession: any) => {
      if (!prevSession) return prevSession;

      const phaseId =
        prevSession.scenario.phases[prevSession.currentPhaseIndex]?.phase_id ||
        prevSession.scenario.phases[prevSession.currentPhaseIndex]?.id;

      const newSession = cloneSession(prevSession);

      toggleMailAttachment(newSession, phaseId, {
        id: doc.doc_id || doc.id || doc.label,
        label: doc.label || doc.doc_id || "Document",
      });

      return newSession;
    });
  }

  function handleSendMail() {
    if (!session || !view || !currentMailKind) return;
    if (!canActuallySendMail) return;

    setSession((prevSession: any) => {
      if (!prevSession) return prevSession;

      const newSession = cloneSession(prevSession);
      sendCurrentPhaseMail(newSession, currentMailKind);
      completeCurrentPhaseAndAdvance(newSession);
      return newSession;
    });

    setActiveTab("chat");
  }

  function handleRestartScenario() {
    localStorage.removeItem("playerName");
    router.push("/introduction");
  }

  async function generateDebriefAndOpenPage() {
    if (!session || !view || debriefLoading) return;

    setDebriefLoading(true);

    try {
      const competencies =
        scenarioData?.meta?.competencies ||
        scenarioData?.competencies ||
        [];

      const res = await fetch("/api/debrief", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          playerName: displayPlayerName,
          actionLog: session.actionLog,
          sentMails: session.sentMails,
          flags: session.flags,
          scores: session.scores,
          totalScore: session.totalScore,
          competencies,
        }),
      });

      const text = await res.text();
      let data: any = {};

      try {
        data = JSON.parse(text);
      } catch {
        data = {
          summary: "Le débrief n’a pas pu être lu correctement.",
          strengths: [],
          weaknesses: [],
          competency_analysis: [],
        };
      }

      const payload = {
        playerName: displayPlayerName,
        ending: view.ending,
        summary: data?.summary || "Débrief indisponible.",
        strengths: Array.isArray(data?.strengths) ? data.strengths : [],
        weaknesses: Array.isArray(data?.weaknesses) ? data.weaknesses : [],
        competency_analysis: Array.isArray(data?.competency_analysis)
          ? data.competency_analysis
          : [],
        sentMails: session.sentMails,
        inboxMails: session.inboxMails,
        actionLog: session.actionLog,
        flags: session.flags,
        scores: session.scores,
        totalScore: session.totalScore,
      };

      saveDebriefToStorage(payload);
      router.push("/debrief");
    } catch (e) {
      console.error(e);

      const payload = {
        playerName: displayPlayerName,
        ending: view.ending,
        summary: "Erreur lors de la génération du débrief.",
        strengths: [],
        weaknesses: [],
        competency_analysis: [],
        sentMails: session.sentMails,
        inboxMails: session.inboxMails,
        actionLog: session.actionLog,
        flags: session.flags,
        scores: session.scores,
        totalScore: session.totalScore,
      };

      saveDebriefToStorage(payload);
      router.push("/debrief");
    } finally {
      setDebriefLoading(false);
    }
  }

  if (!session || !view) {
    return (
      <main
        style={{
          padding: 20,
          maxWidth: 1280,
          margin: "0 auto",
          fontFamily: "Arial, sans-serif",
          color: "#111",
        }}
      >
        <p>Chargement...</p>
      </main>
    );
  }

  return (
    <main
      style={{
        padding: 20,
        maxWidth: 1280,
        margin: "0 auto",
        fontFamily: "Arial, sans-serif",
        color: "#111",
      }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          marginBottom: 16,
          padding: "12px 16px",
          border: "1px solid #d8dbe3",
          borderRadius: 14,
          background:
            "linear-gradient(90deg, rgba(255,248,230,0.98) 0%, rgba(255,243,214,0.98) 100%)",
          boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
          backdropFilter: "blur(8px)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>⏱️</span>
          <div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 2 }}>
              Heure du scénario
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 0.4 }}>
              {formatSimulatedTime(simulatedTime)}
            </div>
          </div>
        </div>

        <button
          onClick={handleRestartScenario}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #cfd5df",
            background: "#fff",
            cursor: "pointer",
            whiteSpace: "nowrap",
            fontWeight: 600,
          }}
        >
          Recommencer le scénario
        </button>
      </div>

      <div style={{ marginBottom: 18 }}>
        <h1 style={{ marginBottom: 6 }}>{view.title}</h1>
        {view.subtitle ? (
          <p style={{ marginTop: 0, color: "#555" }}>{view.subtitle}</p>
        ) : null}
      </div>

      {!view.isFinished ? (
        <>
          <section
            style={{
              border: "1px solid #ddd",
              borderRadius: 16,
              padding: 24,
              marginBottom: 18,
              background: "#fff",
              boxShadow: "0 6px 18px rgba(0,0,0,0.04)",
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 18 }}>Contexte</h2>

            {view.narrative.context ? (
              <p style={{ marginBottom: 18, lineHeight: 1.8, fontSize: 17 }}>
                {view.narrative.context}
              </p>
            ) : null}

            {view.narrative.mission ? (
              <p style={{ marginBottom: 18, lineHeight: 1.8, fontSize: 17 }}>
                {view.narrative.mission}
              </p>
            ) : null}

            {view.narrative.initial_situation ? (
              <p style={{ marginBottom: 18, lineHeight: 1.8, fontSize: 17 }}>
                {view.narrative.initial_situation}
              </p>
            ) : null}

            {view.narrative.trigger ? (
              <p style={{ marginBottom: 18, lineHeight: 1.8, fontSize: 17 }}>
                {view.narrative.trigger}
              </p>
            ) : null}

            {view.narrative.background_fact ? (
              <p style={{ marginBottom: 0, lineHeight: 1.8, fontSize: 17 }}>
                {view.narrative.background_fact}
              </p>
            ) : null}
          </section>

          <section
            style={{
              border: "1px solid #ddd",
              borderRadius: 16,
              padding: 18,
              marginBottom: 18,
              background: "#fff",
              boxShadow: "0 6px 18px rgba(0,0,0,0.04)",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Documents disponibles</h3>

            {view.documents?.length ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 12,
                }}
              >
                {view.documents.map((doc: any, i: number) => (
                  <div
                    key={doc.doc_id || i}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 12,
                      padding: 14,
                      background: "#f8fafc",
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-start",
                    }}
                  >
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        minWidth: 42,
                        borderRadius: 10,
                        background: "#dbeafe",
                        color: "#1d4ed8",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                        fontSize: 14,
                      }}
                    >
                      DOC
                    </div>

                    <div>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>
                        {doc.label || doc.doc_id || `Document ${i + 1}`}
                      </div>
                      <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
                        Ressource disponible pour analyser la situation ou compléter un dossier.
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "#666", margin: 0 }}>
                Aucun document disponible.
              </p>
            )}
          </section>
        </>
      ) : null}

      <section
        style={{
          border: "1px solid #d9dde6",
          borderRadius: 18,
          background: "#fff",
          boxShadow: "0 10px 24px rgba(0,0,0,0.06)",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr" }}>
          <aside
            style={{
              borderRight: "1px solid #e8ebf2",
              background: "#f8f9fc",
              minHeight: 760,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "18px 16px 14px",
                borderBottom: "1px solid #e8ebf2",
                fontWeight: 800,
                fontSize: 16,
              }}
            >
              Contacts
            </div>

            <div style={{ padding: 10, display: "grid", gap: 8 }}>
              {CONTACTS.map((contact) => {
  const isRomain = contact.id === "romain";
  const isSelected = activeTab === "chat" && isRomain;
  const showUnreadChatBadge =
    isRomain && unreadChatCount > 0 && activeTab !== "chat";

                return (
                  <div
                    key={contact.id}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid #e2e8f0",
                      background: isSelected ? "#eef2ff" : "#fff",
                      boxShadow: isSelected
                        ? "0 4px 12px rgba(91,95,199,0.12)"
                        : "none",
                      cursor: isRomain ? "pointer" : "default",
                    }}
                    onClick={() => {
                      if (isRomain) setActiveTab("chat");
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                      }}
                    >
                      <div style={avatarStyle(contact.color, 40)}>
                        {contact.name.slice(0, 1).toUpperCase()}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
  style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  }}
>
  <div
    style={{
      fontWeight: 700,
      fontSize: 14,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    }}
  >
    {contact.name}
  </div>

  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    {showUnreadChatBadge ? (
      <span
        style={{
          minWidth: 18,
          height: 18,
          padding: "0 5px",
          borderRadius: 999,
          background: "#d11a2a",
          color: "#fff",
          fontSize: 12,
          lineHeight: "18px",
          textAlign: "center",
          fontWeight: 700,
        }}
      >
        {unreadChatCount}
      </span>
    ) : null}

    <span
      style={
        contact.status === "available"
          ? statusDot("#16a34a")
          : contact.status === "busy"
          ? statusDot("#f59e0b")
          : statusDot("#94a3b8")
      }
    />
  </div>
</div>

                        <div
                          style={{
                            fontSize: 12,
                            color: "#64748b",
                            marginBottom: 6,
                          }}
                        >
                          {contact.role}
                        </div>

                        <div
                          style={{
                            fontSize: 13,
                            color: "#475569",
                            lineHeight: 1.45,
                            overflow: "hidden",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                          }}
                        >
                          {contact.preview}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>

          <div style={{ minWidth: 0 }}>
            <div
              style={{
                padding: "16px 18px",
                borderBottom: "1px solid #edf0f5",
                display: "flex",
                gap: 10,
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
  {activeTab === "chat" ? (
    <>
      <div style={avatarStyle("#5b5fc7", 42)}>R</div>
      <div>
        <div style={{ fontWeight: 800, fontSize: 18 }}>
          Romain Dufresne
        </div>
        <div style={{ fontSize: 13, color: "#667085" }}>
          Collaborateur — conversation active
        </div>
      </div>
    </>
  ) : (
    <>
      <div style={avatarStyle("#1d4ed8", 42)}>✉</div>
      <div>
        <div style={{ fontWeight: 800, fontSize: 18 }}>
          Boîte mail
        </div>
        <div style={{ fontSize: 13, color: "#667085" }}>
          Rédaction et envoi des messages officiels
        </div>
      </div>
    </>
  )}
</div>

              <div style={{ display: "flex", gap: 10 }}>
                <button
  onClick={() => setActiveTab("chat")}
  style={{
    padding: "9px 14px",
    borderRadius: 10,
    border: "1px solid #cfd5df",
    background: activeTab === "chat" ? "#5b5fc7" : "#f5f7fb",
    color: activeTab === "chat" ? "#fff" : "#111",
    cursor: "pointer",
    fontWeight: 600,
    position: "relative",
  }}
>
  Messagerie
  {unreadChatCount > 0 && activeTab !== "chat" ? (
    <span
      style={{
        position: "absolute",
        top: -8,
        right: -8,
        minWidth: 18,
        height: 18,
        padding: "0 5px",
        borderRadius: 999,
        background: "#d11a2a",
        color: "#fff",
        fontSize: 12,
        lineHeight: "18px",
        textAlign: "center",
        fontWeight: 700,
      }}
    >
      {unreadChatCount}
    </span>
  ) : null}
</button>

                <button
                  onClick={() => setActiveTab("mail")}
                  style={{
                    padding: "9px 14px",
                    borderRadius: 10,
                    border: "1px solid #cfd5df",
                    background: activeTab === "mail" ? "#5b5fc7" : "#f5f7fb",
                    color: activeTab === "mail" ? "#fff" : "#111",
                    cursor: "pointer",
                    position: "relative",
                    fontWeight: 600,
                  }}
                >
                  Boîte mail
                  {unreadInboxCount > 0 ? (
                    <span
                      style={{
                        position: "absolute",
                        top: -8,
                        right: -8,
                        minWidth: 18,
                        height: 18,
                        padding: "0 5px",
                        borderRadius: 999,
                        background: "#d11a2a",
                        color: "#fff",
                        fontSize: 12,
                        lineHeight: "18px",
                        textAlign: "center",
                        fontWeight: 700,
                      }}
                    >
                      {unreadInboxCount}
                    </span>
                  ) : null}
                </button>
              </div>
            </div>

            <div style={{ padding: 18 }}>
              {activeTab === "chat" ? (
                <>
                  <div
                    ref={conversationBoxRef}
                    style={{
                      height: view.isFinished ? 560 : 720,
                      overflowY: "auto",
                      border: "1px solid #eceff5",
                      borderRadius: 16,
                      padding: 16,
                      background: "#f8f9fc",
                    }}
                  >
                    {chatMessages.length === 0 ? (
                      <p style={{ color: "#666", margin: 0 }}>
                        Aucun échange pour l’instant.
                      </p>
                    ) : (
                      <div style={{ display: "grid", gap: 14 }}>
                        {chatMessages.map((msg: any, i: number) => {
                          const isPlayer = msg.role === "player";
                          const isSystem = msg.role === "system";
                          const isInterruption = msg.type === "interruption";

                          const authorLabel = isPlayer
                            ? displayPlayerName
                            : isSystem
                            ? "Système"
                            : msg.actor || "Romain";

                          const authorAvatar = isPlayer ? (
                            <div style={avatarStyle("#0f766e", 40)}>
                              {initials(displayPlayerName)}
                            </div>
                          ) : isSystem ? (
                            <div style={avatarStyle("#a16207", 40)}>!</div>
                          ) : (
                            <div style={avatarStyle(isInterruption ? "#be123c" : "#5b5fc7", 40)}>
                              R
                            </div>
                          );

                          return (
                            <div
                              key={msg.id || i}
                              style={{
                                display: "flex",
                                gap: 10,
                                alignItems: "flex-start",
                              }}
                            >
                              {authorAvatar}

                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    marginBottom: 6,
                                  }}
                                >
                                  <strong style={{ fontSize: 14 }}>{authorLabel}</strong>
                                  <span
                                    style={{
                                      fontSize: 12,
                                      color: "#667085",
                                    }}
                                  >
                                    {formatSimulatedTime(simulatedTime)}
                                  </span>
                                </div>

                                <div
                                  style={{
                                    padding: "12px 14px",
                                    borderRadius: isPlayer
                                      ? "16px 16px 6px 16px"
                                      : "16px 16px 16px 6px",
                                    border: "1px solid #e4e7ec",
                                    background: isPlayer
                                      ? "#ffffff"
                                      : isSystem
                                      ? "#fff8e8"
                                      : isInterruption
                                      ? "#fff0f5"
                                      : "#eef2ff",
                                    color: "#111827",
                                    boxShadow: "0 2px 8px rgba(15,23,42,0.04)",
                                  }}
                                >
                                  <p
                                    style={{
                                      margin: 0,
                                      whiteSpace: "pre-wrap",
                                      lineHeight: 1.65,
                                    }}
                                  >
                                    {msg.content}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {loading && (
                          <div
                            style={{
                              display: "flex",
                              gap: 10,
                              alignItems: "flex-start",
                            }}
                          >
                            <div style={avatarStyle("#5b5fc7", 40)}>R</div>

                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  marginBottom: 6,
                                }}
                              >
                                <strong style={{ fontSize: 14 }}>Romain</strong>
                                <span style={{ fontSize: 12, color: "#667085" }}>
                                  {formatSimulatedTime(simulatedTime)}
                                </span>
                              </div>

                              <div
                                style={{
                                  padding: "12px 14px",
                                  borderRadius: "16px 16px 16px 6px",
                                  border: "1px solid #e4e7ec",
                                  background: "#eef2ff",
                                  width: "fit-content",
                                  minWidth: 92,
                                  boxShadow: "0 2px 8px rgba(15,23,42,0.04)",
                                }}
                              >
                                <TypingDots />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {!view.isFinished ? (
                    <div style={{ marginTop: 14 }}>
                      <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                            e.preventDefault();
                            if (!loading && input.trim()) {
                              sendMessage();
                            }
                          }
                        }}
                        rows={6}
                        placeholder="Écris ici ta réponse..."
                        style={{
                          width: "100%",
                          padding: 14,
                          borderRadius: 14,
                          border: "1px solid #cfd5df",
                          fontSize: 16,
                          resize: "vertical",
                          boxSizing: "border-box",
                          background: "#fff",
                        }}
                      />

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginTop: 10,
                          gap: 12,
                          flexWrap: "wrap",
                        }}
                      >
                        <p
                          style={{
                            margin: 0,
                            fontSize: 13,
                            color: "#667085",
                          }}
                        >
                          Raccourci : Cmd/Ctrl + Entrée pour envoyer
                        </p>

                        <button
                          onClick={sendMessage}
                          disabled={loading || !input.trim()}
                          style={{
                            padding: "10px 18px",
                            borderRadius: 12,
                            border: "1px solid #4338ca",
                            background: "#5b5fc7",
                            color: "#fff",
                            cursor:
                              loading || !input.trim() ? "not-allowed" : "pointer",
                            fontWeight: 700,
                            boxShadow: "0 8px 16px rgba(91,95,199,0.18)",
                          }}
                        >
                          Envoyer à Romain
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <h2 style={{ marginTop: 0, marginBottom: 12 }}>Boîte mail</h2>

                  {!view.isFinished ? (
                    <div style={{ display: "grid", gap: 12 }}>
                      <div>
                        <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
                          À
                        </label>
                        <input
                          value={mailDraft.to}
                          onChange={(e) => handleMailFieldChange("to", e.target.value)}
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid #ccc",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
                          Cc
                        </label>
                        <input
                          value={mailDraft.cc}
                          onChange={(e) => handleMailFieldChange("cc", e.target.value)}
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid #ccc",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
                          Objet
                        </label>
                        <input
                          value={mailDraft.subject}
                          onChange={(e) =>
                            handleMailFieldChange("subject", e.target.value)
                          }
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid #ccc",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
                          Message
                        </label>
                        <textarea
                          value={mailDraft.body}
                          onChange={(e) => handleMailFieldChange("body", e.target.value)}
                          rows={12}
                          style={{
                            width: "100%",
                            padding: 12,
                            borderRadius: 10,
                            border: "1px solid #ccc",
                            resize: "vertical",
                            fontSize: 15,
                            boxSizing: "border-box",
                          }}
                        />
                      </div>

                      <div>
                        <h3 style={{ marginBottom: 8 }}>Mails reçus</h3>

                        {inboxMails.length === 0 ? (
                          <p style={{ color: "#666", marginTop: 0 }}>
                            Aucun mail reçu pour l’instant.
                          </p>
                        ) : (
                          <div style={{ display: "grid", gap: 10 }}>
                            {inboxMails.map((mail: any) => (
                              <div
                                key={mail.id}
                                style={{
                                  border: "1px solid #e5e5e5",
                                  borderRadius: 10,
                                  padding: 12,
                                  background: "#f7fbff",
                                }}
                              >
                                <p style={{ margin: "0 0 6px 0" }}>
                                  <strong>De :</strong> {mail.from || "Inconnu"}
                                </p>
                                <p style={{ margin: "0 0 6px 0" }}>
                                  <strong>Objet :</strong> {mail.subject || "(Sans objet)"}
                                </p>
                                <p
                                  style={{
                                    margin: "0 0 6px 0",
                                    whiteSpace: "pre-wrap",
                                    lineHeight: 1.6,
                                  }}
                                >
                                  {mail.body}
                                </p>
                                <p style={{ margin: 0 }}>
                                  <strong>Pièces jointes :</strong>{" "}
                                  {mail.attachments?.length
                                    ? mail.attachments.map((a: any) => a.label).join(", ")
                                    : "Aucune"}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <h3 style={{ marginBottom: 8 }}>Pièces jointes à ajouter</h3>
                        <div style={{ display: "grid", gap: 8 }}>
                          {view.documents.map((doc: any, i: number) => {
                            const docId = doc.doc_id || doc.id || `${i}`;
                            const selected = selectedAttachmentIds.has(docId);

                            return (
                              <label
                                key={docId}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  padding: "8px 10px",
                                  border: "1px solid #e5e5e5",
                                  borderRadius: 10,
                                  background: selected ? "#eef6ff" : "#fff",
                                  cursor: "pointer",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => handleToggleAttachment(doc)}
                                />
                                <span>{doc.label || doc.doc_id || `Document ${i + 1}`}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                   {view.phaseId === "phase_4_rebound" &&
!hasAttachments &&
canSendMailNow ? (
  <p style={{ color: "#aa6b00", marginBottom: 0 }}>
    Pour cette phase, tu dois joindre au moins une pièce.
  </p>
) : null}

{view.phaseId === "phase_3_execution" ? (
  <p style={{ color: "#475467", marginBottom: 0 }}>
    Tu peux envoyer ce mail directement si tu estimes le dossier prêt.
    Romain n’a pas besoin de le valider avant envoi.
  </p>
) : null}

{canSendMailNow ? (
  <div style={{ marginTop: 8 }}>
                          <button
                            onClick={handleSendMail}
                            disabled={!canActuallySendMail}
                            style={{
                              padding: "10px 16px",
                              borderRadius: 10,
                              border: "1px solid #ccc",
                              background: canActuallySendMail ? "#0b6b3a" : "#d7d7d7",
                              color: "#fff",
                              cursor: canActuallySendMail ? "pointer" : "not-allowed",
                              fontWeight: 700,
                            }}
                          >
                            {sendMailLabel}
                          </button>
                        </div>
                      ) : (
                        <p style={{ color: "#666", marginBottom: 0 }}>
                          Le bouton d’envoi apparaîtra quand la phase sera suffisamment validée.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <h3 style={{ marginTop: 0 }}>Mails envoyés</h3>
                      {view.sentMails.length === 0 ? (
                        <p style={{ color: "#666" }}>Aucun mail envoyé.</p>
                      ) : (
                        <div style={{ display: "grid", gap: 12 }}>
                          {view.sentMails.map((mail: any) => (
                            <div
                              key={mail.id}
                              style={{
                                border: "1px solid #e5e5e5",
                                borderRadius: 10,
                                padding: 12,
                                background: "#fafafa",
                              }}
                            >
                              <p style={{ margin: "0 0 6px 0" }}>
                                <strong>À :</strong> {mail.to || "—"}
                              </p>
                              <p style={{ margin: "0 0 6px 0" }}>
                                <strong>Cc :</strong> {mail.cc || "—"}
                              </p>
                              <p style={{ margin: "0 0 6px 0" }}>
                                <strong>Objet :</strong> {mail.subject || "—"}
                              </p>
                              <p
                                style={{
                                  margin: "0 0 6px 0",
                                  whiteSpace: "pre-wrap",
                                  lineHeight: 1.6,
                                }}
                              >
                                {mail.body || "—"}
                              </p>
                              <p style={{ margin: 0 }}>
                                <strong>Pièces jointes :</strong>{" "}
                                {mail.attachments?.length
                                  ? mail.attachments.map((a: any) => a.label).join(", ")
                                  : "Aucune"}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {view.isFinished ? (
        <section
          style={{
            marginTop: 18,
            border: "1px solid #ddd",
            borderRadius: 16,
            padding: 18,
            background: "#fff",
            boxShadow: "0 6px 18px rgba(0,0,0,0.04)",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Dénouement</h2>
          <p>
            <strong>{view.ending?.label}</strong>
          </p>
          <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
            {view.ending?.content}
          </p>

          <div style={{ marginTop: 18 }}>
            <button
              onClick={generateDebriefAndOpenPage}
              disabled={debriefLoading}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                border: "1px solid #ccc",
                background: "#111",
                color: "#fff",
                cursor: debriefLoading ? "not-allowed" : "pointer",
                fontWeight: 700,
              }}
            >
              {debriefLoading ? "Génération..." : "Voir le débrief complet"}
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}