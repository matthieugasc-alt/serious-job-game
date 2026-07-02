import type { MechanicManifest } from "@/app/lib/engine/mechanics";

/**
 * production — rédaction d'un livrable écrit adressé (mail ou document).
 * Le joueur rédige, la mécanique enregistre le livrable dans le
 * transcript, l'IA observe, le moteur décide. Destinataire, consignes
 * et gabarit arrivent par params — jamais dans le code.
 */
export const manifest: MechanicManifest = {
  id: "production",
  version: "1.0.0",
  title: "Production d'un livrable",
  description:
    "Rédaction d'un livrable écrit adressé : mail (À figé, Objet, Corps) ou document (Titre, Corps), avec brouillon persisté et gabarit optionnel.",
  output_keys: ["deliverable", "body"],
  required_params: ["deliverable_type", "instructions"],
  channels: ["mail", "editor", "documents"],
};
