// ══════════════════════════════════════════════════════════════════
// Contract module — barrel export
// ══════════════════════════════════════════════════════════════════

export type {
  ContractClause,
  ContractDocument,
  ContractStatus,
  ContractThreadMessage,
  NegotiationConfig,
  ParsedModification,
} from "./types";

export {
  buildPacteArticles,
  buildContractSummary,
  EXCLUSIVITY_REGEX,
  detectsExclusivity,
  detectsAcceptance,
} from "./contractModel";

export {
  parseModifications,
  stripModificationBlocks,
  applyModifications,
  buildNegotiationPrompt,
  sendNegotiationMessage,
} from "./contractNegotiation";
export type { NegotiationResult } from "./contractNegotiation";

export { default as ContractOverlay } from "./ContractOverlay";
export type { ContractOverlayProps } from "./ContractOverlay";
