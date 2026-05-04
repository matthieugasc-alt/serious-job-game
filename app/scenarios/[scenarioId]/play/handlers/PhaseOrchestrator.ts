// ══════════════════════════════════════════════════════════════════
// PhaseOrchestrator — Dispatches events to active modules
// ══════════════════════════════════════════════════════════════════
//
// The orchestrator is the bridge between page.tsx (React state owner)
// and the module system (pure functions).
//
// Flow:
//   1. page.tsx calls dispatch(event, modules, ctx)
//   2. Orchestrator routes the event to each module's lifecycle method
//   3. Each module returns a ModuleResult (actions + advance/finish)
//   4. Orchestrator merges all results into a single OrchestratorResult
//   5. page.tsx executes the actions (set state, call APIs, etc.)
//
// Currently passive: no modules are registered, so dispatch() is
// never called in practice. When modules are added, page.tsx will
// call dispatch() instead of (or before) its legacy handlers.
// ══════════════════════════════════════════════════════════════════

import type {
  PhaseModule,
  ModuleEvent,
  ModuleContext,
  ModuleResult,
  ModuleAction,
} from "./modules/types";
import { EMPTY_RESULT } from "./modules/types";

// ── Orchestrator result (merged from all modules) ──

/** Combined result from dispatching an event to all active modules. */
export interface OrchestratorResult {
  /** All actions from all modules, in module order. */
  actions: ModuleAction[];
  /** At least one module wants to advance the phase. */
  advance: boolean;
  /** At least one module wants to finish the scenario. */
  finish: boolean;
}

/** Empty orchestrator result (no actions, no advance). */
export const EMPTY_ORCHESTRATOR_RESULT: Readonly<OrchestratorResult> = Object.freeze({
  actions: [],
  advance: false,
  finish: false,
});

// ── Dispatch ──

/**
 * Dispatch an event to all active modules and merge their results.
 *
 * Each module receives the event and returns a ModuleResult.
 * Results are merged: actions are concatenated (in module order),
 * advance/finish are OR'd (any module can trigger them).
 *
 * Returns EMPTY_ORCHESTRATOR_RESULT if modules is null or empty.
 */
export function dispatch(
  event: ModuleEvent,
  modules: PhaseModule[] | null,
  ctx: ModuleContext,
): OrchestratorResult {
  if (!modules || modules.length === 0) {
    return EMPTY_ORCHESTRATOR_RESULT;
  }

  const allActions: ModuleAction[] = [];
  let advance = false;
  let finish = false;

  for (const mod of modules) {
    const result = routeEvent(event, mod, ctx);

    if (result.actions.length > 0) {
      allActions.push(...result.actions);
    }
    if (result.advance) advance = true;
    if (result.finish) finish = true;
  }

  // After processing the event, check if any module wants to advance
  if (!advance) {
    for (const mod of modules) {
      if (mod.shouldAdvance(ctx)) {
        advance = true;
        break;
      }
    }
  }

  return { actions: allActions, advance, finish };
}

// ── Internal: route an event to the right lifecycle method ──

function routeEvent(
  event: ModuleEvent,
  mod: PhaseModule,
  ctx: ModuleContext,
): ModuleResult {
  switch (event.type) {
    case "enter_phase":
      return mod.onEnterPhase(ctx);

    case "player_message":
      return mod.onPlayerMessage(ctx, event.message, event.actor);

    case "mail_sent":
      return mod.onMailSent(ctx, event.mailKind, event.mailBody);

    case "contract_signed":
      return mod.onContractSigned(ctx, event.contractType);

    case "clause_action":
      return mod.onClauseAction(ctx, event.message, event.articleId);

    case "tick":
      return mod.onTick(ctx, event.elapsed);

    default:
      return EMPTY_RESULT;
  }
}

// ── Context builder (convenience for page.tsx) ──

/**
 * Build a ModuleContext from page.tsx state.
 * Convenience function so page.tsx doesn't need to know the shape.
 */
export function buildModuleContext(params: {
  session: Record<string, unknown>;
  scenario: Record<string, unknown>;
  phase: Record<string, unknown>;
  playerName: string;
  scenarioId: string;
}): ModuleContext {
  return {
    session: params.session,
    scenario: params.scenario,
    phase: params.phase,
    playerName: params.playerName,
    flags: (params.session.flags as Record<string, unknown>) || {},
    scenarioId: params.scenarioId,
  };
}
