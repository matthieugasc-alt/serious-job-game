"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";

// ═══════════════════════════════════════════════════════════════════
// FOUNDER DASHBOARD — Campaign HQ
// Timeline validée · Pression temps · Cockpit premium
// ═══════════════════════════════════════════════════════════════════

// ── PARTIE 1 — Structure locale (front uniquement) ─────────────
interface TimelineEntry {
  scenarioId: string;
  month: number;
  monthEnd?: number;
  phase: string;
  title: string;
}

const FOUNDER_TIMELINE: TimelineEntry[] = [
  {
    scenarioId: "founder_00_cto",
    month: 1,
    phase: "Formation équipe",
    title: "Trouver un CTO",
  },
  {
    scenarioId: "founder_01_incubator",
    month: 2,
    monthEnd: 4,
    phase: "Construction MVP",
    title: "Entrée incubateur + pitch",
  },
  {
    scenarioId: "founder_02_mvp",
    month: 5,
    monthEnd: 6,
    phase: "MVP utilisable",
    title: "Construire le MVP",
  },
  {
    scenarioId: "founder_03_clinical",
    month: 7,
    monthEnd: 8,
    phase: "Test terrain",
    title: "Test clinique",
  },
  {
    scenarioId: "founder_04_v1",
    month: 9,
    monthEnd: 10,
    phase: "Itération produit",
    title: "Passage en V1",
  },
  {
    scenarioId: "founder_05_sales",
    month: 11,
    monthEnd: 12,
    phase: "Première vente",
    title: "Vente complexe",
  },
  {
    scenarioId: "founder_06_fundraising",
    month: 13,
    monthEnd: 18,
    phase: "Pré-seed",
    title: "Levée de fonds",
  },
];

const TOTAL_SCENARIOS = FOUNDER_TIMELINE.length;

// ── Types ──────────────────────────────────────────────────────
interface FounderState {
  treasury: number;
  ownership: number;
  mrr: number;
  payroll: number;
  productQuality: number;
  techDebt: number;
  investorConfidence: number;
  marketValidation: number;
  elapsedMonths: number;
}

interface MicroDebrief {
  decision: string;
  impact: string;
  strength: string;
  risk: string;
  advice?: string;
}

interface CompletedScenario {
  scenarioId: string;
  outcomeId: string;
  signal: string;
  stateAfter: FounderState;
  completedAt: string;
}

interface Campaign {
  id: string;
  userId: string;
  createdAt: string;
  status: string;
  currentScenarioIndex: number;
  pendingScenarioId: string | null;
  state: FounderState;
  completedScenarios: CompletedScenario[];
  lastMicroDebrief: MicroDebrief | null;
  hasAdvisoryBoard: boolean;
  checkpoint: any;
}

interface OutcomeResult {
  outcome: {
    outcomeId: string;
    label: string;
    summary: string;
    signal: string;
  };
  microDebrief: MicroDebrief;
  stateBefore: FounderState;
  stateAfter: FounderState;
  deltas: Record<string, number>;
  campaign: Campaign;
}

// ── Signal palette ─────────────────────────────────────────────
const SIGNALS: Record<string, { label: string; bg: string; border: string; text: string; glow: string }> = {
  robust:    { label: "Solide",     bg: "rgba(74,222,128,0.08)",  border: "rgba(74,222,128,0.25)",  text: "#4ade80", glow: "rgba(74,222,128,0.15)" },
  fragile:   { label: "Fragile",    bg: "rgba(251,191,36,0.08)",  border: "rgba(251,191,36,0.25)",  text: "#fbbf24", glow: "rgba(251,191,36,0.15)" },
  costly:    { label: "Coûteux",    bg: "rgba(251,146,60,0.08)",  border: "rgba(251,146,60,0.25)",  text: "#fb923c", glow: "rgba(251,146,60,0.15)" },
  delayed:   { label: "En retard",  bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.25)",   text: "#ef4444", glow: "rgba(239,68,68,0.15)" },
  promising: { label: "Prometteur", bg: "rgba(96,165,250,0.08)",  border: "rgba(96,165,250,0.25)",  text: "#60a5fa", glow: "rgba(96,165,250,0.15)" },
};

// ── Runway helpers ─────────────────────────────────────────────
const MONTHLY_BURN = 250; // 250€/mois de frais de structure
function computeRunway(treasury: number): number {
  if (treasury <= 0) return 0;
  return Math.floor(treasury / MONTHLY_BURN);
}

function runwayColor(months: number): string {
  if (months > 6) return "#4ade80";
  if (months >= 3) return "#fbbf24";
  return "#ef4444";
}

function runwayBg(months: number): string {
  if (months > 6) return "rgba(74,222,128,0.06)";
  if (months >= 3) return "rgba(251,191,36,0.06)";
  return "rgba(239,68,68,0.06)";
}

function runwayBorder(months: number): string {
  if (months > 6) return "rgba(74,222,128,0.15)";
  if (months >= 3) return "rgba(251,191,36,0.15)";
  return "rgba(239,68,68,0.15)";
}

// ── Month label helper ─────────────────────────────────────────
function monthLabel(entry: TimelineEntry): string {
  if (entry.monthEnd && entry.monthEnd !== entry.month) {
    return `Mois ${entry.month}–${entry.monthEnd}`;
  }
  return `Mois ${entry.month}`;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function FounderDashboardPage() {
  const router = useRouter();
  const params = useParams();
  const campaignId = params.campaignId as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applyingOutcome, setApplyingOutcome] = useState(false);
  const [outcomeResult, setOutcomeResult] = useState<OutcomeResult | null>(null);
  const [showDebrief, setShowDebrief] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;

  // Read user role for admin debug panel
  useEffect(() => {
    if (typeof window !== "undefined") {
      setUserRole(localStorage.getItem("user_role"));
    }
  }, []);

  // ── Load campaign ──────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!token) {
      router.push(`/login?redirect=/founder/${campaignId}`);
      return;
    }

    try {
      const campRes = await fetch(`/api/founder/campaigns?id=${campaignId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!campRes.ok) throw new Error("Campaign not found");
      const campData = await campRes.json();
      setCampaign(campData.campaign);

      if (campData.campaign.pendingScenarioId) {
        await checkAndApplyOutcome(campData.campaign);
      }
    } catch (err: any) {
      setError(err.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [campaignId, token]);

  useEffect(() => { loadData(); }, [loadData]);

  async function checkAndApplyOutcome(camp: Campaign) {
    if (!camp.pendingScenarioId || !token) return;
    setApplyingOutcome(true);
    try {
      const res = await fetch("/api/founder/apply-outcome", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ campaignId: camp.id }),
      });
      if (res.ok) {
        const data: OutcomeResult = await res.json();
        setOutcomeResult(data);
        setCampaign(data.campaign);
        setShowDebrief(true);
      }
    } catch {
      // Silent — outcome applied on next load
    } finally {
      setApplyingOutcome(false);
    }
  }

  async function launchScenario(scenarioId: string) {
    if (!token || !campaign) return;
    await fetch("/api/founder/campaigns", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        campaignId: campaign.id,
        pendingScenarioId: scenarioId,
      }),
    });
    router.push(`/scenarios/${scenarioId}/play`);
  }

  function dismissDebrief() {
    setShowDebrief(false);
    setOutcomeResult(null);
  }

  async function debugJumpTo(index: number) {
    if (!token || !campaign) return;
    try {
      const res = await fetch("/api/founder/campaigns", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          campaignId: campaign.id,
          currentScenarioIndex: index,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCampaign(data.campaign);
      }
    } catch (err) {
      console.error("Debug jump failed:", err);
    }
  }

  // ── Block browser back button — prevent returning to completed scenario ──
  useEffect(() => {
    // Push a dummy state so pressing "back" pops this instead of leaving
    window.history.pushState({ founderDashboard: true }, "");
    const handlePopState = (e: PopStateEvent) => {
      // Re-push so the user stays on this page
      window.history.pushState({ founderDashboard: true }, "");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // ── Guard: redirect to S0 if it hasn't been completed yet ──
  // MUST be called before any early return to respect Rules of Hooks
  const hasCompletedS0 = (campaign?.completedScenarios || []).some(
    (s) => s.scenarioId === "founder_00_cto"
  );
  useEffect(() => {
    if (loading || error || !campaign) return;
    if (!hasCompletedS0 && campaign.status !== "completed") {
      router.replace(`/scenarios/founder_00_cto/play`);
    }
  }, [loading, error, campaign, hasCompletedS0]);

  // ── Loading / Error ────────────────────────────────────────────
  if (loading) {
    return (
      <div style={S.loaderWrap}>
        <div style={S.loaderPulse} />
        <p style={S.loaderText}>
          {applyingOutcome ? "Application des résultats..." : "Chargement..."}
        </p>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div style={S.loaderWrap}>
        <p style={{ color: "#ef4444", fontSize: 15, marginBottom: 16 }}>{error || "Campagne introuvable"}</p>
        <button onClick={() => router.push("/")} style={S.ghostBtn}>Retour</button>
      </div>
    );
  }

  if (!hasCompletedS0 && campaign.status !== "completed") {
    return (
      <div style={S.loaderWrap}>
        <div style={S.loaderPulse} />
        <p style={S.loaderText}>Redirection vers le scénario 0...</p>
      </div>
    );
  }

  // ── Derived data ───────────────────────────────────────────────
  const nextIdx = campaign.currentScenarioIndex;
  const isCompleted = campaign.status === "completed";
  const hasPending = !!campaign.pendingScenarioId;
  const st = campaign.state;
  const completedCount = campaign.completedScenarios.length;
  const progressPct = Math.round((completedCount / TOTAL_SCENARIOS) * 100);

  // Current phase info
  const currentEntry = FOUNDER_TIMELINE[Math.min(nextIdx, TOTAL_SCENARIOS - 1)];

  // Runway
  const runwayMonths = computeRunway(st.treasury);
  const rwColor = runwayColor(runwayMonths);
  const rwBg = runwayBg(runwayMonths);
  const rwBorder = runwayBorder(runwayMonths);

  return (
    <main style={S.main}>
      {/* Ambient */}
      <div style={S.ambientGlow} />

      {/* Debrief overlay */}
      {showDebrief && outcomeResult && (
        <DebriefOverlay outcome={outcomeResult} onDismiss={dismissDebrief} />
      )}

      {/* ── Header ──────────────────────────────────────────────── */}
      <header style={S.header}>
        <div>
          <div style={S.modeBadge}>
            <span style={S.modeDot} />
            Founder Mode
          </div>
          <h1 style={S.companyName}>DrugOptimal</h1>
        </div>
        <button onClick={() => router.push("/")} style={S.exitBtn}>Quitter</button>
      </header>

      {/* ── PARTIE 2 — Affichage temporel ───────────────────────── */}
      <section style={S.phaseCard}>
        <p style={S.phaseMonth}>
          {isCompleted ? "18 mois" : monthLabel(currentEntry)}
        </p>
        <p style={S.phaseName}>
          {isCompleted ? "Campagne terminée" : currentEntry.phase}
        </p>
      </section>

      {/* ── PARTIE 3 — Barre de progression ─────────────────────── */}
      <section style={S.progressSection}>
        <div style={S.progressHeader}>
          <span style={S.progressLabel}>
            {completedCount} / {TOTAL_SCENARIOS} scénarios complétés
          </span>
          <span style={S.progressPct}>{progressPct}%</span>
        </div>
        <div style={S.progressTrack}>
          <div
            style={{
              ...S.progressFill,
              width: `${Math.max(progressPct, 2)}%`,
            }}
          />
        </div>
      </section>

      {/* ── KPIs ────────────────────────────────────────────────── */}
      <section style={S.kpiSection}>
        <div style={S.kpiPrimaryRow}>
          <KpiPrimary
            label="Trésorerie"
            value={st.treasury > 0 ? `${st.treasury.toLocaleString("fr-FR")} €` : "-"}
            color="#60a5fa"
          />
          <div style={S.kpiDivider} />
          <KpiPrimary
            label="Ownership"
            value={st.ownership > 0 ? `${st.ownership}%` : "-"}
            color="#a5a8ff"
          />
        </div>
        <div style={S.kpiSecondaryRow}>
          <KpiSecondary
            label="MRR"
            value={st.mrr > 0 ? `${st.mrr.toLocaleString("fr-FR")} €/mois` : "-"}
          />
          <KpiSecondary
            label="Masse salariale"
            value={st.payroll > 0 ? `${st.payroll.toLocaleString("fr-FR")} €/mois` : "-"}
          />
        </div>
      </section>

      {/* ── PARTIE 5 — Pression temps (runway) ──────────────────── */}
      <section
        style={{
          ...S.runwayCard,
          background: rwBg,
          border: `1px solid ${rwBorder}`,
        }}
      >
        <div style={S.runwayInner}>
          <div>
            <p style={S.runwayLabel}>Runway estimé</p>
            <p style={{ ...S.runwayValue, color: rwColor }}>
              {runwayMonths > 0 ? `${runwayMonths} mois` : "Épuisé"}
            </p>
          </div>
          <div
            style={{
              ...S.runwayIndicator,
              background: rwColor,
              boxShadow: `0 0 12px ${rwColor}40`,
            }}
          />
        </div>
        <p style={S.runwayDetail}>
          {st.treasury.toLocaleString("fr-FR")} € / {MONTHLY_BURN} €/mois de burn · Mois {st.elapsedMonths || 0}
        </p>
      </section>

      {/* ── Last debrief ────────────────────────────────────────── */}
      {campaign.lastMicroDebrief && !showDebrief && (
        <section style={S.lastDebrief}>
          <div style={S.lastDebriefHeader}>
            <span style={S.lastDebriefDot} />
            <span style={S.lastDebriefTag}>Dernier debrief</span>
          </div>
          <p style={S.lastDebriefBody}>{campaign.lastMicroDebrief.decision}</p>
          {campaign.lastMicroDebrief.advice && (
            <p style={S.lastDebriefAdvice}>→ {campaign.lastMicroDebrief.advice}</p>
          )}
        </section>
      )}

      {/* ── PARTIE 4 — Timeline visuelle ────────────────────────── */}
      <section style={S.timelineSection}>
        <h2 style={S.sectionTitle}>Parcours</h2>

        <div style={S.timeline}>
          {FOUNDER_TIMELINE.map((entry, i) => {
            const completed = campaign.completedScenarios.find(
              (cs) => cs.scenarioId === entry.scenarioId
            );
            const isCurrent = i === nextIdx && !isCompleted;
            const isLocked = i > nextIdx && !isCompleted;
            const isPast = !!completed;
            const signal = completed ? SIGNALS[completed.signal] : null;

            return (
              <div key={entry.scenarioId}>
                {/* Connector */}
                {i > 0 && (
                  <div
                    style={{
                      ...S.connector,
                      background: isPast
                        ? "linear-gradient(180deg, rgba(91,95,199,0.35), rgba(91,95,199,0.12))"
                        : isCurrent
                          ? "linear-gradient(180deg, rgba(91,95,199,0.2), rgba(91,95,199,0.06))"
                          : "rgba(255,255,255,0.03)",
                    }}
                  />
                )}

                {/* Card */}
                <div
                  style={{
                    ...S.scenarioCard,
                    ...(isCurrent ? S.scenarioCardActive : {}),
                    ...(isLocked ? S.scenarioCardLocked : {}),
                    ...(isPast ? S.scenarioCardPast : {}),
                  }}
                >
                  {/* Indicator */}
                  <div
                    style={{
                      ...S.scenarioIndicator,
                      ...(isPast ? S.indicatorDone : {}),
                      ...(isCurrent ? S.indicatorCurrent : {}),
                    }}
                  >
                    {isPast ? (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M3 7L6 10L11 4" stroke="#5b5fc7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : isLocked ? (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <rect x="2" y="5" width="8" height="6" rx="1.5" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"/>
                        <path d="M4 5V3.5a2 2 0 014 0V5" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    ) : (
                      <span style={{ fontSize: 13, fontWeight: 800 }}>{i + 1}</span>
                    )}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Month + phase */}
                    <p style={{
                      ...S.scenarioMeta,
                      color: isLocked ? "rgba(255,255,255,0.15)" : isPast ? "rgba(91,95,199,0.5)" : "rgba(91,95,199,0.7)",
                    }}>
                      {monthLabel(entry)} — {entry.phase}
                    </p>
                    {/* Title */}
                    <p style={{
                      ...S.scenarioTitle,
                      color: isLocked ? "rgba(255,255,255,0.2)" : isPast ? "rgba(255,255,255,0.5)" : "#fff",
                    }}>
                      {entry.title}
                    </p>
                    {/* Signal badge for completed */}
                    {isPast && signal && (
                      <SignalBadge signal={completed!.signal} />
                    )}
                    {/* Current hints */}
                    {isCurrent && !hasPending && (
                      <p style={S.currentHint}>Prêt à jouer</p>
                    )}
                    {isCurrent && hasPending && (
                      <p style={S.pendingHint}>En cours — termine le scénario pour voir le résultat</p>
                    )}
                  </div>

                  {/* Action */}
                  {isCurrent && !hasPending && (
                    <button
                      onClick={() => launchScenario(entry.scenarioId)}
                      style={S.playBtn}
                    >
                      Jouer
                    </button>
                  )}
                  {isCurrent && hasPending && (
                    <button
                      onClick={() => router.push(`/scenarios/${entry.scenarioId}/play`)}
                      style={S.resumeBtn}
                    >
                      Reprendre
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Campaign Complete ───────────────────────────────────── */}
      {isCompleted && (
        <section style={S.completedBanner}>
          <div style={S.completedIcon}>✦</div>
          <h2 style={S.completedTitle}>Campagne terminée</h2>
          <p style={S.completedBody}>
            Tu as traversé les 18 mois du mode Founder. L'advisory board review arrive bientôt.
          </p>
        </section>
      )}

      {/* ── Admin Control Panel (super_admin only) ────────────────── */}
      {userRole === "super_admin" && (
        <section style={S.debugPanel}>
          <div style={S.debugHeader}>
            <span style={S.debugDot} />
            <span style={S.debugTag}>Contrôle Admin</span>
          </div>
          <p style={S.debugInfo}>
            Index : {campaign.currentScenarioIndex} · Pending : {campaign.pendingScenarioId || "—"} · Status : {campaign.status}
          </p>

          {/* ── Scenario Slider ── */}
          <div style={{ padding: "12px 0 4px" }}>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" as const, letterSpacing: 1.5, marginBottom: 10, fontWeight: 700 }}>
              Navigation scénarios
            </p>
            {/* Track line */}
            <div style={{ position: "relative" as const, height: 40, margin: "0 0 8px" }}>
              <div style={{ position: "absolute" as const, top: 18, left: 0, right: 0, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }} />
              {/* Progress fill */}
              <div style={{ position: "absolute" as const, top: 18, left: 0, width: `${Math.min(100, (campaign.currentScenarioIndex / Math.max(1, TOTAL_SCENARIOS - 1)) * 100)}%`, height: 4, background: "linear-gradient(90deg, #5b5fc7, #7c7fff)", borderRadius: 2, transition: "width 0.3s" }} />
              {/* Nodes */}
              {FOUNDER_TIMELINE.map((entry, i) => {
                const isCompleted2 = campaign.completedScenarios.some((s) => s.scenarioId === entry.scenarioId);
                const isCurrent = i === campaign.currentScenarioIndex;
                const pct = TOTAL_SCENARIOS <= 1 ? 50 : (i / (TOTAL_SCENARIOS - 1)) * 100;
                return (
                  <button
                    key={entry.scenarioId}
                    onClick={() => debugJumpTo(i)}
                    title={`${entry.title} (index ${i})`}
                    style={{
                      position: "absolute" as const,
                      left: `${pct}%`,
                      top: 8,
                      transform: "translateX(-50%)",
                      width: isCurrent ? 24 : 20,
                      height: isCurrent ? 24 : 20,
                      borderRadius: "50%",
                      background: isCompleted2
                        ? "#4ade80"
                        : isCurrent
                          ? "#5b5fc7"
                          : "rgba(255,255,255,0.1)",
                      border: isCurrent
                        ? "3px solid #a5a8ff"
                        : isCompleted2
                          ? "2px solid rgba(74,222,128,0.4)"
                          : "2px solid rgba(255,255,255,0.15)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 9,
                      fontWeight: 700,
                      color: isCompleted2 || isCurrent ? "#fff" : "rgba(255,255,255,0.4)",
                      transition: "all 0.2s",
                      boxShadow: isCurrent ? "0 0 12px rgba(91,95,199,0.5)" : "none",
                      padding: 0,
                    }}
                  >
                    {isCompleted2 ? "✓" : i}
                  </button>
                );
              })}
            </div>
            {/* Labels under nodes */}
            <div style={{ position: "relative" as const, height: 28 }}>
              {FOUNDER_TIMELINE.map((entry, i) => {
                const pct = TOTAL_SCENARIOS <= 1 ? 50 : (i / (TOTAL_SCENARIOS - 1)) * 100;
                const isCurrent = i === campaign.currentScenarioIndex;
                return (
                  <span
                    key={entry.scenarioId}
                    style={{
                      position: "absolute" as const,
                      left: `${pct}%`,
                      transform: "translateX(-50%)",
                      fontSize: 8,
                      color: isCurrent ? "#a5a8ff" : "rgba(255,255,255,0.25)",
                      fontWeight: isCurrent ? 700 : 400,
                      whiteSpace: "nowrap" as const,
                      textAlign: "center" as const,
                      maxWidth: 70,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    S{i}
                  </span>
                );
              })}
            </div>
          </div>

          {/* ── Reset Button ── */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12, marginTop: 8 }}>
            <button
              onClick={async () => {
                if (!confirm("Supprimer la campagne et revenir à l'intro Founder ?")) return;
                try {
                  await fetch("/api/founder/campaigns", {
                    method: "DELETE",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ campaignId: campaign.id }),
                  });
                  router.push("/founder/intro");
                } catch (err) {
                  console.error("Reset failed:", err);
                }
              }}
              style={{
                width: "100%",
                padding: "10px 16px",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
                borderRadius: 8,
                color: "#ef4444",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <span>🗑</span>
              Reset complet — Supprimer la campagne
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════

function KpiPrimary({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={S.kpiPrimary}>
      <p style={S.kpiPrimaryLabel}>{label}</p>
      <p style={{ ...S.kpiPrimaryValue, color }}>{value}</p>
    </div>
  );
}

function KpiSecondary({ label, value }: { label: string; value: string }) {
  return (
    <div style={S.kpiSecondary}>
      <span style={S.kpiSecondaryLabel}>{label}</span>
      <span style={S.kpiSecondaryValue}>{value}</span>
    </div>
  );
}

function SignalBadge({ signal }: { signal: string }) {
  const s = SIGNALS[signal] || SIGNALS.robust;
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      padding: "3px 10px",
      fontSize: 11,
      fontWeight: 700,
      borderRadius: 5,
      background: s.bg,
      border: `1px solid ${s.border}`,
      color: s.text,
      marginTop: 6,
    }}>
      <span style={{
        width: 5,
        height: 5,
        borderRadius: "50%",
        background: s.text,
        boxShadow: `0 0 6px ${s.glow}`,
      }} />
      {s.label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DEBRIEF OVERLAY
// ═══════════════════════════════════════════════════════════════════

function DebriefOverlay({ outcome, onDismiss }: { outcome: OutcomeResult; onDismiss: () => void }) {
  const { microDebrief, outcome: oc, deltas, stateAfter } = outcome;
  const signal = SIGNALS[oc.signal] || SIGNALS.robust;
  const [revealStep, setRevealStep] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setRevealStep(1), 300),
      setTimeout(() => setRevealStep(2), 700),
      setTimeout(() => setRevealStep(3), 1100),
      setTimeout(() => setRevealStep(4), 1600),
      setTimeout(() => setRevealStep(5), 2200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const visibleDeltas = [
    { label: "Trésorerie", key: "treasury", after: stateAfter.treasury, unit: " €" },
    { label: "Ownership", key: "ownership", after: stateAfter.ownership, unit: "%" },
    { label: "Temps écoulé", key: "elapsedMonths", after: stateAfter.elapsedMonths, unit: " mois" },
    { label: "MRR", key: "mrr", after: stateAfter.mrr, unit: " €" },
    { label: "Masse salariale", key: "payroll", after: stateAfter.payroll, unit: " €" },
  ].filter((d) => deltas[d.key] !== 0);

  // Post-outcome runway
  const newRunway = computeRunway(stateAfter.treasury);
  const nrColor = runwayColor(newRunway);

  return (
    <div style={S.overlay}>
      <div style={S.overlayCard}>
        {/* Signal header */}
        <div style={{
          ...S.revealBlock,
          opacity: revealStep >= 1 ? 1 : 0,
          transform: revealStep >= 1 ? "translateY(0)" : "translateY(10px)",
        }}>
          <div style={S.debriefHeader}>
            <div style={{
              ...S.signalStripe,
              background: `linear-gradient(135deg, ${signal.text}, transparent)`,
            }} />
            <div>
              <SignalBadge signal={oc.signal} />
              <h2 style={S.debriefTitle}>{oc.label}</h2>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div style={{
          ...S.revealBlock,
          opacity: revealStep >= 2 ? 1 : 0,
          transform: revealStep >= 2 ? "translateY(0)" : "translateY(10px)",
        }}>
          <p style={S.debriefSummary}>{oc.summary}</p>
        </div>

        {/* Delta cards + runway */}
        {visibleDeltas.length > 0 && (
          <div style={{
            ...S.revealBlock,
            opacity: revealStep >= 3 ? 1 : 0,
            transform: revealStep >= 3 ? "translateY(0)" : "translateY(10px)",
          }}>
            <div style={S.deltasRow}>
              {visibleDeltas.map((d) => {
                const delta = deltas[d.key];
                const positive = delta > 0;
                return (
                  <div key={d.key} style={S.deltaChip}>
                    <span style={S.deltaChipLabel}>{d.label}</span>
                    <span style={{
                      ...S.deltaChipValue,
                      color: positive ? "#4ade80" : "#ef4444",
                    }}>
                      {positive ? "+" : ""}{delta.toLocaleString("fr-FR")}{d.unit}
                    </span>
                    <span style={S.deltaChipAfter}>
                      → {d.after.toLocaleString("fr-FR")}{d.unit}
                    </span>
                  </div>
                );
              })}
            </div>
            {/* Runway in debrief */}
            <div style={S.debriefRunway}>
              <span style={S.debriefRunwayLabel}>Runway après cette étape</span>
              <span style={{ ...S.debriefRunwayValue, color: nrColor }}>
                {newRunway > 0 ? `${newRunway} mois` : "Épuisé"}
              </span>
            </div>
          </div>
        )}

        {/* Debrief items */}
        <div style={{
          ...S.revealBlock,
          opacity: revealStep >= 4 ? 1 : 0,
          transform: revealStep >= 4 ? "translateY(0)" : "translateY(10px)",
        }}>
          <div style={S.debriefGrid}>
            <DebriefEntry label="Ce qui s'est passé" text={microDebrief.decision} accent="#a5a8ff" />
            <DebriefEntry label="Impact" text={microDebrief.impact} accent="#60a5fa" />
            <DebriefEntry label="Point fort" text={microDebrief.strength} accent="#4ade80" />
            <DebriefEntry label="Risque identifié" text={microDebrief.risk} accent="#fb923c" />
          </div>
        </div>

        {/* Advice + continue */}
        <div style={{
          ...S.revealBlock,
          opacity: revealStep >= 5 ? 1 : 0,
          transform: revealStep >= 5 ? "translateY(0)" : "translateY(10px)",
        }}>
          {microDebrief.advice && (
            <div style={S.adviceCard}>
              <p style={S.adviceTag}>Conseil pour la suite</p>
              <p style={S.adviceBody}>{microDebrief.advice}</p>
            </div>
          )}
          <button onClick={onDismiss} style={S.continueBtn}>
            Continuer →
          </button>
        </div>
      </div>
    </div>
  );
}

function DebriefEntry({ label, text, accent }: { label: string; text: string; accent: string }) {
  return (
    <div style={S.debriefEntry}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
        <span style={{ width: 4, height: 4, borderRadius: "50%", background: accent, flexShrink: 0 }} />
        <span style={{ ...S.debriefEntryLabel, color: accent }}>{label}</span>
      </div>
      <p style={S.debriefEntryText}>{text}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════

const S: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100vh",
    background: "#08080f",
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    color: "#fff",
    padding: "0 20px 48px",
    maxWidth: 660,
    margin: "0 auto",
    position: "relative",
    overflow: "hidden",
  },
  ambientGlow: {
    position: "absolute",
    top: -100,
    left: "50%",
    transform: "translateX(-50%)",
    width: 500,
    height: 350,
    borderRadius: "50%",
    background: "radial-gradient(ellipse, rgba(91,95,199,0.1) 0%, transparent 70%)",
    pointerEvents: "none",
    zIndex: 0,
  },

  // Loader
  loaderWrap: {
    minHeight: "100vh",
    background: "#08080f",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Segoe UI', sans-serif",
    color: "#fff",
  },
  loaderPulse: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    background: "rgba(91,95,199,0.25)",
    animation: "pulse 1.5s ease-in-out infinite",
  },
  loaderText: {
    color: "rgba(255,255,255,0.4)",
    marginTop: 14,
    fontSize: 13,
  },
  ghostBtn: {
    padding: "10px 20px",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 8,
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },

  // Header
  header: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "28px 0 0",
    marginBottom: 24,
  },
  modeBadge: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 10,
    fontWeight: 700,
    color: "rgba(255,255,255,0.45)",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  modeDot: {
    width: 5,
    height: 5,
    borderRadius: "50%",
    background: "#5b5fc7",
    boxShadow: "0 0 8px rgba(91,95,199,0.5)",
  },
  companyName: {
    margin: 0,
    fontSize: 30,
    fontWeight: 800,
    letterSpacing: -0.5,
    background: "linear-gradient(135deg, #c4c6ff 0%, #60a5fa 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  exitBtn: {
    marginTop: 4,
    padding: "7px 16px",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 6,
    color: "rgba(255,255,255,0.35)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },

  // ── Phase card (PARTIE 2) ────────────────────────────────────
  phaseCard: {
    position: "relative",
    zIndex: 1,
    padding: "16px 20px",
    background: "rgba(91,95,199,0.06)",
    borderRadius: 12,
    border: "1px solid rgba(91,95,199,0.12)",
    marginBottom: 16,
    textAlign: "center",
  },
  phaseMonth: {
    margin: "0 0 2px",
    fontSize: 22,
    fontWeight: 800,
    color: "#fff",
    letterSpacing: -0.3,
  },
  phaseName: {
    margin: 0,
    fontSize: 13,
    fontWeight: 600,
    color: "rgba(165,168,255,0.7)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  // ── Progress bar (PARTIE 3) ──────────────────────────────────
  progressSection: {
    position: "relative",
    zIndex: 1,
    marginBottom: 20,
  },
  progressHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "rgba(255,255,255,0.4)",
  },
  progressPct: {
    fontSize: 12,
    fontWeight: 700,
    color: "rgba(255,255,255,0.5)",
  },
  progressTrack: {
    width: "100%",
    height: 4,
    borderRadius: 2,
    background: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
    background: "linear-gradient(90deg, #5b5fc7, #7c7fff)",
    transition: "width 0.6s ease",
  },

  // ── KPIs ─────────────────────────────────────────────────────
  kpiSection: {
    position: "relative",
    zIndex: 1,
    marginBottom: 16,
  },
  kpiPrimaryRow: {
    display: "flex",
    alignItems: "stretch",
    gap: 0,
    background: "rgba(255,255,255,0.025)",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.06)",
    padding: "18px 0",
    marginBottom: 8,
  },
  kpiPrimary: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  kpiPrimaryLabel: {
    margin: 0,
    fontSize: 10,
    fontWeight: 700,
    color: "rgba(255,255,255,0.38)",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  kpiPrimaryValue: {
    margin: 0,
    fontSize: 24,
    fontWeight: 800,
    letterSpacing: -0.5,
  },
  kpiDivider: {
    width: 1,
    background: "rgba(255,255,255,0.06)",
    alignSelf: "stretch",
  },
  kpiSecondaryRow: {
    display: "flex",
    gap: 8,
  },
  kpiSecondary: {
    flex: 1,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 14px",
    background: "rgba(255,255,255,0.02)",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.04)",
  },
  kpiSecondaryLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: "rgba(255,255,255,0.28)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  kpiSecondaryValue: {
    fontSize: 13,
    fontWeight: 700,
    color: "rgba(255,255,255,0.32)",
  },

  // ── Runway (PARTIE 5) ───────────────────────────────────────
  runwayCard: {
    position: "relative",
    zIndex: 1,
    padding: "16px 20px",
    borderRadius: 12,
    marginBottom: 20,
  },
  runwayInner: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  runwayLabel: {
    margin: "0 0 2px",
    fontSize: 10,
    fontWeight: 700,
    color: "rgba(255,255,255,0.4)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  runwayValue: {
    margin: 0,
    fontSize: 20,
    fontWeight: 800,
    letterSpacing: -0.3,
  },
  runwayIndicator: {
    width: 10,
    height: 10,
    borderRadius: "50%",
  },
  runwayDetail: {
    margin: 0,
    fontSize: 11,
    color: "rgba(255,255,255,0.3)",
    fontWeight: 500,
  },

  // ── Last debrief ─────────────────────────────────────────────
  lastDebrief: {
    position: "relative",
    zIndex: 1,
    padding: "16px 20px",
    background: "rgba(91,95,199,0.05)",
    borderRadius: 12,
    border: "1px solid rgba(91,95,199,0.1)",
    marginBottom: 24,
  },
  lastDebriefHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  lastDebriefDot: {
    width: 4,
    height: 4,
    borderRadius: "50%",
    background: "#5b5fc7",
  },
  lastDebriefTag: {
    fontSize: 10,
    fontWeight: 700,
    color: "rgba(255,255,255,0.35)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  lastDebriefBody: {
    margin: "0 0 6px",
    fontSize: 14,
    color: "rgba(255,255,255,0.72)",
    lineHeight: 1.6,
  },
  lastDebriefAdvice: {
    margin: 0,
    fontSize: 13,
    color: "#a5a8ff",
    fontStyle: "italic",
    lineHeight: 1.5,
  },

  // ── Timeline (PARTIE 4) ─────────────────────────────────────
  timelineSection: {
    position: "relative",
    zIndex: 1,
    marginBottom: 32,
  },
  sectionTitle: {
    margin: "0 0 18px",
    fontSize: 14,
    fontWeight: 700,
    color: "rgba(255,255,255,0.45)",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  timeline: {
    display: "flex",
    flexDirection: "column",
  },
  connector: {
    width: 2,
    height: 20,
    marginLeft: 19,
    borderRadius: 1,
  },
  scenarioCard: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "14px 16px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.04)",
    background: "rgba(255,255,255,0.012)",
    transition: "all 0.25s ease",
  },
  scenarioCardActive: {
    padding: "18px 18px",
    border: "1px solid rgba(91,95,199,0.3)",
    background: "rgba(91,95,199,0.06)",
    boxShadow: "0 2px 24px rgba(91,95,199,0.1)",
  },
  scenarioCardLocked: {
    opacity: 0.32,
  },
  scenarioCardPast: {
    opacity: 0.7,
  },
  scenarioIndicator: {
    width: 38,
    height: 38,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.03)",
    border: "2px solid rgba(255,255,255,0.07)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "rgba(255,255,255,0.35)",
    flexShrink: 0,
    transition: "all 0.25s ease",
  },
  indicatorDone: {
    background: "rgba(91,95,199,0.12)",
    border: "2px solid rgba(91,95,199,0.4)",
    color: "#5b5fc7",
  },
  indicatorCurrent: {
    width: 42,
    height: 42,
    background: "rgba(91,95,199,0.18)",
    border: "2px solid #7c7fff",
    color: "#fff",
    boxShadow: "0 0 20px rgba(91,95,199,0.25)",
  },
  scenarioMeta: {
    margin: "0 0 2px",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.3,
  },
  scenarioTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    lineHeight: 1.3,
  },
  currentHint: {
    margin: "5px 0 0",
    fontSize: 12,
    color: "rgba(165,168,255,0.6)",
    fontWeight: 500,
  },
  pendingHint: {
    margin: "5px 0 0",
    fontSize: 12,
    color: "rgba(251,191,36,0.6)",
    fontWeight: 500,
  },
  playBtn: {
    padding: "10px 26px",
    background: "linear-gradient(135deg, #5b5fc7, #4a4eb3)",
    border: "1px solid rgba(91,95,199,0.4)",
    borderRadius: 8,
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    flexShrink: 0,
    boxShadow: "0 2px 16px rgba(91,95,199,0.3)",
    transition: "all 0.2s",
  },
  resumeBtn: {
    padding: "9px 20px",
    background: "rgba(251,191,36,0.1)",
    border: "1px solid rgba(251,191,36,0.25)",
    borderRadius: 8,
    color: "#fbbf24",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    flexShrink: 0,
  },

  // ── Completed ────────────────────────────────────────────────
  completedBanner: {
    position: "relative",
    zIndex: 1,
    padding: "28px 24px",
    background: "rgba(74,222,128,0.04)",
    border: "1px solid rgba(74,222,128,0.12)",
    borderRadius: 14,
    textAlign: "center",
  },
  completedIcon: {
    fontSize: 28,
    color: "#4ade80",
    marginBottom: 8,
  },
  completedTitle: {
    margin: "0 0 8px",
    fontSize: 18,
    fontWeight: 800,
    color: "#fff",
  },
  completedBody: {
    margin: 0,
    fontSize: 14,
    color: "rgba(255,255,255,0.55)",
    lineHeight: 1.5,
  },

  // ═══════════════════════════════════════════════════════════════
  // OVERLAY
  // ═══════════════════════════════════════════════════════════════
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(4,4,10,0.92)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  overlayCard: {
    maxWidth: 540,
    width: "100%",
    maxHeight: "90vh",
    overflowY: "auto",
    background: "linear-gradient(180deg, #101020 0%, #0c0c1a 100%)",
    borderRadius: 18,
    padding: "36px 30px 28px",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(91,95,199,0.08)",
  },
  revealBlock: {
    transition: "opacity 0.5s ease, transform 0.5s ease",
  },
  debriefHeader: {
    position: "relative",
    marginBottom: 20,
    paddingLeft: 16,
  },
  signalStripe: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderRadius: 2,
  },
  debriefTitle: {
    margin: "10px 0 0",
    fontSize: 22,
    fontWeight: 800,
    color: "#fff",
    letterSpacing: -0.3,
  },
  debriefSummary: {
    margin: "0 0 24px",
    fontSize: 14,
    color: "rgba(255,255,255,0.65)",
    lineHeight: 1.7,
  },
  deltasRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  deltaChip: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "10px 14px",
    background: "rgba(255,255,255,0.03)",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.05)",
    minWidth: 120,
    flex: "1 1 calc(50% - 4px)",
  },
  deltaChipLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: "rgba(255,255,255,0.35)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  deltaChipValue: {
    fontSize: 17,
    fontWeight: 800,
    letterSpacing: -0.3,
  },
  deltaChipAfter: {
    fontSize: 11,
    color: "rgba(255,255,255,0.3)",
    fontWeight: 500,
  },
  debriefRunway: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 14px",
    background: "rgba(255,255,255,0.02)",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.04)",
    marginBottom: 24,
  },
  debriefRunwayLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "rgba(255,255,255,0.35)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  debriefRunwayValue: {
    fontSize: 15,
    fontWeight: 800,
  },
  debriefGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    marginBottom: 24,
  },
  debriefEntry: {
    padding: 0,
  },
  debriefEntryLabel: {
    fontSize: 10,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  debriefEntryText: {
    margin: 0,
    fontSize: 14,
    color: "rgba(255,255,255,0.78)",
    lineHeight: 1.65,
  },
  adviceCard: {
    padding: "16px 18px",
    background: "rgba(91,95,199,0.07)",
    borderRadius: 10,
    border: "1px solid rgba(91,95,199,0.12)",
    marginBottom: 20,
  },
  adviceTag: {
    margin: "0 0 6px",
    fontSize: 10,
    fontWeight: 800,
    color: "#a5a8ff",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  adviceBody: {
    margin: 0,
    fontSize: 14,
    color: "rgba(255,255,255,0.82)",
    lineHeight: 1.65,
    fontStyle: "italic",
  },
  continueBtn: {
    width: "100%",
    padding: "14px 24px",
    background: "linear-gradient(135deg, #5b5fc7 0%, #4a4eb3 100%)",
    border: "1px solid rgba(91,95,199,0.3)",
    borderRadius: 10,
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 4px 20px rgba(91,95,199,0.2)",
    transition: "all 0.2s",
  },

  // ── Debug panel ─────────────────────────────────────────────
  debugPanel: {
    position: "relative",
    zIndex: 1,
    marginTop: 40,
    padding: "18px 20px",
    background: "rgba(239,68,68,0.04)",
    borderRadius: 12,
    border: "1px solid rgba(239,68,68,0.15)",
  },
  debugHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  debugDot: {
    width: 5,
    height: 5,
    borderRadius: "50%",
    background: "#ef4444",
    boxShadow: "0 0 6px rgba(239,68,68,0.4)",
  },
  debugTag: {
    fontSize: 10,
    fontWeight: 800,
    color: "#ef4444",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  debugInfo: {
    margin: "0 0 12px",
    fontSize: 11,
    color: "rgba(255,255,255,0.35)",
    fontFamily: "monospace",
  },
  debugGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  debugBtn: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: 6,
    cursor: "pointer",
    transition: "all 0.15s",
    color: "rgba(255,255,255,0.5)",
  },
  debugBtnActive: {
    background: "rgba(91,95,199,0.1)",
    border: "1px solid rgba(91,95,199,0.3)",
    color: "#a5a8ff",
  },
  debugBtnIdx: {
    width: 20,
    fontSize: 11,
    fontWeight: 800,
    fontFamily: "monospace",
    color: "inherit",
  },
  debugBtnTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: "inherit",
  },
};
