/**
 * MailSignButton — "open & sign / open & fill" CTA shown under a mail
 * body when the player needs to act on it (pacte, contract, convention,
 * devis, bon de commande, one-pager).
 *
 * Pure presentation. The parent decides which variant to render (signed
 * green badge / refused red badge / golden CTA / purple CTA) by passing
 * the corresponding props.
 *
 * The 6 invocation sites in MailView used to be 50 lines each of nearly
 * identical JSX; this component drops the cost to a single tag.
 */

import React from "react";

export type MailSignButtonVariant = "gold" | "purple";

export type MailSignButtonProps = {
  /** Render a success badge (Pacte signé / Devis signé / etc.). */
  signed?: boolean;
  /** Optional: render a refused badge (used by S3 clinical contract). */
  refused?: boolean;
  /** Success badge title (e.g. "Pacte signé"). */
  signedTitle?: string;
  /** Success badge subtitle. */
  signedSubtitle?: string;
  /** Refused badge title (only with refused=true). */
  refusedTitle?: string;
  /** Refused badge subtitle. */
  refusedSubtitle?: string;
  /** CTA label (e.g. "Ouvrir et signer le pacte"). */
  ctaLabel: string;
  /** CTA click handler. */
  onClick: () => void;
  /** Color variant — "gold" for contracts, "purple" for the one-pager. */
  variant?: MailSignButtonVariant;
};

export function MailSignButton({
  signed,
  refused,
  signedTitle = "Signé",
  signedSubtitle,
  refusedTitle = "Refusé",
  refusedSubtitle,
  ctaLabel,
  onClick,
  variant = "gold",
}: MailSignButtonProps) {
  if (signed) {
    return (
      <div style={{ marginTop: 16 }}>
        <div
          style={{
            padding: "14px 18px",
            background: "rgba(74,222,128,0.08)",
            border: "1px solid rgba(74,222,128,0.25)",
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 20 }}>✅</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#16a34a" }}>{signedTitle}</div>
            {signedSubtitle && (
              <div style={{ fontSize: 11, color: "#666" }}>{signedSubtitle}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (refused) {
    return (
      <div style={{ marginTop: 16 }}>
        <div
          style={{
            padding: "14px 18px",
            background: "rgba(220,38,38,0.06)",
            border: "1px solid rgba(220,38,38,0.2)",
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 20 }}>❌</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#dc2626" }}>{refusedTitle}</div>
            {refusedSubtitle && (
              <div style={{ fontSize: 11, color: "#666" }}>{refusedSubtitle}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const isPurple = variant === "purple";
  return (
    <div style={{ marginTop: 16 }}>
      <button
        onClick={onClick}
        style={{
          width: "100%",
          padding: "14px 24px",
          background: isPurple
            ? "linear-gradient(135deg, #5b5fc7, #4a4eb3)"
            : "linear-gradient(135deg, #ffd700, #ffb300)",
          border: isPurple ? "2px solid rgba(91,95,199,0.4)" : "2px solid #e6a800",
          borderRadius: 12,
          color: isPurple ? "#fff" : "#1a1a2e",
          fontSize: 14,
          fontWeight: 800,
          cursor: "pointer",
          boxShadow: isPurple
            ? "0 4px 16px rgba(91,95,199,0.3)"
            : "0 4px 16px rgba(255,215,0,0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          transition: "all 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.01)";
          if (isPurple) {
            e.currentTarget.style.boxShadow = "0 6px 24px rgba(91,95,199,0.4)";
          } else {
            e.currentTarget.style.boxShadow = "0 6px 24px rgba(255,215,0,0.4)";
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.boxShadow = isPurple
            ? "0 4px 16px rgba(91,95,199,0.3)"
            : "0 4px 16px rgba(255,215,0,0.3)";
        }}
      >
        {ctaLabel}
      </button>
    </div>
  );
}
