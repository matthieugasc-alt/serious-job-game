// ═══════════════════════════════════════════════════════════════════
// Capabilities — public API barrel
// ═══════════════════════════════════════════════════════════════════
//
// One-stop import for anything capability-related:
//   - probeVoiceCapability()       — boot-time browser+mic+permissions probe
//   - VoiceCapabilityStatus        — the enum-typed result
//   - humanReasonMessage(reason)   — French UI message for the fallback banner
//
// Consommé par la mécanique `presentation` (app/mechanics/presentation)
// pour décider voix vs texte. Le sélecteur v1 (pickBestMode /
// normalizePhaseModes / adjustTimerForMode, basé sur
// phase.interaction_modes du format v1) a été supprimé avec le player
// legacy — voir archive/legacy-v1/ARCHIVE.md.
//
// React components never call navigator.mediaDevices themselves.
// ═══════════════════════════════════════════════════════════════════

export type {
  VoiceCapabilityStatus,
  VoiceCapabilityReason,
} from "./voiceCapability";
export {
  probeVoiceCapability,
  humanReasonMessage,
} from "./voiceCapability";
