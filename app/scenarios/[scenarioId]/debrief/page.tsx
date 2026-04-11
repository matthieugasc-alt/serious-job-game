"use client";

import { useEffect, useMemo, useState, use } from "react";
import { useRouter } from "next/navigation";

interface DebriefEntry {
  id: string;
  createdAt?: string;
  playerName?: string;
  ending?: {
    id?: string;
    label?: string;
    content?: string;
  };
  scores?: Record<string, number>;
  totalScore?: number;
  flags?: Record<string, boolean>;
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
}

function formatDate(value?: string) {
  if (!value) return "Date inconnue";
  try {
    return new Date(value).toLocaleString("fr-FR");
  } catch {
    return value;
  }
}

export default function DebriefPage({
  params,
}: {
  params: Promise<{ scenarioId: string }>;
}) {
  const router = useRouter();
  const { scenarioId } = use(params);

  const [latestDebrief, setLatestDebrief] = useState<DebriefEntry | null>(null);
  const [history, setHistory] = useState<DebriefEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      setLoading(true);
      const latestRaw = window.localStorage.getItem(
        `sjg_debrief_${scenarioId}_latest`
      );
      const historyRaw = window.localStorage.getItem(`sjg_debriefs_${scenarioId}`);

      setLatestDebrief(latestRaw ? JSON.parse(latestRaw) : null);
      setHistory(historyRaw ? JSON.parse(historyRaw) : []);
    } catch (e) {
      console.error(e);
      setLatestDebrief(null);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [scenarioId]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f6f8fc 0%, #eef2f9 100%)",
        padding: "28px 20px 40px",
        fontFamily: "Arial, sans-serif",
        color: "#111",
      }}
    >
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        {/* Back buttons */}
        <div
          style={{
            display: "flex",
            gap: 16,
            marginBottom: 32,
          }}
        >
          <button
            onClick={() => router.push("/")}
            style={{
              background: "#5b5fc7",
              color: "#fff",
              border: "none",
              padding: "10px 20px",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "#4a4aaa";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "#5b5fc7";
            }}
          >
            Retour aux scénarios
          </button>

          <button
            onClick={() => router.push(`/scenarios/${scenarioId}`)}
            style={{
              background: "#fff",
              color: "#5b5fc7",
              border: "1px solid #5b5fc7",
              padding: "10px 20px",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "#f0f0ff";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "#fff";
            }}
          >
            Rejouer ce scénario
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <p style={{ fontSize: 16, color: "#666" }}>
              Chargement du débriefing...
            </p>
          </div>
        ) : !latestDebrief ? (
          <div
            style={{
              background: "#fee2e2",
              border: "1px solid #fca5a5",
              borderRadius: 8,
              padding: 20,
              color: "#991b1b",
              textAlign: "center",
            }}
          >
            Aucun débriefing disponible
          </div>
        ) : (
          <>
            {/* Latest Debrief */}
            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: 18,
                padding: 32,
                background: "#fff",
                boxShadow: "0 8px 24px rgba(0,0,0,0.05)",
                marginBottom: 40,
              }}
            >
              <h1
                style={{
                  margin: "0 0 8px 0",
                  fontSize: 28,
                  fontWeight: 700,
                  color: "#111",
                }}
              >
                Débriefing de la simulation
              </h1>
              <p style={{ margin: "0 0 24px 0", fontSize: 14, color: "#666" }}>
                Simulation jouée par {latestDebrief.playerName} le{" "}
                {formatDate(latestDebrief.createdAt)}
              </p>

              {/* Ending */}
              {latestDebrief.ending && (
                <div
                  style={{
                    marginBottom: 32,
                    padding: 20,
                    borderRadius: 12,
                    background: "#f9fafb",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <h2
                    style={{
                      margin: "0 0 12px 0",
                      fontSize: 20,
                      fontWeight: 700,
                      color: "#111",
                    }}
                  >
                    {latestDebrief.ending.label || "Fin de la simulation"}
                  </h2>
                  <div
                    style={{
                      fontSize: 15,
                      lineHeight: 1.6,
                      color: "#333",
                    }}
                    dangerouslySetInnerHTML={{
                      __html: latestDebrief.ending.content || "",
                    }}
                  />
                </div>
              )}

              {/* Scores */}
              {latestDebrief.scores && Object.keys(latestDebrief.scores).length > 0 && (
                <div
                  style={{
                    marginBottom: 32,
                    padding: 20,
                    borderRadius: 12,
                    background: "#f9fafb",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <h2
                    style={{
                      margin: "0 0 16px 0",
                      fontSize: 20,
                      fontWeight: 700,
                      color: "#111",
                    }}
                  >
                    Résultats par phase
                  </h2>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {Object.entries(latestDebrief.scores).map(([phaseId, score]) => (
                      <div
                        key={phaseId}
                        style={{
                          padding: 14,
                          border: "1px solid #e5e7eb",
                          borderRadius: 8,
                          background: "#fff",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 13,
                            color: "#666",
                            marginBottom: 4,
                            textTransform: "capitalize",
                          }}
                        >
                          {phaseId}
                        </div>
                        <div
                          style={{
                            fontSize: 24,
                            fontWeight: 700,
                            color: "#5b5fc7",
                          }}
                        >
                          {score} pts
                        </div>
                      </div>
                    ))}
                  </div>

                  {latestDebrief.totalScore !== undefined && (
                    <div
                      style={{
                        marginTop: 16,
                        padding: 16,
                        background: "#eef2ff",
                        border: "2px solid #5b5fc7",
                        borderRadius: 8,
                        textAlign: "center",
                      }}
                    >
                      <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>
                        Score total
                      </div>
                      <div
                        style={{
                          fontSize: 32,
                          fontWeight: 700,
                          color: "#5b5fc7",
                        }}
                      >
                        {latestDebrief.totalScore}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Sent Mails */}
              {latestDebrief.sentMails &&
                latestDebrief.sentMails.length > 0 && (
                  <div
                    style={{
                      marginBottom: 32,
                      padding: 20,
                      borderRadius: 12,
                      background: "#f9fafb",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    <h2
                      style={{
                        margin: "0 0 16px 0",
                        fontSize: 20,
                        fontWeight: 700,
                        color: "#111",
                      }}
                    >
                      Mails envoyés
                    </h2>
                    <div style={{ display: "grid", gap: 12 }}>
                      {latestDebrief.sentMails.map((mail) => (
                        <div
                          key={mail.id}
                          style={{
                            padding: 14,
                            border: "1px solid #e5e7eb",
                            borderRadius: 8,
                            background: "#fff",
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 600,
                              marginBottom: 6,
                              color: "#111",
                            }}
                          >
                            {mail.subject}
                          </div>
                          <div style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>
                            À: {mail.to}
                            {mail.cc && ` — CC: ${mail.cc}`}
                          </div>
                          <div
                            style={{
                              fontSize: 14,
                              lineHeight: 1.6,
                              color: "#333",
                              whiteSpace: "pre-wrap",
                              marginBottom: 8,
                            }}
                          >
                            {mail.body}
                          </div>
                          {mail.attachments && mail.attachments.length > 0 && (
                            <div style={{ fontSize: 12, color: "#999" }}>
                              Pièces jointes: {mail.attachments
                                .map((a) => a.label)
                                .join(", ")}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Received Mails */}
              {latestDebrief.inboxMails &&
                latestDebrief.inboxMails.length > 0 && (
                  <div
                    style={{
                      padding: 20,
                      borderRadius: 12,
                      background: "#f9fafb",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    <h2
                      style={{
                        margin: "0 0 16px 0",
                        fontSize: 20,
                        fontWeight: 700,
                        color: "#111",
                      }}
                    >
                      Mails reçus
                    </h2>
                    <div style={{ display: "grid", gap: 12 }}>
                      {latestDebrief.inboxMails.map((mail) => (
                        <div
                          key={mail.id}
                          style={{
                            padding: 14,
                            border: "1px solid #e5e7eb",
                            borderRadius: 8,
                            background: "#fff",
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 600,
                              marginBottom: 6,
                              color: "#111",
                            }}
                          >
                            {mail.subject}
                          </div>
                          <div style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>
                            De: {mail.from}
                          </div>
                          <div
                            style={{
                              fontSize: 14,
                              lineHeight: 1.6,
                              color: "#333",
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {mail.body}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </div>

            {/* History */}
            {history.length > 0 && (
              <div>
                <h2
                  style={{
                    margin: "0 0 20px 0",
                    fontSize: 22,
                    fontWeight: 700,
                    color: "#111",
                  }}
                >
                  Historique des simulations
                </h2>

                <div
                  style={{
                    display: "grid",
                    gap: 16,
                  }}
                >
                  {history.slice(1).map((entry) => (
                    <div
                      key={entry.id}
                      style={{
                        border: "1px solid #ddd",
                        borderRadius: 12,
                        padding: 16,
                        background: "#fff",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "start",
                          marginBottom: 12,
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 15,
                              marginBottom: 4,
                            }}
                          >
                            {entry.playerName || "Joueur anonyme"}
                          </div>
                          <div style={{ fontSize: 13, color: "#666" }}>
                            {formatDate(entry.createdAt)}
                          </div>
                        </div>
                        <div
                          style={{
                            textAlign: "right",
                            padding: "8px 14px",
                            background: "#eef2ff",
                            borderRadius: 6,
                            fontWeight: 600,
                            fontSize: 14,
                            color: "#5b5fc7",
                          }}
                        >
                          {entry.totalScore || 0} pts
                        </div>
                      </div>

                      {entry.ending && (
                        <div style={{ fontSize: 14, color: "#555" }}>
                          {entry.ending.label || "Simulation terminée"}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
