// ═══════════════════════════════════════════════════════════════════
// Capabilities — public API barrel (V-chantier)
// ═══════════════════════════════════════════════════════════════════
//
// One-stop import for anything capability-related:
//   - probeVoiceCapability()       — boot-time browser+mic+permissions probe
//   - VoiceCapabilityStatus        — the enum-typed result
//   - humanReasonMessage(reason)   — French UI message for the fallback banner
//   - pickBestMode(phase, cap)     — the selector (voice → text fallback)
//   - normalizePhaseModes(phase)   — legacy interaction_mode → array
//   - adjustTimerForMode(phase,m)  — timer multiplier per mode (V2 extension)
//   - isVoiceMode(mode)            — helper for downgrade classification
//
// The moteur ONLY reads capabilities through this barrel. React
// components never call navigator.mediaDevices themselves.
// ═══════════════════════════════════════════════════════════════════

export type {
  VoiceCapabilityStatus,
  VoiceCapabilityReason,
} from "./voiceCapability";
export {
  probeVoiceCapability,
  humanReasonMessage,
} from "./voiceCapability";

export type {
  InteractionMode,
  PickBestModeResult,
  TimerAdjustment,
} from "./pickBestMode";
export {
  pickBestMode,
  normalizePhaseModes,
  adjustTimerForMode,
  isVoiceMode,
} from "./pickBestMode";
