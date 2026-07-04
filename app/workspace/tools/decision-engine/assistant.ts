/**
 * assistant.ts — OSSATURE (préparée, NON implémentée) de l'assistant IA
 * d'organisation décisionnelle (contrat §11). Aucune implémentation LLM,
 * aucun appel réseau : ce module définit uniquement le contrat de la V2
 * finale pour que la couture existe et soit testée.
 *
 * GARDE-FOUS (invariants, jamais violés par l'implémentation future) :
 *   1. L'assistant NE CHOISIT JAMAIS à la place du joueur (« choisis A »
 *      est interdit) — il organise, reformule, structure, synthétise.
 *   2. Il ne reçoit QUE l'état d'un board/décision (DecisionAssistRequest)
 *      — JAMAIS le scénario, les critères d'évaluation, ni les prompts
 *      d'acteurs. Le seuil de découplage est ce type de requête.
 *   3. Il ne renvoie que des OPS PROPOSÉES via l'API publique (api.ts),
 *      donc journalisées et REFUSABLES par le joueur avant application.
 *
 * PUR/node-safe (types + stub déterministe). L'implémentation branchera la
 * route POST /api/v2/decision-assist (aujourd'hui stub 501).
 */

import type { Board, DecisionObject } from "./spec";
import type { DecisionToolOp } from "./api";

/** Intents autorisés (contrat §11) — organiser, jamais décider. */
export const ASSIST_INTENTS = [
  "reformulate_options",
  "group_criteria",
  "detect_hypotheses",
  "spot_contradictions",
  "propose_matrix_structure",
  "discussion_to_risks",
  "notes_to_options",
  "synthesize",
] as const;
export type AssistIntent = (typeof ASSIST_INTENTS)[number];

/** Entrée du service : UNIQUEMENT l'état outil (jamais scénario/critères/prompts). */
export interface DecisionAssistRequest {
  intent: AssistIntent;
  decision?: DecisionObject;
  board?: Board;
  /** Texte libre fourni par le joueur (notes, discussion) — jamais le scénario. */
  note?: string;
}

/** Sortie : une synthèse + des ops PROPOSÉES (constructeurs api.ts),
 *  présentées au joueur, refusables, puis dispatchées. Jamais un choix. */
export interface DecisionAssistProposal {
  summary: string;
  ops: DecisionToolOp[];
}

export const DECISION_ASSIST_ROUTE = "/api/v2/decision-assist";

/**
 * STUB V2 : non implémenté. Renvoie une proposition vide et un message.
 * L'implémentation finale appellera DECISION_ASSIST_ROUTE, qui ne recevra
 * que la requête ci-dessus (garde-fou n°2) et ne renverra que des ops
 * (garde-fou n°3), jamais « choisis l'option X » (garde-fou n°1).
 */
export async function requestDecisionAssist(_req: DecisionAssistRequest): Promise<DecisionAssistProposal> {
  return {
    summary: "Assistant IA préparé mais non disponible (à implémenter en version finale).",
    ops: [],
  };
}
