"use client";
// ══════════════════════════════════════════════════════════════════
// ClinicalContractOverlay — S3 clinical contract overlay
// ══════════════════════════════════════════════════════════════════
//
// Split-view overlay: articles left, negotiation thread right.
// All state remains in page.tsx — this is UI-only.
// ══════════════════════════════════════════════════════════════════

import React from "react";

// ── Types ──

interface ClinicalArticle {
  id: string;
  title: string;
  content: string;
  modifiedContent: string | null;
  toxic?: boolean;
  moderate?: boolean;
}

interface NegMessage {
  role: "player" | "juriste";
  content: string;
}

export interface ClinicalContractOverlayProps {
  visible: boolean;
  onClose: () => void;
  playerName: string;

  // Establishment info (resolved from flags)
  etablissementLabel: string;
  signataireName: string;
  juristeName: string;
  contactInfo: { name: string; color: string; initials: string };

  // Contract
  articles: ClinicalArticle[];

  // Negotiation thread
  thread: NegMessage[];
  threadLoading: boolean;
  inputValue: string;
  onInputChange: (v: string) => void;
  onSendMessage: () => void;

  // Signature / refusal
  signed: boolean;
  refused: boolean;
  onSign: () => void;
  onRefused: () => void;
}

// ── Component ──

export default function ClinicalContractOverlay({
  visible,
  onClose,
  playerName,
  etablissementLabel,
  signataireName,
  juristeName,
  contactInfo,
  articles,
  thread,
  threadLoading,
  inputValue,
  onInputChange,
  onSendMessage,
  signed,
  refused,
  onSign,
  onRefused,
}: ClinicalContractOverlayProps) {
  if (!visible) return null;

  const hasModifications = articles.some(a => a.modifiedContent !== null);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10001,
      background: "rgba(0,0,0,0.7)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, maxWidth: 900, width: "100%",
        maxHeight: "92vh", display: "flex", flexDirection: "column",
        boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
      }}>
        {/* Header */}
        <div style={{
          padding: "14px 24px", background: "linear-gradient(135deg, #1a1a2e, #16213e)",
          borderRadius: "16px 16px 0 0",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: "#ffd700", display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 16, fontWeight: 700, color: "#1a1a2e",
            }}>✍️</div>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#fff" }}>
                Convention de test pilote
              </h2>
              <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                {etablissementLabel} × Orisio SAS · {new Date().toLocaleDateString("fr-FR")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.1)", border: "none", fontSize: 18,
              color: "#fff", cursor: "pointer", padding: "4px 10px", borderRadius: 6,
            }}
          >✕</button>
        </div>

        {/* Two-panel layout: Contract (left) + Negotiation (right) */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

          {/* LEFT — Contract body (read-only, structured articles) */}
          <div style={{
            flex: 1, overflow: "auto", background: "#fff", padding: "24px 32px",
            fontFamily: "Georgia, 'Times New Roman', serif",
          }}>
            <h1 style={{ textAlign: "center", color: "#1a1a2e", marginBottom: 4, fontSize: 18 }}>Convention de test pilote</h1>
            <p style={{ textAlign: "center", color: "#888", fontSize: 12, marginBottom: 24 }}>{etablissementLabel} × Orisio SAS</p>
            <hr style={{ border: "none", borderTop: "1px solid #e0e0e0", margin: "16px 0" }} />
            <p style={{ fontSize: 13, lineHeight: 1.7, color: "#1a1a2e" }}><strong>Entre :</strong></p>
            <p style={{ fontSize: 13, lineHeight: 1.7, color: "#1a1a2e" }}>{etablissementLabel}, représenté(e) par {signataireName}<br/>Et Orisio SAS, représentée par {playerName || "CEO"}, Président</p>
            <hr style={{ border: "none", borderTop: "1px solid #e0e0e0", margin: "16px 0" }} />

            {articles.map((article) => (
              <div key={article.id} style={{ marginBottom: 16 }}>
                <h2 style={{ fontSize: 14, color: "#1a1a2e", marginBottom: 6 }}>{article.title}</h2>
                {article.modifiedContent ? (
                  <>
                    <p style={{
                      fontSize: 13, lineHeight: 1.7, color: "#999",
                      textDecoration: "line-through", marginBottom: 6,
                    }}>{article.content}</p>
                    <p style={{
                      fontSize: 13, lineHeight: 1.7, color: "#16a34a", fontWeight: 500,
                      background: "rgba(22,163,106,0.06)", padding: "8px 12px",
                      borderLeft: "3px solid #16a34a", borderRadius: "0 6px 6px 0",
                    }}>{article.modifiedContent}</p>
                  </>
                ) : (
                  <p style={{ fontSize: 13, lineHeight: 1.7, color: "#1a1a2e" }}>{article.content}</p>
                )}
              </div>
            ))}

            <hr style={{ border: "none", borderTop: "1px solid #e0e0e0", margin: "20px 0" }} />
            <p style={{ fontSize: 13, lineHeight: 1.7, color: "#1a1a2e" }}><strong>Pour {etablissementLabel} :</strong><br/>{signataireName} ✓</p>
            <p style={{ fontSize: 13, lineHeight: 1.7, color: "#1a1a2e" }}><strong>Pour Orisio SAS :</strong><br/>Signature : _________________________</p>
          </div>

          {/* RIGHT — Negotiation panel */}
          {!signed && !refused && (
            <div style={{
              width: 320, minWidth: 280, display: "flex", flexDirection: "column",
              borderLeft: "1px solid #e8e8e8", background: "#fafafa",
            }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #e8e8e8" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: contactInfo.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, color: "#fff",
                  }}>{contactInfo.initials}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#333" }}>{juristeName}</div>
                    <div style={{ fontSize: 10, color: "#888" }}>Juriste — {etablissementLabel}</div>
                  </div>
                </div>
                {hasModifications && (
                  <div style={{
                    marginTop: 8, padding: "4px 8px", background: "rgba(22,163,106,0.08)",
                    border: "1px solid rgba(22,163,106,0.2)", borderRadius: 6,
                    fontSize: 11, color: "#16a34a", fontWeight: 600,
                  }}>
                    {articles.filter(a => a.modifiedContent).length} article(s) modifié(s)
                  </div>
                )}
              </div>

              {/* Thread messages */}
              <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }} ref={(el) => { if (el) el.scrollTop = el.scrollHeight; }}>
                {thread.length === 0 && (
                  <div style={{ textAlign: "center", padding: "24px 8px", color: "#aaa", fontSize: 12 }}>
                    Lisez le contrat attentivement, puis discutez ici pour négocier les clauses qui vous posent problème.
                  </div>
                )}
                {thread.map((msg, i) => {
                  const isJuriste = msg.role === "juriste";
                  return (
                    <div key={i} style={{
                      display: "flex", gap: 8, marginBottom: 10,
                      flexDirection: isJuriste ? "row" : "row-reverse",
                    }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                        background: isJuriste ? contactInfo.color : "#5b5fc7",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 9, fontWeight: 700, color: "#fff",
                      }}>
                        {isJuriste ? contactInfo.initials : (playerName || "CEO").charAt(0).toUpperCase()}
                      </div>
                      <div style={{
                        padding: "8px 12px", borderRadius: 12, fontSize: 12, lineHeight: 1.5,
                        maxWidth: "85%", wordBreak: "break-word",
                        background: isJuriste ? "#fff" : "#5b5fc7",
                        color: isJuriste ? "#333" : "#fff",
                        border: isJuriste ? "1px solid #e8e8e8" : "none",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                      }}>
                        {msg.content}
                      </div>
                    </div>
                  );
                })}
                {threadLoading && (
                  <div style={{ fontSize: 11, color: "#888", fontStyle: "italic", padding: "4px 0" }}>
                    {juristeName} est en train de répondre...
                  </div>
                )}
              </div>

              {/* Input */}
              <div style={{ padding: "10px 16px", borderTop: "1px solid #e8e8e8", display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => onInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && inputValue.trim() && !threadLoading) {
                      e.preventDefault();
                      onSendMessage();
                    }
                  }}
                  placeholder="Discuter une clause..."
                  disabled={threadLoading}
                  style={{
                    flex: 1, padding: "8px 12px", border: "1px solid #d4d4d8",
                    borderRadius: 8, fontSize: 12, outline: "none",
                    opacity: threadLoading ? 0.6 : 1,
                  }}
                />
                <button
                  onClick={() => { if (inputValue.trim() && !threadLoading) onSendMessage(); }}
                  style={{
                    padding: "8px 14px", background: inputValue.trim() && !threadLoading ? "#5b5fc7" : "#ccc",
                    border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700,
                    cursor: inputValue.trim() && !threadLoading ? "pointer" : "not-allowed",
                  }}
                >↑</button>
              </div>
            </div>
          )}
        </div>

        {/* Signature / Refusal footer */}
        <div style={{
          padding: "14px 24px", borderTop: "2px solid #ffd700",
          background: signed ? "#f0fdf4" : refused ? "#fef2f2" : "#fffbeb",
        }}>
          {refused ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 20 }}>❌</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#dc2626" }}>
                  Contrat refusé par l&apos;établissement
                </div>
                <div style={{ fontSize: 11, color: "#666" }}>
                  Vos demandes ne sont pas acceptables. Discutez avec Alexandre pour trouver une alternative.
                </div>
              </div>
              <button
                onClick={onRefused}
                style={{
                  marginLeft: "auto", padding: "8px 16px",
                  background: "#5b5fc7", border: "none", borderRadius: 8,
                  color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                Parler à Alexandre
              </button>
            </div>
          ) : !signed ? (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 4 }}>
                  Signataire : {playerName || "CEO"} — Président, Orisio SAS
                </div>
                <div style={{ fontSize: 11, color: "#888" }}>
                  {hasModifications
                    ? `${articles.filter(a => a.modifiedContent).length} article(s) modifié(s) par négociation. La signature vaut acceptation de la version actuelle.`
                    : "Lisez le contrat et négociez si nécessaire avant de signer."}
                </div>
              </div>
              <button
                onClick={onSign}
                style={{
                  padding: "12px 32px", flexShrink: 0,
                  background: "linear-gradient(135deg, #ffd700, #ffb300)",
                  border: "2px solid #e6a800", borderRadius: 10,
                  color: "#1a1a2e", fontSize: 15, fontWeight: 800, cursor: "pointer",
                  boxShadow: "0 4px 16px rgba(255,215,0,0.3)",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.02)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
              >
                ✍️ Signer la convention
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 20 }}>✅</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#16a34a" }}>
                  Convention signée — Le test pilote peut démarrer
                </div>
                <div style={{ fontSize: 11, color: "#666" }}>
                  {playerName || "CEO"} — {new Date().toLocaleDateString("fr-FR")}
                </div>
              </div>
              <button
                onClick={onClose}
                style={{
                  marginLeft: "auto", padding: "8px 16px",
                  background: "#5b5fc7", border: "none", borderRadius: 8,
                  color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
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
