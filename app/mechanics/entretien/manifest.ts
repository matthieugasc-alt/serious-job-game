import type { MechanicManifest } from "@/app/lib/engine/mechanics";

/**
 * Entretien — le joueur mène un dialogue avec un acteur IA vers un
 * objectif fixé par le scénario. Universelle : l'acteur, l'objectif
 * et le cadrage arrivent intégralement via params.
 */
export const manifest: MechanicManifest = {
  id: "entretien",
  version: "1.0.0",
  title: "Entretien",
  description:
    "Le joueur mène un dialogue libre avec un acteur IA pour atteindre un objectif déclaré par le scénario. L'IA observe le transcript, le moteur décide.",
  output_keys: ["dialogue", "exchange_count"],
  required_params: ["actor_id", "objective"],
  channels: ["chat"],
};
