/**
 * feedback — spec HEADLESS v3 (capacité du moteur, zéro UI, zéro I/O).
 * Cohabite avec le Component.tsx v2 (intact jusqu'au jalon 3).
 *
 * Différences avec le v2 :
 *  - v2 : chat dédié + champ « Engagements convenus » saisi à la clôture.
 *  - v3 : le feedback se délivre dans le fil Messages du step ; les
 *    engagements convenus se formalisent dans le Tool notes ou par le
 *    dernier message/mail du joueur. Output { dialogue, commitments }
 *    dérivé du workspace : commitments = notes si présentes, sinon la
 *    dernière formalisation envoyée.
 */

import type { JsonObject } from "@/app/lib/engine/mechanics";
import type { MechanicSpec } from "@/app/lib/engine/workspace";
import {
  lastFormalisation,
  notesForObservation,
  optionalString,
  rawNotes,
  requireString,
  scopedScenarioDirective,
  stepDialogue,
  threadsForObservation,
} from "../specHelpers";

function actorIdOf(params: JsonObject): string {
  return typeof params.actor_id === "string" ? params.actor_id : "";
}

export const feedbackSpec: MechanicSpec = {
  manifest: {
    id: "feedback",
    version: "3.0.0",
    title: "Feedback",
    description:
      "Le joueur délivre un retour difficile à un acteur IA qui réagit (fil Messages), puis formalise les engagements convenus (notes ou message). L'observateur regarde le fil, les notes et la formalisation.",
    output_keys: ["dialogue", "commitments"],
    required_params: ["actor_id", "context_brief"],
    default_tools: ["notes"],
  },

  /** Même esprit que le v2 : l'acteur réagit selon son personnage,
   *  les engagements restent à la charge du joueur. */
  directive(params: JsonObject): string {
    const brief =
      typeof params.context_brief === "string" ? params.context_brief : "";
    return [
      "Le joueur vient te délivrer un feedback dans le poste de travail (fil de discussion).",
      brief ? `Contexte du feedback : ${brief}` : "",
      "Réagis selon ton personnage (émotion, défense, questions), ajuste-toi à la qualité de son retour — mais ne formule JAMAIS les engagements à sa place.",
      scopedScenarioDirective(params),
    ]
      .filter(Boolean)
      .join("\n");
  },

  /** L'observable réel : le fil de feedback + notes + formalisation. */
  buildArtifacts(ws, step, log): JsonObject {
    return {
      contexte:
        typeof step.params.context_brief === "string"
          ? step.params.context_brief
          : "",
      dialogue: threadsForObservation(ws, step, [actorIdOf(step.params)]),
      notes: notesForObservation(ws),
      engagements_formalises: lastFormalisation(ws, log, step) || "(aucune formalisation envoyée)",
    };
  },

  /** Mêmes output_keys qu'en v2, dérivés du workspace (voir en-tête). */
  buildOutput(ws, step, _observation, log): JsonObject {
    const notes = rawNotes(ws);
    return {
      dialogue: stepDialogue(ws, step, [actorIdOf(step.params)]),
      commitments: notes.length > 0 ? notes : lastFormalisation(ws, log, step),
    };
  },

  validateParams(params: JsonObject): string[] {
    const errors: string[] = [];
    requireString(params, "actor_id", errors);
    requireString(params, "context_brief", errors);
    optionalString(params, "directive", errors);
    return errors;
  },
};
