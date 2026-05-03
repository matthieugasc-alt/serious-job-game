// ══════════════════════════════════════════════════════════════════
// Contract module — negotiation logic (AI prompt + response parsing)
// ══════════════════════════════════════════════════════════════════

import type {
  ContractClause,
  ContractThreadMessage,
  NegotiationConfig,
  ParsedModification,
} from "./types";
import { buildContractSummary } from "./contractModel";

// ── Parse [MODIFICATION article_X]...[/MODIFICATION] blocks ──

const MODIFICATION_REGEX =
  /\[MODIFICATION\s+(article_\d+)\]([\s\S]*?)\[\/MODIFICATION\]/gi;

/**
 * Extract all [MODIFICATION article_X]...[/MODIFICATION] blocks from an AI reply.
 */
export function parseModifications(reply: string): ParsedModification[] {
  const results: ParsedModification[] = [];
  let match;
  // Reset lastIndex for safety
  MODIFICATION_REGEX.lastIndex = 0;
  while ((match = MODIFICATION_REGEX.exec(reply)) !== null) {
    results.push({
      articleId: match[1].toLowerCase(),
      newContent: match[2].trim(),
    });
  }
  return results;
}

/**
 * Strip [MODIFICATION] blocks from the displayed reply.
 */
export function stripModificationBlocks(reply: string): string {
  return reply
    .replace(/\[MODIFICATION\s+article_\d+\][\s\S]*?\[\/MODIFICATION\]/gi, "")
    .trim();
}

/**
 * Apply parsed modifications to a clauses array (immutable).
 * Returns a new array with updated modifiedContent fields.
 */
export function applyModifications(
  clauses: ContractClause[],
  modifications: ParsedModification[],
): ContractClause[] {
  if (modifications.length === 0) return clauses;
  return clauses.map((clause) => {
    const mod = modifications.find((m) => m.articleId === clause.id);
    if (mod) {
      return { ...clause, modifiedContent: mod.newContent };
    }
    return clause;
  });
}

// ── Build the negotiation system prompt ──

/**
 * Build the full system prompt for the AI counterpart,
 * injecting the current contract state + [MODIFICATION] instructions.
 */
export function buildNegotiationPrompt(
  basePrompt: string,
  clauses: ContractClause[],
): string {
  const contractSummary = buildContractSummary(clauses);

  return `${basePrompt}

## CONTRAT ACTUEL
${contractSummary}

## INSTRUCTIONS DE NÉGOCIATION
Le joueur discute d'une clause du contrat. Tu peux :
1. REFUSER la modification (argumente juridiquement, sec, 2-3 phrases max)
2. ACCEPTER la modification — dans ce cas, ajoute à la fin de ta réponse un bloc :
[MODIFICATION article_X]
Nouveau texte complet de l'article ici.
[/MODIFICATION]

Remplace "article_X" par l'id exact de l'article (article_1, article_2, etc.).
Le texte entre les balises remplacera le contenu de l'article dans le contrat.
N'utilise ce bloc QUE si tu acceptes de modifier l'article. Si tu refuses, ne mets PAS de bloc [MODIFICATION].
Tu peux proposer un compromis (texte modifié qui protège aussi l'établissement).`;
}

// ── Send a negotiation message to the AI ──

export interface NegotiationResult {
  /** Clean reply (without [MODIFICATION] blocks) */
  displayReply: string;
  /** Parsed modifications to apply */
  modifications: ParsedModification[];
}

/**
 * Send a player message to the AI counterpart and parse the response.
 * Returns the clean reply + any modifications to apply.
 */
export async function sendNegotiationMessage(
  playerMessage: string,
  clauses: ContractClause[],
  thread: ContractThreadMessage[],
  config: NegotiationConfig,
): Promise<NegotiationResult> {
  // Build thread context (last 6 messages for context window)
  const threadContext = thread.slice(-6).map((m) => ({
    role: m.role === "player" ? "user" : "assistant",
    content: m.content,
  }));
  threadContext.push({ role: "user", content: playerMessage });

  const negotiationPrompt = buildNegotiationPrompt(
    config.roleplayPrompt,
    clauses,
  );

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: config.apiHeaders(),
    body: JSON.stringify({
      playerName: config.playerName,
      message: playerMessage,
      phaseTitle: config.phaseTitle,
      phaseObjective: `Le joueur négocie les clauses du contrat. Réponds en tant que counterpart, directement, à la 1ère personne.`,
      phaseFocus: config.phaseFocus,
      phasePrompt: "",
      criteria: [],
      mode: "standard",
      narrative: config.narrative,
      recentConversation: threadContext,
      playerMessages: [playerMessage],
      roleplayPrompt: negotiationPrompt,
    }),
  });

  const data = await res.json();
  const rawReply =
    data?.reply || data?.response || "Je vais vérifier et te reviens.";

  const modifications = parseModifications(rawReply);
  const displayReply = stripModificationBlocks(rawReply);

  return { displayReply, modifications };
}
