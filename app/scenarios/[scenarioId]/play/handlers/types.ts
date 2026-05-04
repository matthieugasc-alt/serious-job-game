// ══════════════════════════════════════════════════════════════════
// Phase Handler — Shared types
// ══════════════════════════════════════════════════════════════════
//
// Each handler is a plain object with pure functions.
// State remains in page.tsx — handlers compute & act, they don't own React state.
// When no handler matches a phase, page.tsx falls back to legacy behavior.
// ══════════════════════════════════════════════════════════════════

/**
 * Base interface for all phase handlers.
 * Handlers are pure function objects — no hooks, no state ownership.
 */
export interface PhaseHandler {
  /** Unique handler type identifier */
  readonly type: string;
  /** Does this handler apply to the given phase config? */
  matches(phase: any): boolean;
}

/** Declarative config for manual_start phases (from scenario.json) */
export interface ManualStartConfig {
  /** Actor who introduces the candidate (shown first) */
  briefing_actor: string;
  /** Actor to interview (the candidate) */
  target_actor: string;
  /** Custom label for the "Faire entrer" button */
  button_label: string;
  /** Actor to return to after the interview ends */
  return_to_actor: string;
  /** Whether to mark the target actor as unavailable after the interview */
  mark_target_unavailable: boolean;
}

/**
 * Interview handler — manages phases with manual_start.
 * Covers: detection, gate state, start action, candidate name resolution,
 * and routing (briefing actor, return actor) via declarative config.
 * Timer remains in usePhaseTimer (reads interviewStarted via props).
 */
export interface InterviewPhaseHandler extends PhaseHandler {
  type: "interview";

  /**
   * Is the interview gate blocking chat input?
   * True when phase has manual_start AND interview not yet started.
   */
  isGateActive(phase: any, interviewStarted: boolean): boolean;

  /**
   * Resolve the candidate's first name for the "Faire entrer X" button.
   */
  getCandidateFirstName(phase: any, actors: any[]): string;

  /**
   * Read the manual_start_config from the phase (null if absent).
   */
  getConfig(phase: any): ManualStartConfig | null;

  /**
   * Get the briefing actor ID (from config, or null if no config).
   */
  getBriefingActor(phase: any): string | null;

  /**
   * Get the target actor ID (from config, or ai_actors[0]).
   */
  getTargetActor(phase: any): string;

  /**
   * Get the button label (from config, or default "Faire entrer le candidat").
   */
  getButtonLabel(phase: any): string;

  /**
   * Get the actor to return to after interview ends (from config, or null).
   */
  getReturnActor(phase: any): string | null;

  /**
   * Should the target actor be marked unavailable after the interview?
   */
  shouldMarkUnavailable(phase: any): boolean;

  /**
   * Build the new session state after "Faire entrer le candidat".
   * Injects remaining entry_events as timed events.
   * Returns the cloned+mutated session — caller sets it via setSession.
   */
  startInterview(
    session: any,
    scenario: any,
    cloneSession: (s: any) => any,
  ): any;

  /**
   * Inject only delay_ms=0 events for a manual_start phase.
   * Called on initial load and on auto-advance into an interview phase.
   * Mutates the session in-place (caller clones first).
   */
  injectIntroEventsOnly(
    session: any,
    addAIMessage: (sess: any, content: string, actor: string) => void,
  ): void;
}

// ══════════════════════════════════════════════════════════════════
// Contract handler types
// ══════════════════════════════════════════════════════════════════

/** Contract types managed by ContractHandler */
export type ContractType = "s0_pacte" | "s2_novadev" | "s4_devis" | "s5_exceptions";

/** Result of computeSignFlags — flags to merge into session + post-sign directives */
export interface SignResult {
  /** Flags to merge into session.flags */
  flags: Record<string, any>;
  /** Mail draft to set before sending (null = no mail) */
  mailDraft: {
    to: string;
    cc: string;
    subject: string;
    body: string;
    attachments: { id: string; label: string }[];
  } | null;
  /** Mail kind for sendCurrentPhaseMail (null = don't send) */
  mailKind: string | null;
  /** Should advance to next phase after sign? */
  shouldAdvancePhase: boolean;
  /** Should finish the scenario after sign? */
  shouldFinishScenario: boolean;
}

/** Params for building initial articles */
export interface BuildArticlesParams {
  playerName: string;
  /** S0 — CTO name */
  ctoName?: string;
  /** S2 — NovaDev contract variables */
  novadevVars?: { price: string; features: string[]; equity: string | null; playerName: string };
  /** S5 — establishment label */
  establishmentLabel?: string;
}

/** Params for computing sign flags */
export interface SignFlagsParams {
  playerName: string;
  /** Contract articles (S0, S2, S5) */
  articles?: import("../contracts/types").ContractClause[];
  /** Negotiation thread (S0, S2, S5) */
  thread?: import("../contracts/types").ContractThreadMessage[];
  /** Current session flags (S0 — to read pacte_signed_clean) */
  currentFlags?: Record<string, any>;
  /** CTO name (S0) */
  ctoName?: string;
  /** Phase mail config (S0 — to read send_advances_phase) */
  phaseMailConfig?: any;
  /** Backup contract vars (S2 — price/equity fallback) */
  contractVars?: { price: string; equity: string | null };
  /** Selected features (S4) */
  features?: Record<string, boolean>;
  /** Negotiated deal terms (S4) */
  dealTerms?: import("../contracts/ContractOverlayHost").DealTerms;
  /** Devis messages (S4 — for canSign check) */
  messagesLength?: number;
}

/** Config returned by getNegotiationConfig */
export interface NegotiationConfig {
  actorId: string;
  phaseTitle: string;
  phaseFocus: string;
  fallbackError: string;
}

// ══════════════════════════════════════════════════════════════════
// Mail handler types
// ══════════════════════════════════════════════════════════════════

/** Context provided by page.tsx for building an auto-reply API payload */
export interface AutoReplyContext {
  /** Player display name */
  playerName: string;
  /** Mail body the player just sent */
  mailBody: string;
  /** Scenario narrative object */
  narrative: any;
  /** Runtime view for the NEW phase (after advance) */
  runtimeView: {
    phaseTitle: string;
    phaseObjective: string;
    phaseFocus: string;
    phasePrompt: string;
    criteria: any[];
    adaptiveMode: string | null;
  };
  /** Active roleplay prompt for the actor */
  roleplayPrompt: string;
}

/** Describes a post-send auto-reply effect to be executed by page.tsx */
export interface AutoReplyEffect {
  /** Actor to switch chat to */
  actorId: string;
  /** Summary injected as player message in chat */
  playerMessageSummary: string;
  /** API request body for /api/chat */
  apiPayload: Record<string, any>;
}

/**
 * Mail handler — manages post-send effects for specific mail kinds.
 * Pure function handler. No React hooks, no owned state.
 * page.tsx owns all state; handler computes descriptions of effects.
 *
 * Returns null when no handler matches → page.tsx uses legacy behavior.
 */
export interface MailPhaseHandler {
  readonly type: "mail";

  /**
   * Should the scope_proposal auto-reply fire?
   * Returns true only for mailKind === "scope_proposal".
   */
  shouldAutoReply(mailKind: string): boolean;

  /**
   * Build the auto-reply effect for a scope_proposal mail.
   * Returns the API payload and UI instructions — caller executes them.
   */
  buildAutoReplyEffect(ctx: AutoReplyContext): AutoReplyEffect;
}

/**
 * Contract handler — manages contract overlays for S0/S2/S4/S5.
 * Pure function handler. No React hooks, no owned state.
 * page.tsx owns all contract state; handler computes and acts.
 *
 * Not registered in the phase handler registry (contracts are
 * triggered by explicit user actions, not phase detection).
 */
export interface ContractPhaseHandler {
  readonly type: "contract";

  /** Map a scenario ID to its contract type (null = no contract / legacy) */
  resolveContractType(scenarioId: string): ContractType | null;

  /** Build initial articles for the contract overlay */
  buildArticles(type: ContractType, params: BuildArticlesParams): import("../contracts/types").ContractClause[];

  /** Can the player sign this contract? (min thread length check) */
  canSign(type: ContractType, threadOrMessagesLength: number): boolean;

  /** Get negotiation config for sendNegotiationMessage */
  getNegotiationConfig(type: ContractType): NegotiationConfig;

  /** Compute all flags + mail draft + directives for a signature */
  computeSign(type: ContractType, params: SignFlagsParams): SignResult;
}
