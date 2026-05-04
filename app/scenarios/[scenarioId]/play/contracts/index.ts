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
  buildNovadevArticles,
  buildExceptionsArticles,
  EXCLUSIVITY_REGEX,
  detectsExclusivity,
  detectsAcceptance,
} from "./contractModel";
export type { NovadevContractVars } from "./contractModel";

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

export { default as ContractOverlayHost } from "./ContractOverlayHost";
export type { ContractOverlayHostProps, DealTerms } from "./ContractOverlayHost";

export { default as ClinicalContractOverlay } from "./ClinicalContractOverlay";
export type { ClinicalContractOverlayProps } from "./ClinicalContractOverlay";
export {
  DEVIS_FEATURES_DATA,
  DISCOUNT_TABLE,
  getTierKey,
  computeDiscount,
  parseDealTag,
} from "./ContractOverlayHost";
