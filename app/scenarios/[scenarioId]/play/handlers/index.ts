// ══════════════════════════════════════════════════════════════════
// Handlers — barrel export
// ══════════════════════════════════════════════════════════════════

export { resolvePhaseHandler, InterviewHandler, ContractHandler, MailHandler } from "./registry";
export type { PhaseHandler, InterviewPhaseHandler, ContractPhaseHandler, ContractType, SignResult, NegotiationConfig, MailPhaseHandler, AutoReplyContext, AutoReplyEffect } from "./types";
