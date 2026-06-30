/**
 * DebugPanel — diagnostic widget shown when ?debug=1.
 *
 * Collapsible bottom-left panel with phase id, score, completion rules,
 * mail config, flags, and "skip to phase" buttons.
 */

import React from "react";

export type DebugPanelProps = {
  debugMode: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  scenario: any;
  session: any;
  view: any;
  allDocumentsCount: number;
  allDocumentsRawCount: number;
  onJumpToPhase: (idx: number) => void;
};

export function DebugPanel({
  debugMode,
  collapsed,
  onToggleCollapsed,
  scenario,
  session,
  view,
  allDocumentsCount,
  allDocumentsRawCount,
  onJumpToPhase,
}: DebugPanelProps) {
  if (!debugMode || !view || !session || !scenario) return null;

  const phase = scenario.phases[session.currentPhaseIndex];
  const pid = phase?.phase_id || "?";
  const rules = phase?.completion_rules || {};
  const mc = phase?.mail_config;
  const flagEntries = Object.entries(session.flags).filter(([, v]) => v);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 12,
        left: 12,
        zIndex: 9999,
        background: "rgba(15,15,30,0.95)",
        color: "#e0e0e0",
        borderRadius: 10,
        border: "1px solid rgba(91,95,199,0.5)",
        fontSize: 11,
        fontFamily: "monospace",
        maxWidth: 380,
        boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        onClick={onToggleCollapsed}
        style={{
          padding: "6px 12px",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: collapsed ? "none" : "1px solid rgba(255,255,255,0.1)",
          userSelect: "none",
        }}
      >
        <span style={{ fontWeight: 700, color: "#a5a8ff" }}>DEBUG {pid}</span>
        <span style={{ color: "rgba(255,255,255,0.4)" }}>{collapsed ? "+" : "-"}</span>
      </div>
      {!collapsed && (
        <div style={{ padding: "8px 12px", lineHeight: 1.7 }}>
          <div>
            <span style={{ color: "#888" }}>Phase:</span>{" "}
            <span style={{ color: "#fff", fontWeight: 600 }}>{pid}</span>{" "}
            <span style={{ color: "#888" }}>({phase?.title})</span>
          </div>
          <div>
            <span style={{ color: "#888" }}>Focus:</span>{" "}
            <span style={{ color: phase?.phase_focus ? "#a5a8ff" : "#555" }}>
              {phase?.phase_focus
                ? phase.phase_focus.slice(0, 80) + (phase.phase_focus.length > 80 ? "..." : "")
                : "(aucun)"}
            </span>
          </div>
          <div>
            <span style={{ color: "#888" }}>Score:</span> {session.scores[pid] || 0} |{" "}
            <span style={{ color: "#888" }}>canAdvance:</span>{" "}
            <span style={{ color: view.canAdvance ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
              {view.canAdvance ? "OUI" : "NON"}
            </span>
          </div>
          <div>
            <span style={{ color: "#888" }}>Rules:</span>{" "}
            {rules.min_score !== undefined ? `min_score=${rules.min_score}` : ""}
            {rules.any_flags ? `any_flags=[${rules.any_flags.join(", ")}]` : ""}
            {rules.all_flags ? `all_flags=[${rules.all_flags.join(", ")}]` : ""}
            {!rules.min_score && !rules.any_flags && !rules.all_flags ? "fallback (2 msgs)" : ""}
          </div>
          {mc && (
            <div>
              <span style={{ color: "#888" }}>Mail:</span> send_advances=
              {mc.send_advances_phase ? "true" : "false"} | flags={JSON.stringify(mc.on_send_flags)}
            </div>
          )}
          <div>
            <span style={{ color: "#888" }}>Docs:</span> {allDocumentsCount}/{allDocumentsRawCount}{" "}
            visibles
            {allDocumentsRawCount > allDocumentsCount
              ? ` (${allDocumentsRawCount - allDocumentsCount} locked)`
              : ""}
          </div>
          {flagEntries.length > 0 && (
            <div>
              <span style={{ color: "#888" }}>Flags:</span>{" "}
              {flagEntries.map(([k]) => k).join(", ")}
            </div>
          )}
          <div style={{ marginTop: 6, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 6 }}>
            <div style={{ color: "#888", marginBottom: 4 }}>Jump to phase:</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {scenario.phases.map((p: any, idx: number) => (
                <button
                  key={p.phase_id}
                  disabled={idx === session.currentPhaseIndex}
                  onClick={() => onJumpToPhase(idx)}
                  style={{
                    padding: "2px 8px",
                    fontSize: 10,
                    borderRadius: 4,
                    border:
                      idx === session.currentPhaseIndex
                        ? "1px solid #a5a8ff"
                        : "1px solid rgba(255,255,255,0.2)",
                    background:
                      idx === session.currentPhaseIndex
                        ? "rgba(91,95,199,0.3)"
                        : "rgba(255,255,255,0.05)",
                    color: idx === session.currentPhaseIndex ? "#a5a8ff" : "#ccc",
                    cursor: idx === session.currentPhaseIndex ? "default" : "pointer",
                    opacity: idx === session.currentPhaseIndex ? 0.6 : 1,
                  }}
                >
                  P{idx + 1}: {p.phase_id.slice(0, 15)}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 4, color: "#555", fontSize: 10 }}>?debug=1 | Ctrl+D toggle</div>
        </div>
      )}
    </div>
  );
}
