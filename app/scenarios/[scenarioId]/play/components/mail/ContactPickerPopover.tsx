/**
 * ContactPickerPopover — directory popover used by the mail Compose
 * form for both the "À :" and "Cc :" rows. Renders a scrollable list of
 * actors with click-to-toggle on the current value.
 */

import React from "react";
import { Avatar } from "../Avatars";
import { getInitials } from "../../lib/playerUtils";

export type ContactActor = {
  actor_id: string;
  name: string;
  role?: string;
  email?: string;
  visible_in_contacts?: boolean;
  avatar?: { initials?: string; color?: string };
};

export type ContactPickerPopoverProps = {
  /** Header label ("Répertoire — Destinataire" / "— Copie (Cc)"). */
  title: string;
  /** Current comma-separated value to toggle entries against. */
  value: string;
  /** Receives the new comma-separated value when an entry is clicked. */
  onChange: (next: string) => void;
  /** Full actor list — filtered internally to skip "player" + invisible. */
  actors: ContactActor[];
};

export function ContactPickerPopover({
  title,
  value,
  onChange,
  actors,
}: ContactPickerPopoverProps) {
  return (
    <div
      style={{
        position: "absolute",
        top: "100%",
        right: 0,
        marginTop: 4,
        zIndex: 100,
        background: "#fff",
        border: "1px solid #ddd",
        borderRadius: 8,
        boxShadow: "0 4px 16px rgba(0,0,0,.12)",
        width: 300,
        maxHeight: 280,
        overflowY: "auto",
      }}
    >
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid #eee",
          fontSize: 11,
          fontWeight: 700,
          color: "#999",
          textTransform: "uppercase",
        }}
      >
        {title}
      </div>
      {actors
        .filter((a) => a.actor_id !== "player" && (a.visible_in_contacts || a.email))
        .map((a) => {
          const contactEmail = a.email || a.name;
          const isAlreadyAdded = value.toLowerCase().includes(contactEmail.toLowerCase());
          return (
            <div
              key={a.actor_id}
              onClick={() => {
                if (isAlreadyAdded) {
                  const parts = value
                    .split(",")
                    .map((s) => s.trim())
                    .filter((s) => s.toLowerCase() !== contactEmail.toLowerCase());
                  onChange(parts.join(", "));
                } else {
                  const existing = value.trim();
                  onChange(existing ? `${existing}, ${contactEmail}` : contactEmail);
                }
              }}
              style={{
                padding: "8px 12px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                borderBottom: "1px solid #f5f5f5",
                transition: "background .1s",
                background: isAlreadyAdded ? "#f0f0ff" : "#fff",
              }}
              onMouseEnter={(e) => {
                if (!isAlreadyAdded) e.currentTarget.style.background = "#fafafa";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isAlreadyAdded ? "#f0f0ff" : "#fff";
              }}
            >
              <Avatar
                initials={a.avatar?.initials || getInitials(a.name)}
                color={a.avatar?.color || "#666"}
                size={28}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>{a.name}</div>
                <div
                  style={{
                    fontSize: 11,
                    color: "#888",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {a.role?.slice(0, 40)}
                  {a.role && a.role.length > 40 ? "..." : ""}
                </div>
                {a.email && (
                  <div style={{ fontSize: 10, color: "#5b5fc7" }}>{a.email}</div>
                )}
              </div>
              {isAlreadyAdded && (
                <span style={{ fontSize: 16, color: "#5b5fc7", flexShrink: 0 }}>✓</span>
              )}
            </div>
          );
        })}
    </div>
  );
}
