/**
 * InlineDocModal — modal that displays an inline document's title and
 * monospace content. Used by the briefing flow to show short text
 * documents (e.g. CV, mémo, fiche) without leaving the player.
 */

import React from "react";

export type InlineDoc = { title: string; content: string };

export type InlineDocModalProps = {
  doc: InlineDoc | null;
  onClose: () => void;
};

export function InlineDocModal({ doc, onClose }: InlineDocModalProps) {
  if (!doc) return null;
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          maxWidth: 700,
          width: "90%",
          maxHeight: "80vh",
          overflow: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, color: "#333" }}>{doc.title}</h3>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 20,
              cursor: "pointer",
              color: "#999",
            }}
          >
            ✕
          </button>
        </div>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontFamily: "'Segoe UI', system-ui, sans-serif",
            fontSize: 13,
            lineHeight: 1.6,
            color: "#444",
            margin: 0,
            background: "#fafafa",
            padding: 16,
            borderRadius: 8,
          }}
        >
          {doc.content}
        </pre>
      </div>
    </div>
  );
}
