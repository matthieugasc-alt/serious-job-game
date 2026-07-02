import type { MechanicManifest } from "@/app/lib/engine/mechanics";

/**
 * analyse — étude documentaire → conclusions structurées.
 * Le joueur lit les documents du step et remplit un champ de conclusion
 * par "finding" demandé. L'IA observe les conclusions, le moteur décide.
 * Aucun contenu scénario ici : instructions, prompts et documents
 * arrivent par params.
 */
export const manifest: MechanicManifest = {
  id: "analyse",
  version: "1.0.0",
  title: "Analyse documentaire",
  description:
    "Étude de documents fournie par le scénario, restituée en conclusions structurées : un champ de réponse par finding demandé (findings_prompts).",
  output_keys: ["findings"],
  required_params: ["instructions", "findings_prompts"],
  channels: ["documents", "editor"],
};
