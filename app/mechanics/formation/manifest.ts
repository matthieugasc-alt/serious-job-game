import type { MechanicManifest } from "@/app/lib/engine/mechanics";

/**
 * formation — le joueur transmet un savoir à un acteur-apprenant qui
 * pose des questions de compréhension et reformule. À la clôture, le
 * joueur coche les objectifs pédagogiques qu'il estime couverts.
 * Diffère d'`entretien` : le flux est piloté par la transmission (le
 * joueur explique, l'acteur apprend), et l'output structure la
 * couverture des objectifs déclarés par le scénario.
 */
export const manifest: MechanicManifest = {
  id: "formation",
  version: "1.0.0",
  title: "Formation",
  description:
    "Le joueur transmet un savoir à un acteur IA en position d'apprenant (questions, reformulations), puis déclare les objectifs pédagogiques couverts. L'IA observe, le moteur décide.",
  output_keys: ["dialogue", "objectives_covered"],
  required_params: ["actor_id", "topic", "objectives"],
  channels: ["chat"],
};
