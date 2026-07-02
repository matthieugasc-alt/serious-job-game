import type { MechanicManifest } from "@/app/lib/engine/mechanics";

/**
 * negociation — construction d'un accord à termes structurés avec un
 * acteur IA. Dialogue libre + panneau de termes ; le joueur propose,
 * conclut ou rompt. Acteur, termes et consignes arrivent par params.
 * L'IA observe le transcript et l'accord, le moteur décide.
 */
export const manifest: MechanicManifest = {
  id: "negociation",
  version: "1.0.0",
  title: "Négociation",
  description:
    "Construction d'un accord à termes structurés avec un acteur IA : dialogue libre, propositions formalisées, conclusion ou rupture explicite.",
  output_keys: ["agreement", "proposals_count"],
  required_params: ["actor_id", "instructions", "terms"],
  channels: ["chat"],
};
