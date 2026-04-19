"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

// ═══════════════════════════════════════════════════════════════════
// FOUNDER INTRO — Pitch d'entrée (premium)
// ═══════════════════════════════════════════════════════════════════

const STEP_LABELS = [
  "Le problème",
  "Le produit",
  "Le marché",
  "L'équipe",
  "La réalité",
];

export default function FounderIntroPage() {
  const router = useRouter();
  const [pitch, setPitch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [visible, setVisible] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/founder/rules")
      .then((r) => r.json())
      .then((rules) => {
        setPitch(rules.pitch);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function goToStep(next: number) {
    if (transitioning) return;
    setTransitioning(true);
    setVisible(false);
    setTimeout(() => {
      setStep(next);
      if (contentRef.current) contentRef.current.scrollTop = 0;
      window.scrollTo({ top: 0, behavior: "smooth" });
      setVisible(true);
      setTransitioning(false);
    }, 280);
  }

  async function handleLaunch() {
    setCreating(true);
    const token = localStorage.getItem("auth_token");
    if (!token) {
      router.push("/login?redirect=/founder/intro");
      return;
    }

    try {
      const res = await fetch("/api/founder/campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (data.campaign?.id) {
        router.push(`/founder/${data.campaign.id}`);
      }
    } catch (err) {
      console.error("Failed to create campaign:", err);
      setCreating(false);
    }
  }

  // ── Loading ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={S.loaderWrap}>
        <div style={S.loaderPulse} />
      </div>
    );
  }

  if (!pitch) {
    return (
      <div style={S.loaderWrap}>
        <p style={{ color: "#ef4444", fontSize: 15 }}>Erreur de chargement du pitch.</p>
      </div>
    );
  }

  const isLastStep = step === STEP_LABELS.length - 1;

  // ── Render ─────────────────────────────────────────────────────
  return (
    <main style={S.main}>
      {/* Ambient glow */}
      <div style={S.ambientGlow} />

      {/* Top bar */}
      <header style={S.topBar}>
        <div style={S.modeBadge}>
          <span style={S.modeDot} />
          Founder Mode
        </div>
        <button
          onClick={() => router.push("/")}
          style={S.exitBtn}
        >
          Quitter
        </button>
      </header>

      {/* Progress */}
      <nav style={S.progressWrap}>
        <div style={S.progressTrack}>
          {STEP_LABELS.map((label, i) => (
            <button
              key={i}
              onClick={() => i < step ? goToStep(i) : undefined}
              style={{
                ...S.progressStep,
                cursor: i < step ? "pointer" : "default",
                opacity: i <= step ? 1 : 0.3,
              }}
            >
              <div
                style={{
                  ...S.progressDot,
                  background: i < step ? "#5b5fc7" : i === step ? "#fff" : "rgba(255,255,255,0.2)",
                  boxShadow: i === step ? "0 0 12px rgba(91,95,199,0.6)" : "none",
                  transform: i === step ? "scale(1.3)" : "scale(1)",
                }}
              />
              <span
                style={{
                  ...S.progressLabel,
                  color: i === step ? "#fff" : i < step ? "#a5a8ff" : "rgba(255,255,255,0.3)",
                  fontWeight: i === step ? 700 : 500,
                }}
              >
                {label}
              </span>
            </button>
          ))}
        </div>
        {/* Connecting line */}
        <div style={S.progressLine}>
          <div
            style={{
              ...S.progressLineFill,
              width: `${(step / (STEP_LABELS.length - 1)) * 100}%`,
            }}
          />
        </div>
      </nav>

      {/* Content */}
      <div
        ref={contentRef}
        style={{
          ...S.content,
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(12px)",
        }}
      >
        {step === 0 && <StepProblem pitch={pitch} />}
        {step === 1 && <StepProduct pitch={pitch} />}
        {step === 2 && <StepMarket pitch={pitch} />}
        {step === 3 && <StepTeam pitch={pitch} />}
        {step === 4 && <StepReality pitch={pitch} />}
      </div>

      {/* Navigation */}
      <footer style={S.footer}>
        <button
          onClick={() => step > 0 ? goToStep(step - 1) : router.push("/")}
          style={S.navBtnSecondary}
        >
          {step > 0 ? "← Précédent" : "Quitter"}
        </button>

        {isLastStep ? (
          <button
            onClick={handleLaunch}
            disabled={creating}
            style={{
              ...S.launchBtn,
              opacity: creating ? 0.7 : 1,
              cursor: creating ? "not-allowed" : "pointer",
            }}
          >
            <span style={S.launchBtnInner}>
              {creating ? "Création..." : "Lancer ma startup →"}
            </span>
          </button>
        ) : (
          <button
            onClick={() => goToStep(step + 1)}
            style={S.navBtnPrimary}
          >
            Suivant →
          </button>
        )}
      </footer>
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STEP COMPONENTS
// ═══════════════════════════════════════════════════════════════════

function StepProblem({ pitch }: { pitch: any }) {
  return (
    <div>
      <p style={S.stepTag}>Le constat</p>
      <h2 style={S.heroTitle}>{pitch.problem.headline}</h2>
      <p style={S.bodyText}>{pitch.problem.context}</p>
      <div style={S.statCard}>
        <div style={S.statCardAccent} />
        <p style={S.statValue}>{pitch.problem.data}</p>
      </div>
    </div>
  );
}

function StepProduct({ pitch }: { pitch: any }) {
  return (
    <div>
      <p style={S.stepTag}>Ta vision</p>
      <h2 style={S.sectionTitle}>Ce que tu veux construire</h2>
      <p style={S.bodyText}>{pitch.product.vision}</p>

      <div style={S.infoCard}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={S.cardIcon}>◎</span>
          <span style={S.cardLabel}>Objectif V1</span>
        </div>
        <p style={S.cardBody}>{pitch.product.v1Promise}</p>
      </div>

      <p style={S.techNote}>{pitch.product.techStack}</p>
    </div>
  );
}

function StepMarket({ pitch }: { pitch: any }) {
  const items = [
    { label: "Cible", text: pitch.market.target, icon: "◉" },
    { label: "Taille du marché", text: pitch.market.size, icon: "◈" },
    { label: "Compétition", text: pitch.market.competition, icon: "◇" },
    { label: "Timing", text: pitch.market.timing, icon: "◆" },
  ];

  return (
    <div>
      <p style={S.stepTag}>Le marché</p>
      <h2 style={S.sectionTitle}>Ton terrain de jeu</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {items.map((item) => (
          <div key={item.label} style={S.marketItem}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: "#5b5fc7" }}>{item.icon}</span>
              <span style={S.marketLabel}>{item.label}</span>
            </div>
            <p style={S.marketText}>{item.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepTeam({ pitch }: { pitch: any }) {
  return (
    <div>
      <p style={S.stepTag}>L'équipe</p>
      <h2 style={S.sectionTitle}>Les fondateurs</h2>

      {/* CEO */}
      <div style={S.founderCardPrimary}>
        <div style={S.founderHeader}>
          <div style={S.avatarCEO}>T</div>
          <div>
            <p style={S.founderName}>Toi — CEO</p>
            <p style={S.founderMeta}>70% equity · Full-time · Pas de salaire</p>
          </div>
        </div>
        <p style={S.founderBody}>{pitch.founders.ceo.role}</p>
        <p style={{ ...S.founderBody, color: "rgba(255,255,255,0.6)" }}>{pitch.founders.ceo.background}</p>
        <p style={S.founderHighlight}>{pitch.founders.ceo.commitment}</p>
      </div>

      {/* CPO */}
      <div style={S.founderCardSecondary}>
        <div style={S.founderHeader}>
          <div style={S.avatarCPO}>A</div>
          <div>
            <p style={S.founderName}>{pitch.founders.cpo.name} — CPO</p>
            <p style={S.founderMeta}>30% equity · Mi-temps · CHU Bordeaux</p>
          </div>
        </div>
        <p style={S.founderBody}>{pitch.founders.cpo.role}</p>
        <p style={{ ...S.founderBody, color: "rgba(255,255,255,0.6)" }}>{pitch.founders.cpo.background}</p>
        <p style={{ ...S.founderBody, color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{pitch.founders.cpo.commitment}</p>
        <div style={S.valueCallout}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#4ade80" }}>{pitch.founders.cpo.value}</p>
        </div>
      </div>
    </div>
  );
}

function StepReality({ pitch }: { pitch: any }) {
  return (
    <div>
      <p style={S.stepTag}>La réalité</p>
      <h2 style={S.sectionTitle}>Ce que tu as. Ce que tu n'as pas.</h2>

      {/* Constraints */}
      <div style={S.alertCard}>
        <div style={{ ...S.alertAccent, background: "#ef4444" }} />
        <p style={S.alertBody}>{pitch.stakes.constraints}</p>
      </div>

      {/* Runway */}
      <div style={{ ...S.alertCard, marginBottom: 28 }}>
        <div style={{ ...S.alertAccent, background: "#eab308" }} />
        <p style={S.alertBody}>{pitch.stakes.runway}</p>
      </div>

      {/* Initial metrics */}
      <div style={S.metricsGrid}>
        {[
          { label: "Trésorerie", value: pitch.initialMetrics.treasury, accent: true },
          { label: "Ownership", value: pitch.initialMetrics.ownership, accent: true },
          { label: "MRR", value: pitch.initialMetrics.mrr, accent: false },
          { label: "Masse salariale", value: pitch.initialMetrics.payroll, accent: false },
        ].map((m) => (
          <div key={m.label} style={S.metricCard}>
            <p style={S.metricLabel}>{m.label}</p>
            <p style={{ ...S.metricValue, color: m.accent ? "#a5a8ff" : "rgba(255,255,255,0.35)" }}>
              {m.value}
            </p>
          </div>
        ))}
      </div>

      {/* First move */}
      <div style={S.firstMoveCard}>
        <div style={S.firstMoveAccent} />
        <div>
          <p style={S.firstMoveLabel}>Première étape</p>
          <p style={S.firstMoveText}>{pitch.stakes.firstMove}</p>
        </div>
      </div>
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
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "0 20px 40px",
    position: "relative",
    overflow: "hidden",
  },
  ambientGlow: {
    position: "absolute",
    top: -120,
    left: "50%",
    transform: "translateX(-50%)",
    width: 600,
    height: 400,
    borderRadius: "50%",
    background: "radial-gradient(ellipse, rgba(91,95,199,0.12) 0%, transparent 70%)",
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
    width: 40,
    height: 40,
    borderRadius: "50%",
    background: "rgba(91,95,199,0.3)",
    animation: "pulse 1.5s ease-in-out infinite",
  },

  // Top bar
  topBar: {
    position: "relative",
    zIndex: 1,
    width: "100%",
    maxWidth: 620,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "24px 0 20px",
  },
  modeBadge: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 11,
    fontWeight: 700,
    color: "rgba(255,255,255,0.5)",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  modeDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#5b5fc7",
    boxShadow: "0 0 8px rgba(91,95,199,0.6)",
  },
  exitBtn: {
    padding: "6px 14px",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 6,
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },

  // Progress
  progressWrap: {
    position: "relative",
    zIndex: 1,
    width: "100%",
    maxWidth: 620,
    marginBottom: 40,
    padding: "0 8px",
  },
  progressTrack: {
    display: "flex",
    justifyContent: "space-between",
    position: "relative",
    zIndex: 1,
  },
  progressStep: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    background: "transparent",
    border: "none",
    padding: 0,
    transition: "opacity 0.3s",
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    transition: "all 0.3s ease",
  },
  progressLabel: {
    fontSize: 10,
    letterSpacing: 0.3,
    whiteSpace: "nowrap",
    transition: "all 0.3s",
  },
  progressLine: {
    position: "absolute",
    top: 3,
    left: 30,
    right: 30,
    height: 2,
    background: "rgba(255,255,255,0.06)",
    borderRadius: 1,
    zIndex: 0,
  },
  progressLineFill: {
    height: "100%",
    background: "linear-gradient(90deg, #5b5fc7, #7c7fff)",
    borderRadius: 1,
    transition: "width 0.4s ease",
  },

  // Content
  content: {
    position: "relative",
    zIndex: 1,
    maxWidth: 580,
    width: "100%",
    transition: "opacity 0.28s ease, transform 0.28s ease",
  },

  // Step tag
  stepTag: {
    margin: "0 0 12px",
    fontSize: 11,
    fontWeight: 700,
    color: "#5b5fc7",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },

  // Titles
  heroTitle: {
    fontSize: 26,
    fontWeight: 800,
    margin: "0 0 20px",
    lineHeight: 1.3,
    letterSpacing: -0.3,
    background: "linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.75) 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 800,
    margin: "0 0 20px",
    lineHeight: 1.3,
    letterSpacing: -0.2,
    color: "#fff",
  },

  // Text
  bodyText: {
    fontSize: 15,
    lineHeight: 1.75,
    color: "rgba(255,255,255,0.72)",
    margin: "0 0 24px",
  },

  // Stat card
  statCard: {
    position: "relative",
    padding: "18px 22px 18px 26px",
    background: "rgba(91,95,199,0.08)",
    borderRadius: 12,
    border: "1px solid rgba(91,95,199,0.15)",
    overflow: "hidden",
  },
  statCardAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    background: "linear-gradient(180deg, #5b5fc7, #7c7fff)",
    borderRadius: "3px 0 0 3px",
  },
  statValue: {
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
    color: "#b8baff",
    lineHeight: 1.5,
  },

  // Info card
  infoCard: {
    padding: "18px 22px",
    background: "rgba(255,255,255,0.03)",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.06)",
    marginBottom: 16,
  },
  cardIcon: {
    fontSize: 14,
    color: "#5b5fc7",
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "rgba(255,255,255,0.5)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cardBody: {
    margin: 0,
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
    lineHeight: 1.65,
  },
  techNote: {
    fontSize: 13,
    color: "rgba(255,255,255,0.35)",
    margin: 0,
    fontStyle: "italic",
  },

  // Market items
  marketItem: {
    padding: "14px 18px",
    background: "rgba(255,255,255,0.02)",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.05)",
  },
  marketLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "#a5a8ff",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  marketText: {
    margin: 0,
    fontSize: 14,
    color: "rgba(255,255,255,0.75)",
    lineHeight: 1.65,
  },

  // Founders
  founderCardPrimary: {
    padding: "22px 24px",
    background: "linear-gradient(135deg, rgba(91,95,199,0.1) 0%, rgba(91,95,199,0.04) 100%)",
    borderRadius: 14,
    border: "1px solid rgba(91,95,199,0.2)",
    marginBottom: 14,
  },
  founderCardSecondary: {
    padding: "22px 24px",
    background: "rgba(255,255,255,0.02)",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.07)",
  },
  founderHeader: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    marginBottom: 14,
  },
  avatarCEO: {
    width: 44,
    height: 44,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #5b5fc7, #7c7fff)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    fontSize: 17,
    color: "#fff",
    flexShrink: 0,
  },
  avatarCPO: {
    width: 44,
    height: 44,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #2d6a4f, #40916c)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    fontSize: 17,
    color: "#fff",
    flexShrink: 0,
  },
  founderName: {
    margin: 0,
    fontWeight: 700,
    fontSize: 16,
    color: "#fff",
  },
  founderMeta: {
    margin: "2px 0 0",
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
    fontWeight: 500,
  },
  founderBody: {
    margin: "0 0 8px",
    fontSize: 14,
    color: "rgba(255,255,255,0.75)",
    lineHeight: 1.6,
  },
  founderHighlight: {
    margin: 0,
    fontSize: 13,
    color: "#a5a8ff",
    fontWeight: 600,
  },
  valueCallout: {
    marginTop: 12,
    padding: "10px 14px",
    background: "rgba(74,222,128,0.06)",
    borderRadius: 8,
    border: "1px solid rgba(74,222,128,0.12)",
  },

  // Reality step
  alertCard: {
    position: "relative",
    padding: "16px 20px 16px 24px",
    background: "rgba(255,255,255,0.02)",
    borderRadius: 10,
    marginBottom: 12,
    overflow: "hidden",
  },
  alertAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderRadius: "3px 0 0 3px",
  },
  alertBody: {
    margin: 0,
    fontSize: 14,
    color: "rgba(255,255,255,0.82)",
    lineHeight: 1.65,
  },

  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginBottom: 24,
  },
  metricCard: {
    padding: "14px 16px",
    background: "rgba(255,255,255,0.025)",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.06)",
  },
  metricLabel: {
    margin: "0 0 4px",
    fontSize: 10,
    fontWeight: 700,
    color: "rgba(255,255,255,0.4)",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  metricValue: {
    margin: 0,
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.5,
  },

  firstMoveCard: {
    position: "relative",
    display: "flex",
    gap: 14,
    padding: "18px 20px 18px 24px",
    background: "rgba(91,95,199,0.08)",
    borderRadius: 12,
    border: "1px solid rgba(91,95,199,0.15)",
    overflow: "hidden",
  },
  firstMoveAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    background: "linear-gradient(180deg, #5b5fc7, #7c7fff)",
    borderRadius: "3px 0 0 3px",
  },
  firstMoveLabel: {
    margin: "0 0 6px",
    fontSize: 11,
    fontWeight: 700,
    color: "#a5a8ff",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  firstMoveText: {
    margin: 0,
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
    lineHeight: 1.65,
  },

  // Footer / Nav
  footer: {
    position: "relative",
    zIndex: 1,
    maxWidth: 580,
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 48,
  },
  navBtnSecondary: {
    padding: "11px 22px",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  navBtnPrimary: {
    padding: "12px 28px",
    background: "rgba(91,95,199,0.15)",
    border: "1px solid rgba(91,95,199,0.35)",
    borderRadius: 8,
    color: "#b8baff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  launchBtn: {
    padding: "14px 36px",
    background: "linear-gradient(135deg, #5b5fc7 0%, #4a4eb3 100%)",
    border: "1px solid rgba(91,95,199,0.4)",
    borderRadius: 10,
    color: "#fff",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    transition: "all 0.2s",
    boxShadow: "0 4px 24px rgba(91,95,199,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
  },
  launchBtnInner: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
};
