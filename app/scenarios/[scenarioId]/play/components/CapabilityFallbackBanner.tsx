/**
 * CapabilityFallbackBanner — displayed when the moteur downgraded from
 * a voice mode to text mode because the browser/device/permissions
 * didn't cooperate (V4 of the V-chantier).
 *
 * The banner is intentionally reassuring: the scenario continues, and
 * the player is told exactly why voice was skipped. When the reason is
 * "permission_denied" or "permission_prompt", a CTA lets the player
 * retry — clicking it triggers a fresh getUserMedia() request that
 * pops the browser prompt (or shows the "you already denied" message,
 * which the user then knows to fix in their browser settings).
 *
 * Pure presentation + a single async retry callback. No capability
 * probing happens here — the caller (page.tsx boot) provides the
 * status; the banner only renders it.
 */

import React, { useState } from "react";
import type { VoiceCapabilityStatus } from "@/app/lib/capabilities";
import { humanReasonMessage } from "@/app/lib/capabilities";

export interface CapabilityFallbackBannerProps {
  /** The capability status that caused the downgrade. */
  status: VoiceCapabilityStatus;
  /** The mode the phase preferred (voice / voice_qa). */
  preferredMode: string;
  /** The mode the moteur is actually running in (typically "text"). */
  activeMode: string;
  /**
   * Called when the player clicks "Réessayer avec le micro". Should
   * re-run probeVoiceCapability() and, if now usable, hot-swap the
   * mode. Should return true on success (mode swap done), false otherwise.
   */
  onRetry?: () => Promise<boolean>;
  /** Called when the player dismisses the banner (accepts text mode). */
  onDismiss?: () => void;
}

export function CapabilityFallbackBanner({
  status,
  preferredMode,
  activeMode,
  onRetry,
  onDismiss,
}: CapabilityFallbackBannerProps) {
  const [retrying, setRetrying] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);

  // Don't render if we didn't actually downgrade.
  if (status.usable || preferredMode === activeMode) return null;

  const message =
    humanReasonMessage(status.reason) ||
    "Le micro n'est pas disponible. La simulation se poursuit en mode texte.";

  // Retry only makes sense when the mic MIGHT still be reachable
  // (not for insecure_context / no_api which are terminal).
  const canRetry =
    Boolean(onRetry) &&
    (status.reason === "permission_denied" ||
      status.reason === "permission_prompt" ||
      status.reason === "no_device" ||
      status.reason === "unknown_error");

  async function handleRetry() {
    if (!onRetry || retrying) return;
    setRetrying(true);
    setRetryFailed(false);
    try {
      const ok = await onRetry();
      if (!ok) setRetryFailed(true);
    } catch {
      setRetryFailed(true);
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: "linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)",
        border: "1px solid #3b82f6",
        borderRadius: 0,
        padding: "12px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexShrink: 0,
        zIndex: 100,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span style={{ fontSize: 20, flexShrink: 0 }} aria-hidden>
          🎤
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#1e3a8a" }}>
            Mode texte activé
          </div>
          <div style={{ fontSize: 12, color: "#1e40af", marginTop: 2 }}>
            {message}
            {retryFailed ? (
              <span style={{ display: "block", marginTop: 4, color: "#b91c1c" }}>
                Le micro reste inaccessible. Vérifie les permissions dans les
                réglages de ton navigateur.
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        {canRetry ? (
          <button
            onClick={handleRetry}
            disabled={retrying}
            style={{
              background: "#3b82f6",
              border: "1px solid #2563eb",
              borderRadius: 6,
              padding: "4px 12px",
              color: "white",
              fontSize: 12,
              fontWeight: 600,
              cursor: retrying ? "wait" : "pointer",
              opacity: retrying ? 0.7 : 1,
            }}
          >
            {retrying ? "Vérification..." : "Réessayer avec le micro"}
          </button>
        ) : null}
        {onDismiss ? (
          <button
            onClick={onDismiss}
            style={{
              background: "rgba(30,58,138,0.1)",
              border: "1px solid rgba(30,58,138,0.2)",
              borderRadius: 6,
              padding: "4px 12px",
              color: "#1e3a8a",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Continuer en texte
          </button>
        ) : null}
      </div>
    </div>
  );
}
