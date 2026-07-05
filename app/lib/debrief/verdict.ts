/**
 * verdict.ts — le verdict 3 niveaux du juge unique (doctrine d'évaluation)
 * et le mapping verdict → ending affiché.
 *
 * PUR (aucun React). Le verdict vient de la passe IA (/api/v2/debrief-final)
 * et pilote CE QUI EST AFFICHÉ en fin de scénario. Le chemin économique des
 * campagnes founder (/api/v2/complete) reste, lui, sur l'ending déterministe
 * tant que la Phase 2b n'a pas aligné l'économie (risque financier).
 */

import type { EndingRule } from "@/app/lib/engine/mechanics";

export type Verdict = "victoire_complete" | "victoire_partielle" | "defaite";

export const VERDICT_LABEL: Record<Verdict, { label: string; icon: string }> = {
  victoire_complete: { label: "Victoire complète", icon: "🏆" },
  victoire_partielle: { label: "Victoire partielle", icon: "🎯" },
  defaite: { label: "Défaite", icon: "🔁" },
};

type TaggedEnding = EndingRule & { verdict?: Verdict };

/**
 * Choisit l'ending à AFFICHER pour un verdict donné :
 *  1. un ending explicitement tagué `verdict` par l'auteur ;
 *  2. sinon heuristique : Défaite → ending par défaut ; Victoire (complète
 *     ou partielle) → un ending non-défaut (issue positive) ;
 *  3. sinon le fallback (l'ending déterministe déjà calculé).
 */
export function pickEndingForVerdict(
  endings: EndingRule[],
  verdict: Verdict,
  fallback: EndingRule | null,
): EndingRule | null {
  const tagged = (endings as TaggedEnding[]).find((e) => e.verdict === verdict);
  if (tagged) return tagged;
  const def = endings.find((e) => e.default) ?? null;
  const nonDefault = endings.filter((e) => !e.default);
  if (verdict === "defaite") return def ?? fallback;
  return nonDefault[0] ?? def ?? fallback;
}
