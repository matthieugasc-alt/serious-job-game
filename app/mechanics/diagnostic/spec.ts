/**
 * diagnostic — spec HEADLESS v3 (capacité du moteur, zéro UI, zéro I/O).
 * Cohabite avec le Component.tsx v2 (intact jusqu'au jalon 3).
 *
 * Différences avec le v2 :
 *  - v2 : formulaire structuré { cause, evidence, eliminated } saisi
 *    dans un écran dédié, hypothèses cochables.
 *  - v3 : le joueur enquête dans le fil Messages (le témoin est un
 *    acteur), consigne ses hypothèses dans le Tool notes, et FORMALISE
 *    son diagnostic par message/mail. L'output { diagnosis, dialogue }
 *    est réinterprété : cause = la formalisation envoyée, evidence =
 *    les notes (sinon la formalisation), eliminated = "" (les causes
 *    écartées vivent désormais dans le texte de la formalisation).
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

/** Parse défensif de params.hypotheses (mêmes règles que le Runtime v2). */
function hypothesisLabels(params: JsonObject): string[] {
  if (!Array.isArray(params.hypotheses)) return [];
  return params.hypotheses
    .filter(
      (h): h is JsonObject =>
        h !== null && typeof h === "object" && !Array.isArray(h),
    )
    .map((h) => (typeof h.label === "string" ? h.label : ""))
    .filter((l) => l.length > 0);
}

export const diagnosticSpec: MechanicSpec = {
  manifest: {
    id: "diagnostic",
    version: "3.0.0",
    title: "Diagnostic",
    description:
      "Le joueur investigue la cause d'un problème auprès d'un acteur témoin (fil Messages), consigne ses hypothèses en notes et formalise son diagnostic. L'observateur regarde le fil, les notes et la formalisation.",
    output_keys: ["diagnosis", "dialogue"],
    required_params: ["situation", "actor_id"],
    default_tools: ["notes"],
  },

  /** Même consigne témoin que le v2 (WITNESS_DIRECTIVE), situation en plus. */
  directive(params: JsonObject): string {
    const situation =
      typeof params.situation === "string" ? params.situation : "";
    return [
      "Le joueur enquête sur la cause d'un problème depuis son poste de travail.",
      situation ? `Situation : ${situation}` : "",
      "Réponds en témoin : ce que tu sais, ce que tu as constaté — sans jamais conclure à sa place.",
      scopedScenarioDirective(params),
    ]
      .filter(Boolean)
      .join("\n");
  },

  /** L'observable réel : fil d'enquête, notes, formalisation envoyée. */
  buildArtifacts(ws, step, log): JsonObject {
    return {
      situation:
        typeof step.params.situation === "string" ? step.params.situation : "",
      hypotheses_declarees: hypothesisLabels(step.params),
      dialogue: threadsForObservation(ws, step, [actorIdOf(step.params)]),
      notes: notesForObservation(ws),
      diagnostic_formalise: lastFormalisation(ws, log, step) || "(aucune formalisation envoyée)",
    };
  },

  /** diagnosis réinterprété depuis le workspace (voir en-tête). */
  buildOutput(ws, step, _observation, log): JsonObject {
    const formalisation = lastFormalisation(ws, log, step);
    const notes = rawNotes(ws);
    return {
      diagnosis: {
        cause: formalisation,
        evidence: notes.length > 0 ? notes : formalisation,
        eliminated: "",
      },
      dialogue: stepDialogue(ws, step, [actorIdOf(step.params)]),
    };
  },

  validateParams(params: JsonObject): string[] {
    const errors: string[] = [];
    requireString(params, "situation", errors);
    requireString(params, "actor_id", errors);
    if (params.hypotheses !== undefined) {
      if (!Array.isArray(params.hypotheses) || params.hypotheses.length === 0) {
        errors.push("params.hypotheses doit être un tableau non vide si présent");
      } else if (hypothesisLabels(params).length !== params.hypotheses.length) {
        errors.push(
          "chaque entrée de params.hypotheses doit avoir id et label (strings non vides)",
        );
      }
    }
    optionalString(params, "directive", errors);
    return errors;
  },
};
