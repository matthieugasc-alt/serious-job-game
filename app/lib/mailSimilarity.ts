/**
 * Mail Similarity Helper
 *
 * Pure, deterministic similarity computation between two mail bodies.
 * Used by S5 Phase 1 to detect when a player re-sends a near-duplicate
 * cold email to the same KOL — which should NOT magically work the
 * second time around.
 *
 * Implementation: Jaccard similarity over normalised tokens.
 *  - normalise: lowercase, strip punctuation, collapse whitespace
 *  - drop very short tokens (< 3 chars) and a small list of FR stop-words
 *  - intersection / union of token sets
 *
 * Returns a number in [0, 1].
 *  - 0    = no token in common
 *  - 1    = identical token sets (e.g. exact copy-paste, possibly with
 *           cosmetic punctuation differences)
 *  - 0.7+ = the API treats it as a duplicate (forces interested = false
 *           and instructs the NPC to acknowledge the repetition).
 *
 * Design notes:
 *  - Pure function, zero deps. Trivially unit-testable.
 *  - Token-set Jaccard ignores order and duplication, which matches the
 *    intuitive "is this the same message again?" rather than caring about
 *    sentence reordering.
 *  - A more sophisticated metric (cosine on TF-IDF, embeddings, …) would
 *    be overkill for what we need here and would couple us to a runtime
 *    LLM call we don't want.
 */

const FR_STOPWORDS = new Set([
  "le", "la", "les", "un", "une", "des", "de", "du", "et", "ou", "mais",
  "pour", "par", "sur", "dans", "avec", "sans", "que", "qui", "quoi",
  "ce", "cet", "cette", "ces", "son", "sa", "ses", "leur", "leurs",
  "mon", "ma", "mes", "ton", "ta", "tes", "notre", "votre", "vos",
  "nos", "tres", "plus", "moins", "aussi", "donc", "alors", "puis",
  "etre", "avoir", "faire", "dire", "voir", "aller", "venir",
  "vous", "nous", "ils", "elles", "elle", "lui", "moi", "toi", "soi",
  "est", "sont", "ete", "etait", "sera", "fait", "ont", "aura",
  "bonjour", "cordialement", "bien", "merci", "salut",
]);

/**
 * Normalise a mail body into a deterministic token set.
 *
 * Steps:
 *  1. lowercase
 *  2. NFD-normalise then strip combining accents (é → e, ç → c, …)
 *  3. replace non-letter/digit chars with whitespace
 *  4. split on whitespace
 *  5. drop tokens < 3 chars and FR stop-words
 *
 * Exported for unit-testability; not used directly by callers.
 */
export function normaliseTokens(body: string): Set<string> {
  if (!body) return new Set();
  const lowered = body.toLowerCase();
  // Strip diacritics (é → e, à → a, …) so "réponse" and "reponse" match.
  // ̀-ͯ covers the Combining Diacritical Marks Unicode block.
  const stripped = lowered.normalize("NFD").replace(/[̀-ͯ]/g, "");
  // Replace anything that is not a-z or 0-9 with a space, then split.
  const cleaned = stripped.replace(/[^a-z0-9]+/g, " ").trim();
  if (!cleaned) return new Set();
  const tokens = cleaned.split(/\s+/).filter((t) => {
    if (t.length < 3) return false;
    if (FR_STOPWORDS.has(t)) return false;
    return true;
  });
  return new Set(tokens);
}

/**
 * Jaccard similarity between two mail bodies.
 *
 * Returns 0 when either body is empty (after normalisation).
 * Returns 1 when both bodies normalise to the exact same token set.
 */
export function jaccardSimilarity(a: string, b: string): number {
  const tokensA = normaliseTokens(a);
  const tokensB = normaliseTokens(b);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersectionCount = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersectionCount++;
  }
  const unionCount = tokensA.size + tokensB.size - intersectionCount;
  if (unionCount === 0) return 0;
  return intersectionCount / unionCount;
}
