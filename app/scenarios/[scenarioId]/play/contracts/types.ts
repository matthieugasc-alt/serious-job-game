// ══════════════════════════════════════════════════════════════════
// Contract module — shared types
// ══════════════════════════════════════════════════════════════════

/** A single clause/article in a contract document */
export interface ContractClause {
  id: string;           // e.g. "article_1", "article_6"
  title: string;        // e.g. "Article 6 — Engagements du CTO"
  content: string;      // Original text
  modifiedContent: string | null; // Amended text (null = unchanged)
  /** Pedagogical flags (for scoring, not UI) */
  toxic?: boolean;      // Clause is intentionally bad for the player
  moderate?: boolean;   // Clause is borderline / negotiable
}

/** Lifecycle status of a contract */
export type ContractStatus =
  | "draft"       // Being reviewed / negotiated
  | "signed"      // Player signed
  | "refused";    // Counterpart refused

/** A message in the negotiation thread */
export interface ContractThreadMessage {
  role: "player" | "counterpart";
  content: string;
}

/** Full contract document state */
export interface ContractDocument {
  /** Unique contract identifier, e.g. "pacte_associes", "convention_clinique" */
  contractId: string;
  /** Display title */
  title: string;
  /** Subtitle (e.g. "Orisio SAS · 03/05/2026") */
  subtitle: string;
  /** Structured articles */
  clauses: ContractClause[];
  /** Negotiation thread */
  thread: ContractThreadMessage[];
  /** Current status */
  status: ContractStatus;
  /** Counterpart info for the negotiation panel */
  counterpart: {
    name: string;
    role: string;
    color: string;
    initials: string;
  };
  /** Player display name */
  playerName: string;
}

/** Result of parsing an AI response for [MODIFICATION] blocks */
export interface ParsedModification {
  articleId: string;    // e.g. "article_6"
  newContent: string;   // Full replacement text
}

/** Config passed to the negotiation handler to build the AI prompt */
export interface NegotiationConfig {
  /** The AI roleplay prompt for the counterpart */
  roleplayPrompt: string;
  /** Phase context for /api/chat */
  phaseTitle: string;
  phaseFocus: string;
  /** Narrative object from scenario */
  narrative: Record<string, any>;
  /** Player display name */
  playerName: string;
  /** API headers builder */
  apiHeaders: () => Record<string, string>;
}
