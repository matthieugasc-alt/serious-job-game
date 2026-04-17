"use client";

/**
 * Full-screen blocker displayed on mobile devices.
 * Prevents any gameplay access — the user sees this instead.
 *
 * Design: centered card with icon, message, and a subtle background.
 * Inline styles only — consistent with the rest of the codebase.
 */
export default function MobileBlockedScreen() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: "100%",
          background: "#ffffff",
          borderRadius: 24,
          padding: "48px 32px",
          textAlign: "center",
          boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
        }}
      >
        {/* Icon — laptop/monitor illustration */}
        <div
          style={{
            width: 80,
            height: 80,
            margin: "0 auto 24px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #e0e7ff, #c7d2fe)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 36,
          }}
        >
          💻
        </div>

        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "#1e1b4b",
            margin: "0 0 12px",
            lineHeight: 1.3,
          }}
        >
          Expérience non disponible sur mobile
        </h1>

        <div
          style={{
            width: 48,
            height: 3,
            background: "linear-gradient(90deg, #6366f1, #8b5cf6)",
            borderRadius: 2,
            margin: "0 auto 20px",
          }}
        />

        <p
          style={{
            fontSize: 15,
            lineHeight: 1.7,
            color: "#4b5563",
            margin: "0 0 28px",
          }}
        >
          Ceci est un <strong style={{ color: "#1e1b4b" }}>Serious Game</strong> dont
          l&apos;objectif est de vous mettre en situation professionnelle.
        </p>

        <p
          style={{
            fontSize: 15,
            lineHeight: 1.7,
            color: "#4b5563",
            margin: "0 0 32px",
          }}
        >
          Pour garantir une expérience de qualité, cette application est accessible
          uniquement sur un <strong style={{ color: "#1e1b4b" }}>ordinateur</strong> ou
          une <strong style={{ color: "#1e1b4b" }}>tablette</strong>.
        </p>

        {/* Device icons */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 32,
            marginBottom: 28,
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: "#f0fdf4",
                border: "2px solid #86efac",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
                margin: "0 auto 6px",
              }}
            >
              🖥️
            </div>
            <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>
              Ordinateur
            </span>
          </div>
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: "#f0fdf4",
                border: "2px solid #86efac",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
                margin: "0 auto 6px",
              }}
            >
              📱
            </div>
            <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>
              Tablette
            </span>
          </div>
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: "#fef2f2",
                border: "2px solid #fca5a5",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
                margin: "0 auto 6px",
                position: "relative",
              }}
            >
              📱
              <span
                style={{
                  position: "absolute",
                  top: -4,
                  right: -4,
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "#ef4444",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ✕
              </span>
            </div>
            <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 600 }}>
              Mobile
            </span>
          </div>
        </div>

        <div
          style={{
            padding: "12px 16px",
            background: "#f5f3ff",
            borderRadius: 12,
            fontSize: 13,
            color: "#6d28d9",
            fontWeight: 500,
          }}
        >
          Serious Job Game — Simulation professionnelle
        </div>
      </div>
    </div>
  );
}
