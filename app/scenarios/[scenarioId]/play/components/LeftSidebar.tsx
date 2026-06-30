/**
 * LeftSidebar — navigation tabs (Chat / Email / Notes) + contacts list +
 * phase objective.
 *
 * Pure presentation. Many props because page.tsx still owns the source
 * of truth for actors, session, view mode and selected contact. The
 * "isBusyAfterPhase" / "isAvailable" lock logic moved INTO this
 * component so callers don't need to compute it.
 */

import React from "react";
import { Avatar } from "./Avatars";
import { getInitials } from "../lib/playerUtils";

// page.tsx uses a wider MainView union ("chat" | "mail" | "docs" | "context" |
// "notes"). The sidebar only renders chat / mail / notes but must accept the
// wider type so callers don't have to narrow.
export type MainViewLike = string;

export type LeftSidebarTab = { key: MainViewLike; icon: string; label: string; badge: number };

export type LeftSidebarProps = {
  // Tabs
  mainView: MainViewLike;
  onMainViewChange: (v: MainViewLike) => void;
  unreadMails: number;
  hasMindmapTool: boolean;
  mailLockedForNow: boolean;

  // Contacts
  visibleContacts: any[];
  selectedContact: string | null;
  onSelectContact: (actorId: string) => void;
  resolveActor: (actorId: string) => string;
  currentPhaseAiActors: string[];
  conversation: any[];
  contactUnreadCounts: Record<string, number>;
  session: any;
  scenario: any;

  // Phase objective
  phaseObjective: string;
};

export function LeftSidebar({
  mainView,
  onMainViewChange,
  unreadMails,
  hasMindmapTool,
  mailLockedForNow,
  visibleContacts,
  selectedContact,
  onSelectContact,
  resolveActor,
  currentPhaseAiActors,
  conversation,
  contactUnreadCounts,
  session,
  scenario,
  phaseObjective,
}: LeftSidebarProps) {
  const tabs: LeftSidebarTab[] = [
    { key: "chat", icon: "💬", label: "Chat", badge: 0 },
    { key: "mail", icon: "📧", label: "Email", badge: unreadMails },
    ...(hasMindmapTool ? [{ key: "notes", icon: "🗒️", label: "Notes", badge: 0 }] : []),
  ];

  const phase = scenario?.phases?.[session?.currentPhaseIndex];
  const globalShow = (scenario?.meta as any)?.show_objective !== false;
  const phaseShow = (phase as any)?.show_objective;
  const showObjective = phaseShow !== undefined ? phaseShow !== false : globalShow;

  return (
    <aside
      style={{
        width: 240,
        flexShrink: 0,
        background: "#fff",
        borderRight: "1px solid #e0e0e0",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Tabs */}
      <nav style={{ display: "flex", borderBottom: "1px solid #e8e8e8", flexShrink: 0 }}>
        {tabs.map((tab) => {
          const isLocked = tab.key === "mail" && mailLockedForNow;
          const isActive = mainView === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onMainViewChange(tab.key)}
              style={{
                flex: 1,
                padding: "10px 4px",
                border: "none",
                cursor: "pointer",
                background: isActive ? "#f0f0ff" : "#fff",
                borderBottom: isActive ? "2px solid #5b5fc7" : "2px solid transparent",
                fontSize: 12,
                fontWeight: isActive ? 700 : 500,
                color: isLocked ? "#bbb" : isActive ? "#5b5fc7" : "#666",
                position: "relative",
                opacity: isLocked ? 0.7 : 1,
              }}
            >
              {tab.icon} {tab.label}
              {tab.badge ? (
                <span
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 8,
                    background: "#e94b3c",
                    color: "#fff",
                    borderRadius: 10,
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "1px 5px",
                    minWidth: 16,
                    textAlign: "center",
                  }}
                >
                  {tab.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {/* Contacts */}
      <div style={{ padding: "12px", flex: 1, overflowY: "auto" }}>
        <h3
          style={{
            margin: "0 0 10px",
            fontSize: 11,
            fontWeight: 700,
            color: "#999",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          Contacts
        </h3>
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {visibleContacts
            .filter((a: any) => a.actor_id !== "player" && !a.mail_only)
            .map((actor: any) => {
              const resolvedId = resolveActor(actor.actor_id);
              const isInPhase = currentPhaseAiActors.includes(resolvedId);
              const busyAfterPhase = (actor as any).busy_after_phase;
              const isBusyAfterPhase =
                busyAfterPhase &&
                session &&
                (() => {
                  const phaseIdx = scenario?.phases?.findIndex(
                    (p: any) => p.phase_id === busyAfterPhase,
                  );
                  return (
                    phaseIdx !== undefined && phaseIdx >= 0 && session.currentPhaseIndex > phaseIdx
                  );
                })();
              const baseStatus =
                actor.contact_status ||
                (actor.interaction_modes?.includes("unreachable") ? "offline" : "available");
              const isAvailable = isInPhase && !isBusyAfterPhase;
              const status = isAvailable ? baseStatus : "busy";
              const color = actor.avatar?.color || "#666";
              const ini = actor.avatar?.initials || getInitials(actor.name);
              const isSelected = selectedContact === actor.actor_id;
              const unread = contactUnreadCounts[actor.actor_id] || 0;
              const lastMsg = [...conversation]
                .reverse()
                .find((m: any) => m.actor === actor.actor_id && m.role === "npc");
              const busyMsg = isBusyAfterPhase
                ? (actor as any).busy_message || "Occupé"
                : "Occupé";
              const preview = isAvailable
                ? lastMsg
                  ? lastMsg.content.length > 40
                    ? lastMsg.content.slice(0, 40) + "..."
                    : lastMsg.content
                  : actor.contact_preview || ""
                : busyMsg;
              return (
                <li
                  key={actor.actor_id}
                  onClick={() => {
                    if (!isAvailable) return;
                    onSelectContact(actor.actor_id);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 8px",
                    borderRadius: 8,
                    marginBottom: 2,
                    cursor: isAvailable ? "pointer" : "not-allowed",
                    background: isSelected
                      ? isAvailable
                        ? "#f0f0ff"
                        : "#f5f5f5"
                      : "transparent",
                    borderLeft: isSelected
                      ? isAvailable
                        ? "3px solid #5b5fc7"
                        : "3px solid #ccc"
                      : "3px solid transparent",
                    opacity: isAvailable ? 1 : 0.55,
                    transition: "all .1s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected && isAvailable) e.currentTarget.style.background = "#f8f8fb";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div style={{ position: "relative" }}>
                    <Avatar initials={ini} color={color} size={36} status={status} />
                    {unread > 0 && isAvailable && (
                      <span
                        style={{
                          position: "absolute",
                          top: -2,
                          right: -4,
                          background: "#e94b3c",
                          color: "#fff",
                          borderRadius: 10,
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "1px 5px",
                          minWidth: 16,
                          textAlign: "center",
                        }}
                      >
                        {unread}
                      </span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: isSelected && isAvailable ? 700 : 600,
                        color: !isAvailable
                          ? "#aaa"
                          : isSelected
                            ? "#5b5fc7"
                            : "#333",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {actor.name}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#999",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {preview}
                    </div>
                  </div>
                </li>
              );
            })}
        </ul>

        {/* Phase objective */}
        {showObjective && (
          <div
            style={{
              marginTop: 16,
              padding: "10px",
              background: "#f8f8ff",
              borderRadius: 8,
              borderLeft: "3px solid #5b5fc7",
            }}
          >
            <h4
              style={{
                margin: "0 0 4px",
                fontSize: 11,
                fontWeight: 700,
                color: "#5b5fc7",
                textTransform: "uppercase",
              }}
            >
              Objectif
            </h4>
            <p style={{ margin: 0, fontSize: 12, color: "#444", lineHeight: 1.4 }}>
              {phaseObjective}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
