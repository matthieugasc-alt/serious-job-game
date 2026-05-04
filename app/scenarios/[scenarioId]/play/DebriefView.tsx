"use client";
// ══════════════════════════════════════════════════════════════════
// DebriefView — Classic debrief (non-Founder scenarios)
// ══════════════════════════════════════════════════════════════════
//
// Pure UI component. All navigation callbacks come from page.tsx.
// ══════════════════════════════════════════════════════════════════

import React from "react";

// ── Types ──

export interface DebriefViewProps {
  debriefData: any;
  isFounderScenario: boolean;
  scenarioId: string;
  onReplay: () => void;
  onHistory: () => void;
  onHome: () => void;
  onContinueCampaign: () => void;
}

// ── Rating config ──

const ratingConfig: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  maitrise: { label: "Maîtrisé", color: "#1a7f37", bg: "#dcfce7", icon: "★" },
  acquis: { label: "Acquis", color: "#2563eb", bg: "#dbeafe", icon: "●" },
  en_cours: { label: "En cours", color: "#b45309", bg: "#fef3c7", icon: "◐" },
  non_acquis: { label: "Non acquis", color: "#991b1b", bg: "#fee2e2", icon: "○" },
};

// ── Component ──

export default function DebriefView({
  debriefData,
  isFounderScenario,
  scenarioId,
  onReplay,
  onHistory,
  onHome,
  onContinueCampaign,
}: DebriefViewProps) {
  const aiEnding = debriefData?.ending || "failure";
  const endingColor = aiEnding === "success" ? "#16a34a" : aiEnding === "partial_success" ? "#d97706" : "#dc2626";
  const endingEmoji = aiEnding === "success" ? "🎉" : aiEnding === "partial_success" ? "⚠️" : "💡";
  const endingLabel = aiEnding === "success" ? "Succès" : aiEnding === "partial_success" ? "Succès partiel" : "Échec";

  return (
    <div style={{ minHeight: "100vh", background: "#f3f2f1", fontFamily: "'Segoe UI', system-ui, sans-serif", overflowY: "auto" }}>
      {/* Header banner */}
      <div style={{ background: endingColor, padding: "36px 24px", textAlign: "center", color: "#fff" }}>
        <div style={{ fontSize: 44, marginBottom: 8 }}>{endingEmoji}</div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 8px" }}>{endingLabel}</h1>
        <p style={{ fontSize: 15, opacity: 0.92, maxWidth: 650, margin: "0 auto", lineHeight: 1.6 }}>
          {debriefData.ending_narrative || debriefData.overall_summary}
        </p>
      </div>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 20px" }}>

        {/* Global summary */}
        {debriefData.overall_summary && (
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,.05)", marginBottom: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#333", margin: "0 0 10px" }}>Résumé global</h2>
            <p style={{ margin: 0, fontSize: 14, color: "#444", lineHeight: 1.7 }}>{debriefData.overall_summary}</p>
          </div>
        )}

        {/* Per-phase AI analysis */}
        {debriefData.phases?.map((phase: any, idx: number) => {
          return (
            <div key={idx} style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,.05)", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#333" }}>
                  Phase {idx + 1} — {phase.phase_title}
                </h3>
              </div>
              {phase.phase_summary && (
                <p style={{ margin: "0 0 14px", fontSize: 13, color: "#555", lineHeight: 1.6, fontStyle: "italic" }}>{phase.phase_summary}</p>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {phase.competencies?.map((comp: any, ci: number) => {
                  const cfg = ratingConfig[comp.rating] || ratingConfig.non_acquis;
                  return (
                    <div key={ci} style={{ padding: "10px 14px", background: "#fafafa", borderRadius: 8, borderLeft: `3px solid ${cfg.color}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>{comp.name}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg, padding: "2px 10px", borderRadius: 12 }}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: 12, color: "#666", lineHeight: 1.5 }}>{comp.justification}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Strengths & Improvements side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
          {debriefData.strengths?.length > 0 && (
            <div style={{ background: "#f0fdf4", borderRadius: 12, padding: 20, border: "1px solid #bbf7d0" }}>
              <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: "#16a34a" }}>Points forts</h3>
              {debriefData.strengths.map((s: string, i: number) => (
                <p key={i} style={{ margin: "0 0 6px", fontSize: 13, color: "#333", lineHeight: 1.5 }}>• {s}</p>
              ))}
            </div>
          )}
          {debriefData.improvements?.length > 0 && (
            <div style={{ background: "#fffbeb", borderRadius: 12, padding: 20, border: "1px solid #fde68a" }}>
              <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: "#b45309" }}>Axes d'amélioration</h3>
              {debriefData.improvements.map((s: string, i: number) => (
                <p key={i} style={{ margin: "0 0 6px", fontSize: 13, color: "#333", lineHeight: 1.5 }}>• {s}</p>
              ))}
            </div>
          )}
        </div>

        {/* Pedagogical advice */}
        {debriefData.pedagogical_advice && (
          <div style={{ background: "#f0f0ff", borderRadius: 12, padding: 20, border: "1px solid #c7d2fe", marginBottom: 24 }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#5b5fc7" }}>Conseil pédagogique</h3>
            <p style={{ margin: 0, fontSize: 13, color: "#444", lineHeight: 1.6 }}>{debriefData.pedagogical_advice}</p>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", paddingBottom: 40 }}>
          {isFounderScenario ? (
            <button
              onClick={onContinueCampaign}
              style={{ padding: "12px 28px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14, boxShadow: "0 2px 8px rgba(22,163,74,.3)" }}
            >
              Continuer la campagne
            </button>
          ) : (
            <>
              <button
                onClick={onReplay}
                style={{ padding: "12px 28px", background: "#5b5fc7", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14, boxShadow: "0 2px 8px rgba(91,95,199,.3)" }}
              >
                Rejouer le scénario
              </button>
              <button
                onClick={onHistory}
                style={{ padding: "12px 28px", background: "#fff", color: "#5b5fc7", border: "1px solid #5b5fc7", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14 }}
              >
                Historique
              </button>
            </>
          )}
          <button
            onClick={onHome}
            style={{ padding: "12px 28px", background: "#fff", color: "#666", border: "1px solid #ddd", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14 }}
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    </div>
  );
}
