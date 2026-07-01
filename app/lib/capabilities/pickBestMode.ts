// ═══════════════════════════════════════════════════════════════════
// PICK BEST MODE — V3 of the V-chantier
// ═══════════════════════════════════════════════════════════════════
//
// Selects the best interaction mode for a phase given:
//   - the phase's ordered `interaction_modes` preference list
//   - the browser's VoiceCapabilityStatus (from probeVoiceCapability)
//
// Guarantees:
//   1. Always returns a mode. `text` is the ultimate fallback and is
//      auto-appended if the phase forgot to list it.
//   2. Never returns a voice mode when voice is unusable.
//   3. Legacy compat: normalizePhaseModes accepts either the new
//      `interaction_modes: string[]` OR the legacy `interaction_mode: string`,
//      and returns a single normalized array.
//
// Design principle: pure function. No side effects, deterministic,
// trivial to test. The mode selection happens ONCE at boot and is
// then persisted for the rest of the session.
// ═══════════════════════════════════════════════════════════════════

import type { VoiceCapabilityStatus } from "./voiceCapability";

// ─── Types ───────────────────────────────────────────────────────

/**
 * Modes the moteur knows how to render. Adding a new one requires:
 *   - updating the schema enum in scenario.schema.json
 *   - handling it in isVoiceMode below
 *   - wiring the UI branch (V5: PresentationModeView / others)
 */
export type InteractionMode =
  | "voice"
  | "text"
  | "chat_mail"
  | "presentation"
  | "voice_qa";

/**
 * Which modes require voice capability. If a mode is here, the moteur
 * won't pick it when VoiceCapabilityStatus.usable === false.
 */
const VOICE_MODES: ReadonlySet<InteractionMode> = new Set([
  "voice",
  "voice_qa",
]);

export function isVoiceMode(mode: InteractionMode): boolean {
  return VOICE_MODES.has(mode);
}

// ─── Normalization: legacy interaction_mode → interaction_modes ──

interface PhaseWithModes {
  interaction_modes?: unknown;
  interaction_mode?: unknown;
}

/**
 * Read a phase's mode declaration in either the new or legacy shape
 * and return a normalized ordered list of modes.
 *
 * Rules:
 *   - If `interaction_modes` is a non-empty array, use it as-is (order preserved).
 *   - Else if `interaction_mode` (legacy singular) is a string, wrap it: [mode].
 *   - Else return ["text"] (defensive default — never leave a phase unplayable).
 *
 * "text" is auto-appended to any list that doesn't already contain it,
 * so the picker always has an ultimate fallback.
 */
export function normalizePhaseModes(phase: PhaseWithModes | null | undefined): InteractionMode[] {
  const raw: InteractionMode[] = [];

  if (phase && Array.isArray(phase.interaction_modes) && phase.interaction_modes.length > 0) {
    for (const m of phase.interaction_modes) {
      if (typeof m === "string") raw.push(m as InteractionMode);
    }
  } else if (phase && typeof phase.interaction_mode === "string") {
    raw.push(phase.interaction_mode as InteractionMode);
  }

  if (raw.length === 0) raw.push("text");

  // Ensure "text" is always in the list (ultimate fallback).
  if (!raw.includes("text")) raw.push("text");

  return raw;
}

// ─── The selector ────────────────────────────────────────────────

export interface PickBestModeResult {
  /** The mode the moteur should activate for this phase. */
  readonly mode: InteractionMode;
  /**
   * The mode the phase actually preferred (raw[0]). Useful for the UX
   * banner: if `mode !== preferred`, we downgraded and should tell the
   * user why.
   */
  readonly preferred: InteractionMode;
  /** True iff we had to downgrade from the preferred mode. */
  readonly downgraded: boolean;
  /**
   * When downgraded=true, the human-readable reason (from the
   * capability status). Empty string otherwise.
   */
  readonly downgradeReason: string;
}

/**
 * Pick the best mode for a phase.
 *
 * Iterates the normalized mode list in preference order. Skips voice
 * modes if capability is not usable. Returns the first compatible mode.
 * "text" is always compatible (guaranteed by normalizePhaseModes).
 */
export function pickBestMode(
  phase: PhaseWithModes | null | undefined,
  capability: VoiceCapabilityStatus,
): PickBestModeResult {
  const modes = normalizePhaseModes(phase);
  const preferred = modes[0]!;

  for (const mode of modes) {
    if (isVoiceMode(mode) && !capability.usable) continue;
    const downgraded = mode !== preferred;
    return {
      mode,
      preferred,
      downgraded,
      downgradeReason: downgraded ? capabilityReasonText(capability) : "",
    };
  }

  // Should be unreachable — "text" is guaranteed present and always usable.
  // Defensive fallback for exhaustiveness.
  return {
    mode: "text",
    preferred,
    downgraded: preferred !== "text",
    downgradeReason: preferred !== "text" ? capabilityReasonText(capability) : "",
  };
}

function capabilityReasonText(capability: VoiceCapabilityStatus): string {
  return capability.reason;
}

// ─── Timer adjustment (extension: text takes longer than speech) ──

interface PhaseWithModeConfig extends PhaseWithModes {
  max_duration_sec?: unknown;
  mode_config?: Record<string, { timer_multiplier?: unknown; disable_timer?: unknown }>;
}

export interface TimerAdjustment {
  /** Effective max_duration_sec after applying mode_config, or null if disabled. */
  readonly effectiveMaxDurationSec: number | null;
  /** The raw scenario value, for diagnostics. */
  readonly baseMaxDurationSec: number | null;
  /** The multiplier applied (1 if none). */
  readonly appliedMultiplier: number;
  /** True if the timer was fully disabled by mode_config. */
  readonly disabled: boolean;
}

/**
 * Compute the effective phase timer given the mode picked.
 *
 * Text mode is typically slower than voice (typing vs speaking) — a
 * scenario can declare `mode_config: { text: { timer_multiplier: 3 } }`
 * to give the player breathing room when the moteur falls back to text.
 *
 * `disable_timer: true` OR `timer_multiplier: 0` disables the cap entirely.
 */
export function adjustTimerForMode(
  phase: PhaseWithModeConfig | null | undefined,
  mode: InteractionMode,
): TimerAdjustment {
  const base =
    phase && typeof phase.max_duration_sec === "number" && phase.max_duration_sec > 0
      ? phase.max_duration_sec
      : null;

  const cfg = phase?.mode_config?.[mode];
  const disabled = cfg?.disable_timer === true;
  const rawMult = typeof cfg?.timer_multiplier === "number" ? cfg.timer_multiplier : 1;
  const multiplier = rawMult >= 0 ? rawMult : 1;

  if (base === null) {
    return {
      effectiveMaxDurationSec: null,
      baseMaxDurationSec: null,
      appliedMultiplier: multiplier,
      disabled,
    };
  }

  if (disabled || multiplier === 0) {
    return {
      effectiveMaxDurationSec: null,
      baseMaxDurationSec: base,
      appliedMultiplier: multiplier,
      disabled: true,
    };
  }

  return {
    effectiveMaxDurationSec: Math.round(base * multiplier),
    baseMaxDurationSec: base,
    appliedMultiplier: multiplier,
    disabled: false,
  };
}
