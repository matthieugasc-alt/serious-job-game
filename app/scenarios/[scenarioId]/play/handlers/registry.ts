// ══════════════════════════════════════════════════════════════════
// Handler Registry — Resolves which handler (if any) manages a phase
// ══════════════════════════════════════════════════════════════════
//
// Usage:
//   const handler = resolvePhaseHandler(currentPhaseConfig);
//   if (handler) { /* use handler */ }
//   else { /* legacy behavior */ }
//
// Returns null when no handler matches → page.tsx uses its existing code.
// ══════════════════════════════════════════════════════════════════

import type { PhaseHandler } from "./types";
import { InterviewHandler } from "./InterviewHandler";

/** All registered handlers, in priority order */
const handlers: readonly PhaseHandler[] = [InterviewHandler];

/**
 * Find the handler that manages the given phase config.
 * Returns null if no handler matches (→ legacy fallback in page.tsx).
 */
export function resolvePhaseHandler(phase: any): PhaseHandler | null {
  if (!phase) return null;
  for (const handler of handlers) {
    if (handler.matches(phase)) return handler;
  }
  return null;
}

// Re-export for convenience
export { InterviewHandler } from "./InterviewHandler";
export { ContractHandler } from "./ContractHandler";
export { MailHandler } from "./MailHandler";
export type { PhaseHandler, InterviewPhaseHandler, ContractPhaseHandler, ContractType, SignResult, NegotiationConfig, MailPhaseHandler, AutoReplyContext, AutoReplyEffect } from "./types";
