// ══════════════════════════════════════════════════════════════════
// Phase Module System — Type definitions
// ══════════════════════════════════════════════════════════════════
//
// Modules are pure-function objects that describe gameplay behavior
// for a phase. They never mutate React state — they return actions
// that page.tsx (the state owner) executes.
//
// This file defines the contracts. No implementation here.
// ══════════════════════════════════════════════════════════════════

// ── Module identification ──

/** Known module types. Extensible as new modules are added. */
export type ModuleType =
  | "chat"
  | "contract"
  | "mail"
  | "timer"
  | "interview"
  | "debrief";

// ── Actions (effects described by modules, executed by page.tsx) ──

/** Discriminated union of all effects a module can request. */
export type ModuleAction =
  | { type: "set_flags"; flags: Record<string, unknown> }
  | { type: "add_ai_message"; actor: string; content: string }
  | { type: "set_contact"; actorId: string }
  | { type: "set_mail_draft"; draft: MailDraftAction }
  | { type: "send_mail"; kind: string }
  | { type: "inject_events"; events: TimedEventAction[] }
  | { type: "open_contract"; contractType: string }
  | { type: "mark_unavailable"; actorId: string }
  | { type: "advance_phase" }
  | { type: "finish_scenario" }
  // ── Mail module actions ──
  | { type: "set_view"; view: string }
  | { type: "set_compose"; show: boolean }
  | { type: "add_inbox_mail"; mail: InboxMailAction }
  | { type: "play_sound" }
  | { type: "set_contract_vars"; vars: Record<string, unknown> }
  | { type: "complete_advance_phase" }
  | { type: "schedule_timed_event"; event: Record<string, unknown> }
  | { type: "async_effect"; effect: AsyncEffectDescriptor }
  | { type: "delayed_actions"; delayMs: number; actions: ModuleAction[] };

/** Minimal mail draft shape for the set_mail_draft action. */
export interface MailDraftAction {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  attachments?: { id: string; label: string }[];
}

/** Minimal timed event shape for the inject_events action. */
export interface TimedEventAction {
  event_id: string;
  actor: string;
  content: string;
  channel: string;
  delay_ms: number;
}

/** Shape of a mail to add to the player's inbox. */
export interface InboxMailAction {
  from: string;
  subject: string;
  body: string;
  phaseId: string;
  attachments?: { id: string; label: string }[];
}

/**
 * Descriptor for an async side-effect that the module requests.
 * The module describes WHAT to do; page.tsx EXECUTES it.
 * `kind` discriminates the effect type; remaining fields are payload.
 */
export interface AsyncEffectDescriptor {
  kind: string;
  [key: string]: unknown;
}

// ── Module result ──

/** What a module lifecycle method returns. */
export interface ModuleResult {
  /** Actions for page.tsx to execute (in order). Empty = no-op. */
  actions: ModuleAction[];
  /** Should the orchestrator trigger phase advance? */
  advance?: boolean;
  /** Should the orchestrator finish the scenario? */
  finish?: boolean;
}

/** Convenience: an empty result (no actions, no advance). */
export const EMPTY_RESULT: Readonly<ModuleResult> = Object.freeze({
  actions: [],
  advance: false,
  finish: false,
});

// ── Module context (read-only view passed to every lifecycle method) ──

/**
 * Read-only context provided by the orchestrator to each module.
 * Modules read from this; they never mutate it.
 */
export interface ModuleContext {
  /** Current session state (treat as readonly) */
  readonly session: Record<string, unknown>;
  /** Full scenario definition */
  readonly scenario: Record<string, unknown>;
  /** Current phase config from scenario.phases[currentPhaseIndex] */
  readonly phase: Record<string, unknown>;
  /** Player display name */
  readonly playerName: string;
  /** Shortcut to session.flags */
  readonly flags: Record<string, unknown>;
  /** Scenario ID */
  readonly scenarioId: string;
}

// ── Module events (what triggers a lifecycle call) ──

/** Events that the orchestrator can dispatch to modules. */
export type ModuleEvent =
  | { type: "enter_phase" }
  | { type: "player_message"; message: string; actor: string }
  | { type: "mail_sent"; mailKind: string; mailBody: string }
  | { type: "contract_signed"; contractType: string }
  | { type: "clause_action"; message: string; articleId: string }
  | { type: "tick"; elapsed: number };

// ── Contract module extended context ──

/**
 * Extended context for contract operations.
 * page.tsx passes these via `(ctx as any).extra` — same pattern as MailModuleContext.
 *
 * Each field maps to what ContractHandler.computeSign() needs (SignFlagsParams).
 * Not all fields are used by every contract type:
 *   - S0: articles, thread, currentFlags, ctoName, phaseMailConfig
 *   - S2: articles, contractVars
 *   - S4: features, dealTerms
 *   - S5: articles
 */
export interface ContractModuleContext {
  /** Contract type being signed */
  contractType: string;
  /** Contract articles (S0, S2, S5) */
  articles?: import("../../contracts/types").ContractClause[];
  /** Negotiation thread (S0, S2, S5) */
  thread?: import("../../contracts/types").ContractThreadMessage[];
  /** Current session flags — S0 needs pacte_signed_clean */
  currentFlags?: Record<string, unknown>;
  /** CTO name — S0 only */
  ctoName?: string;
  /** Phase mail config — S0 only (reads send_advances_phase) */
  phaseMailConfig?: Record<string, unknown>;
  /** Backup contract vars — S2 only (price/equity fallback) */
  contractVars?: { price: string; equity: string | null };
  /** Selected features — S4 only */
  features?: Record<string, boolean>;
  /** Negotiated deal terms — S4 only */
  dealTerms?: import("../../contracts/ContractOverlayHost").DealTerms;
}

// ── PhaseModule interface ──

/**
 * A phase module is a pure-function object that handles one aspect
 * of gameplay (chat, contracts, mail, timer, etc.).
 *
 * Modules are stateless — they read from ModuleContext and return
 * ModuleResult. All side effects are described as ModuleAction[],
 * executed by page.tsx.
 */
export interface PhaseModule {
  /** Unique module type identifier */
  readonly type: ModuleType;

  /**
   * Does this module apply to the given phase?
   * Called by the registry to auto-detect modules when the phase
   * doesn't declare an explicit `modules` array.
   */
  canHandle(phase: Record<string, unknown>, scenario: Record<string, unknown>): boolean;

  /**
   * Called once when the phase becomes active.
   * Use for initialization (inject entry events, set contacts, etc.).
   */
  onEnterPhase(ctx: ModuleContext): ModuleResult;

  /**
   * Called when the player sends a chat message.
   */
  onPlayerMessage(ctx: ModuleContext, message: string, actor: string): ModuleResult;

  /**
   * Called when the player sends a mail.
   */
  onMailSent(ctx: ModuleContext, mailKind: string, mailBody: string): ModuleResult;

  /**
   * Called when the player signs a contract.
   */
  onContractSigned(ctx: ModuleContext, contractType: string): ModuleResult;

  /**
   * Called when the player comments/proposes on a contract clause.
   */
  onClauseAction(ctx: ModuleContext, message: string, articleId: string): ModuleResult;

  /**
   * Called every tick (typically 1s).
   */
  onTick(ctx: ModuleContext, elapsed: number): ModuleResult;

  /**
   * Should the phase advance? Evaluated after every event.
   */
  shouldAdvance(ctx: ModuleContext): boolean;
}
