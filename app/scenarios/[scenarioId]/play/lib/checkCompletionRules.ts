/**
 * @deprecated — do NOT use.
 *
 * This file was an incomplete re-implementation of the completion-rules
 * evaluation logic (only handled npc_evidence / player_evidence / min_score,
 * missed any_flags / all_flags / max_exchanges). Using it caused the S1
 * one-pager phase to auto-advance on any mail send (regression).
 *
 * Single source of truth: `isCurrentPhaseValidatedByRules(session)` from
 * `@/app/lib/runtime` — handles ALL 6 rule types plus the min_player_messages
 * fallback for phases without explicit completion_rules.
 *
 * This file kept as a redirect only for backward-compat with older imports.
 * TODO: remove once no active branch still imports from here.
 */

export { isCurrentPhaseValidatedByRules as checkCompletionRules } from "@/app/lib/runtime";
