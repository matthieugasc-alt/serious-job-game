import type { MechanicManifest } from "@/app/lib/engine/mechanics";

/**
 * diagnostic — investiguer la cause d'un problème auprès d'un acteur
 * témoin, puis rendre un diagnostic structuré (cause retenue, éléments
 * à l'appui, causes écartées). Diffère d'`analyse` (boucle hypothèses →
 * investigation → élimination, pas une simple extraction documentaire)
 * et d'`entretien` (l'output est un diagnostic structuré, pas le
 * dialogue seul). Situation, témoin et hypothèses arrivent par params.
 */
export const manifest: MechanicManifest = {
  id: "diagnostic",
  version: "1.0.0",
  title: "Diagnostic",
  description:
    "Le joueur investigue la cause d'un problème en interrogeant un acteur témoin, puis rend un diagnostic structuré : cause retenue, éléments à l'appui, causes écartées. L'IA observe, le moteur décide.",
  output_keys: ["diagnosis", "dialogue"],
  required_params: ["situation", "actor_id"],
  channels: ["chat", "documents", "editor"],
};
