import type { MechanicManifest } from "@/app/lib/engine/mechanics";

/**
 * decision — arbitrage explicite entre options déclarées par le scénario.
 * Exception encadrée à la règle "l'IA observe" : les critères structurels
 * "choice_<option_id>" sont observés DÉTERMINISTIQUEMENT (true ssi l'option
 * est choisie) ; les autres critères (justification…) passent par io.observe.
 * Le moteur décide toujours.
 */
export const manifest: MechanicManifest = {
  id: "decision",
  version: "1.0.0",
  title: "Décision",
  description:
    "Arbitrage explicite entre options déclarées, avec justification. Les critères choice_<option_id> sont observés déterministiquement, le reste par l'IA.",
  output_keys: ["choice", "choices", "justification"],
  required_params: ["instructions", "options"],
  channels: ["editor"],
};
