/**
 * Visual atoms used throughout the player.
 * Extracted from page.tsx. No state, pure render.
 */

import { STATUS_COLORS } from "../lib/playerUtils";

export function TypingDots() {
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

/** Small colored circle for contact status */
export function StatusDot({ status }: { status: string }) {
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

/** Avatar circle */
export function Avatar({ initials, color, size = 36, status }: {
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
