// ══════════════════════════════════════════════════════════════════
// InterviewModule — PhaseModule wrapper around InterviewHandler
// ══════════════════════════════════════════════════════════════════
//
// Wraps the existing InterviewHandler in the PhaseModule interface.
// Delegates all logic to InterviewHandler — no new behavior.
//
// Handles:
//   - onEnterPhase: set contact to briefing actor
//   - Interview start routing (target actor, return actor)
//   - Post-interview: mark candidate unavailable if configured
//
// Does NOT own React state. Returns ModuleAction[] for page.tsx.
// ══════════════════════════════════════════════════════════════════

import type { PhaseModule, ModuleContext, ModuleResult } from "./types";
import { EMPTY_RESULT } from "./types";
import { InterviewHandler } from "../InterviewHandler";

export const InterviewModule: PhaseModule = {
  type: "interview",

  // ── Detection ──────────────────────────────────────────────────

  canHandle(phase: Record<string, unknown>): boolean {
    return InterviewHandler.matches(phase);
  },

  // ── Phase enter: set contact to briefing actor ─────────────────

  onEnterPhase(ctx: ModuleContext): ModuleResult {
    const briefingActor = InterviewHandler.getBriefingActor(ctx.phase);
    if (!briefingActor) return EMPTY_RESULT;

    return {
      actions: [{ type: "set_contact", actorId: briefingActor }],
      advance: false,
      finish: false,
    };
  },

  // ── Chat message: no interview-specific logic ──────────────────
  // Chat handling stays in page.tsx sendMessage. Pass-through.

  onPlayerMessage(): ModuleResult {
    return EMPTY_RESULT;
  },

  // ── Mail: not relevant for interviews ──────────────────────────

  onMailSent(): ModuleResult {
    return EMPTY_RESULT;
  },

  // ── Contract: not relevant ─────────────────────────────────────

  onContractSigned(): ModuleResult {
    return EMPTY_RESULT;
  },

  // ── Clause action: not relevant ────────────────────────────────

  onClauseAction(): ModuleResult {
    return EMPTY_RESULT;
  },

  // ── Timer tick: not handled here (usePhaseTimer owns this) ─────

  onTick(): ModuleResult {
    return EMPTY_RESULT;
  },

  // ── Advance: interviews advance via timer / max_duration ───────

  shouldAdvance(): boolean {
    return false;
  },
};

// ══════════════════════════════════════════════════════════════════
// Helpers for page.tsx (thin wrappers around InterviewHandler)
// ══════════════════════════════════════════════════════════════════

/**
 * Build actions for starting an interview (player clicks "Faire entrer").
 * Returns set_contact to target actor + mark_unavailable if configured.
 *
 * NOTE: session mutation (startInterview) still happens in page.tsx
 * because it requires cloneSession. This helper only returns the
 * contact-switching actions.
 */
export function buildInterviewStartActions(
  phase: Record<string, unknown>,
): ModuleResult {
  const targetActor = InterviewHandler.getTargetActor(phase);
  if (!targetActor) return EMPTY_RESULT;

  return {
    actions: [{ type: "set_contact", actorId: targetActor }],
    advance: false,
    finish: false,
  };
}

/**
 * Build actions for after an interview phase ends.
 * Returns mark_unavailable if configured + set_contact to return actor.
 */
export function buildInterviewEndActions(
  phase: Record<string, unknown>,
): ModuleResult {
  const actions: ModuleResult["actions"] = [];

  // Mark candidate as unavailable if configured
  if (InterviewHandler.shouldMarkUnavailable(phase)) {
    const target = InterviewHandler.getTargetActor(phase);
    if (target) {
      actions.push({ type: "mark_unavailable", actorId: target });
    }
  }

  // Return to briefing actor
  const returnActor = InterviewHandler.getReturnActor(phase);
  if (returnActor) {
    actions.push({ type: "set_contact", actorId: returnActor });
  }

  return {
    actions,
    advance: false,
    finish: false,
  };
}
