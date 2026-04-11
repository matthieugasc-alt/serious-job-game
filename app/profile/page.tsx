"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface SessionData {
  user: {
    id: string;
    email: string;
    name: string;
    created_at: string;
  };
}

interface GameRecord {
  id: string;
  scenarioId: string;
  scenarioTitle: string;
  date: string;
  ending: "success" | "partial_success" | "failure";
  duration_minutes: number;
  score: number;
  debrief?: {
    phases?: Array<{ title: string; evaluation: string }>;
    competencies?: Record<string, number>;
  };
}

interface ScenarioPreference {
  job_family: string;
  followed: boolean;
}

interface Scenario {
  id: string;
  job_family?: string;
  title: string;
}

/** Format job_family slug into readable label */
function formatJobFamily(slug: string): string {
  const map: Record<string, string> = {
    assistant_cooperation_internationale: "Assistant·e de coopération internationale",
    management: "Management",
    ressources_humaines: "Ressources humaines",
    commercial: "Commercial",
    communication: "Communication",
    juridique: "Juridique",
    finance: "Finance",
    formation: "Formation",
  };
  if (map[slug]) return map[slug];
  return slug
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function getEndingBadge(ending: string): { label: string; color: string; bg: string } {
  const config: Record<string, { label: string; color: string; bg: string }> = {
    success: { label: "Succès", color: "#16a34a", bg: "#dcfce7" },
    partial_success: { label: "Succès partiel", color: "#d97706", bg: "#fef3c7" },
    failure: { label: "Échec", color: "#dc2626", bg: "#fee2e2" },
  };
  return config[ending] || config.failure;
}

export default function ProfilePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"history" | "categories">("history");
  const [userToken, setUserToken] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [gameHistory, setGameHistory] = useState<GameRecord[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [preferences, setPreferences] = useState<ScenarioPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsChanged, setPrefsChanged] = useState(false);

  // Load auth from localStorage and fetch session data
  useEffect(() => {
    const loadAuthAndData = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem("auth_token");
        const name = localStorage.getItem("user_name");

        if (!token || !name) {
          router.push("/login");
          return;
        }

        setUserToken(token);
        setUserName(name);

        // Fetch session data
        const sessionRes = await fetch("/api/auth/session", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (sessionRes.ok) {
          const data = await sessionRes.json();
          setSessionData(data);
        }

        // Fetch game history
        const historyRes = await fetch("/api/profile/history", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (historyRes.ok) {
          const data = await historyRes.json();
          setGameHistory(data.records || []);
        }

        // Fetch scenarios
        const scenariosRes = await fetch("/api/scenarios");
        if (scenariosRes.ok) {
          const data = await scenariosRes.json();
          setScenarios(data.scenarios || []);
        }

        // Fetch user preferences
        const prefsRes = await fetch("/api/profile/preferences", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (prefsRes.ok) {
          const data = await prefsRes.json();
          setPreferences(data.preferences || []);
        } else {
          // If preferences don't exist, initialize from available scenarios
          const scenariosData = await fetch("/api/scenarios");
          if (scenariosData.ok) {
            const sData = await scenariosData.json();
            const uniqueFamilies = Array.from(
              new Set((sData.scenarios || []).map((s: Scenario) => s.job_family).filter(Boolean))
            );
            setPreferences(
              uniqueFamilies.map((family) => ({
                job_family: family as string,
                followed: true,
              }))
            );
          }
        }

        setError(null);
      } catch (err: any) {
        console.error("Error loading profile:", err);
        setError("Impossible de charger le profil");
      } finally {
        setLoading(false);
      }
    };

    loadAuthAndData();
  }, [router]);

  const handleDownloadPdf = async (recordId: string) => {
    if (!userToken) return;

    setDownloadingId(recordId);
    try {
      const res = await fetch(`/api/profile/download-pdf/${recordId}`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });

      if (!res.ok) {
        throw new Error("Erreur lors du téléchargement");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `debrief-${recordId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Download error:", err);
      alert("Erreur lors du téléchargement du PDF");
    } finally {
      setDownloadingId(null);
    }
  };

  const handlePreferenceChange = (jobFamily: string, followed: boolean) => {
    setPreferences((prev) =>
      prev.map((p) => (p.job_family === jobFamily ? { ...p, followed } : p))
    );
    setPrefsChanged(true);
  };

  const handleSelectAll = () => {
    setPreferences((prev) => prev.map((p) => ({ ...p, followed: true })));
    setPrefsChanged(true);
  };

  const handleDeselectAll = () => {
    setPreferences((prev) => prev.map((p) => ({ ...p, followed: false })));
    setPrefsChanged(true);
  };

  const handleSavePreferences = async () => {
    if (!userToken) return;

    setSavingPrefs(true);
    try {
      const res = await fetch("/api/profile/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({ preferences }),
      });

      if (!res.ok) {
        throw new Error("Erreur lors de la sauvegarde");
      }

      setPrefsChanged(false);
      alert("Préférences sauvegardées avec succès");
    } catch (err: any) {
      console.error("Save error:", err);
      alert("Erreur lors de la sauvegarde des préférences");
    } finally {
      setSavingPrefs(false);
    }
  };

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Segoe UI, sans-serif" }}>
        Chargement du profil...
      </main>
    );
  }

  if (!userToken || !userName) {
    return null;
  }

  const gamesPlayed = gameHistory.length;
  const avgScore = gameHistory.length > 0
    ? Math.round(gameHistory.reduce((sum, r) => sum + (r.score || 0), 0) / gameHistory.length)
    : 0;
  const scenariosCompleted = gameHistory.length;
  const memberSince = sessionData?.user?.created_at ? formatDate(sessionData.user.created_at) : "N/A";

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f6f8fc 0%, #eef2f9 100%)",
        padding: "28px 20px 40px",
        fontFamily: "Segoe UI, sans-serif",
        color: "#111",
      }}
    >
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 40,
          }}
        >
          <div>
            <h1 style={{ margin: "0 0 8px", fontSize: 36, fontWeight: 700, color: "#111" }}>
              Mon Profil
            </h1>
            <p style={{ margin: 0, fontSize: 16, color: "#666" }}>
              Bienvenue, {userName}
            </p>
          </div>
          <button
            onClick={() => router.push("/")}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "#fff",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
              color: "#555",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#f9f9f9";
              e.currentTarget.style.borderColor = "#bbb";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#fff";
              e.currentTarget.style.borderColor = "#ddd";
            }}
          >
            Retour à l'accueil
          </button>
        </div>

        {/* Stats Section */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 16,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 14,
              padding: 24,
              boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 32, fontWeight: 700, color: "#5b5fc7", marginBottom: 8 }}>
              {gamesPlayed}
            </div>
            <div style={{ fontSize: 14, color: "#666" }}>Parties jouées</div>
          </div>

          <div
            style={{
              background: "#fff",
              borderRadius: 14,
              padding: 24,
              boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 32, fontWeight: 700, color: "#5b5fc7", marginBottom: 8 }}>
              {avgScore}%
            </div>
            <div style={{ fontSize: 14, color: "#666" }}>Score moyen</div>
          </div>

          <div
            style={{
              background: "#fff",
              borderRadius: 14,
              padding: 24,
              boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 32, fontWeight: 700, color: "#5b5fc7", marginBottom: 8 }}>
              {scenariosCompleted}
            </div>
            <div style={{ fontSize: 14, color: "#666" }}>Scénarios complétés</div>
          </div>

          <div
            style={{
              background: "#fff",
              borderRadius: 14,
              padding: 24,
              boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 14, color: "#666", marginBottom: 8 }}>Membre depuis</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#111" }}>
              {memberSince}
            </div>
          </div>
        </div>

        {/* User Info Section */}
        <div
          style={{
            background: "#fff",
            borderRadius: 14,
            padding: 24,
            boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
            marginBottom: 32,
          }}
        >
          <h2 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 700, color: "#111" }}>
            Informations personnelles
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              <label style={{ display: "block", fontSize: 13, color: "#666", marginBottom: 4 }}>
                Nom
              </label>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#111" }}>
                {userName}
              </p>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 13, color: "#666", marginBottom: 4 }}>
                Email
              </label>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#111" }}>
                {sessionData?.user?.email || "N/A"}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 24,
            borderBottom: "1px solid #ddd",
            marginBottom: 24,
          }}
        >
          <button
            onClick={() => setActiveTab("history")}
            style={{
              padding: "12px 0",
              fontSize: 16,
              fontWeight: activeTab === "history" ? 700 : 500,
              color: activeTab === "history" ? "#5b5fc7" : "#666",
              background: "none",
              border: "none",
              cursor: "pointer",
              borderBottom: activeTab === "history" ? "3px solid #5b5fc7" : "none",
              transition: "all 0.2s",
            }}
          >
            Historique des parties
          </button>
          <button
            onClick={() => setActiveTab("categories")}
            style={{
              padding: "12px 0",
              fontSize: 16,
              fontWeight: activeTab === "categories" ? 700 : 500,
              color: activeTab === "categories" ? "#5b5fc7" : "#666",
              background: "none",
              border: "none",
              cursor: "pointer",
              borderBottom: activeTab === "categories" ? "3px solid #5b5fc7" : "none",
              transition: "all 0.2s",
            }}
          >
            Catégories
          </button>
        </div>

        {/* History Tab */}
        {activeTab === "history" && (
          <div>
            {error && (
              <div
                style={{
                  background: "#fee2e2",
                  border: "1px solid #fca5a5",
                  borderRadius: 8,
                  padding: 16,
                  color: "#991b1b",
                  marginBottom: 16,
                }}
              >
                {error}
              </div>
            )}

            {gameHistory.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "60px 20px",
                  background: "#fff",
                  borderRadius: 14,
                  boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
                }}
              >
                <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
                <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 600, color: "#333" }}>
                  Aucune partie enregistrée
                </h3>
                <p style={{ margin: "0 0 20px", fontSize: 14, color: "#888" }}>
                  Jouez un scénario pour voir votre historique ici.
                </p>
                <button
                  onClick={() => router.push("/")}
                  style={{
                    padding: "12px 24px",
                    background: "#5b5fc7",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  Choisir un scénario
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {gameHistory.map((record) => {
                  const badgeConfig = getEndingBadge(record.ending);
                  const isExpanded = expandedRecordId === record.id;
                  const isDownloading = downloadingId === record.id;

                  return (
                    <div
                      key={record.id}
                      style={{
                        background: "#fff",
                        borderRadius: 14,
                        padding: "20px 24px",
                        boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
                        transition: "box-shadow 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.boxShadow =
                          "0 4px 20px rgba(0,0,0,0.1)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.boxShadow =
                          "0 2px 12px rgba(0,0,0,0.05)";
                      }}
                    >
                      {/* Game header */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 16,
                          marginBottom: isExpanded ? 16 : 0,
                          cursor: "pointer",
                        }}
                        onClick={() =>
                          setExpandedRecordId(isExpanded ? null : record.id)
                        }
                      >
                        <div
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 10,
                            background: badgeConfig.bg,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 24,
                            flexShrink: 0,
                          }}
                        >
                          {badgeConfig.label === "Succès" ? "🎉" : badgeConfig.label === "Succès partiel" ? "⚠️" : "💡"}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h3
                            style={{
                              margin: "0 0 6px",
                              fontSize: 16,
                              fontWeight: 700,
                              color: "#111",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {record.scenarioTitle}
                          </h3>
                          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: badgeConfig.color,
                                background: badgeConfig.bg,
                                padding: "2px 10px",
                                borderRadius: 12,
                              }}
                            >
                              {badgeConfig.label}
                            </span>
                            <span style={{ fontSize: 13, color: "#888" }}>
                              Score : {record.score || 0}%
                            </span>
                            <span style={{ fontSize: 12, color: "#aaa" }}>
                              Durée : {record.duration_minutes || 0} min
                            </span>
                            <span style={{ fontSize: 12, color: "#aaa" }}>
                              {formatDate(record.date)}
                            </span>
                          </div>
                        </div>

                        <span
                          style={{
                            fontSize: 20,
                            color: "#bbb",
                            transition: "transform 0.2s",
                            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                          }}
                        >
                          ▼
                        </span>
                      </div>

                      {/* Expandable debrief */}
                      {isExpanded && (
                        <div
                          style={{
                            borderTop: "1px solid #eee",
                            paddingTop: 16,
                            display: "flex",
                            flexDirection: "column",
                            gap: 16,
                          }}
                        >
                          {record.debrief?.phases && record.debrief.phases.length > 0 && (
                            <div>
                              <h4
                                style={{
                                  margin: "0 0 12px",
                                  fontSize: 14,
                                  fontWeight: 600,
                                  color: "#333",
                                }}
                              >
                                Phases
                              </h4>
                              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {record.debrief.phases.map((phase, idx) => (
                                  <div
                                    key={idx}
                                    style={{
                                      padding: 12,
                                      background: "#f9f9f9",
                                      borderRadius: 8,
                                      fontSize: 13,
                                      color: "#555",
                                    }}
                                  >
                                    <strong>{phase.title}</strong>: {phase.evaluation}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {record.debrief?.competencies &&
                            Object.keys(record.debrief.competencies).length > 0 && (
                              <div>
                                <h4
                                  style={{
                                    margin: "0 0 12px",
                                    fontSize: 14,
                                    fontWeight: 600,
                                    color: "#333",
                                  }}
                                >
                                  Compétences évaluées
                                </h4>
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                                    gap: 8,
                                  }}
                                >
                                  {Object.entries(record.debrief.competencies).map(
                                    ([name, score]) => (
                                      <div
                                        key={name}
                                        style={{
                                          padding: 12,
                                          background: "#f9f9f9",
                                          borderRadius: 8,
                                          fontSize: 13,
                                        }}
                                      >
                                        <div
                                          style={{
                                            fontWeight: 600,
                                            color: "#333",
                                            marginBottom: 4,
                                          }}
                                        >
                                          {name}
                                        </div>
                                        <div
                                          style={{
                                            width: "100%",
                                            height: 6,
                                            background: "#e0e0e0",
                                            borderRadius: 3,
                                            overflow: "hidden",
                                          }}
                                        >
                                          <div
                                            style={{
                                              height: "100%",
                                              width: `${(score as number) * 100}%`,
                                              background: "#5b5fc7",
                                              transition: "width 0.3s",
                                            }}
                                          />
                                        </div>
                                        <div
                                          style={{
                                            marginTop: 4,
                                            fontSize: 11,
                                            color: "#999",
                                          }}
                                        >
                                          {Math.round((score as number) * 100)}%
                                        </div>
                                      </div>
                                    )
                                  )}
                                </div>
                              </div>
                            )}

                          <button
                            onClick={() => handleDownloadPdf(record.id)}
                            disabled={isDownloading}
                            style={{
                              padding: "10px 16px",
                              background: isDownloading ? "#e0e0e0" : "#5b5fc7",
                              color: isDownloading ? "#999" : "#fff",
                              border: "none",
                              borderRadius: 8,
                              cursor: isDownloading ? "not-allowed" : "pointer",
                              fontWeight: 600,
                              fontSize: 13,
                              alignSelf: "flex-start",
                              transition: "all 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              if (!isDownloading) {
                                e.currentTarget.style.background = "#4a4aaa";
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isDownloading) {
                                e.currentTarget.style.background = "#5b5fc7";
                              }
                            }}
                          >
                            {isDownloading ? "Téléchargement..." : "Télécharger le débrief PDF"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Categories Tab */}
        {activeTab === "categories" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 14, color: "#666", marginBottom: 16 }}>
                Sélectionnez les catégories de scénarios qui vous intéressent. Elles apparaîtront en
                avant sur la page d'accueil.
              </p>

              <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                <button
                  onClick={handleSelectAll}
                  style={{
                    padding: "8px 16px",
                    background: "#fff",
                    color: "#5b5fc7",
                    border: "1px solid #5b5fc7",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#f0f0ff";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#fff";
                  }}
                >
                  Tout sélectionner
                </button>
                <button
                  onClick={handleDeselectAll}
                  style={{
                    padding: "8px 16px",
                    background: "#fff",
                    color: "#666",
                    border: "1px solid #ddd",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#f9f9f9";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#fff";
                  }}
                >
                  Tout désélectionner
                </button>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 16,
                marginBottom: 24,
              }}
            >
              {preferences.map((pref) => (
                <label
                  key={pref.job_family}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: 16,
                    background: "#fff",
                    borderRadius: 12,
                    border: pref.followed ? "2px solid #5b5fc7" : "1px solid #ddd",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLLabelElement).style.boxShadow =
                      "0 4px 12px rgba(0,0,0,0.08)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLLabelElement).style.boxShadow = "none";
                  }}
                >
                  <input
                    type="checkbox"
                    checked={pref.followed}
                    onChange={(e) => handlePreferenceChange(pref.job_family, e.target.checked)}
                    style={{
                      width: 20,
                      height: 20,
                      cursor: "pointer",
                      accentColor: "#5b5fc7",
                    }}
                  />
                  <span style={{ fontSize: 15, fontWeight: 500, color: "#111", flex: 1 }}>
                    {formatJobFamily(pref.job_family)}
                  </span>
                </label>
              ))}
            </div>

            <button
              onClick={handleSavePreferences}
              disabled={!prefsChanged || savingPrefs}
              style={{
                padding: "12px 32px",
                background: !prefsChanged ? "#e0e0e0" : "#5b5fc7",
                color: !prefsChanged ? "#999" : "#fff",
                border: "none",
                borderRadius: 8,
                cursor: !prefsChanged || savingPrefs ? "not-allowed" : "pointer",
                fontWeight: 600,
                fontSize: 14,
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                if (prefsChanged && !savingPrefs) {
                  e.currentTarget.style.background = "#4a4aaa";
                }
              }}
              onMouseLeave={(e) => {
                if (prefsChanged && !savingPrefs) {
                  e.currentTarget.style.background = "#5b5fc7";
                }
              }}
            >
              {savingPrefs ? "Sauvegarde en cours..." : "Enregistrer les préférences"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
