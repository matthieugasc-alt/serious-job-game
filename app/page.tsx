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
  is_teaser?: boolean;
  teaser_banner?: string;
  status?: 'active' | 'maintenance';
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

/** Normalize a job_family value to a canonical slug for grouping.
 *  Handles both slugs ("assistant_cooperation_internationale")
 *  and freeform labels ("Assistant.e de coopération internationale").  */
function normalizeJobFamily(raw: string): string {
  const s = raw
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[·.\-]/g, "")                           // strip middot, dot, dash
    .replace(/\s+/g, "_")                              // spaces → underscores
    .replace(/[^a-z0-9_]/g, "")                        // keep only alnum + _
    .replace(/_+/g, "_")                               // collapse double _
    .replace(/^_|_$/g, "");                            // trim leading/trailing _

  // Merge known variants
  if (s.includes("assistant") && s.includes("cooperation")) return "assistant_cooperation_internationale";
  if (s.includes("attache") && s.includes("parlementaire")) return "attache_parlementaire";
  if (s.includes("chef") && s.includes("produit")) return "chef_de_produit";
  if (s.includes("enseignant")) return "enseignant";
  if (s.includes("immobilier")) return "immobilier";

  return s;
}

/** Format job_family slug into readable label */
function formatJobFamily(slug: string): string {
  const map: Record<string, string> = {
    assistant_cooperation_internationale: "Assistant·e de coopération internationale",
    attache_parlementaire: "Attaché·e parlementaire",
    chef_de_produit: "Chef·fe de produit",
    enseignant: "Enseignant·e",
    immobilier: "Agent immobilier",
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
  const isTeaser = !!scenario.is_teaser;
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
            background: isTeaser ? "rgba(255,171,64,0.18)" : "rgba(255,255,255,0.7)",
            borderRadius: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 12,
            zIndex: 10,
            border: isTeaser ? "2px dashed #ffab40" : undefined,
          }}
        >
          <div style={{ fontSize: 32 }}>{isTeaser ? "🚧" : "🔒"}</div>
          <div
            style={{
              textAlign: "center",
              fontSize: 13,
              color: isTeaser ? "#b45309" : "#666",
              fontWeight: 700,
              textTransform: isTeaser ? "uppercase" : "none",
              letterSpacing: isTeaser ? 0.5 : 0,
              padding: "0 16px",
            }}
          >
            {lockReason || (isTeaser ? "En cours d'implémentation" : "Verrouillé")}
          </div>
          {isTeaser && (
            <div style={{ fontSize: 11, color: "#92400e", fontStyle: "italic" }}>
              Aperçu — non jouable
            </div>
          )}
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
        title={scenario.description || ""}
        style={{
          margin: "0 0 12px 0",
          fontSize: 15,
          lineHeight: 1.5,
          color: "#333",
          flex: 1,
          display: "-webkit-box",
          WebkitLineClamp: 4,
          WebkitBoxOrient: "vertical" as const,
          overflow: "hidden",
          textOverflow: "ellipsis",
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
  const [founderCompletedIds, setFounderCompletedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userToken, setUserToken] = useState<string | null>(null);
  const [founderAccess, setFounderAccess] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [mySpaces, setMySpaces] = useState<Array<{
    organizationId: string;
    organizationName: string;
    orgType: string;
    role: string;
  }>>([]);

  useEffect(() => {
    // Check auth token and user name from localStorage
    if (typeof window !== "undefined") {
      // Clear org context when on homepage (personal space)
      localStorage.removeItem("active_org_id");
      const token = localStorage.getItem("auth_token");
      const name = localStorage.getItem("user_name");
      const role = localStorage.getItem("user_role");
      const fAccess = localStorage.getItem("founder_access");
      if (role) setUserRole(role);
      if (token) setUserToken(token);
      if (fAccess === "true" || role === "super_admin" || role === "admin") setFounderAccess(true);
      if (name && name !== "undefined" && name.trim() !== "") {
        setUserName(name);
      } else if (token) {
        // Token exists but name is missing — fetch it from the server instead of logging out
        fetch("/api/auth/session", {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((r) => r.ok ? r.json() : null)
          .then((data) => {
            if (data?.user?.name) {
              setUserName(data.user.name);
              localStorage.setItem("user_name", data.user.name);
              if (data.user.role) localStorage.setItem("user_role", data.user.role);
              if (data.user.founderAccess) localStorage.setItem("founder_access", "true");
            }
          })
          .catch(() => {});
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

        // Extract unique categories (normalized)
        const categories: string[] = Array.from(
          new Set<string>(
            loadedScenarios
              .map((s: Scenario) => normalizeJobFamily(s.job_family || "autre"))
              .filter((f: string) => Boolean(f))
          )
        ).sort();
        setAllCategories(categories);
        setSelectedCategories(new Set<string>(categories));

        // Fetch scenario configs
        try {
          const configsRes = await fetch("/api/admin/scenario-config", { cache: "no-store" });
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
                  .map((p: UserPreference) => normalizeJobFamily(p.job_family))
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

          // Fetch Founder campaign to know which founder scenarios are unlocked for classic mode
          try {
            const founderRes = await fetch("/api/founder/campaigns", {
              headers: { Authorization: `Bearer ${userToken}` },
            });
            if (founderRes.ok) {
              const founderData = await founderRes.json();
              const campaigns = founderData.campaigns || (founderData.campaign ? [founderData.campaign] : []);
              const ids = new Set<string>();
              for (const camp of campaigns) {
                for (const cs of camp.completedScenarios || []) {
                  ids.add(cs.scenarioId);
                }
              }
              setFounderCompletedIds(ids);
            }
          } catch (err) {
            // Non-blocking: if no campaign exists, founder scenarios stay locked
          }

          // Fetch user capabilities/memberships for space selector
          try {
            const capRes = await fetch("/api/capabilities", {
              headers: { Authorization: `Bearer ${userToken}` },
            });
            if (capRes.ok) {
              const capData = await capRes.json();
              setMySpaces(capData.memberships || []);
            }
          } catch (err) {
            console.error("Failed to fetch capabilities:", err);
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
        {userRole === "super_admin" && (
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

        {/* Founder Mode Entry — only visible if admin granted founderAccess */}
        {userName && founderAccess && (
          <div
            onClick={async () => {
              const token = localStorage.getItem("auth_token");
              if (!token) {
                router.push("/login?redirect=/founder/intro");
                return;
              }
              try {
                const res = await fetch("/api/founder/campaigns", {
                  headers: { Authorization: `Bearer ${token}` },
                });
                const data = await res.json();
                const active = (data.campaigns || []).find(
                  (c: any) => c.status !== "completed"
                );
                if (active) {
                  router.push(`/founder/${active.id}`);
                } else {
                  router.push("/founder/intro");
                }
              } catch {
                router.push("/founder/intro");
              }
            }}
            style={{
              marginBottom: 24,
              padding: "18px 24px",
              borderRadius: 14,
              background: "linear-gradient(135deg, #0f0f1e 0%, #161633 50%, #1a1a3e 100%)",
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              transition: "transform 0.2s, box-shadow 0.2s",
              boxShadow: "0 4px 16px rgba(91,95,199,0.15)",
              border: "1px solid rgba(91,95,199,0.2)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
              (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 28px rgba(91,95,199,0.25)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
              (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(91,95,199,0.15)";
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #5b5fc7, #7c7fff)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                fontWeight: 800,
                color: "#fff",
                boxShadow: "0 0 12px rgba(91,95,199,0.3)",
              }}>
                F
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Startup Founder Mode</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
                  Lance ta startup. 7 décisions. 18 mois simulés.
                </div>
              </div>
            </div>
            <span style={{ fontSize: 20, opacity: 0.5, color: "#a5a8ff" }}>→</span>
          </div>
        )}

        {/* My Spaces */}
        {mySpaces.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 13, color: "#666", marginBottom: 10, fontWeight: 600 }}>
              Mes espaces
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {mySpaces.map((space) => (
                <div
                  key={space.organizationId}
                  onClick={() =>
                    router.push(
                      space.orgType === "enterprise"
                        ? `/enterprise/${space.organizationId}`
                        : `/coach/${space.organizationId}`
                    )
                  }
                  style={{
                    padding: "14px 20px",
                    borderRadius: 14,
                    background: space.orgType === "enterprise"
                      ? "linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)"
                      : "linear-gradient(135deg, #6d28d9 0%, #8b5cf6 100%)",
                    color: "#fff",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    transition: "transform 0.2s, box-shadow 0.2s",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    minWidth: 200,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
                    (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 20px rgba(0,0,0,0.2)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                    (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
                  }}
                >
                  <span style={{ fontSize: 22 }}>
                    {space.orgType === "enterprise" ? "🏢" : "🎓"}
                  </span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{space.organizationName}</div>
                    <div style={{ fontSize: 11, opacity: 0.8 }}>
                      {space.orgType === "enterprise" ? "Espace entreprise" : "Espace coaching"}
                      {space.role === "admin" ? " · Admin" : ""}
                    </div>
                  </div>
                  <span style={{ marginLeft: "auto", fontSize: 16, opacity: 0.7 }}>→</span>
                </div>
              ))}
            </div>
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
            // Filter scenarios by selected categories (normalized)
            const filteredScenarios = scenarios.filter((s) =>
              selectedCategories.has(normalizeJobFamily(s.job_family || "autre"))
            );

            // Group scenarios by normalized job_family
            const groups: Record<string, Scenario[]> = {};
            for (const s of filteredScenarios) {
              const key = normalizeJobFamily(s.job_family || "autre");
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

                        const isFounderScenario = (scenario.job_family || "") === "founder";
                        const isFounderUnlocked = founderCompletedIds.has(scenario.scenario_id);

                        let lockReason = "";
                        let isLocked = false;

                        if (scenario.is_teaser) {
                          isLocked = true;
                          lockReason =
                            scenario.teaser_banner || "🚧 En cours d'implémentation";
                        } else if (scenario.status === "maintenance" && userRole !== "super_admin") {
                          isLocked = true;
                          lockReason = "🔧 Maintenance — scénario en cours de refonte";
                        } else if (isFounderScenario && !isFounderUnlocked) {
                          // Founder scenarios locked until completed in Founder mode
                          isLocked = true;
                          lockReason = "🔒 Complétez ce scénario en Founder Mode pour le débloquer";
                        } else if (isAdminLocked) {
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
