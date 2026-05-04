// ══════════════════════════════════════════════════════════════════
// Handlers — barrel export
// ══════════════════════════════════════════════════════════════════

// ── Legacy handler system (still active, 100% fallback) ──
export { resolvePhaseHandler, InterviewHandler, ContractHandler, MailHandler } from "./registry";
export type { PhaseHandler, InterviewPhaseHandler, ContractPhaseHandler, ContractType, SignResult, NegotiationConfig, MailPhaseHandler, AutoReplyContext, AutoReplyEffect } from "./types";

// ── Module system ──
export { resolveModules, hasActiveModules } from "./PhaseModuleRegistry";
export { dispatch, buildModuleContext, EMPTY_ORCHESTRATOR_RESULT } from "./PhaseOrchestrator";
export type { OrchestratorResult } from "./PhaseOrchestrator";
export type { PhaseModule, ModuleType, ModuleAction, ModuleEvent, ModuleContext, ModuleResult, MailDraftAction, TimedEventAction, InboxMailAction, AsyncEffectDescriptor } from "./modules";
export { EMPTY_RESULT } from "./modules";

// ── Concrete modules + helpers ──
export { InterviewModule, buildInterviewStartActions, buildInterviewEndActions } from "./modules";
export { ContractModule, mapSignResultToActions } from "./modules";
export { MailModule } from "./modules";
export type { MailModuleExtra } from "./modules";
