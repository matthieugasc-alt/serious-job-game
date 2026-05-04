"use client";
// ══════════════════════════════════════════════════════════════════
// ChatView — Chat messages panel (center area)
// ══════════════════════════════════════════════════════════════════
//
// Pure UI component. All state and handlers remain in page.tsx.
// ══════════════════════════════════════════════════════════════════

import React from "react";

// ── Local helpers (duplicated to avoid circular deps) ──

const STATUS_COLORS: Record<string, string> = {
  available: "#44b553",
  busy: "#e94b3c",
  away: "#f5a623",
  offline: "#bbb",
  dnd: "#e94b3c",
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      style={{
        width: 10, height: 10, borderRadius: "50%",
        background: STATUS_COLORS[status] || STATUS_COLORS.offline,
        border: "2px solid #fff",
        position: "absolute", bottom: -1, right: -1,
        boxShadow: "0 0 0 1px #e0e0e0",
      }}
    />
  );
}

function Avatar({ initials, color, size = 36, status }: {
  initials: string; color: string; size?: number; status?: string;
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
      {status && <StatusDot status={status} />}
    </div>
  );
}

function TypingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 3, marginLeft: 6 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 5, height: 5, borderRadius: "50%", background: "#888",
            animation: "dotPulse 1.4s infinite", animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
      <style>{`@keyframes dotPulse{0%,80%,100%{opacity:.3}40%{opacity:1}}`}</style>
    </span>
  );
}

// ── Types ──

export interface ChatViewProps {
  // Header
  selectedContact: string | null;
  actors: any[];
  phaseTitle: string;
  getActorInfo: (id: string) => { name: string; color: string; initials: string; status?: string };
  displayPlayerName: string;

  // Messages
  filteredConversation: any[];
  isSending: boolean;
  chatEndRef: React.RefObject<HTMLDivElement | null>;

  // Attachments context
  scenarioId: string;
  scenarioDocs: any[];
  onePagerSubmitted: boolean;
  onOpenOnePager: () => void;

  // Input
  playerInput: string;
  onPlayerInputChange: (value: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onSendMessage: () => void;

  // Manual start gate
  isManualStart: boolean;
  candidateFirstName: string;
  onStartInterview: () => void;

  // Contact availability
  contactAvailable: boolean;
  contactBusyMessage: string;

  // Notes insertion in chat
  hasNotesForInsert: boolean;
  onInsertNotesInChat: () => void;
}

// ── Component ──

export default function ChatView({
  selectedContact,
  actors,
  phaseTitle,
  getActorInfo,
  displayPlayerName,
  filteredConversation,
  isSending,
  chatEndRef,
  scenarioId,
  scenarioDocs,
  onePagerSubmitted,
  onOpenOnePager,
  playerInput,
  onPlayerInputChange,
  inputRef,
  onSendMessage,
  isManualStart,
  candidateFirstName,
  onStartInterview,
  contactAvailable,
  contactBusyMessage,
  hasNotesForInsert,
  onInsertNotesInChat,
}: ChatViewProps) {
  return (
    <>
      {/* Chat header */}
      <div style={{ padding: "10px 16px", borderBottom: "1px solid #e8e8e8", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {(() => {
          if (selectedContact) {
            const contactActor = actors.find((a: any) => a.actor_id === selectedContact);
            const cColor = contactActor?.avatar?.color || "#666";
            const cIni = contactActor?.avatar?.initials || getInitials(contactActor?.name || "");
            return (
              <>
                <Avatar initials={cIni} color={cColor} size={28} status={contactActor?.contact_status || "available"} />
                <span style={{ fontSize: 15, fontWeight: 600, color: "#333" }}>{contactActor?.name || selectedContact}</span>
                <span style={{ fontSize: 12, color: "#999" }}>— {phaseTitle}</span>
              </>
            );
          }
          return <span style={{ fontSize: 15, fontWeight: 600, color: "#333" }}>💬 Messagerie — {phaseTitle}</span>;
        })()}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
        {filteredConversation.map((msg: any) => {
          const isPlayer = msg.role === "player";
          const isSystem = msg.role === "system";
          const actor = !isPlayer && !isSystem ? getActorInfo(msg.actor || "npc") : null;
          const msgType = msg.type || "";

          if (isSystem) {
            const isError = msg.type === "error";
            return (
              <div key={msg.id} style={{ textAlign: "center", padding: "6px 0" }}>
                <span style={{
                  background: isError ? "#fff3cd" : "#f0f0f0",
                  color: isError ? "#856404" : "#888",
                  fontSize: isError ? 12 : 11,
                  padding: isError ? "8px 16px" : "4px 12px",
                  borderRadius: 12,
                  border: isError ? "1px solid #ffc107" : "none",
                  display: "inline-block",
                  maxWidth: "80%",
                }}>
                  {msg.content}
                </span>
              </div>
            );
          }

          // Type badge for non-chat messages
          const typeBadgeMap: Record<string, string> = { phone_call: "📞 Appel", whatsapp_message: "📱 WhatsApp", sms: "📱 SMS", visio: "📹 Visio" };
          const typeBadge = typeBadgeMap[msgType] || null;

          return (
            <div
              key={msg.id}
              style={{
                display: "flex", gap: 8, alignItems: "flex-start",
                flexDirection: isPlayer ? "row-reverse" : "row",
                maxWidth: "85%", alignSelf: isPlayer ? "flex-end" : "flex-start",
              }}
            >
              {!isPlayer && actor && (
                <Avatar initials={actor.initials} color={actor.color} size={32} status={actor.status} />
              )}
              {isPlayer && (
                <Avatar initials={displayPlayerName ? getInitials(displayPlayerName) : "CEO"} color="#5b5fc7" size={32} />
              )}
              <div>
                {/* Sender name */}
                <div style={{ fontSize: 11, color: "#888", marginBottom: 2, textAlign: isPlayer ? "right" : "left" }}>
                  {isPlayer ? (displayPlayerName || "CEO") : actor?.name}
                  {typeBadge && <span style={{ marginLeft: 6, fontSize: 10, color: "#5b5fc7" }}>{typeBadge}</span>}
                </div>
                {/* Bubble */}
                <div
                  style={{
                    background: isPlayer ? "#5b5fc7" : "#f3f2f1",
                    color: isPlayer ? "#fff" : "#333",
                    padding: "8px 14px", borderRadius: 12,
                    borderTopRightRadius: isPlayer ? 4 : 12,
                    borderTopLeftRadius: isPlayer ? 12 : 4,
                    fontSize: 13, lineHeight: 1.5, wordBreak: "break-word",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {msg.content}
                </div>
                {/* Attachments (documents sent in chat) — click opens PDF or editor */}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                    {msg.attachments.map((att: any) => {
                      const attDoc = scenarioDocs?.find((d: any) => d.doc_id === att.id);
                      const fp = (attDoc as any)?.file_path || "";
                      const isPublicPdf = fp.startsWith("/") && fp.endsWith(".pdf");
                      const docUrl = isPublicPdf ? fp : `/api/download?file=${encodeURIComponent(fp)}&scenarioId=${encodeURIComponent(scenarioId)}`;
                      // One-pager template: open editor instead of PDF
                      const isOnePagerTemplate = att.id === "one_pager_template";
                      if (isOnePagerTemplate) {
                        return (
                          <button
                            key={att.id}
                            onClick={() => onOpenOnePager()}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              padding: "6px 14px", background: onePagerSubmitted ? "#f0fdf4" : (isPlayer ? "rgba(255,255,255,0.15)" : "#fff"),
                              border: onePagerSubmitted ? "1px solid #86efac" : (isPlayer ? "1px solid rgba(255,255,255,0.25)" : "1px solid #5b5fc7"),
                              borderRadius: 8, fontSize: 11, fontWeight: 700,
                              color: onePagerSubmitted ? "#16a34a" : (isPlayer ? "#fff" : "#5b5fc7"),
                              cursor: "pointer",
                              animation: !onePagerSubmitted ? "none" : "none",
                            }}
                          >
                            {onePagerSubmitted ? "✅" : "📝"} {onePagerSubmitted ? "One-pager soumis" : "Ouvrir et remplir le one-pager"}
                          </button>
                        );
                      }
                      return (
                        <a
                          key={att.id}
                          href={attDoc ? docUrl : "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            padding: "4px 10px", background: isPlayer ? "rgba(255,255,255,0.15)" : "#fff",
                            border: isPlayer ? "1px solid rgba(255,255,255,0.25)" : "1px solid #ddd",
                            borderRadius: 8, fontSize: 11, fontWeight: 600,
                            color: isPlayer ? "#fff" : "#5b5fc7", cursor: attDoc ? "pointer" : "default",
                            textDecoration: "none",
                          }}
                        >
                          📑 {att.label}
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {isSending && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#ddd", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <TypingDots />
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input bar — or "Faire entrer le candidat" gate for manual_start phases */}
      {isManualStart ? (
        <div style={{
          padding: "16px", borderTop: "1px solid #e8e8e8", flexShrink: 0,
          background: "linear-gradient(135deg, #f8f9ff, #f0f0ff)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
        }}>
          <div style={{ fontSize: 12, color: "#666", textAlign: "center" }}>
            Prenez le temps de lire les CV dans l&apos;onglet Documents avant de commencer l&apos;entretien.
          </div>
          <button
            onClick={onStartInterview}
            style={{
              padding: "12px 32px", borderRadius: 12, border: "none",
              background: "linear-gradient(135deg, #5b5fc7, #4a4eb3)",
              color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 14,
              boxShadow: "0 4px 16px rgba(91,95,199,0.25)",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.02)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
          >
            Faire entrer {candidateFirstName}
          </button>
        </div>
      ) : !contactAvailable && selectedContact ? (
        <div style={{ padding: "12px 16px", borderTop: "1px solid #e8e8e8", textAlign: "center", background: "#f5f5f5", color: "#999", fontSize: 12, fontStyle: "italic" }}>
          {contactBusyMessage}
        </div>
      ) : (
        <div style={{ padding: "10px 16px", borderTop: "1px solid #e8e8e8", display: "flex", gap: 8, flexShrink: 0, background: "#fafafa" }}>
          {hasNotesForInsert && (
            <button
              onClick={onInsertNotesInChat}
              title="Insérer mes notes"
              style={{
                padding: "8px 10px", borderRadius: 20, border: "1px solid #ddd",
                background: "#f8f8ff", color: "#5b5fc7", cursor: "pointer",
                fontSize: 14, flexShrink: 0, lineHeight: 1,
              }}
            >
              🗒️
            </button>
          )}
          <input
            ref={inputRef}
            type="text"
            value={playerInput}
            onChange={(e) => onPlayerInputChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSendMessage(); }}
            placeholder="Votre message..."
            style={{
              flex: 1, padding: "10px 14px", border: "1px solid #ddd", borderRadius: 20,
              fontSize: 13, fontFamily: "inherit", outline: "none", background: "#fff", color: "#111",
            }}
          />
          <button
            onClick={onSendMessage}
            disabled={!playerInput.trim()}
            style={{
              padding: "8px 20px", borderRadius: 20, border: "none",
              background: playerInput.trim() ? "#5b5fc7" : "#ccc",
              color: "#fff", cursor: playerInput.trim() ? "pointer" : "not-allowed",
              fontWeight: 600, fontSize: 13,
            }}
          >
            Envoyer
          </button>
        </div>
      )}
    </>
  );
}
