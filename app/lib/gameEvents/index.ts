// ══════════════════════════════════════════════════════════════════
// Game Events — barrel export
// ══════════════════════════════════════════════════════════════════

export type {
  GameEventType,
  GameEvent,
  GameSession,
  SessionStartedPayload,
  PhaseStartedPayload,
  PlayerMessagePayload,
  AIMessagePayload,
  MailSentPayload,
  ContractSignedPayload,
  PhaseCompletedPayload,
  ScenarioCompletedPayload,
  OutcomeAppliedPayload,
  PhaseAbandonedPayload,
} from "./types";

export {
  generateSessionId,
  logSessionStarted,
  logPhaseStarted,
  logPlayerMessage,
  logAIMessage,
  logMailSent,
  logContractSigned,
  logPhaseCompleted,
  logScenarioCompleted,
  logOutcomeApplied,
  logPhaseAbandoned,
} from "./writer";

export {
  fireSessionStarted,
  firePhaseStarted,
  firePlayerMessage,
  fireAIMessage,
  fireMailSent,
  fireContractSigned,
  firePhaseCompleted,
  fireScenarioCompleted,
  firePhaseAbandoned,
} from "./client";
