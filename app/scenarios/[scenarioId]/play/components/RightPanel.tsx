/**
 * RightPanel — context / documents tabs on the right side of the player.
 *
 * Pure presentation. The DocumentsView tab content is delegated to the
 * existing DocumentsView component (kept as a child).
 */

import React from "react";
import DocumentsView from "../DocumentsView";

export type RightPanelTab = "info" | "docs";

export type RightPanelProps = {
  tab: RightPanelTab;
  onTabChange: (tab: RightPanelTab) => void;
  scenario: any;
  allDocuments: any[];
  scenarioId: string;
  currentPhaseId: string | null;
  pacteSigned: boolean;
  onOpenInlineDoc: (title: string, content: string) => void;
};

export function RightPanel({
  tab,
  onTabChange,
  scenario,
  allDocuments,
  scenarioId,
  currentPhaseId,
  pacteSigned,
  onOpenInlineDoc,
}: RightPanelProps) {
  const n = scenario.narrative;
  const showBackgroundFact =
    !!n?.background_fact && (scenario.meta as any)?.show_background_fact !== false;

  return (
    <aside
      style={{
        width: 280,
        flexShrink: 0,
        background: "#fafafa",
        borderLeft: "1px solid #e0e0e0",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #e8e8e8", flexShrink: 0 }}>
        <button
          onClick={() => onTabChange("info")}
          style={{
            flex: 1,
            padding: "10px",
            border: "none",
            cursor: "pointer",
            background: tab === "info" ? "#fff" : "transparent",
            borderBottom: tab === "info" ? "2px solid #5b5fc7" : "2px solid transparent",
            fontSize: 12,
            fontWeight: tab === "info" ? 700 : 500,
            color: tab === "info" ? "#5b5fc7" : "#666",
          }}
        >
          📋 Contexte
        </button>
        <button
          onClick={() => onTabChange("docs")}
          style={{
            flex: 1,
            padding: "10px",
            border: "none",
            cursor: "pointer",
            background: tab === "docs" ? "#fff" : "transparent",
            borderBottom: tab === "docs" ? "2px solid #5b5fc7" : "2px solid transparent",
            fontSize: 12,
            fontWeight: tab === "docs" ? 700 : 500,
            color: tab === "docs" ? "#5b5fc7" : "#666",
          }}
        >
          📁 Documents ({allDocuments.length})
        </button>
      </div>

      {/* Panel content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
        {tab === "info" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {n?.context && <NarrativeBlock label="Contexte" body={n.context} />}
            {n?.mission && <NarrativeBlock label="Mission" body={n.mission} />}
            {n?.initial_situation && (
              <NarrativeBlock label="Situation initiale" body={n.initial_situation} />
            )}
            {n?.trigger && <NarrativeBlock label="Déclencheur" body={n.trigger} />}
            {showBackgroundFact && (
              <div
                style={{
                  padding: 10,
                  background: "#fff8e6",
                  borderRadius: 6,
                  border: "1px solid #f5d680",
                }}
              >
                <h4
                  style={{
                    margin: "0 0 4px",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#b8860b",
                    textTransform: "uppercase",
                  }}
                >
                  Info vérifiée
                </h4>
                <p style={{ margin: 0, fontSize: 12, color: "#444", lineHeight: 1.5 }}>
                  {n!.background_fact}
                </p>
              </div>
            )}
          </div>
        )}

        {tab === "docs" && (
          <DocumentsView
            documents={allDocuments}
            scenarioId={scenarioId}
            currentPhaseId={currentPhaseId}
            pacteSigned={pacteSigned}
            onOpenInlineDoc={(title, content) => onOpenInlineDoc(title, content)}
          />
        )}
      </div>
    </aside>
  );
}

function NarrativeBlock({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <h4
        style={{
          margin: "0 0 4px",
          fontSize: 11,
          fontWeight: 700,
          color: "#5b5fc7",
          textTransform: "uppercase",
        }}
      >
        {label}
      </h4>
      <p style={{ margin: 0, fontSize: 12, color: "#444", lineHeight: 1.5 }}>{body}</p>
    </div>
  );
}
