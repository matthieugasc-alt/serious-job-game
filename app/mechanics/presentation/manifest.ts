import type { MechanicManifest } from "@/app/lib/engine/mechanics";

/**
 * Présentation — exposé sous contrainte de temps : phase de préparation
 * (brief + documents) puis phase d'exposé chronométrée. Voix via le
 * pattern voiceCapture quand le navigateur le permet, fallback texte
 * systématique. Universelle : le brief arrive via params.
 */
export const manifest: MechanicManifest = {
  id: "presentation",
  version: "1.0.0",
  title: "Présentation",
  description:
    "Le joueur prépare puis prononce un exposé sous contrainte de temps (micro si disponible, sinon texte). L'IA observe le discours produit, le moteur décide.",
  output_keys: ["speech", "duration_s"],
  required_params: ["brief"],
  channels: ["voice", "documents"],
};
