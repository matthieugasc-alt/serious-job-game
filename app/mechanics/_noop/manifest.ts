import type { MechanicManifest } from "@/app/lib/engine/mechanics";

/**
 * Mécanique factice de preuve du socle. Elle ne sert qu'à valider la
 * boucle Shell → MechanicRunner → moteur → step suivant, et le contrat
 * inputs_from, sans dépendre d'aucune IA ni d'aucun contenu.
 * Elle reste dans le repo comme harnais de test d'intégration.
 */
export const manifest: MechanicManifest = {
  id: "_noop",
  version: "1.0.0",
  title: "Noop (harnais de test)",
  description:
    "Complète immédiatement le step avec un output déclaré dans les params. Preuve de boucle, jamais utilisée par un scénario réel.",
  output_keys: ["echo", "received_inputs"],
  required_params: ["echo"],
  channels: [],
};
