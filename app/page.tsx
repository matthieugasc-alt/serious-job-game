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

interface ScenarioConfig {
  scenarioId: string;
  adminLocked?: boolean;
  lockMessage?: string;
  prerequisites?: string[];
}

interface UserPreference {
  job_family: string;
  followed: boolean;
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
  isLocked,
  lockReason,
  isCompleted,
}: {
  scenario: Scenario;
  onClick: () => void;
  isLocked?: boolean;
  lockReason?: string;
  isCompleted?: boolean;
}) {
  return (
    <div
      onClick={!isLocked ? onClick : undefined}
      style={{
        border: "1px solid #ddd",
        borderRadius: 18,
        padding: 24,
        background: isLocked ? "#f5f5f5" : "#fff",
        boxShadow: "0 8px 24px rgba(0,0,0,0.05)",
        cursor: isLocked ? "not-allowed" : "pointer",
        transition: "all 0.3s ease",
        display: "flex",
        flexDirection: "column",
        opacity: isLocked ? 0.6 : 1,
        position: "relative",
      }}
      onMouseEnter={(e) => {
        if (!isLocked) {
          (e.currentTarget as HTMLDivElement).style.boxShadow =
            "0 12px 32px rgba(0,0,0,0.12)";
          (e.currentTarget as HTMLDivElement).style.transform = "translateY(-4px)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isLocked) {
          (e.currentTarget as HTMLDivElement).style.boxShadow =
            "0 8px 24px rgba(0,0,0,0.05)";
          (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
        }
      }}
    >
      {isLocked && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(255,255,255,0.7)",
            borderRadius: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 12,
            zIndex: 10,
          }}
        >
          <div style={{ fontSize: 32 }}>🔒</div>
          <div style={{ textAlign: "center", fontSize: 13, color: "#666", fontWeight: 500 }}>
            {lockReason || "Verrouillé"}
          </div>
        </div>
      )}

      {isCompleted && !isLocked && (
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            width: 32,
            height: 32,
            background: "#dcfce7",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            zIndex: 5,
          }}
        >
          ✅
        </div>
      )}

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
  const [configs, setConfigs] = useState<Record<string, ScenarioConfig>>({});
  const [completedScenarios, setCompletedScenarios] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userToken, setUserToken] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [allCategories, setAllCategories] = useState<string[]>([]);

  useEffect(() => {
    // Check auth token and user name from localStorage
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("auth_token");
      const name = localStorage.getItem("user_name");
      const role = localStorage.getItem("user_role");
      if (role) setUserRole(role);
      if (token) setUserToken(token);
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
    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch scenarios
        const scenariosRes = await fetch("/api/scenarios");
        if (!scenariosRes.ok) throw new Error("Failed to fetch scenarios");
        const scenariosData = await scenariosRes.json();
        const loadedScenarios = scenariosData.scenarios || [];
        setScenarios(loadedScenarios);

        // Extract unique categories
        const categories: string[] = Array.from(
          new Set<string>(
            loadedScenarios
              .map((s: Scenario) => s.job_family)
              .filter((f: string | undefined): f is string => Boolean(f))
          )
        ).sort();
        setAllCategories(categories);
        setSelectedCategories(new Set<string>(categories));

        // Fetch scenario configs
        try {
          const configsRes = await fetch("/api/admin/scenario-config");
          if (configsRes.ok) {
            const configsData = await configsRes.json();
            const configMap: Record<string, ScenarioConfig> = {};
            (configsData.configs || []).forEach((cfg: ScenarioConfig) => {
              configMap[cfg.scenarioId] = cfg;
            });
            setConfigs(configMap);
          }
        } catch (err) {
          console.error("Failed to fetch configs:", err);
        }

        // If logged in, fetch user preferences and completed scenarios
        if (userToken) {
          try {
            const prefsRes = await fetch("/api/profile/preferences", {
              headers: { Authorization: `Bearer ${userToken}` },
            });
            if (prefsRes.ok) {
              const prefsData = await prefsRes.json();
              const selectedCats = new Set<string>(
                (prefsData.preferences || [])
                  .filter((p: UserPreference) => p.followed)
                  .map((p: UserPreference) => p.job_family)
              );
              if (selectedCats.size > 0) {
                setSelectedCategories(selectedCats);
              }
            }
          } catch (err) {
            console.error("Failed to fetch preferences:", err);
          }

          try {
            const historyRes = await fetch("/api/profile/history", {
              headers: { Authorization: `Bearer ${userToken}` },
            });
            if (historyRes.ok) {
              const historyData = await historyRes.json();
              const completed = new Set<string>(
                (historyData.records || []).map((r: any) => r.scenarioId as string)
              );
              setCompletedScenarios(completed);
            }
          } catch (err) {
            console.error("Failed to fetch history:", err);
          }
        }
      } catch (err) {
        console.error(err);
        setError("Impossible de charger les scénarios");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userToken]);

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
                    onClick={() => router.push("/profile")}
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
                    Mon profil
                  </button>
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

        {/* Category Filters */}
        {!loading && scenarios.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
              Filtrer par catégorie:
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {allCategories.map((category) => (
                <button
                  key={category}
                  onClick={() => {
                    const newSelected = new Set(selectedCategories);
                    if (newSelected.has(category)) {
                      newSelected.delete(category);
                    } else {
                      newSelected.add(category);
                    }
                    setSelectedCategories(newSelected);
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 20,
                    border: selectedCategories.has(category) ? "2px solid #5b5fc7" : "1px solid #ddd",
                    background: selectedCategories.has(category) ? "#f0f0ff" : "#fff",
                    color: selectedCategories.has(category) ? "#5b5fc7" : "#666",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 500,
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (!selectedCategories.has(category)) {
                      e.currentTarget.style.borderColor = "#5b5fc7";
                      e.currentTarget.style.color = "#5b5fc7";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!selectedCategories.has(category)) {
                      e.currentTarget.style.borderColor = "#ddd";
                      e.currentTarget.style.color = "#666";
                    }
                  }}
                >
                  {formatJobFamily(category)}
                </button>
              ))}
            </div>
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
            // Filter scenarios by selected categories
            const filteredScenarios = scenarios.filter((s) =>
              selectedCategories.has(s.job_family || "autre")
            );

            // Group scenarios by job_family
            const groups: Record<string, Scenario[]> = {};
            for (const s of filteredScenarios) {
              const key = s.job_family || "autre";
              if (!groups[key]) groups[key] = [];
              groups[key].push(s);
            }
            const sortedKeys = Object.keys(groups).sort();

            if (sortedKeys.length === 0) {
              return (
                <div style={{ textAlign: "center", padding: "60px 20px" }}>
                  <p style={{ fontSize: 16, color: "#666" }}>Aucun scénario dans cette catégorie</p>
                </div>
              );
            }

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
                      {groups[familyKey].map((scenario) => {
                        const config = configs[scenario.scenario_id];
                        const isAdminLocked = config?.adminLocked;
                        const prerequisites = config?.prerequisites || [];
                        const completedPrerequisites = prerequisites.filter((prereqId) =>
                          completedScenarios.has(prereqId)
                        );
                        const allPrerequisitesMet =
                          prerequisites.length === 0 ||
                          completedPrerequisites.length === prerequisites.length;

                        let lockReason = "";
                        let isLocked = false;

                        if (isAdminLocked) {
                          isLocked = true;
                          lockReason =
                            config.lockMessage || "🔧 En cours de développement";
                        } else if (!allPrerequisitesMet) {
                          isLocked = true;
                          const missingIds = prerequisites.filter(
                            (id) => !completedScenarios.has(id)
                          );
                          const missingTitles = missingIds
                            .map((id) => {
                              const s = scenarios.find((sc) => sc.scenario_id === id);
                              return s?.title || id;
                            })
                            .join(", ");
                          lockReason = `Complétez d'abord: ${missingTitles}`;
                        }

                        return (
                          <ScenarioCard
                            key={scenario.id}
                            scenario={scenario}
                            onClick={() => handleSelectScenario(scenario.id)}
                            isLocked={isLocked}
                            lockReason={lockReason}
                            isCompleted={completedScenarios.has(scenario.scenario_id)}
                          />
                        );
                      })}
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
