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

export default function Home() {
  const router = useRouter();

  const [session, setSession] = useState<any | null>(null);
  const [input, setInput] = useState("");
  const [playerName, setPlayerName] = useState("Joueur");
  const [activeTab, setActiveTab] = useState<TabKey>("chat");
  const [loading, setLoading] = useState(false);
  const [debriefLoading, setDebriefLoading] = useState(false);

  const conversationBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const s = initializeSession(scenarioData);
    injectPhaseEntryEvents(s);
    setSession(s);
  }, []);

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
    if (!canSendMailNow || !mailFormIsComplete) return false;

    if (view.phaseId === "phase_3_execution") {
      return true;
    }

    if (view.phaseId === "phase_4_rebound") {
      return hasAttachments;
    }

    return false;
  }, [view, canSendMailNow, mailFormIsComplete, hasAttachments]);

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
  }, [chatMessages.length]);

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

      applyEvaluation(
        newSession,
        data.matched_criteria || [],
        data.score_delta || 0,
        data.flags_to_set || {}
      );

      updateAdaptiveMode(newSession);
      scheduleInterruption(newSession);

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

  function resetGame() {
    const freshSession = initializeSession(scenarioData);
    injectPhaseEntryEvents(freshSession);
    setSession(freshSession);
    setInput("");
    setLoading(false);
    setActiveTab("chat");
    setDebriefLoading(false);
  }

  if (!session || !view) {
    return (
      <main
        style={{
          padding: 20,
          maxWidth: 1120,
          margin: "0 auto",
          fontFamily: "Arial, sans-serif",
          color: "#111",
        }}
      >
        <p>Chargement…</p>
      </main>
    );
  }

  return (
    <main
      style={{
        padding: 20,
        maxWidth: 1120,
        margin: "0 auto",
        fontFamily: "Arial, sans-serif",
        color: "#111",
      }}
    >
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ marginBottom: 6 }}>{view.title}</h1>
        {view.subtitle ? (
          <p style={{ marginTop: 0, color: "#555" }}>{view.subtitle}</p>
        ) : null}
      </div>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 18,
          marginBottom: 18,
          background: "#fff",
        }}
      >
        <div style={{ marginBottom: 14 }}>
          <label
            htmlFor="player-name"
            style={{
              display: "block",
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            Ton prénom / nom dans le scénario
          </label>
          <input
            id="player-name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Ex. Matthieu"
            style={{
              width: "100%",
              maxWidth: 320,
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #ccc",
              fontSize: 15,
              boxSizing: "border-box",
            }}
          />
        </div>

        <button
          onClick={resetGame}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #ccc",
            background: "#f5f5f5",
            cursor: "pointer",
          }}
        >
          Recommencer le scénario
        </button>
      </section>

      {!view.isFinished ? (
        <section
          style={{
            border: "1px solid #ddd",
            borderRadius: 12,
            padding: 24,
            marginBottom: 18,
            background: "#fff",
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
      ) : null}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1.45fr 0.75fr",
          gap: 18,
          alignItems: "start",
        }}
      >
        <div>
          <section
            style={{
              border: "1px solid #ddd",
              borderRadius: 12,
              padding: 18,
              marginBottom: 18,
              background: "#fff",
            }}
          >
            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <button
                onClick={() => setActiveTab("chat")}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #ccc",
                  background: activeTab === "chat" ? "#111" : "#f5f5f5",
                  color: activeTab === "chat" ? "#fff" : "#111",
                  cursor: "pointer",
                }}
              >
                Messagerie
              </button>

              <button
                onClick={() => setActiveTab("mail")}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #ccc",
                  background: activeTab === "mail" ? "#111" : "#f5f5f5",
                  color: activeTab === "mail" ? "#fff" : "#111",
                  cursor: "pointer",
                }}
              >
                Boîte mail
              </button>
            </div>

            {activeTab === "chat" ? (
              <>
                <h2 style={{ marginTop: 0, marginBottom: 12 }}>Messagerie</h2>

                <div
                  ref={conversationBoxRef}
                  style={{
                    height: view.isFinished ? 460 : 620,
                    overflowY: "auto",
                    border: "1px solid #eee",
                    borderRadius: 10,
                    padding: 12,
                    background: "#fafafa",
                  }}
                >
                  {chatMessages.length === 0 ? (
                    <p style={{ color: "#666", margin: 0 }}>
                      Aucun échange pour l’instant.
                    </p>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {chatMessages.map((msg: any, i: number) => (
                        <div
                          key={msg.id || i}
                          style={{
                            padding: 10,
                            borderRadius: 8,
                            border: "1px solid #e5e5e5",
                            background:
                              msg.role === "player"
                                ? "#ffffff"
                                : msg.role === "system"
                                ? "#fff8e6"
                                : msg.type === "interruption"
                                ? "#ffeef0"
                                : "#eef6ff",
                          }}
                        >
                          <strong>
                            {msg.role === "player"
                              ? displayPlayerName
                              : msg.role === "system"
                              ? "Système"
                              : msg.actor || "NPC"}
                          </strong>
                          <p
                            style={{
                              margin: "8px 0 0 0",
                              whiteSpace: "pre-wrap",
                              lineHeight: 1.6,
                            }}
                          >
                            {msg.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {!view.isFinished ? (
                  <div style={{ marginTop: 14 }}>
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      rows={6}
                      placeholder="Écris ici ta réponse..."
                      style={{
                        width: "100%",
                        padding: 12,
                        borderRadius: 8,
                        border: "1px solid #ccc",
                        fontSize: 16,
                        resize: "vertical",
                        boxSizing: "border-box",
                      }}
                    />

                    <div style={{ marginTop: 12 }}>
                      <button
                        onClick={sendMessage}
                        disabled={loading || !input.trim()}
                        style={{
                          padding: "10px 16px",
                          borderRadius: 8,
                          border: "1px solid #ccc",
                          background: "#111",
                          color: "#fff",
                          cursor:
                            loading || !input.trim() ? "not-allowed" : "pointer",
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
                          borderRadius: 8,
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
                          borderRadius: 8,
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
                          borderRadius: 8,
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
                          borderRadius: 8,
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
                                borderRadius: 8,
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
                                borderRadius: 8,
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

                    {canSendMailNow ? (
                      <div style={{ marginTop: 8 }}>
                        <button
                          onClick={handleSendMail}
                          disabled={!canActuallySendMail}
                          style={{
                            padding: "10px 16px",
                            borderRadius: 8,
                            border: "1px solid #ccc",
                            background: canActuallySendMail ? "#0b6b3a" : "#d7d7d7",
                            color: "#fff",
                            cursor: canActuallySendMail ? "pointer" : "not-allowed",
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
                              borderRadius: 8,
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
          </section>
        </div>

        <div>
          {!view.isFinished ? (
            <section
              style={{
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: 18,
                marginBottom: 18,
                background: "#fff",
              }}
            >
              <h3 style={{ marginTop: 0 }}>Documents disponibles</h3>

              {view.documents?.length ? (
                <ul style={{ paddingLeft: 18, margin: 0, lineHeight: 1.8 }}>
                  {view.documents.map((doc: any, i: number) => (
                    <li key={doc.doc_id || i}>
                      {doc.label || doc.doc_id || `Document ${i + 1}`}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ color: "#666", margin: 0 }}>
                  Aucun document disponible.
                </p>
              )}
            </section>
          ) : (
            <section
              style={{
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: 18,
                background: "#fff",
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
                    borderRadius: 8,
                    border: "1px solid #ccc",
                    background: "#111",
                    color: "#fff",
                    cursor: debriefLoading ? "not-allowed" : "pointer",
                  }}
                >
                  {debriefLoading ? "Génération..." : "Voir le débrief complet"}
                </button>
              </div>
            </section>
          )}
        </div>
      </section>
    </main>
  );
}