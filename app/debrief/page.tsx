"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type DebriefEntry = {
  id: string;
  createdAt?: string;
  playerName?: string;
  ending?: {
    id?: string;
    label?: string;
    content?: string;
  };
  summary?: string;
  strengths?: string[];
  weaknesses?: string[];
  competency_analysis?: Array<{
    competency: string;
    level: string;
    justification: string;
  }>;
  sentMails?: Array<{
    id: string;
    to: string;
    cc: string;
    subject: string;
    body: string;
    attachments?: Array<{
      id: string;
      label: string;
    }>;
    phaseId?: string;
    kind?: string;
    sentAt?: number;
  }>;
  inboxMails?: Array<{
    id: string;
    from: string;
    subject: string;
    body: string;
    attachments?: Array<{
      id: string;
      label: string;
    }>;
    phaseId?: string;
    receivedAt?: number;
  }>;
  scores?: Record<string, number>;
  totalScore?: number;
  flags?: Record<string, boolean>;
};

function formatDate(value?: string) {
  if (!value) return "Date inconnue";

  try {
    return new Date(value).toLocaleString("fr-FR");
  } catch {
    return value;
  }
}

function levelBadgeColor(level?: string) {
  const normalized = (level || "").toLowerCase();

  if (normalized === "excellent") return "#0b6b3a";
  if (normalized === "bon") return "#1d4ed8";
  if (normalized === "moyen") return "#a16207";
  if (normalized === "faible") return "#b91c1c";

  return "#555";
}

export default function DebriefPage() {
  const router = useRouter();

  const [latestDebrief, setLatestDebrief] = useState<DebriefEntry | null>(null);
  const [history, setHistory] = useState<DebriefEntry[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const latestRaw = window.localStorage.getItem(
        "serious_job_game_latest_debrief"
      );
      const historyRaw = window.localStorage.getItem(
        "serious_job_game_debriefs"
      );

      setLatestDebrief(latestRaw ? JSON.parse(latestRaw) : null);
      setHistory(historyRaw ? JSON.parse(historyRaw) : []);
    } catch (e) {
      console.error(e);
      setLatestDebrief(null);
      setHistory([]);
    }
  }, []);

  const displayedHistory = useMemo(() => {
    return history || [];
  }, [history]);

  return (
    <main
      style={{
        padding: 20,
        maxWidth: 1100,
        margin: "0 auto",
        fontFamily: "Arial, sans-serif",
        color: "#111",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 18,
        }}
      >
        <button
          onClick={() => router.push("/")}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #ccc",
            background: "#f5f5f5",
            cursor: "pointer",
          }}
        >
          Retour au scénario
        </button>
      </div>

      <div style={{ marginBottom: 18 }}>
        <h1 style={{ marginBottom: 6 }}>Débrief complet</h1>
        <p style={{ marginTop: 0, color: "#555" }}>
          Analyse détaillée de la session la plus récente, avec historique des runs.
        </p>
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
        {latestDebrief ? (
          <>
            <div style={{ marginBottom: 16 }}>
              <p style={{ margin: "0 0 8px 0", color: "#555" }}>
                <strong>Joueur :</strong> {latestDebrief.playerName || "Joueur"}
              </p>
              <p style={{ margin: 0, color: "#555" }}>
                <strong>Date :</strong> {formatDate(latestDebrief.createdAt)}
              </p>
            </div>

            {latestDebrief.ending?.label ? (
              <div
                style={{
                  border: "1px solid #e5e5e5",
                  borderRadius: 10,
                  padding: 14,
                  background: "#fafafa",
                  marginBottom: 18,
                }}
              >
                <h2 style={{ marginTop: 0, marginBottom: 8 }}>Dénouement</h2>
                <p style={{ margin: "0 0 8px 0" }}>
                  <strong>{latestDebrief.ending.label}</strong>
                </p>
                {latestDebrief.ending.content ? (
                  <p style={{ margin: 0, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                    {latestDebrief.ending.content}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div
              style={{
                border: "1px solid #e5e5e5",
                borderRadius: 10,
                padding: 14,
                background: "#fff",
                marginBottom: 18,
              }}
            >
              <h2 style={{ marginTop: 0, marginBottom: 10 }}>Résumé</h2>
              <p style={{ margin: 0, lineHeight: 1.8 }}>
                {latestDebrief.summary || "Aucun résumé disponible."}
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 18,
                marginBottom: 18,
              }}
            >
              <section
                style={{
                  border: "1px solid #e5e5e5",
                  borderRadius: 10,
                  padding: 14,
                  background: "#fff",
                }}
              >
                <h2 style={{ marginTop: 0 }}>Points forts</h2>
                {latestDebrief.strengths?.length ? (
                  <ul style={{ paddingLeft: 18, marginBottom: 0, lineHeight: 1.8 }}>
                    {latestDebrief.strengths.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ marginBottom: 0 }}>Aucun point fort clairement identifié.</p>
                )}
              </section>

              <section
                style={{
                  border: "1px solid #e5e5e5",
                  borderRadius: 10,
                  padding: 14,
                  background: "#fff",
                }}
              >
                <h2 style={{ marginTop: 0 }}>Points à renforcer</h2>
                {latestDebrief.weaknesses?.length ? (
                  <ul style={{ paddingLeft: 18, marginBottom: 0, lineHeight: 1.8 }}>
                    {latestDebrief.weaknesses.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ marginBottom: 0 }}>
                    Aucun point faible majeur identifié.
                  </p>
                )}
              </section>
            </div>

            <section
              style={{
                border: "1px solid #e5e5e5",
                borderRadius: 10,
                padding: 14,
                background: "#fff",
                marginBottom: 18,
              }}
            >
              <h2 style={{ marginTop: 0, marginBottom: 12 }}>
                Analyse par compétence
              </h2>

              {latestDebrief.competency_analysis?.length ? (
                <div style={{ display: "grid", gap: 12 }}>
                  {latestDebrief.competency_analysis.map((item, i) => (
                    <div
                      key={i}
                      style={{
                        border: "1px solid #e5e5e5",
                        borderRadius: 8,
                        padding: 12,
                        background: "#fafafa",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          alignItems: "center",
                          flexWrap: "wrap",
                          marginBottom: 8,
                        }}
                      >
                        <strong>{item.competency}</strong>
                        <span
                          style={{
                            padding: "4px 8px",
                            borderRadius: 999,
                            background: levelBadgeColor(item.level),
                            color: "#fff",
                            fontSize: 13,
                          }}
                        >
                          {item.level}
                        </span>
                      </div>
                      <p style={{ margin: 0, lineHeight: 1.7 }}>
                        {item.justification}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ marginBottom: 0 }}>
                  Aucune analyse de compétence disponible.
                </p>
              )}
            </section>

            <section
              style={{
                border: "1px solid #e5e5e5",
                borderRadius: 10,
                padding: 14,
                background: "#fff",
                marginBottom: 18,
              }}
            >
              <h2 style={{ marginTop: 0, marginBottom: 12 }}>Mails envoyés</h2>

              {latestDebrief.sentMails?.length ? (
                <div style={{ display: "grid", gap: 12 }}>
                  {latestDebrief.sentMails.map((mail) => (
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
                          ? mail.attachments.map((a) => a.label).join(", ")
                          : "Aucune"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ marginBottom: 0 }}>Aucun mail envoyé.</p>
              )}
            </section>
          </>
        ) : (
          <p style={{ margin: 0 }}>Aucun débrief disponible.</p>
        )}
      </section>

      <section
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 18,
          background: "#fff",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Historique des débriefs</h2>

        {displayedHistory.length ? (
          <div style={{ display: "grid", gap: 12 }}>
            {displayedHistory.map((item) => (
              <div
                key={item.id}
                style={{
                  border: "1px solid #e5e5e5",
                  borderRadius: 8,
                  padding: 12,
                  background: "#fafafa",
                }}
              >
                <p style={{ margin: "0 0 6px 0" }}>
                  <strong>{item.ending?.label || "Débrief"}</strong>
                </p>
                <p style={{ margin: "0 0 6px 0", color: "#555" }}>
                  {formatDate(item.createdAt)}
                </p>
                <p style={{ margin: 0, lineHeight: 1.6 }}>
                  {item.summary || "Aucun résumé."}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ marginBottom: 0 }}>Aucun historique disponible.</p>
        )}
      </section>
    </main>
  );
}