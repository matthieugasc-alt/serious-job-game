"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

interface SessionData {
  user: { id: string; email: string; name: string; created_at: string };
}

interface GameRecord {
  id: string;
  scenarioId: string;
  scenarioTitle: string;
  date: string;
  ending: "success" | "partial_success" | "failure";
  avgScore: number;
  durationMin: number;
  phasesCompleted: number;
  totalPhases: number;
  jobFamily?: string;
  difficulty?: string;
  extractedSkills?: Array<{ skill: string; level: string; evidence: string }>;
  debrief?: any;
}

interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastPlayedDate: string | null;
}

interface JobFamilyStats {
  jobFamily: string;
  scenariosCompleted: number;
  avgScore: number;
  bestScore: number;
  totalTimePlayed: number;
  completedScenarioIds: string[];
  difficulties: Record<string, number>;
}

interface AggregatedSkill {
  skill: string;
  level: "acquise" | "en_cours" | "a_travailler";
  occurrences: number;
  latestEvidence: string;
  scenarioTitles: string[];
}

interface Scenario {
  id: string;
  job_family?: string;
  title: string;
  difficulty?: string;
}

interface ScenarioConfig {
  scenarioId: string;
  adminLocked?: boolean;
  prerequisites?: string[];
  category?: string;
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function formatJobFamily(slug: string): string {
  const map: Record<string, string> = {
    assistant_cooperation_internationale: "Coopération internationale",
    management: "Management",
    ressources_humaines: "Ressources humaines",
    commercial: "Commercial",
    communication: "Communication",
    juridique: "Juridique",
    finance: "Finance",
    formation: "Formation",
    non_classé: "Non classé",
  };
  return map[slug] || slug.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  } catch { return iso; }
}

function getEndingBadge(ending: string) {
  const c: Record<string, { label: string; color: string; bg: string; icon: string }> = {
    success: { label: "Succès", color: "#16a34a", bg: "#dcfce7", icon: "🎉" },
    partial_success: { label: "Succès partiel", color: "#d97706", bg: "#fef3c7", icon: "⚠️" },
    failure: { label: "À retravailler", color: "#dc2626", bg: "#fee2e2", icon: "💡" },
  };
  return c[ending] || c.failure;
}

function getDifficultyLabel(d?: string) {
  if (d === "senior") return { label: "Senior", color: "#9333ea", bg: "#f3e8ff" };
  if (d === "intermediate") return { label: "Intermédiaire", color: "#2563eb", bg: "#dbeafe" };
  return { label: "Junior", color: "#16a34a", bg: "#dcfce7" };
}

function getSkillLevelConfig(level: string) {
  if (level === "acquise") return { label: "Acquise", color: "#16a34a", bg: "#dcfce7", icon: "✅", pct: 100 };
  if (level === "en_cours") return { label: "En cours", color: "#d97706", bg: "#fef3c7", icon: "🔄", pct: 60 };
  return { label: "À travailler", color: "#dc2626", bg: "#fee2e2", icon: "📌", pct: 25 };
}

// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function ProfilePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"overview" | "skills" | "history" | "categories">("overview");
  const [userToken, setUserToken] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [gameHistory, setGameHistory] = useState<GameRecord[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenarioConfigs, setScenarioConfigs] = useState<ScenarioConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Stats
  const [streak, setStreak] = useState<StreakData>({ currentStreak: 0, longestStreak: 0, lastPlayedDate: null });
  const [jobFamilyStats, setJobFamilyStats] = useState<JobFamilyStats[]>([]);
  const [skills, setSkills] = useState<AggregatedSkill[]>([]);
  const [completedScenarioIds, setCompletedScenarioIds] = useState<string[]>([]);
  const [totalPlayTime, setTotalPlayTime] = useState(0);
  const [successRate, setSuccessRate] = useState(0);
  const [gamesPlayed, setGamesPlayed] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem("auth_token");
        const name = localStorage.getItem("user_name");
        if (!token || !name) { router.push("/login"); return; }
        setUserToken(token);
        setUserName(name);

        const headers = { Authorization: `Bearer ${token}` };

        // Parallel fetches
        const [sessionRes, historyRes, statsRes, scenariosRes, configsRes] = await Promise.all([
          fetch("/api/auth/session", { headers }),
          fetch("/api/profile/history", { headers }),
          fetch("/api/profile/stats", { headers }),
          fetch("/api/scenarios"),
          fetch("/api/admin/scenario-config"),
        ]);

        if (sessionRes.ok) setSessionData(await sessionRes.json());
        if (historyRes.ok) { const d = await historyRes.json(); setGameHistory(d.records || []); }
        if (statsRes.ok) {
          const d = await statsRes.json();
          setStreak(d.streak || { currentStreak: 0, longestStreak: 0, lastPlayedDate: null });
          setJobFamilyStats(d.jobFamilyStats || []);
          setSkills(d.skills || []);
          setCompletedScenarioIds(d.completedScenarioIds || []);
          setTotalPlayTime(d.totalPlayTime || 0);
          setSuccessRate(d.successRate || 0);
          setGamesPlayed(d.gamesPlayed || 0);
        }
        if (scenariosRes.ok) { const d = await scenariosRes.json(); setScenarios(d.scenarios || []); }
        if (configsRes.ok) { const d = await configsRes.json(); setScenarioConfigs(d.configs || []); }
      } catch (err) {
        console.error("Error loading profile:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  const handleDownloadPdf = async (recordId: string) => {
    if (!userToken) return;
    setDownloadingId(recordId);
    try {
      const res = await fetch(`/api/profile/download-pdf/${recordId}`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      if (!res.ok) throw new Error("Erreur");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `debrief-${recordId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { alert("Erreur lors du téléchargement du PDF"); }
    finally { setDownloadingId(null); }
  };

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Segoe UI, sans-serif", background: "#f6f8fc" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 40, height: 40, border: "3px solid #e0e0e0", borderTopColor: "#5b5fc7", borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto 16px" }} />
          <p style={{ color: "#666" }}>Chargement du profil...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </main>
    );
  }

  // ── Suggested next scenarios ──
  const suggestedScenarios = scenarios.filter((s) => {
    if (completedScenarioIds.includes(s.id)) return false;
    const config = scenarioConfigs.find((c) => c.scenarioId === s.id);
    if (config?.adminLocked) return false;
    if (config?.prerequisites?.length) {
      const met = config.prerequisites.every((p) => completedScenarioIds.includes(p));
      if (!met) return false;
    }
    return true;
  }).slice(0, 3);

  const memberSince = sessionData?.user?.created_at ? formatDate(sessionData.user.created_at) : "N/A";

  const tabs = [
    { key: "overview" as const, label: "Vue d'ensemble" },
    { key: "skills" as const, label: "Compétences" },
    { key: "history" as const, label: "Historique" },
  ];

  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(180deg, #f6f8fc 0%, #eef2f9 100%)", padding: "28px 20px 60px", fontFamily: "Segoe UI, sans-serif", color: "#111" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* ═══ HEADER ═══ */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
          <div>
            <h1 style={{ margin: "0 0 4px", fontSize: 32, fontWeight: 700 }}>Mon Profil</h1>
            <p style={{ margin: 0, fontSize: 15, color: "#666" }}>
              Bienvenue, {userName} — Membre depuis {memberSince}
            </p>
          </div>
          <button onClick={() => router.push("/")} style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 500, color: "#555" }}>
            Retour à l'accueil
          </button>
        </div>

        {/* ═══ STREAK + KEY STATS ═══ */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 28 }}>
          {/* Streak card */}
          <div style={{ background: "linear-gradient(135deg, #5b5fc7 0%, #7b7fff 100%)", borderRadius: 16, padding: "20px 24px", color: "#fff", position: "relative", overflow: "hidden" }}>
            <div style={{ fontSize: 42, fontWeight: 800, lineHeight: 1 }}>{streak.currentStreak}</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6, opacity: 0.9 }}>
              {streak.currentStreak <= 1 ? "jour d'affilée" : "jours d'affilée"}
            </div>
            <div style={{ fontSize: 11, marginTop: 8, opacity: 0.7 }}>
              Record : {streak.longestStreak} jour{streak.longestStreak > 1 ? "s" : ""}
            </div>
            <div style={{ position: "absolute", top: 12, right: 16, fontSize: 36, opacity: 0.2 }}>🔥</div>
          </div>

          <StatCard value={gamesPlayed} label="Parties jouées" icon="🎮" />
          <StatCard value={`${successRate}%`} label="Taux de réussite" icon="🏆" />
          <StatCard value={completedScenarioIds.length} label="Scénarios uniques" icon="📋" />
          <StatCard value={`${totalPlayTime} min`} label="Temps total joué" icon="⏱️" />
        </div>

        {/* ═══ TABS ═══ */}
        <div style={{ display: "flex", gap: 8, borderBottom: "1px solid #ddd", marginBottom: 24 }}>
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
              padding: "12px 20px", fontSize: 14, fontWeight: activeTab === t.key ? 700 : 500,
              color: activeTab === t.key ? "#5b5fc7" : "#666", background: "none", border: "none",
              cursor: "pointer", borderBottom: activeTab === t.key ? "3px solid #5b5fc7" : "3px solid transparent",
              transition: "all 0.2s",
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ═══ OVERVIEW TAB ═══ */}
        {activeTab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

            {/* Progression by job family */}
            <section>
              <h2 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 700 }}>Progression par métier</h2>
              {jobFamilyStats.length === 0 ? (
                <EmptyState icon="📊" title="Aucune donnée" subtitle="Jouez un scénario pour voir votre progression." />
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
                  {jobFamilyStats.map((stat) => {
                    const familyScenarios = scenarios.filter((s) => s.job_family === stat.jobFamily);
                    const totalAvailable = familyScenarios.length;
                    const progressPct = totalAvailable > 0 ? Math.round((stat.scenariosCompleted / totalAvailable) * 100) : 0;

                    return (
                      <div key={stat.jobFamily} style={{ background: "#fff", borderRadius: 14, padding: "20px 24px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{formatJobFamily(stat.jobFamily)}</h3>
                          <span style={{ fontSize: 12, color: "#888" }}>{stat.scenariosCompleted}/{totalAvailable} scénarios</span>
                        </div>

                        {/* Progress bar */}
                        <div style={{ width: "100%", height: 8, background: "#eee", borderRadius: 4, overflow: "hidden", marginBottom: 12 }}>
                          <div style={{ height: "100%", width: `${progressPct}%`, background: "linear-gradient(90deg, #5b5fc7, #7b7fff)", borderRadius: 4, transition: "width 0.4s" }} />
                        </div>

                        <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
                          <div>
                            <span style={{ color: "#888" }}>Score moyen</span>
                            <div style={{ fontWeight: 700, color: stat.avgScore >= 70 ? "#16a34a" : stat.avgScore >= 40 ? "#d97706" : "#dc2626" }}>
                              {stat.avgScore}%
                            </div>
                          </div>
                          <div>
                            <span style={{ color: "#888" }}>Meilleur</span>
                            <div style={{ fontWeight: 700, color: "#5b5fc7" }}>{stat.bestScore}%</div>
                          </div>
                          <div>
                            <span style={{ color: "#888" }}>Temps</span>
                            <div style={{ fontWeight: 600, color: "#333" }}>{stat.totalTimePlayed} min</div>
                          </div>
                        </div>

                        {/* Difficulty breakdown */}
                        {Object.keys(stat.difficulties).length > 0 && (
                          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                            {Object.entries(stat.difficulties).map(([diff, count]) => {
                              const dc = getDifficultyLabel(diff);
                              return (
                                <span key={diff} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: dc.bg, color: dc.color, fontWeight: 600 }}>
                                  {dc.label} x{count}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Suggested next */}
            {suggestedScenarios.length > 0 && (
              <section>
                <h2 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 700 }}>Scénarios conseillés</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
                  {suggestedScenarios.map((s) => {
                    const dc = getDifficultyLabel(s.difficulty);
                    return (
                      <div key={s.id} onClick={() => router.push(`/scenarios/${s.id}`)} style={{
                        background: "#fff", borderRadius: 14, padding: "18px 22px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
                        cursor: "pointer", transition: "all 0.2s", border: "2px solid transparent",
                      }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#5b5fc7"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.transform = "none"; }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#111" }}>{s.title}</h3>
                          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: dc.bg, color: dc.color, fontWeight: 600 }}>{dc.label}</span>
                        </div>
                        <div style={{ fontSize: 12, color: "#888" }}>{formatJobFamily(s.job_family || "")}</div>
                        <div style={{ marginTop: 10, fontSize: 12, color: "#5b5fc7", fontWeight: 600 }}>Commencer →</div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Quick skills preview */}
            {skills.length > 0 && (
              <section>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Compétences clés</h2>
                  <button onClick={() => setActiveTab("skills")} style={{ fontSize: 13, color: "#5b5fc7", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
                    Voir tout →
                  </button>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {skills.slice(0, 6).map((s) => {
                    const cfg = getSkillLevelConfig(s.level);
                    return (
                      <div key={s.skill} style={{ padding: "10px 16px", background: cfg.bg, borderRadius: 12, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 14 }}>{cfg.icon}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: cfg.color }}>{s.skill}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}

        {/* ═══ SKILLS TAB ═══ */}
        {activeTab === "skills" && (
          <div>
            {skills.length === 0 ? (
              <EmptyState icon="🧠" title="Aucune compétence extraite" subtitle="Terminez un scénario pour que l'IA analyse vos compétences." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {skills.map((s) => {
                  const cfg = getSkillLevelConfig(s.level);
                  return (
                    <div key={s.skill} style={{ background: "#fff", borderRadius: 14, padding: "18px 24px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 18 }}>{cfg.icon}</span>
                          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{s.skill}</h3>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 12px", borderRadius: 10, background: cfg.bg, color: cfg.color }}>
                          {cfg.label}
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div style={{ width: "100%", height: 6, background: "#eee", borderRadius: 3, overflow: "hidden", marginBottom: 10 }}>
                        <div style={{ height: "100%", width: `${cfg.pct}%`, background: cfg.color, borderRadius: 3, transition: "width 0.4s" }} />
                      </div>

                      {/* Evidence */}
                      <p style={{ margin: "0 0 8px", fontSize: 13, color: "#555", fontStyle: "italic", lineHeight: 1.5 }}>
                        "{s.latestEvidence}"
                      </p>

                      {/* Meta */}
                      <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#999" }}>
                        <span>Observé {s.occurrences} fois</span>
                        <span>dans : {s.scenarioTitles.join(", ")}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ HISTORY TAB ═══ */}
        {activeTab === "history" && (
          <div>
            {gameHistory.length === 0 ? (
              <EmptyState icon="📋" title="Aucune partie enregistrée" subtitle="Jouez un scénario pour voir votre historique ici." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {gameHistory.map((record) => {
                  const badge = getEndingBadge(record.ending);
                  const isExpanded = expandedRecordId === record.id;
                  const isDownloading = downloadingId === record.id;

                  return (
                    <div key={record.id} style={{ background: "#fff", borderRadius: 14, padding: "18px 22px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)", transition: "box-shadow 0.2s" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}
                        onClick={() => setExpandedRecordId(isExpanded ? null : record.id)}>

                        <div style={{ width: 44, height: 44, borderRadius: 10, background: badge.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                          {badge.icon}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {record.scenarioTitle}
                          </h3>
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: badge.color, background: badge.bg, padding: "2px 8px", borderRadius: 10 }}>{badge.label}</span>
                            <span style={{ fontSize: 12, color: "#888" }}>Score : {record.avgScore || 0}%</span>
                            <span style={{ fontSize: 11, color: "#aaa" }}>{record.durationMin || 0} min</span>
                            <span style={{ fontSize: 11, color: "#aaa" }}>{formatDate(record.date)}</span>
                            {record.difficulty && (() => { const dc = getDifficultyLabel(record.difficulty); return (
                              <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: dc.bg, color: dc.color, fontWeight: 600 }}>{dc.label}</span>
                            ); })()}
                          </div>
                        </div>

                        <span style={{ fontSize: 18, color: "#bbb", transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
                      </div>

                      {isExpanded && (
                        <div style={{ borderTop: "1px solid #eee", paddingTop: 14, marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
                          {/* Phases */}
                          {record.debrief?.phases?.length > 0 && (
                            <div>
                              <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "#333" }}>Évaluation par phase</h4>
                              {record.debrief.phases.map((phase: any, idx: number) => (
                                <div key={idx} style={{ padding: 10, background: "#f9f9f9", borderRadius: 8, fontSize: 13, color: "#555", marginBottom: 6 }}>
                                  <strong>{phase.title}</strong>: {phase.evaluation}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Extracted skills for this record */}
                          {record.extractedSkills && record.extractedSkills.length > 0 && (
                            <div>
                              <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "#333" }}>Compétences identifiées</h4>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {record.extractedSkills.map((sk, idx) => {
                                  const cfg = getSkillLevelConfig(sk.level);
                                  return (
                                    <div key={idx} style={{ padding: "6px 12px", background: cfg.bg, borderRadius: 10, fontSize: 12, fontWeight: 600, color: cfg.color }}>
                                      {cfg.icon} {sk.skill}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <button onClick={() => handleDownloadPdf(record.id)} disabled={isDownloading}
                            style={{
                              padding: "10px 16px", background: isDownloading ? "#e0e0e0" : "#5b5fc7",
                              color: isDownloading ? "#999" : "#fff", border: "none", borderRadius: 8,
                              cursor: isDownloading ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 13,
                              alignSelf: "flex-start",
                            }}>
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

      </div>
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════

function StatCard({ value, label, icon }: { value: string | number; label: string; icon: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, padding: "18px 22px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)", textAlign: "center", position: "relative" }}>
      <div style={{ position: "absolute", top: 10, right: 14, fontSize: 20, opacity: 0.15 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#5b5fc7", marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 13, color: "#666" }}>{label}</div>
    </div>
  );
}

function EmptyState({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div style={{ textAlign: "center", padding: "50px 20px", background: "#fff", borderRadius: 14, boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>{icon}</div>
      <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 600, color: "#333" }}>{title}</h3>
      <p style={{ margin: 0, fontSize: 14, color: "#888" }}>{subtitle}</p>
    </div>
  );
}
