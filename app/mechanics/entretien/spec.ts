/**
 * entretien — spec HEADLESS v3 (capacité du moteur, zéro UI, zéro I/O).
 * Cohabite avec le Component.tsx v2 (intact jusqu'au jalon 3).
 *
 * Différences avec le v2 :
 *  - v2 : écran de chat dédié avec bouton « Terminer l'entretien » et
 *    seuil min_exchanges vérifié par l'UI ; output construit depuis le
 *    transcript local du composant.
 *  - v3 : le dialogue vit dans le fil Messages du step (ou ChatDock).
 *    Le seuil d'échanges est déclaré par le rédacteur via le trigger
 *    (message_sent.min_count) — min_exchanges disparaît. L'output
 *    { dialogue, exchange_count } est dérivé du workspace : dialogue
 *    depuis le(s) fil(s) du step, exchange_count depuis le journal.
 */

import type { JsonObject } from "@/app/lib/engine/mechanics";
import type { MechanicSpec } from "@/app/lib/engine/workspace";
import {
  notesForObservation,
  optionalString,
  playerMessages,
  requireString,
  scopedScenarioDirective,
  stepDialogue,
  threadsForObservation,
} from "../specHelpers";

function actorIdOf(params: JsonObject): string {
  return typeof params.actor_id === "string" ? params.actor_id : "";
}

export const entretienSpec: MechanicSpec = {
  manifest: {
    id: "entretien",
    version: "3.0.0",
    title: "Entretien",
    description:
      "Le joueur mène un dialogue avec un acteur IA vers un objectif déclaré, dans le fil Messages du step. L'observateur regarde le dialogue et les notes.",
    output_keys: ["dialogue", "exchange_count"],
    required_params: ["actor_id", "objective"],
    default_tools: ["notes"],
  },

  /** Même esprit que le v2 : l'acteur joue son rôle, l'objectif reste
   *  à la charge du joueur. */
  directive(params: JsonObject): string {
    const objective =
      typeof params.objective === "string" ? params.objective : "";
    return [
      "Un entretien est en cours dans le poste de travail du joueur (fil de discussion).",
      objective ? `Objectif que le joueur doit atteindre : ${objective}` : "",
      "Reste dans ton rôle : réponds, relance, nuance — mais n'atteins JAMAIS l'objectif à sa place, c'est à lui de conduire l'échange.",
      scopedScenarioDirective(params),
    ]
      .filter(Boolean)
      .join("\n");
  },

  /** L'observable réel : le(s) fil(s) du step + notes éventuelles. */
  buildArtifacts(ws, step, log): JsonObject {
    return {
      objectif: typeof step.params.objective === "string" ? step.params.objective : "",
      dialogue: threadsForObservation(ws, step, [actorIdOf(step.params)]),
      notes: notesForObservation(ws),
      messages_joueur: playerMessages(ws, log, step).length,
    };
  },

  /** Mêmes output_keys qu'en v2, dérivés du workspace (voir en-tête). */
  buildOutput(ws, step, _observation, log): JsonObject {
    return {
      dialogue: stepDialogue(ws, step, [actorIdOf(step.params)]),
      exchange_count: playerMessages(ws, log, step).length,
    };
  },

  validateParams(params: JsonObject): string[] {
    const errors: string[] = [];
    requireString(params, "actor_id", errors);
    requireString(params, "objective", errors);
    optionalString(params, "directive", errors);
    return errors;
  },
};
