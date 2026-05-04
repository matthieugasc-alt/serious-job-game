// ══════════════════════════════════════════════════════════════════
// ContractModule — PhaseModule wrapper around ContractHandler
// ══════════════════════════════════════════════════════════════════
//
// Wraps the existing ContractHandler in the PhaseModule interface.
// Delegates all logic to ContractHandler — no new behavior.
//
// Handles:
//   - canHandle: detects contract phases via handler_config.contract.type
//   - onContractSigned: calls computeSign → maps SignResult to actions
//   - shouldAdvance: checks completion_trigger === "contract_signed"
//
// Does NOT own React state (articles, thread, status stay in page.tsx).
// Returns ModuleAction[] for page.tsx to execute.
// ══════════════════════════════════════════════════════════════════

import type { PhaseModule, ModuleContext, ModuleResult, ModuleAction, ContractModuleContext } from "./types";
import { EMPTY_RESULT } from "./types";
import { ContractHandler } from "../ContractHandler";
import type { ContractType, SignResult, SignFlagsParams } from "../types";

// ── Helper: read contract type from phase config ──

function getContractType(phase: Record<string, unknown>): ContractType | null {
  // Path 1: explicit handler_config.contract.type in JSON
  const handlerConfig = phase.handler_config as Record<string, unknown> | undefined;
  if (handlerConfig) {
    const contractConfig = handlerConfig.contract as Record<string, unknown> | undefined;
    if (contractConfig?.type && typeof contractConfig.type === "string") {
      return contractConfig.type as ContractType;
    }
  }

  // Path 2: check if modules array includes "contract"
  // (canHandle was already called, so we know it's a contract phase)
  // Fall through — caller should provide type explicitly

  return null;
}

// ══════════════════════════════════════════════════════════════════
// Module implementation
// ══════════════════════════════════════════════════════════════════

export const ContractModule: PhaseModule = {
  type: "contract",

  // ── Detection ──────────────────────────────────────────────────

  canHandle(phase: Record<string, unknown>): boolean {
    // A phase is a contract phase if it declares handler_config.contract.type
    return getContractType(phase) !== null;
  },

  // ── Phase enter: signal which contract type to initialize ──────

  onEnterPhase(ctx: ModuleContext): ModuleResult {
    const contractType = getContractType(ctx.phase);
    if (!contractType) return EMPTY_RESULT;

    return {
      actions: [{ type: "open_contract", contractType }],
      advance: false,
      finish: false,
    };
  },

  // ── Chat message: not handled (negotiation stays in page.tsx) ──

  onPlayerMessage(): ModuleResult {
    return EMPTY_RESULT;
  },

  // ── Mail: not handled by contract module ───────────────────────

  onMailSent(): ModuleResult {
    return EMPTY_RESULT;
  },

  // ── Contract signed: compute flags + directives ────────────────

  onContractSigned(ctx: ModuleContext, contractType: string): ModuleResult {
    const ct = contractType as ContractType;

    // Validate this is a known contract type
    if (!["s0_pacte", "s2_novadev", "s4_devis", "s5_exceptions"].includes(ct)) {
      return EMPTY_RESULT;
    }

    // Read extended context passed by page.tsx via (ctx as any).extra
    const extra = (ctx as any).extra as ContractModuleContext | undefined;
    if (!extra) {
      // No extra context → caller didn't enrich context, fall back to legacy
      return EMPTY_RESULT;
    }

    // Build SignFlagsParams from extra context
    const params: SignFlagsParams = {
      playerName: ctx.playerName,
      articles: extra.articles,
      thread: extra.thread,
      currentFlags: extra.currentFlags as Record<string, any> | undefined,
      ctoName: extra.ctoName,
      phaseMailConfig: extra.phaseMailConfig,
      contractVars: extra.contractVars,
      features: extra.features,
      dealTerms: extra.dealTerms,
    };

    // Delegate to ContractHandler — pure computation, no side effects
    const signResult = ContractHandler.computeSign(ct, params);

    // Map SignResult → ModuleAction[]
    return {
      actions: mapSignResultToActions(signResult),
      advance: signResult.shouldAdvancePhase,
      finish: signResult.shouldFinishScenario,
    };
  },

  // ── Clause action: DEFERRED — stays in page.tsx ────────────────
  //
  // Why: onClauseAction delegates to sendXxxNegotiationMessage(), which is
  // an async function that: (1) calls /api/chat, (2) parses AI response
  // to update contract articles, (3) mutates React state (thread, loading).
  // This is inherently async + stateful — cannot be expressed as
  // synchronous ModuleAction[]. Would require async_effect + heavy refactor.
  // Safe to keep in page.tsx until the negotiation system is extracted.

  onClauseAction(): ModuleResult {
    return EMPTY_RESULT;
  },

  // ── Timer tick: not relevant ───────────────────────────────────

  onTick(): ModuleResult {
    return EMPTY_RESULT;
  },

  // ── Advance: checks completion_trigger ─────────────────────────

  shouldAdvance(ctx: ModuleContext): boolean {
    const trigger = ctx.phase.completion_trigger;
    if (trigger !== "contract_signed") return false;

    // Check session flags for contract_signed / pacte_signed
    return !!(
      ctx.flags.contract_signed ||
      ctx.flags.pacte_signed ||
      ctx.flags.devis_signed
    );
  },
};

// ══════════════════════════════════════════════════════════════════
// Helpers for page.tsx (thin wrappers around ContractHandler)
// ══════════════════════════════════════════════════════════════════

/**
 * Map a SignResult from ContractHandler.computeSign() into ModuleActions.
 * This is the bridge between the existing handler and the module system.
 *
 * Usage (future, when page.tsx delegates to orchestrator):
 *   const signResult = ContractHandler.computeSign(type, params);
 *   const actions = mapSignResultToActions(signResult);
 *   executeActions(actions);
 */
export function mapSignResultToActions(result: SignResult): ModuleAction[] {
  const actions: ModuleAction[] = [];

  // Flags
  if (Object.keys(result.flags).length > 0) {
    actions.push({ type: "set_flags", flags: result.flags });
  }

  // Mail draft
  if (result.mailDraft) {
    actions.push({
      type: "set_mail_draft",
      draft: {
        to: result.mailDraft.to,
        cc: result.mailDraft.cc,
        subject: result.mailDraft.subject,
        body: result.mailDraft.body,
        attachments: result.mailDraft.attachments,
      },
    });
  }

  // Send mail
  if (result.mailKind) {
    actions.push({ type: "send_mail", kind: result.mailKind });
  }

  // Advance / finish
  // Use complete_advance_phase (not advance_phase) because contract sign
  // needs full treatment: resolve dynamic actors, establishments, entry events
  if (result.shouldAdvancePhase) {
    actions.push({ type: "complete_advance_phase" });
  }
  if (result.shouldFinishScenario) {
    actions.push({ type: "finish_scenario" });
  }

  return actions;
}
