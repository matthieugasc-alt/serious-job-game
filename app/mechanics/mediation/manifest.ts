import type { MechanicManifest } from "@/app/lib/engine/mechanics";

/**
 * mediation — le joueur régule un conflit entre DEUX acteurs IA
 * (première mécanique multi-acteurs). Chat à trois voix avec sélecteur
 * de destinataire ; chaque message joueur déclenche la réponse de
 * chaque partie adressée. Conclusion : accord trouvé ou constat de
 * désaccord, avec les termes. Les parties, le conflit et le cadrage
 * arrivent intégralement par params (clés *_actor validées composer).
 */
export const manifest: MechanicManifest = {
  id: "mediation",
  version: "1.0.0",
  title: "Médiation",
  description:
    "Le joueur conduit une médiation entre deux acteurs IA en conflit : chat à trois voix, destinataire choisi à chaque message, conclusion par accord ou constat. L'IA observe, le moteur décide.",
  output_keys: ["dialogue", "resolution"],
  required_params: ["party_a_actor", "party_b_actor", "conflict_brief"],
  channels: ["chat", "editor"],
};
