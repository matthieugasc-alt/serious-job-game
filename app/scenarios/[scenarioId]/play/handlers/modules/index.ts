// ══════════════════════════════════════════════════════════════════
// Phase Modules — barrel export
// ══════════════════════════════════════════════════════════════════

export type {
  ModuleType,
  ModuleAction,
  MailDraftAction,
  TimedEventAction,
  InboxMailAction,
  AsyncEffectDescriptor,
  ModuleResult,
  ModuleContext,
  ModuleEvent,
  PhaseModule,
  ContractModuleContext,
} from "./types";

export { EMPTY_RESULT } from "./types";

// ── Concrete modules ──
export { InterviewModule, buildInterviewStartActions, buildInterviewEndActions } from "./InterviewModule";
export { ContractModule, mapSignResultToActions } from "./ContractModule";
export { MailModule } from "./MailModule";
export type { MailModuleExtra, MailModuleContext, MailKind, MailBranchResult } from "./MailModule";
