// ══════════════════════════════════════════════════════════════════
// Game Events — Type definitions (append-only audit layer)
// ══════════════════════════════════════════════════════════════════
//
// PASSIVE ONLY — these types define audit events for observability.
// The game NEVER reads events to make decisions. Events are written
// append-only to JSONL files in data/game_events/.
//
// If logging fails, the game continues normally (console.warn only).
// ══════════════════════════════════════════════════════════════════

/** All supported event types. */
export type GameEventType =
  | "session_started"
  | "phase_started"
  | "player_message"
  | "ai_message"
  | "mail_sent"
  | "contract_signed"
  | "phase_completed"
  | "scenario_completed"
  | "outcome_applied"
  | "phase_abandoned";

/** A single game event — immutable once written. */
export interface GameEvent {
  /** Unique event ID (UUIDv4) */
  eventId: string;
  /** Session this event belongs to */
  sessionId: string;
  /** Event type discriminator */
  type: GameEventType;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Scenario being played */
  scenarioId: string;
  /** User who generated the event */
  userId: string;
  /** Phase ID at the time of the event (null for session-level events) */
  phaseId: string | null;
  /** Event-specific payload — shape depends on type */
  payload: Record<string, unknown>;
}

/**
 * A game session — created once when a scenario starts.
 * Maps 1:1 with a JSONL file in data/game_events/.
 */
export interface GameSession {
  /** Unique session ID (UUIDv4) */
  sessionId: string;
  /** User who started the session */
  userId: string;
  /** Scenario being played */
  scenarioId: string;
  /** Player display name */
  playerName: string;
  /** ISO 8601 timestamp of session creation */
  startedAt: string;
  /** Whether this is a Founder campaign scenario */
  isFounder: boolean;
  /** Campaign ID (Founder only) */
  campaignId: string | null;
}

// ── Payload types for each event type ──────────────────────────────
// These are NOT enforced at runtime (payload is Record<string, unknown>)
// but documented here for clarity and future validation.

/** session_started payload */
export interface SessionStartedPayload {
  playerName: string;
  isFounder: boolean;
  campaignId: string | null;
  totalPhases: number;
}

/** phase_started payload */
export interface PhaseStartedPayload {
  phaseIndex: number;
  phaseTitle: string;
  modules: string[];
}

/** player_message payload */
export interface PlayerMessagePayload {
  actor: string;
  contentLength: number;
  /** First 200 chars for audit (not full content for privacy) */
  contentPreview: string;
}

/** ai_message payload */
export interface AIMessagePayload {
  actor: string;
  contentLength: number;
  contentPreview: string;
}

/** mail_sent payload */
export interface MailSentPayload {
  mailKind: string;
  to: string;
  subject: string;
  bodyLength: number;
  hasAttachments: boolean;
}

/** contract_signed payload */
export interface ContractSignedPayload {
  contractType: string;
  articleCount: number;
  flagsSet: string[];
}

/** phase_completed payload */
export interface PhaseCompletedPayload {
  phaseIndex: number;
  phaseScore: number;
  durationMs: number;
}

/** scenario_completed payload */
export interface ScenarioCompletedPayload {
  ending: string;
  totalScore: number;
  completedPhases: string[];
  durationMs: number;
}

/** outcome_applied payload */
export interface OutcomeAppliedPayload {
  ending: string;
  deltas: Record<string, number>;
  microDebriefDecision: string;
}

/** phase_abandoned payload */
export interface PhaseAbandonedPayload {
  phaseIndex: number;
  reason: string;
}
