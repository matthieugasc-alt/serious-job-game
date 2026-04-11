"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Scenario {
  id: string;
  scenario_id: string;
  title: string;
  subtitle: string;
  difficulty: string;
  estimated_duration_min: number;
  description?: string;
  tags?: string[];
  job_family?: string;
}

function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const bgColor =
    difficulty === "junior"
      ? "#e0f2fe"
      : difficulty === "intermediate"
        ? "#fef3c7"
        : "#fecaca";
  const textColor =
    difficulty === "junior"
      ? "#0369a1"
      : difficulty === "intermediate"
        ? "#b45309"
        : "#991b1b";

  return (
    <span
      style={{
        display: "inline-block",
        padding: "6px 12px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        backgroundColor: bgColor,
        color: textColor,
        textTransform: "capitalize",
      }}
    >
      {difficulty}
    </span>
  );
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
  // Fallback: replace underscores, capitalize first letter
  return slug
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

function ScenarioCard({
  scenario,
  onClick,
}: {
  scenario: Scenario;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        border: "1px solid #ddd",
        borderRadius: 18,
        padding: 24,
        background: "#fff",
        boxShadow: "0 8px 24px rgba(0,0,0,0.05)",
        cursor: "pointer",
        transition: "all 0.3s ease",
        display: "flex",
        flexDirection: "column",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          "0 12px 32px rgba(0,0,0,0.12)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-4px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          "0 8px 24px rgba(0,0,0,0.05)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <h3
          style={{
            margin: "0 0 8px 0",
            fontSize: 20,
            fontWeight: 700,
            color: "#111",
          }}
        >
          {scenario.title}
        </h3>
        <p
          style={{
            margin: "0 0 12px 0",
            fontSize: 14,
            color: "#666",
          }}
        >
          {scenario.subtitle}
        </p>
      </div>

      <div style={{ marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <DifficultyBadge difficulty={scenario.difficulty} />
        <span
          style={{
            display: "inline-block",
            padding: "6px 12px",
            borderRadius: 6,
            fontSize: 12,
            backgroundColor: "#f3f4f6",
            color: "#555",
          }}
        >
          ⏱ {scenario.estimated_duration_min}min
        </span>
      </div>

      <p
        style={{
          margin: "0 0 12px 0",
          fontSize: 15,
          lineHeight: 1.5,
          color: "#333",
          flex: 1,
        }}
      >
        {scenario.description || "Scenario description"}
      </p>

      {scenario.tags && scenario.tags.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {scenario.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              style={{
                padding: "4px 10px",
                borderRadius: 4,
                fontSize: 12,
                backgroundColor: "#f0f0f0",
                color: "#666",
              }}
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ScenarioSelectionPage() {
  const router = useRouter();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    // Check auth token and user name from localStorage
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("auth_token");
      const name = localStorage.getItem("user_name");
      const role = localStorage.getItem("user_role");
      if (role) setUserRole(role);
      if (name && name !== "undefined" && name.trim() !== "") {
        setUserName(name);
      } else if (token) {
        // Token exists but name is broken — clean up and force re-login
        localStorage.removeItem("auth_token");
        localStorage.removeItem("user_name");
      }
    }
  }, []);

  useEffect(() => {
    const fetchScenarios = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/scenarios");
        if (!response.ok) throw new Error("Failed to fetch scenarios");
        const data = await response.json();
        setScenarios(data.scenarios || []);
      } catch (err) {
        console.error(err);
        setError("Impossible de charger les scénarios");
      } finally {
        setLoading(false);
      }
    };

    fetchScenarios();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("user_name");
    localStorage.removeItem("user_role");
    setUserName(null);
    setUserRole(null);
  };

  const handleSelectScenario = (scenarioId: string) => {
    router.push(`/scenarios/${scenarioId}`);
  };

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
      <div
        style={{
          maxWidth: 1120,
          margin: "0 auto",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 40,
          }}
        >
          <div>
            <h1
              style={{
                margin: "0 0 8px 0",
                fontSize: 36,
                fontWeight: 700,
                color: "#111",
              }}
            >
              Serious Job Game
            </h1>
            <p style={{ margin: 0, fontSize: 16, color: "#666" }}>
              Sélectionnez un scénario pour commencer
            </p>
          </div>

          <div style={{ textAlign: "right" }}>
            {userName ? (
              <div>
                <p style={{ margin: "0 0 12px 0", fontSize: 14, color: "#666" }}>
                  Connecté en tant que <strong>{userName}</strong>
                </p>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => router.push("/history")}
                    style={{
                      padding: "10px 20px",
                      borderRadius: 8,
                      border: "1px solid #ddd",
                      background: "#fff",
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: 500,
                      color: "#5b5fc7",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#f0f0ff";
                      e.currentTarget.style.borderColor = "#5b5fc7";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#fff";
                      e.currentTarget.style.borderColor = "#ddd";
                    }}
                  >
                    Historique
                  </button>
                  <button
                    onClick={handleLogout}
                    style={{
                      padding: "10px 20px",
                      borderRadius: 8,
                      border: "1px solid #ddd",
                      background: "#fff",
                      cursor: "pointer",
                      fontSize: 14,
                      fontWeight: 500,
                      color: "#111",
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
                    Déconnexion
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => router.push("/login")}
                style={{
                  padding: "10px 20px",
                  borderRadius: 8,
                  border: "none",
                  background: "#5b5fc7",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "#fff",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#4a4aaa";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#5b5fc7";
                }}
              >
                Se connecter
              </button>
            )}
          </div>
        </div>

        {/* Admin Banner */}
        {userRole === "admin" && (
          <div
            onClick={() => router.push("/admin")}
            style={{
              marginBottom: 24,
              padding: "16px 24px",
              borderRadius: 12,
              background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              transition: "transform 0.2s, box-shadow 0.2s",
              boxShadow: "0 4px 16px rgba(26, 26, 46, 0.3)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
              (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 24px rgba(26, 26, 46, 0.4)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
              (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(26, 26, 46, 0.3)";
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontSize: 24 }}>⚙️</span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Espace Administrateur</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
                  Creer et gerer vos scenarios
                </div>
              </div>
            </div>
            <span style={{ fontSize: 20, opacity: 0.6 }}>→</span>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <p style={{ fontSize: 16, color: "#666" }}>Chargement des scénarios...</p>
          </div>
        ) : error ? (
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
            {error}
          </div>
        ) : scenarios.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <p style={{ fontSize: 16, color: "#666" }}>Aucun scénario disponible</p>
          </div>
        ) : (
          (() => {
            // Group scenarios by job_family
            const groups: Record<string, Scenario[]> = {};
            for (const s of scenarios) {
              const key = s.job_family || "autre";
              if (!groups[key]) groups[key] = [];
              groups[key].push(s);
            }
            const sortedKeys = Object.keys(groups).sort();

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
                {sortedKeys.map((familyKey) => (
                  <section key={familyKey}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        marginBottom: 20,
                      }}
                    >
                      <h2
                        style={{
                          margin: 0,
                          fontSize: 22,
                          fontWeight: 700,
                          color: "#1a3c6e",
                        }}
                      >
                        {formatJobFamily(familyKey)}
                      </h2>
                      <span
                        style={{
                          padding: "4px 10px",
                          borderRadius: 12,
                          fontSize: 12,
                          fontWeight: 600,
                          backgroundColor: "#e8ecf4",
                          color: "#5b5fc7",
                        }}
                      >
                        {groups[familyKey].length} scénario{groups[familyKey].length > 1 ? "s" : ""}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                        gap: 24,
                      }}
                    >
                      {groups[familyKey].map((scenario) => (
                        <ScenarioCard
                          key={scenario.id}
                          scenario={scenario}
                          onClick={() => handleSelectScenario(scenario.id)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            );
          })()
        )}
      </div>
    </main>
  );
}
