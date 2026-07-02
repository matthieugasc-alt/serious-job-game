import type { MechanicManifest } from "@/app/lib/engine/mechanics";

/**
 * QA — initiative inversée : un acteur IA interroge le joueur, une
 * question à la fois. Universelle : l'acteur, le nombre de questions
 * et le cadrage arrivent intégralement via params.
 */
export const manifest: MechanicManifest = {
  id: "qa",
  version: "1.0.0",
  title: "Questions / réponses",
  description:
    "Un acteur IA interroge le joueur, une question à la fois, jusqu'au nombre de questions déclaré par le scénario. L'IA observe le transcript, le moteur décide.",
  output_keys: ["dialogue", "answers_count"],
  required_params: ["actor_id", "question_count"],
  channels: ["chat"],
};
