import type { MechanicManifest } from "@/app/lib/engine/mechanics";

/**
 * feedback — le joueur délivre un retour structuré à un acteur IA qui
 * réagit (émotion, défense, questions selon son prompt scénario), puis
 * formalise les engagements convenus. Diffère d'`entretien` : l'enjeu
 * n'est pas d'extraire une information mais de faire passer un message
 * difficile et d'en sortir avec des engagements. Contexte, acteur et
 * cadrage arrivent intégralement par params.
 */
export const manifest: MechanicManifest = {
  id: "feedback",
  version: "1.0.0",
  title: "Feedback",
  description:
    "Le joueur émet un retour structuré à un acteur IA qui réagit, ajuste son discours, puis clôt l'échange en formalisant les engagements convenus. L'IA observe, le moteur décide.",
  output_keys: ["dialogue", "commitments"],
  required_params: ["actor_id", "context_brief"],
  channels: ["chat", "editor"],
};
