/**
 * PlayerHeader — top toolbar of the player screen.
 *
 * Pure presentation. Renders the home button, scenario title, phase
 * dots, briefing button and clock. All click handlers are passed in;
 * the parent owns the navigation / overlay open / scenario state.
 */

import React from "react";

export type PhaseLite = {
  phase_id?: string;
  id?: string;
  title?: string;
};

export type PlayerHeaderProps = {
  scenarioTitle: string;
  phases: PhaseLite[];
  completedPhases: string[];
  currentPhaseIndex: number;
  simulatedTime: string;
  showBriefingOverlay: boolean;
  onHome: () => void;
  onOpenBriefing: () => void;
};

export function PlayerHeader({
  scenarioTitle,
  phases,
  completedPhases,
  currentPhaseIndex,
  simulatedTime,
  showBriefingOverlay,
  onHome,
  onOpenBriefing,
}: PlayerHeaderProps) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        height: 48,
        background: "#292929",
        color: "#fff",
        padding: "0 16px",
        gap: 16,
        flexShrink: 0,
      }}
    >
      {/* Home button */}
      <button
        onClick={onHome}
        title="Retour à l'accueil"
        style={{
          background: "none",
          border: "none",
          color: "#fff",
          cursor: "pointer",
          fontSize: 18,
          padding: "4px 8px",
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      </button>

      <div style={{ height: 24, width: 1, background: "#555" }} />

      {/* Title */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "block",
          }}
        >
          {scenarioTitle}
        </span>
      </div>

      {/* Phase progression dots */}
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        {phases.map((p, i) => {
          const pid = p.phase_id || p.id || `phase_${i}`;
          const done = completedPhases.includes(pid);
          const current = i === currentPhaseIndex;
          return (
            <div
              key={pid}
              title={p.title}
              style={{
                width: current ? "auto" : 8,
                height: 8,
                borderRadius: current ? 10 : "50%",
                background: done ? "#44b553" : current ? "#5b5fc7" : "#555",
                padding: current ? "2px 10px" : 0,
                color: "#fff",
                fontSize: 11,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                transition: "all .2s",
              }}
            >
              {current ? p.title : ""}
            </div>
          );
        })}
      </div>

      <div style={{ height: 24, width: 1, background: "#555" }} />

      {/* Briefing button */}
      <button
        onClick={onOpenBriefing}
        title="Consulter le briefing et vos documents"
        style={{
          background: showBriefingOverlay ? "rgba(91,95,199,0.3)" : "none",
          border: "1px solid rgba(255,255,255,0.2)",
          color: "#fff",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          padding: "4px 12px",
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          gap: 5,
          transition: "all .15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(91,95,199,0.3)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = showBriefingOverlay ? "rgba(91,95,199,0.3)" : "none";
        }}
      >
        📁 Briefing
      </button>

      <div style={{ height: 24, width: 1, background: "#555" }} />

      {/* Clock */}
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: "#7b7fff",
          minWidth: 52,
          textAlign: "right",
        }}
      >
        {simulatedTime}
      </div>
    </header>
  );
}
