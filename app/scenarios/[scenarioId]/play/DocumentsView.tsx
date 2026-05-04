"use client";
// ══════════════════════════════════════════════════════════════════
// DocumentsView — Document list panel (right sidebar)
// ══════════════════════════════════════════════════════════════════
//
// Pure UI component. All state remains in page.tsx.
// ══════════════════════════════════════════════════════════════════

import React from "react";

// ── Types ──

interface DocumentItem {
  doc_id: string;
  label: string;
  usable_as_pj?: boolean;
  usable_as_attachment?: boolean;
  file_path?: string;
  image_path?: string;
  content?: string;
}

export interface DocumentsViewProps {
  documents: DocumentItem[];
  scenarioId: string;
  currentPhaseId: string | null;
  pacteSigned: boolean;
  onOpenInlineDoc: (title: string, content: string) => void;
}

// ── Component ──

export default function DocumentsView({
  documents,
  scenarioId,
  currentPhaseId,
  pacteSigned,
  onOpenInlineDoc,
}: DocumentsViewProps) {
  return (
    <div>
      {/* Document list — click opens in new tab */}
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {documents.map((doc) => {
          const hasPJ = doc.usable_as_pj || doc.usable_as_attachment;
          const fp = doc.file_path || "";
          const ip = doc.image_path || "";
          const isPublicPdf = fp.startsWith("/") && fp.endsWith(".pdf");
          const isImage = !!ip || /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(fp);
          const hasInlineContent = !fp && !ip && !!doc.content;
          const docUrl = hasInlineContent ? "#" : isImage ? (ip || fp) : isPublicPdf ? fp : `/api/download?file=${encodeURIComponent(fp)}&scenarioId=${encodeURIComponent(scenarioId)}`;
          const docIcon = isImage ? "🖼️" : hasInlineContent ? "📄" : "📑";
          const docType = isImage ? "Image" : hasInlineContent ? "Texte" : "PDF";
          const docTypeColor = isImage ? { fg: "#1e40af", bg: "#dbeafe" } : hasInlineContent ? { fg: "#16a34a", bg: "#f0fdf4" } : { fg: "#c2410c", bg: "#fff7ed" };
          return (
            <li
              key={doc.doc_id}
              style={{
                padding: "10px", marginBottom: 4, borderRadius: 6,
                background: "#fff", border: "1px solid #e8e8e8",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#333", display: "flex", alignItems: "center", gap: 6 }}>
                    <span>{docIcon}</span>
                    {doc.label}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: docTypeColor.fg, background: docTypeColor.bg, padding: "1px 6px", borderRadius: 8, fontWeight: 600 }}>
                      {docType}
                    </span>
                    {hasPJ && (
                      <span style={{ fontSize: 10, color: "#5b5fc7", background: "#f0f0ff", padding: "1px 6px", borderRadius: 8 }}>
                        PJ
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {hasInlineContent ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenInlineDoc(doc.label, doc.content!);
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: 4,
                        padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: "#f0f0ff", color: "#5b5fc7", textDecoration: "none",
                        border: "1px solid rgba(91,95,199,0.2)", cursor: "pointer",
                      }}
                    >
                      Lire
                    </button>
                  ) : (
                    <>
                      <a
                        href={docUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          display: "flex", alignItems: "center", gap: 4,
                          padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                          background: "#f0f0ff", color: "#5b5fc7", textDecoration: "none",
                          border: "1px solid rgba(91,95,199,0.2)", cursor: "pointer",
                        }}
                      >
                        Ouvrir
                      </a>
                      <a
                        href={docUrl}
                        download
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          display: "flex", alignItems: "center", gap: 4,
                          padding: "6px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                          background: "#fff", color: "#666", textDecoration: "none",
                          border: "1px solid #ddd", cursor: "pointer",
                        }}
                      >
                        ⬇
                      </a>
                    </>
                  )}
                </div>
              </div>
              {/* Pacte signing status */}
              {doc.doc_id === "pacte_associes" && currentPhaseId === "phase_3_pacte" && (
                <div style={{ marginTop: 8 }}>
                  {pacteSigned ? (
                    <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>✅ Pacte signé</div>
                  ) : (
                    <div style={{ fontSize: 11, color: "#555" }}>
                      Pour signer, ouvrez le <strong>mail du CTO</strong>.
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
