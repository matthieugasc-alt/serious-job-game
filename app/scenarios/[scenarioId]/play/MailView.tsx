"use client";
// ══════════════════════════════════════════════════════════════════
// MailView — Mail tab UI (inbox, reading, compose, attachments)
// ══════════════════════════════════════════════════════════════════
//
// Pure UI component. All state & handlers remain in page.tsx.
// ══════════════════════════════════════════════════════════════════

import React from "react";

// ── Local sub-components (duplicated from page.tsx to avoid circular deps) ──

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Avatar({ initials, color, size = 36 }: {
  initials: string; color: string; size?: number;
}) {
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <div
        style={{
          width: size, height: size, borderRadius: "50%", background: color,
          color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 700, fontSize: size > 32 ? 13 : 11, userSelect: "none",
        }}
      >
        {initials}
      </div>
    </div>
  );
}

// ── Types ──

export interface MailDraft {
  to: string;
  cc: string;
  subject: string;
  body: string;
  attachments: { id: string; label: string }[];
}

export interface MailViewProps {
  // Inbox
  inboxMails: any[];
  selectedMailId: string | null;
  selectedMail: any | null;
  sentMails: any[];

  // Compose
  showCompose: boolean;
  canComposeMail: boolean;
  canActuallySendMail: boolean;
  mailSendBlockReason: string | null;
  currentMailDraft: MailDraft;
  sendMailLabel: string;
  attachableDocs: any[];
  showContactPicker: "to" | "cc" | null;

  // Actors
  actors: any[];
  getActorInfo: (id: string) => { name: string; color: string; initials: string };
  displayPlayerName: string;

  // Scenario context
  scenarioId: string;
  currentPhaseId: string | null;
  scenarioDocs: any[];

  // Contract / signature states (for inline sign buttons)
  pacteSigned: boolean;
  contractSigned: boolean;
  clinicalContractSigned: boolean;
  clinicalContractRefused: boolean;
  devisSigned: boolean;
  exceptionsSigned: boolean;
  onePagerSubmitted: boolean;
  sessionFlags: Record<string, any>;

  // Mindmap
  hasMindmapTool: boolean;
  outlineItemCount: number;

  // ── Callbacks ──
  onSelectMail: (mailId: string) => void;
  onNewCompose: () => void;
  onSetShowCompose: (v: boolean) => void;
  onUpdateDraft: (patch: Partial<MailDraft>) => void;
  onSendMail: () => void;
  onToggleAttachment: (docId: string, label: string) => void;
  onSetContactPicker: (v: "to" | "cc" | null) => void;
  onReplyAll: (mail: any) => void;
  onInsertOutlineNotes: () => void;

  // Contract open callbacks
  onOpenPacteSign: () => void;
  onOpenContractSign: () => void;
  onOpenClinicalSign: () => void;
  onOpenDevisSign: () => void;
  onOpenExceptionsSign: () => void;
  onOpenOnePager: () => void;
}

// ── Component ──

export default function MailView({
  inboxMails,
  selectedMailId,
  selectedMail,
  sentMails,
  showCompose,
  canComposeMail,
  canActuallySendMail,
  mailSendBlockReason,
  currentMailDraft,
  sendMailLabel,
  attachableDocs,
  showContactPicker,
  actors,
  getActorInfo,
  displayPlayerName,
  scenarioId,
  currentPhaseId,
  scenarioDocs,
  pacteSigned,
  contractSigned,
  clinicalContractSigned,
  clinicalContractRefused,
  devisSigned,
  exceptionsSigned,
  onePagerSubmitted,
  sessionFlags,
  hasMindmapTool,
  outlineItemCount,
  onSelectMail,
  onNewCompose,
  onSetShowCompose,
  onUpdateDraft,
  onSendMail,
  onToggleAttachment,
  onSetContactPicker,
  onReplyAll,
  onInsertOutlineNotes,
  onOpenPacteSign,
  onOpenContractSign,
  onOpenClinicalSign,
  onOpenDevisSign,
  onOpenExceptionsSign,
  onOpenOnePager,
}: MailViewProps) {
  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      {/* Mail list sidebar */}
      <div style={{ width: 280, borderRight: "1px solid #e8e8e8", display: "flex", flexDirection: "column", overflowY: "auto", flexShrink: 0 }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid #e8e8e8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>📧 Boîte de réception</h3>
          {canComposeMail && (
            <button
              onClick={onNewCompose}
              style={{
                padding: "4px 12px", background: "#5b5fc7", color: "#fff",
                border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 600,
              }}
            >
              + Nouveau
            </button>
          )}
        </div>

        {inboxMails.length === 0 && !showCompose && (
          <div style={{ padding: 20, textAlign: "center", color: "#999", fontSize: 13 }}>
            Aucun email reçu pour le moment
          </div>
        )}

        {inboxMails.map((mail: any) => {
          const sender = getActorInfo(mail.from);
          const isActive = selectedMailId === mail.id && !showCompose;
          return (
            <div
              key={mail.id}
              onClick={() => onSelectMail(mail.id)}
              style={{
                padding: "10px 14px", cursor: "pointer",
                background: isActive ? "#f0f0ff" : "#fff",
                borderBottom: "1px solid #f0f0f0",
                borderLeft: isActive ? "3px solid #5b5fc7" : "3px solid transparent",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: "#333", marginBottom: 2 }}>
                {sender.name}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {mail.subject}
              </div>
              <div style={{ fontSize: 11, color: "#999", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {mail.body.slice(0, 60)}...
              </div>
            </div>
          );
        })}

        {/* Sent mails */}
        {sentMails && sentMails.length > 0 && (
          <>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid #e8e8e8", borderTop: "1px solid #e8e8e8", marginTop: 8 }}>
              <h4 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Envoyés</h4>
            </div>
            {sentMails.map((mail: any) => (
              <div key={mail.id} style={{ padding: "8px 14px", borderBottom: "1px solid #f0f0f0", opacity: 0.7 }}>
                <div style={{ fontSize: 11, color: "#888" }}>→ {mail.to}</div>
                <div style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>{mail.subject}</div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Mail content / compose */}
      <div style={{ flex: 1, overflowY: "auto", padding: 0 }}>

        {/* Reading a mail */}
        {selectedMail && !showCompose && (
          <div style={{ padding: 24 }}>
            <h2 style={{ fontSize: 18, color: "#333", marginBottom: 16 }}>{selectedMail.subject}</h2>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #e8e8e8" }}>
              <Avatar initials={getActorInfo(selectedMail.from).initials} color={getActorInfo(selectedMail.from).color} size={36} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{getActorInfo(selectedMail.from).name}</div>
                <div style={{ fontSize: 11, color: "#888" }}>
                  À : {selectedMail.to || displayPlayerName || "CEO"}
                  {selectedMail.cc && <span> — Cc : {selectedMail.cc}</span>}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "#333", whiteSpace: "pre-wrap" }}>
              {selectedMail.body}
            </div>
            {selectedMail.attachments && selectedMail.attachments.length > 0 && (
              <div style={{ marginTop: 16, padding: 14, background: "#f8f9fa", borderRadius: 8, border: "1px solid #e8e8e8" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.3px" }}>
                  📎 Pièces jointes ({selectedMail.attachments.length})
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {selectedMail.attachments.map((a: any) => {
                    const doc = scenarioDocs?.find((d: any) => d.doc_id === a.id);
                    const hasFile = doc?.file_path;
                    const hasImage = doc?.image_path;
                    const isPDF = hasFile && doc.file_path!.endsWith(".pdf");
                    const isImage = !!hasImage;
                    const isClickable = !!doc;
                    const fileIcon = isPDF ? "📑" : isImage ? "🖼️" : "📄";
                    const fileType = isPDF ? "PDF" : isImage ? "Image" : "Document";

                    return (
                      <div
                        key={a.id}
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "8px 12px", background: "#fff", borderRadius: 6,
                          border: "1px solid #ddd", cursor: isClickable ? "pointer" : "default",
                          transition: "all .15s", minWidth: 180, maxWidth: 280,
                        }}
                        onMouseEnter={(e) => { if (isClickable) { e.currentTarget.style.borderColor = "#5b5fc7"; e.currentTarget.style.background = "#f0f0ff"; } }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#ddd"; e.currentTarget.style.background = "#fff"; }}
                        onClick={() => {
                          if (doc) {
                            const fp = (doc as any).file_path || "";
                            const ip = (doc as any).image_path || "";
                            const isImg = !!ip || /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(fp);
                            const isPublicPdf = fp.startsWith("/") && fp.endsWith(".pdf");
                            const url = isImg ? (ip || fp) : isPublicPdf ? fp : `/api/download?file=${encodeURIComponent(fp)}&scenarioId=${encodeURIComponent(scenarioId)}`;
                            window.open(url, "_blank");
                          }
                        }}
                      >
                        <span style={{ fontSize: 22, flexShrink: 0 }}>{fileIcon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#333", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {a.label}
                          </div>
                          <div style={{ fontSize: 10, color: "#888" }}>{fileType}</div>
                        </div>
                        {isClickable && (
                          <span style={{ fontSize: 14, color: "#5b5fc7", flexShrink: 0 }} title="Consulter">📖</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── "Ouvrir et signer le pacte" — only in phase_3_pacte, only on the pacte mail ── */}
            {currentPhaseId === "phase_3_pacte" &&
              selectedMail.attachments?.some((a: any) => a.id === "pacte_associes") && (
              <div style={{ marginTop: 16 }}>
                {pacteSigned ? (
                  <div style={{
                    padding: "14px 18px", background: "rgba(74,222,128,0.08)",
                    border: "1px solid rgba(74,222,128,0.25)", borderRadius: 10,
                    display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <span style={{ fontSize: 20 }}>✅</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#16a34a" }}>Pacte signé</div>
                      <div style={{ fontSize: 11, color: "#666" }}>
                        Renvoyez le pacte signé par mail au CTO pour finaliser.
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={onOpenPacteSign}
                    style={{
                      width: "100%", padding: "14px 24px",
                      background: "linear-gradient(135deg, #ffd700, #ffb300)",
                      border: "2px solid #e6a800", borderRadius: 12,
                      color: "#1a1a2e", fontSize: 14, fontWeight: 800, cursor: "pointer",
                      boxShadow: "0 4px 16px rgba(255,215,0,0.3)",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.01)"; e.currentTarget.style.boxShadow = "0 6px 24px rgba(255,215,0,0.4)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(255,215,0,0.3)"; }}
                  >
                    ✍️ Ouvrir et signer le pacte
                  </button>
                )}
              </div>
            )}

            {/* ── "Ouvrir et signer le contrat" — only in phase_3_sign (scenario 2) ── */}
            {currentPhaseId === "phase_3_sign" &&
              (selectedMail.from === "thomas_novadev" || selectedMail.from === "Thomas Vidal") && (
              <div style={{ marginTop: 16 }}>
                {contractSigned ? (
                  <div style={{
                    padding: "14px 18px", background: "rgba(74,222,128,0.08)",
                    border: "1px solid rgba(74,222,128,0.25)", borderRadius: 10,
                    display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <span style={{ fontSize: 20 }}>✅</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#16a34a" }}>Contrat signé</div>
                      <div style={{ fontSize: 11, color: "#666" }}>
                        Le développement du MVP est lancé. Livraison dans 7 semaines.
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={onOpenContractSign}
                    style={{
                      width: "100%", padding: "14px 24px",
                      background: "linear-gradient(135deg, #ffd700, #ffb300)",
                      border: "2px solid #e6a800", borderRadius: 12,
                      color: "#1a1a2e", fontSize: 14, fontWeight: 800, cursor: "pointer",
                      boxShadow: "0 4px 16px rgba(255,215,0,0.3)",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.01)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                  >
                    ✍️ Ouvrir et négocier le contrat
                  </button>
                )}
              </div>
            )}

            {/* ── "Ouvrir et signer la convention" — only in phase_3_contract (scenario 3) ── */}
            {currentPhaseId === "phase_3_contract" &&
              selectedMail.attachments?.some((a: any) => a.id?.startsWith("contrat_")) && (() => {
                const isPivotContract = sessionFlags?.switched_to_clinique && selectedMail.attachments?.some((a: any) => a.id === "contrat_clinique");
                const effectiveRefused = clinicalContractRefused && !isPivotContract;
                return (
              <div style={{ marginTop: 16 }}>
                {clinicalContractSigned ? (
                  <div style={{
                    padding: "14px 18px", background: "rgba(74,222,128,0.08)",
                    border: "1px solid rgba(74,222,128,0.25)", borderRadius: 10,
                    display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <span style={{ fontSize: 20 }}>✅</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#16a34a" }}>Convention signée</div>
                      <div style={{ fontSize: 11, color: "#666" }}>
                        Le test pilote peut démarrer.
                      </div>
                    </div>
                  </div>
                ) : effectiveRefused ? (
                  <div style={{
                    padding: "14px 18px", background: "rgba(220,38,38,0.06)",
                    border: "1px solid rgba(220,38,38,0.2)", borderRadius: 10,
                    display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <span style={{ fontSize: 20 }}>❌</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#dc2626" }}>Convention refusée</div>
                      <div style={{ fontSize: 11, color: "#666" }}>
                        Discutez avec Alexandre pour trouver une alternative.
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={onOpenClinicalSign}
                    style={{
                      width: "100%", padding: "14px 24px",
                      background: "linear-gradient(135deg, #ffd700, #ffb300)",
                      border: "2px solid #e6a800", borderRadius: 12,
                      color: "#1a1a2e", fontSize: 14, fontWeight: 800, cursor: "pointer",
                      boxShadow: "0 4px 16px rgba(255,215,0,0.3)",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.01)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                  >
                    ✍️ Ouvrir et signer la convention
                  </button>
                )}
              </div>
                );
              })()}

            {/* ── "Négocier et signer le devis" — Scenario 4 Phase 3 ── */}
            {currentPhaseId === "phase_3_negotiation" &&
              selectedMail.from === "thomas_vidal" && (
              <div style={{ marginTop: 16 }}>
                {devisSigned ? (
                  <div style={{
                    padding: "14px 18px", background: "rgba(74,222,128,0.08)",
                    border: "1px solid rgba(74,222,128,0.25)", borderRadius: 10,
                    display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <span style={{ fontSize: 20 }}>✅</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#16a34a" }}>Devis signé</div>
                      <div style={{ fontSize: 11, color: "#666" }}>
                        L'accord avec NovaDev est formalisé.
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={onOpenDevisSign}
                    style={{
                      width: "100%", padding: "14px 24px",
                      background: "linear-gradient(135deg, #ffd700, #ffb300)",
                      border: "2px solid #e6a800", borderRadius: 12,
                      color: "#1a1a2e", fontSize: 14, fontWeight: 800, cursor: "pointer",
                      boxShadow: "0 4px 16px rgba(255,215,0,0.3)",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.01)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                  >
                    ✍️ Négocier et signer le devis
                  </button>
                )}
              </div>
            )}

            {/* ── "Négocier le bon de commande" — Scenario 5 Phase 5 ── */}
            {currentPhaseId === "phase_5_exceptions" &&
              (selectedMail.from === "claire_vasseur" || selectedMail.from === "Me Claire Vasseur") && (
              <div style={{ marginTop: 16 }}>
                {exceptionsSigned ? (
                  <div style={{
                    padding: "14px 18px", background: "rgba(74,222,128,0.08)",
                    border: "1px solid rgba(74,222,128,0.25)", borderRadius: 10,
                    display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <span style={{ fontSize: 20 }}>✅</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#16a34a" }}>Bon de commande validé</div>
                      <div style={{ fontSize: 11, color: "#666" }}>
                        Les conditions particulières ont été négociées et acceptées.
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={onOpenExceptionsSign}
                    style={{
                      width: "100%", padding: "14px 24px",
                      background: "linear-gradient(135deg, #ffd700, #ffb300)",
                      border: "2px solid #e6a800", borderRadius: 12,
                      color: "#1a1a2e", fontSize: 14, fontWeight: 800, cursor: "pointer",
                      boxShadow: "0 4px 16px rgba(255,215,0,0.3)",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.01)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                  >
                    ✍️ Ouvrir et négocier le bon de commande
                  </button>
                )}
              </div>
            )}

            {/* ── "Ouvrir et remplir le one-pager" — only in phase_1_onepager ── */}
            {currentPhaseId === "phase_1_onepager" && (
              <div style={{ marginTop: 16 }}>
                {onePagerSubmitted ? (
                  <div style={{
                    padding: "14px 18px", background: "rgba(74,222,128,0.08)",
                    border: "1px solid rgba(74,222,128,0.25)", borderRadius: 10,
                    display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <span style={{ fontSize: 20 }}>✅</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#16a34a" }}>One-pager soumis</div>
                      <div style={{ fontSize: 11, color: "#666" }}>
                        Le jury va examiner votre candidature. Préparez votre pitch.
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={onOpenOnePager}
                    style={{
                      width: "100%", padding: "14px 24px",
                      background: "linear-gradient(135deg, #5b5fc7, #4a4eb3)",
                      border: "2px solid rgba(91,95,199,0.4)", borderRadius: 12,
                      color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer",
                      boxShadow: "0 4px 16px rgba(91,95,199,0.3)",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.01)"; e.currentTarget.style.boxShadow = "0 6px 24px rgba(91,95,199,0.4)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(91,95,199,0.3)"; }}
                  >
                    📝 Ouvrir et remplir le one-pager
                  </button>
                )}
              </div>
            )}

            {/* Reply All button if mail is enabled */}
            {canComposeMail && (
              <button
                onClick={() => onReplyAll(selectedMail)}
                style={{ marginTop: 20, padding: "8px 20px", background: "#5b5fc7", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 600, fontSize: 13 }}
              >
                Répondre à tous
              </button>
            )}
          </div>
        )}

        {/* Compose form */}
        {showCompose && canComposeMail && (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#333" }}>
              {sendMailLabel || "Nouveau message"}
            </h3>

            {/* To */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
              <label style={{ width: 40, fontSize: 12, fontWeight: 600, color: "#666" }}>À :</label>
              <input
                type="text" value={currentMailDraft.to}
                onChange={(e) => onUpdateDraft({ to: e.target.value })}
                placeholder="Saisissez ou choisissez un contact"
                style={{ flex: 1, padding: "8px 10px", border: "1px solid #ddd", borderRadius: 4, fontSize: 13, fontFamily: "inherit" }}
              />
              <button
                onClick={() => onSetContactPicker(showContactPicker === "to" ? null : "to")}
                title="Répertoire de contacts"
                style={{
                  background: showContactPicker === "to" ? "#5b5fc7" : "#f0f0f0",
                  color: showContactPicker === "to" ? "#fff" : "#555",
                  border: "1px solid #ddd", borderRadius: 4, padding: "6px 10px",
                  cursor: "pointer", fontSize: 16, lineHeight: 1, flexShrink: 0,
                }}
              >
                📇
              </button>
              {showContactPicker === "to" && (
                <div style={{
                  position: "absolute", top: "100%", right: 0, marginTop: 4, zIndex: 100,
                  background: "#fff", border: "1px solid #ddd", borderRadius: 8,
                  boxShadow: "0 4px 16px rgba(0,0,0,.12)", width: 300, maxHeight: 280, overflowY: "auto",
                }}>
                  <div style={{ padding: "8px 12px", borderBottom: "1px solid #eee", fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>
                    Répertoire — Destinataire
                  </div>
                  {actors
                    .filter((a: any) => a.actor_id !== "player" && (a.visible_in_contacts || a.email))
                    .map((a: any) => {
                      const contactEmail = a.email || a.name;
                      const isAlreadyAdded = currentMailDraft.to.toLowerCase().includes(contactEmail.toLowerCase());
                      return (
                        <div
                          key={a.actor_id}
                          onClick={() => {
                            if (isAlreadyAdded) {
                              const parts = currentMailDraft.to.split(",").map((s: string) => s.trim()).filter((s: string) => s.toLowerCase() !== contactEmail.toLowerCase());
                              onUpdateDraft({ to: parts.join(", ") });
                            } else {
                              const existing = currentMailDraft.to.trim();
                              onUpdateDraft({ to: existing ? `${existing}, ${contactEmail}` : contactEmail });
                            }
                          }}
                          style={{
                            padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                            borderBottom: "1px solid #f5f5f5", transition: "background .1s",
                            background: isAlreadyAdded ? "#f0f0ff" : "#fff",
                          }}
                          onMouseEnter={(e) => { if (!isAlreadyAdded) e.currentTarget.style.background = "#fafafa"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = isAlreadyAdded ? "#f0f0ff" : "#fff"; }}
                        >
                          <Avatar initials={a.avatar?.initials || getInitials(a.name)} color={a.avatar?.color || "#666"} size={28} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>{a.name}</div>
                            <div style={{ fontSize: 11, color: "#888", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {a.role?.slice(0, 40)}{a.role?.length > 40 ? "..." : ""}
                            </div>
                            {a.email && <div style={{ fontSize: 10, color: "#5b5fc7" }}>{a.email}</div>}
                          </div>
                          {isAlreadyAdded && <span style={{ fontSize: 16, color: "#5b5fc7", flexShrink: 0 }}>✓</span>}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
            {/* Cc */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
              <label style={{ width: 40, fontSize: 12, fontWeight: 600, color: "#666" }}>Cc :</label>
              <input
                type="text" value={currentMailDraft.cc}
                onChange={(e) => onUpdateDraft({ cc: e.target.value })}
                placeholder="Copie (optionnel)"
                style={{ flex: 1, padding: "8px 10px", border: "1px solid #ddd", borderRadius: 4, fontSize: 13, fontFamily: "inherit" }}
              />
              <button
                onClick={() => onSetContactPicker(showContactPicker === "cc" ? null : "cc")}
                title="Répertoire de contacts"
                style={{
                  background: showContactPicker === "cc" ? "#5b5fc7" : "#f0f0f0",
                  color: showContactPicker === "cc" ? "#fff" : "#555",
                  border: "1px solid #ddd", borderRadius: 4, padding: "6px 10px",
                  cursor: "pointer", fontSize: 16, lineHeight: 1, flexShrink: 0,
                }}
              >
                📇
              </button>
              {showContactPicker === "cc" && (
                <div style={{
                  position: "absolute", top: "100%", right: 0, marginTop: 4, zIndex: 100,
                  background: "#fff", border: "1px solid #ddd", borderRadius: 8,
                  boxShadow: "0 4px 16px rgba(0,0,0,.12)", width: 300, maxHeight: 280, overflowY: "auto",
                }}>
                  <div style={{ padding: "8px 12px", borderBottom: "1px solid #eee", fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>
                    Répertoire — Copie (Cc)
                  </div>
                  {actors
                    .filter((a: any) => a.actor_id !== "player" && (a.visible_in_contacts || a.email))
                    .map((a: any) => {
                      const contactEmail = a.email || a.name;
                      const isAlreadyAdded = currentMailDraft.cc.toLowerCase().includes(contactEmail.toLowerCase());
                      return (
                        <div
                          key={a.actor_id}
                          onClick={() => {
                            if (isAlreadyAdded) {
                              const parts = currentMailDraft.cc.split(",").map((s: string) => s.trim()).filter((s: string) => s.toLowerCase() !== contactEmail.toLowerCase());
                              onUpdateDraft({ cc: parts.join(", ") });
                            } else {
                              const existing = currentMailDraft.cc.trim();
                              onUpdateDraft({ cc: existing ? `${existing}, ${contactEmail}` : contactEmail });
                            }
                          }}
                          style={{
                            padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                            borderBottom: "1px solid #f5f5f5", transition: "background .1s",
                            background: isAlreadyAdded ? "#f0f0ff" : "#fff",
                          }}
                          onMouseEnter={(e) => { if (!isAlreadyAdded) e.currentTarget.style.background = "#fafafa"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = isAlreadyAdded ? "#f0f0ff" : "#fff"; }}
                        >
                          <Avatar initials={a.avatar?.initials || getInitials(a.name)} color={a.avatar?.color || "#666"} size={28} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>{a.name}</div>
                            <div style={{ fontSize: 11, color: "#888", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {a.role?.slice(0, 40)}{a.role?.length > 40 ? "..." : ""}
                            </div>
                            {a.email && <div style={{ fontSize: 10, color: "#5b5fc7" }}>{a.email}</div>}
                          </div>
                          {isAlreadyAdded && <span style={{ fontSize: 16, color: "#5b5fc7", flexShrink: 0 }}>✓</span>}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
            {/* Subject */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ width: 40, fontSize: 12, fontWeight: 600, color: "#666" }}>Objet :</label>
              <input
                type="text" value={currentMailDraft.subject}
                onChange={(e) => onUpdateDraft({ subject: e.target.value })}
                style={{ flex: 1, padding: "8px 10px", border: "1px solid #ddd", borderRadius: 4, fontSize: 13, fontFamily: "inherit" }}
              />
            </div>
            {/* Body */}
            {hasMindmapTool && outlineItemCount > 0 && (
              <button
                onClick={onInsertOutlineNotes}
                style={{
                  padding: "6px 14px", borderRadius: 6,
                  border: "1px dashed rgba(91,95,199,0.4)",
                  background: "#f8f8ff", color: "#5b5fc7", fontSize: 12,
                  cursor: "pointer", fontWeight: 500,
                  display: "flex", alignItems: "center", gap: 6,
                  alignSelf: "flex-start",
                }}
              >
                🗒️ Insérer mes notes ({outlineItemCount} éléments)
              </button>
            )}
            <textarea
              value={currentMailDraft.body}
              onChange={(e) => onUpdateDraft({ body: e.target.value })}
              placeholder="Rédigez votre message ici..."
              style={{ flex: 1, padding: 12, border: "1px solid #ddd", borderRadius: 4, fontSize: 13, fontFamily: "inherit", resize: "none", minHeight: 180 }}
            />

            {/* Attachments */}
            {attachableDocs.length > 0 && (
              <div style={{ padding: 10, background: "#fafafa", borderRadius: 6, border: "1px solid #eee" }}>
                <strong style={{ fontSize: 12, color: "#555" }}>📎 Pièces jointes :</strong>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  {attachableDocs.map((doc: any) => {
                    const isAttached = currentMailDraft.attachments.some((a: any) => a.id === doc.doc_id);
                    return (
                      <label
                        key={doc.doc_id}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "4px 10px", borderRadius: 16, cursor: "pointer",
                          background: isAttached ? "#e8e5ff" : "#f0f0f0",
                          border: isAttached ? "1px solid #5b5fc7" : "1px solid #ddd",
                          fontSize: 12, color: isAttached ? "#5b5fc7" : "#555",
                          fontWeight: isAttached ? 600 : 400,
                          transition: "all .15s",
                        }}
                      >
                        <input
                          type="checkbox" checked={isAttached}
                          onChange={() => onToggleAttachment(doc.doc_id, doc.label)}
                          style={{ display: "none" }}
                        />
                        {isAttached ? "✓" : "+"} {doc.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Send */}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => onSetShowCompose(false)}
                style={{ padding: "8px 16px", background: "#f0f0f0", color: "#666", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 }}
              >
                Annuler
              </button>
              <button
                onClick={onSendMail}
                disabled={!canActuallySendMail}
                title={mailSendBlockReason || undefined}
                style={{
                  padding: "8px 24px", borderRadius: 4, border: "none",
                  background: canActuallySendMail ? "#5b5fc7" : "#ccc",
                  color: "#fff", cursor: canActuallySendMail ? "pointer" : "not-allowed",
                  fontWeight: 600, fontSize: 13,
                }}
              >
                {sendMailLabel || "Envoyer"}
              </button>
              {!canActuallySendMail && mailSendBlockReason && (
                <div style={{ fontSize: 11, color: "#e74c3c", marginTop: 4, textAlign: "right" }}>
                  {mailSendBlockReason}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!selectedMail && !showCompose && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#999", fontSize: 14 }}>
            {inboxMails.length > 0
              ? "Sélectionnez un email pour le lire"
              : canComposeMail
                ? "Cliquez sur « + Nouveau » pour rédiger un email"
                : "Aucun email pour le moment"
            }
          </div>
        )}
      </div>
    </div>
  );
}
