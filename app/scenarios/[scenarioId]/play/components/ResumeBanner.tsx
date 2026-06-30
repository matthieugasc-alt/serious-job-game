/**
 * ResumeBanner — orange banner shown when the founder resumes a phase
 * after a quit/interrupt (penalty applied).
 *
 * Pure presentation. The displayed numbers ("15 jours" / "125 €") are
 * hard-coded for now because they were hard-coded inline in page.tsx;
 * once the resume penalty model is parameterised the props can grow.
 */

import React from "react";

export type ResumeBannerProps = {
  visible: boolean;
  onDismiss: () => void;
};

export function ResumeBanner({ visible, onDismiss }: ResumeBannerProps) {
  if (!visible) return null;
  return (
    <div
      style={{
        background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
        border: "1px solid #f59e0b",
        borderRadius: 0,
        padding: "12px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexShrink: 0,
        zIndex: 100,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 20 }}>⏱</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#92400e" }}>
            Reprise après interruption
          </div>
          <div style={{ fontSize: 12, color: "#78350f", marginTop: 2 }}>
            Vous reprenez au début de cette phase. Cette interruption vous a coûté{" "}
            <strong>15 jours</strong> et <strong>125 €</strong> de charges.
          </div>
        </div>
      </div>
      <button
        onClick={onDismiss}
        style={{
          background: "rgba(146,64,14,0.1)",
          border: "1px solid rgba(146,64,14,0.2)",
          borderRadius: 6,
          padding: "4px 12px",
          color: "#92400e",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        Compris
      </button>
    </div>
  );
}

/**
 * SaveInfo — persistent purple strip shown to founders, reminding them
 * that the progression is autosaved at the start of each phase.
 */
export function SaveInfo({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      style={{
        background: "#f0f0ff",
        borderBottom: "1px solid rgba(91,95,199,0.15)",
        padding: "6px 20px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexShrink: 0,
        zIndex: 99,
      }}
    >
      <span style={{ fontSize: 12, color: "#5b5fc7" }}>💾</span>
      <span style={{ fontSize: 11, color: "#5b5fc7", fontWeight: 500 }}>
        Votre progression est sauvegardée au début de chaque phase.
      </span>
    </div>
  );
}
