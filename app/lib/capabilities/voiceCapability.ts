// ═══════════════════════════════════════════════════════════════════
// VOICE CAPABILITY — boot-time capability check (V1 of the V-chantier)
// ═══════════════════════════════════════════════════════════════════
//
// Purpose:
//   Answers ONE question before a scenario starts:
//     "Can this browser + this device + this user run voice input right now?"
//
//   Returns a simple discriminated enum so the mode selector (V3) can
//   pick a mode without inspecting a dozen booleans.
//
// This module composes on top of app/lib/voiceCapture.ts's
// detectVoiceCapabilities() (API surface) and adds two orthogonal
// checks that voiceCapture.ts does NOT do:
//
//   1. Secure context   — getUserMedia is blocked on http:// (except
//      http://localhost). Without HTTPS, no mic. Ever.
//
//   2. Permission state — via navigator.permissions.query({name:'microphone'}).
//      Lets us know if the user has already GRANTED, DENIED, or if the
//      browser will PROMPT on first getUserMedia call.
//
// Design principle (advisor: "l'engine décide, jamais l'UI qui devine"):
//   The moteur asks once at boot, caches the result, and hands off a
//   VoiceCapabilityStatus to whoever needs it. UI components read from
//   this — they NEVER call navigator.mediaDevices themselves.
// ═══════════════════════════════════════════════════════════════════

import { detectVoiceCapabilities } from "../voiceCapture";

// ─── Public types ────────────────────────────────────────────────

/**
 * The reason voice is (or isn't) usable.
 *
 * `ready`             → All checks passed. Voice mode is safe to enable.
 * `permission_prompt` → APIs present, secure context, but the user hasn't
 *                       been asked yet. Voice mode CAN be used; the first
 *                       getUserMedia() call will trigger the browser prompt.
 * `permission_denied` → User has explicitly refused mic access. Voice
 *                       mode is impossible without user going to browser
 *                       settings.
 * `no_device`         → No microphone hardware detected (rare — usually
 *                       surfaces at getUserMedia time as NotFoundError).
 * `insecure_context`  → Page loaded over http:// (not localhost). Browser
 *                       will refuse getUserMedia.
 * `no_api`            → getUserMedia not exposed by the browser at all
 *                       (very old browsers, some embedded WebViews).
 * `unknown_error`     → An unexpected exception during detection. Fall
 *                       back to text mode defensively.
 */
export type VoiceCapabilityReason =
  | "ready"
  | "permission_prompt"
  | "permission_denied"
  | "no_device"
  | "insecure_context"
  | "no_api"
  | "unknown_error";

export interface VoiceCapabilityStatus {
  /** True iff a voice-mode scenario can start right now without breaking. */
  readonly usable: boolean;
  /** Why. Drives the fallback message shown to the player. */
  readonly reason: VoiceCapabilityReason;
  /** For diagnostics only — the low-level capability set. */
  readonly api: {
    readonly hasGetUserMedia: boolean;
    readonly hasMediaRecorder: boolean;
    readonly hasSpeechRecognition: boolean;
    readonly recommendedMode: "native" | "backend" | "unavailable";
  };
  /**
   * True if the check was inconclusive (e.g. permissions API not
   * available in this browser). Caller can still try getUserMedia; the
   * moteur just can't pre-flight.
   */
  readonly probed: boolean;
}

// ─── Detection ───────────────────────────────────────────────────

const SSR_FALLBACK: VoiceCapabilityStatus = Object.freeze({
  usable: false as const,
  reason: "no_api" as const,
  api: {
    hasGetUserMedia: false,
    hasMediaRecorder: false,
    hasSpeechRecognition: false,
    recommendedMode: "unavailable" as const,
  },
  probed: false as const,
});

/**
 * Boot-time voice capability probe.
 *
 * Safe to call in any environment (SSR, jsdom, real browser). Returns
 * a frozen status object — callers can trust it never mutates.
 *
 * Never throws. On unexpected browser errors, returns `unknown_error`
 * with usable=false so the moteur falls back to text mode defensively.
 */
export async function probeVoiceCapability(): Promise<VoiceCapabilityStatus> {
  // ── Server-side: bail early with a safe default ──
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return SSR_FALLBACK;
  }

  try {
    // ── 1. Secure context (getUserMedia refuses on http:// except localhost) ──
    // window.isSecureContext is spec — Safari 10+, Chrome 47+.
    if (window.isSecureContext === false) {
      return freeze({
        usable: false,
        reason: "insecure_context",
        api: apiFromDetect(),
        probed: true,
      });
    }

    // ── 2. API surface (getUserMedia present at all) ──
    const api = apiFromDetect();
    if (!api.hasGetUserMedia) {
      return freeze({ usable: false, reason: "no_api", api, probed: true });
    }

    // ── 3. Permission state (does NOT trigger the prompt) ──
    // The Permissions API is not universal — Safari didn't ship
    // 'microphone' until 16. If unavailable, we return "permission_prompt"
    // (usable=true) because the mic MAY work; we just can't pre-flight.
    let permissionState: PermissionState | null = null;
    if (typeof navigator.permissions?.query === "function") {
      try {
        const res = await navigator.permissions.query({
          name: "microphone" as PermissionName,
        });
        permissionState = res.state;
      } catch {
        // Some browsers throw on unknown descriptor — treat as unknown.
        permissionState = null;
      }
    }

    if (permissionState === "denied") {
      return freeze({ usable: false, reason: "permission_denied", api, probed: true });
    }

    if (permissionState === "prompt") {
      return freeze({ usable: true, reason: "permission_prompt", api, probed: true });
    }

    // permissionState === "granted" OR (null = couldn't probe) → ready.
    // In both cases the first getUserMedia call will succeed OR raise a
    // catchable NotAllowedError / NotFoundError that the UI can handle.
    return freeze({
      usable: true,
      reason: "ready",
      api,
      probed: permissionState !== null,
    });
  } catch {
    // Never throw from a capability probe — defensive fallback.
    return freeze({
      usable: false,
      reason: "unknown_error",
      api: apiFromDetect(),
      probed: true,
    });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

function apiFromDetect(): VoiceCapabilityStatus["api"] {
  const raw = detectVoiceCapabilities();
  return {
    hasGetUserMedia: raw.hasGetUserMedia,
    hasMediaRecorder: raw.hasMediaRecorder,
    hasSpeechRecognition: raw.hasSpeechRecognition,
    recommendedMode: raw.recommendedMode,
  };
}

function freeze<T>(x: T): Readonly<T> {
  return Object.freeze(x);
}

// ─── Human-readable messages ────────────────────────────────────

/**
 * French-language message to display to the player when voice mode
 * has been downgraded to text. Keep it short + reassuring — the
 * scenario continues, nothing is broken.
 */
export function humanReasonMessage(reason: VoiceCapabilityReason): string {
  switch (reason) {
    case "ready":
    case "permission_prompt":
      return ""; // voice will be tried
    case "permission_denied":
      return "L'accès au micro a été refusé. La simulation se poursuit en mode texte. Tu peux ré-autoriser dans les paramètres du navigateur.";
    case "no_device":
      return "Aucun micro détecté. La simulation se poursuit en mode texte.";
    case "insecure_context":
      return "Le micro nécessite une connexion sécurisée (HTTPS). La simulation se poursuit en mode texte.";
    case "no_api":
      return "Ce navigateur ne supporte pas la capture audio. La simulation se poursuit en mode texte.";
    case "unknown_error":
      return "Le micro n'est pas disponible sur cette configuration. La simulation se poursuit automatiquement en mode texte.";
  }
}
