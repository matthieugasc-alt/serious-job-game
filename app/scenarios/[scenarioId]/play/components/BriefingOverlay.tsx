/**
 * BriefingOverlay — full-screen modal listing the scenario narrative
 * (context, mission, initial_situation) and the document deck. Clicking
 * a document closes the overlay and reveals it in the right panel.
 */

import React from "react";

export type BriefingScenario = {
  meta?: { title?: string };
  narrative?: {
    context?: string;
    mission?: string;
    initial_situation?: string;
  };
};

export type BriefingDoc = {
  doc_id: string;
  label: string;
  image_path?: string;
  file_path?: string;
};

export type BriefingOverlayProps = {
  visible: boolean;
  scenario: BriefingScenario;
  documents: BriefingDoc[];
  onClose: () => void;
  onSelectDoc: (docId: string) => void;
};

export function BriefingOverlay({
  visible,
  scenario,
  documents,
  onClose,
  onSelectDoc,
}: BriefingOverlayProps) {
  if (!visible) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 14,
          maxWidth: 900,
          width: "100%",
          maxHeight: "85vh",
          overflow: "hidden",
          boxShadow: "0 8px 40px rgba(0,0,0,0.25)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 24px",
            background: "#292929",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderRadius: "14px 14px 0 0",
            flexShrink: 0,
          }}
        >
          <div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#7b7fff",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              Briefing
            </span>
            <h2 style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 700 }}>
              {scenario.meta?.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#fff",
              fontSize: 24,
              cursor: "pointer",
              padding: "4px 8px",
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            {scenario.narrative?.context && (
              <div style={{ padding: 16, background: "#f8f9fc", borderRadius: 10, border: "1px solid #e2e4ea" }}>
                <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#1a3c6e" }}>Contexte</h3>
                <p style={{ margin: 0, fontSize: 13, color: "#444", lineHeight: 1.6 }}>
                  {scenario.narrative.context}
                </p>
              </div>
            )}
            {scenario.narrative?.mission && (
              <div style={{ padding: 16, background: "#f8f9fc", borderRadius: 10, border: "1px solid #e2e4ea" }}>
                <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#1a3c6e" }}>Mission</h3>
                <p style={{ margin: 0, fontSize: 13, color: "#444", lineHeight: 1.6 }}>
                  {scenario.narrative.mission}
                </p>
              </div>
            )}
          </div>
          {scenario.narrative?.initial_situation && (
            <div
              style={{
                padding: 16,
                background: "#fffbeb",
                borderRadius: 10,
                border: "1px solid #fde68a",
                marginBottom: 24,
              }}
            >
              <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#92400e" }}>
                Situation initiale
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: "#78350f", lineHeight: 1.6 }}>
                {scenario.narrative.initial_situation}
              </p>
            </div>
          )}

          {/* Documents */}
          <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: "#1a3c6e" }}>
            📁 Documents de travail
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            {documents.map((doc) => {
              const hasImage = !!doc.image_path;
              const hasPDF = !!doc.file_path && doc.file_path.endsWith(".pdf");
              const docIcon = hasImage ? "🖼️" : hasPDF ? "📑" : "📄";
              return (
                <div
                  key={doc.doc_id}
                  onClick={() => onSelectDoc(doc.doc_id)}
                  style={{
                    padding: 14,
                    borderRadius: 10,
                    cursor: "pointer",
                    background: "#fff",
                    border: "1px solid #e2e4ea",
                    transition: "all .15s",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#5b5fc7";
                    e.currentTarget.style.boxShadow = "0 2px 8px rgba(91,95,199,0.12)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#e2e4ea";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  {hasImage && (
                    <div style={{ height: 100, borderRadius: 6, overflow: "hidden", background: "#eee" }}>
                      <img
                        src={doc.image_path}
                        alt={doc.label}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </div>
                  )}
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>
                    {docIcon} {doc.label}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {hasPDF && (
                      <span
                        style={{
                          fontSize: 10,
                          color: "#c2410c",
                          background: "#fff7ed",
                          padding: "1px 6px",
                          borderRadius: 8,
                          fontWeight: 600,
                        }}
                      >
                        PDF
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: "#5b5fc7", fontWeight: 600 }}>
                      Cliquer pour consulter →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
