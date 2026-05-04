// ══════════════════════════════════════════════════════════════════
// Phase Modules — barrel export
// ══════════════════════════════════════════════════════════════════

export type {
  ModuleType,
  ModuleAction,
  MailDraftAction,
  TimedEventAction,
  ModuleResult,
  ModuleContext,
  ModuleEvent,
  PhaseModule,
} from "./types";

export { EMPTY_RESULT } from "./types";

// ── Concrete modules ──
export { InterviewModule, buildInterviewStartActions, buildInterviewEndActions } from "./InterviewModule";
export { ContractModule, mapSignResultToActions } from "./ContractModule";
