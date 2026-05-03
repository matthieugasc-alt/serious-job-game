"use client";
// ══════════════════════════════════════════════════════════════════
// Contract module — reusable split-view contract overlay
// ══════════════════════════════════════════════════════════════════
//
// Renders:
//  - Left panel: structured articles with strikethrough/highlight amendments
//  - Right panel: negotiation thread with counterpart
//  - Footer: signature / refuse actions
//
// This component is UI-only. All state management stays in page.tsx.
// ══════════════════════════════════════════════════════════════════

import React, { useRef, useEffect } from "react";
import type { ContractClause, ContractThreadMessage } from "./types";

// ── Props ──

export interface ContractOverlayProps {
  /** Whether the overlay is visible */
  visible: boolean;
  /** Close the overlay */
  onClose: () => void;

  // ── Document ──
  /** Overlay title (e.g. "Pacte d'associés") */
  title: string;
  /** Subtitle line (e.g. "Orisio SAS · 03/05/2026") */
  subtitle: string;
  /** Structured articles to display */
  clauses: ContractClause[];
  /** Optional header content rendered above articles (e.g. parties, preamble) */
  headerContent?: React.ReactNode;
  /** Optional footer content rendered below articles (e.g. signatures block) */
  footerContent?: React.ReactNode;

  // ── Negotiation thread ──
  /** The negotiation thread messages */
  thread: ContractThreadMessage[];
  /** Whether the AI is currently responding */
  isLoading: boolean;
  /** Current input value */
  inputValue: string;
  /** Input change handler */
  onInputChange: (value: string) => void;
  /** Send message handler */
  onSendMessage: () => void;
  /** Counterpart display info */
  counterpart: {
    name: string;
    role: string;
    color: string;
    initials: string;
  };
  /** Player display info */
  playerName: string;
  /** Loading text (e.g. "Sofia est en train de répondre...") */
  loadingText?: string;
  /** Input placeholder */
  inputPlaceholder?: string;
  /** Whether to show the negotiation panel (hide after signature) */
  showNegotiation?: boolean;

  // ── Signature ──
  /** Whether the contract has been signed */
  isSigned: boolean;
  /** Sign button handler */
  onSign: () => void;
  /** Optional: custom sign button label */
  signLabel?: string;
  /** Summary text shown in the signature area */
  signatureSummary?: string;

  // ── Progress bar ──
  /** Progress steps (optional) */
  progressSteps?: Array<{ label: string; active: boolean }>;
  /** Optional instruction banner */
  instructionBanner?: React.ReactNode;
}

// ── Component ──

export default function ContractOverlay({
  visible,
  onClose,
  title,
  subtitle,
  clauses,
  headerContent,
  footerContent,
  thread,
  isLoading,
  inputValue,
  onInputChange,
  onSendMessage,
  counterpart,
  playerName,
  loadingText,
  inputPlaceholder = "Discuter une clause...",
  showNegotiation = true,
  isSigned,
  onSign,
  signLabel = "Signer",
  signatureSummary,
  progressSteps,
  instructionBanner,
}: ContractOverlayProps) {
  const threadRef = useRef<HTMLDivElement>(null);

  // Auto-scroll thread
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [thread, isLoading]);

  if (!visible) return null;

  const hasModifications = clauses.some((a) => a.modifiedContent !== null);
  const modifiedCount = clauses.filter((a) => a.modifiedContent !== null).length;
  const canSend = inputValue.trim() && !isLoading;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10001,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          maxWidth: 900,
          width: "100%",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
        }}
      >
        {/* ── Header bar ── */}
        <div
          style={{
            padding: "14px 24px",
            background: "linear-gradient(135deg, #1a1a2e, #16213e)",
            borderRadius: "16px 16px 0 0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "#ffd700",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                fontWeight: 700,
                color: "#1a1a2e",
              }}
            >
              {"✍️"}
            </div>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#fff",
                }}
              >
                {title}
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  color: "rgba(255,255,255,0.6)",
                }}
              >
                {subtitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.1)",
              border: "none",
              fontSize: 18,
              color: "#fff",
              cursor: "pointer",
              padding: "4px 10px",
              borderRadius: 6,
            }}
          >
            {"✕"}
          </button>
        </div>

        {/* ── Progress indicator ── */}
        {progressSteps && (
          <div
            style={{
              padding: "8px 24px",
              background: "#f8f9fa",
              borderBottom: "1px solid #e8e8e8",
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 12,
            }}
          >
            {progressSteps.map((step, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span style={{ color: "#ccc" }}>{"→"}</span>}
                <span
                  style={{
                    color: step.active ? "#16a34a" : "#666",
                    fontWeight: step.active ? 700 : 500,
                  }}
                >
                  {step.label}
                </span>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* ── Instruction banner ── */}
        {instructionBanner}

        {/* ── Two-panel layout ── */}
        <div
          style={{
            flex: 1,
            display: "flex",
            overflow: "hidden",
            minHeight: 0,
          }}
        >
          {/* LEFT — Contract body (read-only, structured articles) */}
          <div
            style={{
              flex: 1,
              overflow: "auto",
              background: "#fff",
              padding: "24px 32px",
              fontFamily: "Georgia, 'Times New Roman', serif",
            }}
          >
            {/* Document header */}
            <h1
              style={{
                textAlign: "center",
                color: "#1a1a2e",
                marginBottom: 4,
                fontSize: 18,
              }}
            >
              {title}
            </h1>
            <p
              style={{
                textAlign: "center",
                color: "#888",
                fontSize: 12,
                marginBottom: 24,
              }}
            >
              {subtitle}
            </p>
            <hr
              style={{
                border: "none",
                borderTop: "1px solid #e0e0e0",
                margin: "16px 0",
              }}
            />

            {/* Optional preamble (parties, etc.) */}
            {headerContent}

            {/* Structured articles */}
            {clauses.map((article) => (
              <div key={article.id} style={{ marginBottom: 16 }}>
                <h2
                  style={{
                    fontSize: 14,
                    color: "#1a1a2e",
                    marginBottom: 6,
                  }}
                >
                  {article.title}
                </h2>
                {article.modifiedContent ? (
                  <>
                    <p
                      style={{
                        fontSize: 13,
                        lineHeight: 1.7,
                        color: "#999",
                        textDecoration: "line-through",
                        marginBottom: 6,
                        whiteSpace: "pre-line",
                      }}
                    >
                      {article.content}
                    </p>
                    <p
                      style={{
                        fontSize: 13,
                        lineHeight: 1.7,
                        color: "#16a34a",
                        fontWeight: 500,
                        background: "rgba(22,163,106,0.06)",
                        padding: "8px 12px",
                        borderLeft: "3px solid #16a34a",
                        borderRadius: "0 6px 6px 0",
                        whiteSpace: "pre-line",
                      }}
                    >
                      {article.modifiedContent}
                    </p>
                  </>
                ) : (
                  <p
                    style={{
                      fontSize: 13,
                      lineHeight: 1.7,
                      color: "#1a1a2e",
                      whiteSpace: "pre-line",
                    }}
                  >
                    {article.content}
                  </p>
                )}
              </div>
            ))}

            {/* Optional document footer (signature block, etc.) */}
            <hr
              style={{
                border: "none",
                borderTop: "1px solid #e0e0e0",
                margin: "20px 0",
              }}
            />
            {footerContent}
          </div>

          {/* RIGHT — Negotiation panel */}
          {showNegotiation && !isSigned && (
            <div
              style={{
                width: 320,
                minWidth: 280,
                display: "flex",
                flexDirection: "column",
                borderLeft: "1px solid #e8e8e8",
                background: "#fafafa",
              }}
            >
              {/* Counterpart header */}
              <div
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid #e8e8e8",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: counterpart.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#fff",
                    }}
                  >
                    {counterpart.initials}
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#333",
                      }}
                    >
                      {counterpart.name}
                    </div>
                    <div style={{ fontSize: 10, color: "#888" }}>
                      {counterpart.role}
                    </div>
                  </div>
                </div>
                {hasModifications && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "4px 8px",
                      background: "rgba(22,163,106,0.08)",
                      border: "1px solid rgba(22,163,106,0.2)",
                      borderRadius: 6,
                      fontSize: 11,
                      color: "#16a34a",
                      fontWeight: 600,
                    }}
                  >
                    {modifiedCount} article(s) modifié(s)
                  </div>
                )}
              </div>

              {/* Thread messages */}
              <div
                ref={threadRef}
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "12px 16px",
                }}
              >
                {thread.length === 0 && (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "24px 8px",
                      color: "#aaa",
                      fontSize: 12,
                    }}
                  >
                    Lisez le contrat attentivement, puis discutez ici pour
                    négocier les clauses qui vous posent problème.
                  </div>
                )}
                {thread.map((msg, i) => {
                  const isCounterpart = msg.role === "counterpart";
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        gap: 8,
                        marginBottom: 10,
                        flexDirection: isCounterpart ? "row" : "row-reverse",
                      }}
                    >
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          flexShrink: 0,
                          background: isCounterpart
                            ? counterpart.color
                            : "#5b5fc7",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 9,
                          fontWeight: 700,
                          color: "#fff",
                        }}
                      >
                        {isCounterpart
                          ? counterpart.initials
                          : (playerName || "CEO").charAt(0).toUpperCase()}
                      </div>
                      <div
                        style={{
                          padding: "8px 12px",
                          borderRadius: 12,
                          fontSize: 12,
                          lineHeight: 1.5,
                          maxWidth: "85%",
                          wordBreak: "break-word",
                          background: isCounterpart ? "#fff" : "#5b5fc7",
                          color: isCounterpart ? "#333" : "#fff",
                          border: isCounterpart
                            ? "1px solid #e8e8e8"
                            : "none",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                        }}
                      >
                        {msg.content}
                      </div>
                    </div>
                  );
                })}
                {isLoading && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "#888",
                      fontStyle: "italic",
                      padding: "4px 0",
                    }}
                  >
                    {loadingText || `${counterpart.name} est en train de répondre...`}
                  </div>
                )}
              </div>

              {/* Input */}
              <div
                style={{
                  padding: "10px 16px",
                  borderTop: "1px solid #e8e8e8",
                  display: "flex",
                  gap: 8,
                }}
              >
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => onInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canSend) {
                      e.preventDefault();
                      onSendMessage();
                    }
                  }}
                  placeholder={inputPlaceholder}
                  disabled={isLoading}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    border: "1px solid #d4d4d8",
                    borderRadius: 8,
                    fontSize: 12,
                    outline: "none",
                    opacity: isLoading ? 0.6 : 1,
                  }}
                />
                <button
                  onClick={() => {
                    if (canSend) onSendMessage();
                  }}
                  style={{
                    padding: "8px 14px",
                    background: canSend ? "#5b5fc7" : "#ccc",
                    border: "none",
                    borderRadius: 8,
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: canSend ? "pointer" : "not-allowed",
                  }}
                >
                  {"↑"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Signature footer ── */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "2px solid #ffd700",
            background: isSigned ? "#f0fdf4" : "#fffbeb",
          }}
        >
          {!isSigned ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#333",
                    marginBottom: 4,
                  }}
                >
                  Signataire : {playerName || "CEO"} — Président, Orisio SAS
                </div>
                <div style={{ fontSize: 11, color: "#888" }}>
                  {signatureSummary ||
                    (hasModifications
                      ? `${modifiedCount} article(s) modifié(s) par négociation. La signature vaut acceptation de la version actuelle.`
                      : "Lisez le contrat et négociez si nécessaire avant de signer.")}
                </div>
              </div>
              <button
                onClick={onSign}
                style={{
                  padding: "12px 32px",
                  flexShrink: 0,
                  background: "linear-gradient(135deg, #ffd700, #ffb300)",
                  border: "2px solid #e6a800",
                  borderRadius: 10,
                  color: "#1a1a2e",
                  fontSize: 15,
                  fontWeight: 800,
                  cursor: "pointer",
                  boxShadow: "0 4px 16px rgba(255,215,0,0.3)",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.02)";
                  e.currentTarget.style.boxShadow =
                    "0 6px 24px rgba(255,215,0,0.4)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.boxShadow =
                    "0 4px 16px rgba(255,215,0,0.3)";
                }}
              >
                {"✍️"} {signLabel}
              </button>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "4px 0",
              }}
            >
              <span style={{ fontSize: 20 }}>{"✅"}</span>
              <div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#16a34a",
                  }}
                >
                  Contrat signé et envoyé
                </div>
                <div style={{ fontSize: 11, color: "#666" }}>
                  {playerName || "CEO"} —{" "}
                  {new Date().toLocaleDateString("fr-FR")}
                </div>
              </div>
              <button
                onClick={onClose}
                style={{
                  marginLeft: "auto",
                  padding: "8px 16px",
                  background: "#5b5fc7",
                  border: "none",
                  borderRadius: 8,
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Fermer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
