/**
 * qa — spec HEADLESS v3 (capacité du moteur, zéro UI, zéro I/O).
 * Cohabite avec le Component.tsx v2 (intact jusqu'au jalon 3).
 *
 * Différences avec le v2 :
 *  - v2 : l'UI pilotait la boucle question par question (directive
 *    « pose la question n/total » recalculée à chaque tour).
 *  - v3 : l'acteur interrogateur vit dans le fil Messages du step ; la
 *    directive (statique par step) lui donne le protocole complet
 *    (« une question à la fois, N au total »). La fin appartient au
 *    rédacteur : message_sent.min_count, actor_validation, ou
 *    timer_elapsed (Tool reunion en mode qa pour le décor chronométré).
 *    Output { dialogue, answers_count } dérivé du workspace.
 */

import type { JsonObject } from "@/app/lib/engine/mechanics";
import type { MechanicSpec } from "@/app/lib/engine/workspace";
import {
  optionalString,
  playerMessages,
  requireString,
  scopedScenarioDirective,
  stepDialogue,
  stepThreadIds,
  threadsForObservation,
} from "../specHelpers";

function actorIdOf(params: JsonObject): string {
  return typeof params.actor_id === "string" ? params.actor_id : "";
}

function questionCount(params: JsonObject): number {
  const raw = params.question_count;
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 1 ? raw : 0;
}

export const qaSpec: MechanicSpec = {
  manifest: {
    id: "qa",
    version: "3.0.0",
    title: "Questions / réponses",
    description:
      "Un acteur IA interroge le joueur, une question à la fois, dans le fil Messages du step. L'observateur regarde le dialogue et les réponses données.",
    output_keys: ["dialogue", "answers_count"],
    required_params: ["actor_id", "question_count"],
    default_tools: [],
  },

  /** Directive universelle d'interrogation — même protocole que le v2,
   *  donné en une fois (le fil porte l'historique des tours). */
  directive(params: JsonObject): string {
    const total = questionCount(params);
    return [
      "Une séance de questions/réponses est en cours dans le poste de travail du joueur : c'est TOI qui l'interroges.",
      total > 0
        ? `Pose tes questions UNE À LA FOIS — ${total} question${total > 1 ? "s" : ""} au total — et attends sa réponse avant la suivante. Numérote-les (1/${total}, 2/${total}…).`
        : "Pose tes questions une à la fois et attends sa réponse avant la suivante.",
      "Ne réponds jamais à ta propre question et ne valide pas à sa place ; adapte la question suivante à ce qu'il vient de dire.",
      scopedScenarioDirective(params),
    ]
      .filter(Boolean)
      .join("\n");
  },

  /** L'observable réel : le fil d'interrogation + les compteurs. */
  buildArtifacts(ws, step, log): JsonObject {
    const actorId = actorIdOf(step.params);
    const threadIds = stepThreadIds(ws, step, [actorId]);
    let questionsPosees = 0;
    for (const id of threadIds) {
      questionsPosees += ws.threads[id].messages.filter(
        (m) => m.from === "actor" && m.actor_id === actorId,
      ).length;
    }
    return {
      questions_attendues: questionCount(step.params),
      questions_posees: questionsPosees,
      reponses_joueur: playerMessages(ws, log, step).length,
      dialogue: threadsForObservation(ws, step, [actorId]),
    };
  },

  /** Mêmes output_keys qu'en v2, dérivés du workspace (voir en-tête). */
  buildOutput(ws, step, _observation, log): JsonObject {
    return {
      dialogue: stepDialogue(ws, step, [actorIdOf(step.params)]),
      answers_count: playerMessages(ws, log, step).length,
    };
  },

  validateParams(params: JsonObject): string[] {
    const errors: string[] = [];
    requireString(params, "actor_id", errors);
    if (questionCount(params) === 0) {
      errors.push("params.question_count doit être un entier >= 1");
    }
    optionalString(params, "directive", errors);
    return errors;
  },
};
