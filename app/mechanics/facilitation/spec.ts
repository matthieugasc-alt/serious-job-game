/**
 * facilitation — spec HEADLESS v3 (capacité du moteur, zéro UI, zéro I/O).
 *
 * Le joueur ANIME un collectif (COPIL, atelier, staff, sprint planning,
 * réunion de crise, comité) vers un objectif. Plusieurs acteurs IA sont
 * présents dans le MÊME fil Messages et répondent chacun selon leur rôle.
 * À NE PAS confondre avec `entretien` (échange dirigé à une personne) ni
 * `presentation` (exposer/convaincre un auditoire) : ici on fait AVANCER
 * un groupe. Deuxième mécanique multi-acteurs après `mediation`.
 *
 * INVARIANT D'INDÉPENDANCE (docs/TOOL_BLOC_NOTES.md §1, garde-fous des
 * tools transversaux) : une mécanique n'importe JAMAIS bloc-notes /
 * decision-engine / whiteboard et ne lit JAMAIS leur état. Ce que la
 * réunion PRODUIT concrètement dans ces tools (décisions, actions, idées)
 * est mesuré par le collecteur de débrief (app/lib/debrief/collect.ts),
 * hors app/mechanics. Ici la mécanique observe le fil multi-acteurs, les
 * notes génériques et la synthèse FORMALISÉE par le joueur.
 *
 * PUR / node-safe : aucun React, aucun import de tool.
 */

import type { JsonObject } from "@/app/lib/engine/mechanics";
import type { MechanicSpec } from "@/app/lib/engine/workspace";
import {
  lastFormalisation,
  notesForObservation,
  optionalString,
  requireString,
  stepDialogue,
  threadsForObservation,
} from "../specHelpers";

/** Critère conventionnel pilotant outcomes.productive s'il est déclaré. */
export const FACILITATION_PRODUCTIVE_CRITERION = "reunion_productive";

function participantIds(params: JsonObject): string[] {
  return Array.isArray(params.participants)
    ? params.participants.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : [];
}

export const facilitationSpec: MechanicSpec = {
  manifest: {
    id: "facilitation",
    version: "3.0.0",
    title: "Réunion / Facilitation",
    description:
      "Le joueur anime une réunion avec plusieurs acteurs IA présents dans le MÊME fil Messages, pour faire avancer le collectif vers un objectif. L'observateur regarde la distribution de la parole, la dynamique du groupe et ce que la réunion produit (décisions, actions, synthèse).",
    output_keys: ["dialogue", "outcomes"],
    required_params: ["participants", "objective"],
    default_tools: [],
  },

  directive(params: JsonObject): string {
    const participants = participantIds(params);
    const objective = typeof params.objective === "string" ? params.objective : "";
    const scenarioDirective = typeof params.directive === "string" ? params.directive.trim() : "";
    return [
      "Une réunion animée par le joueur est en cours : plusieurs participants sont présents dans le MÊME fil de discussion.",
      `Participants : ${participants.join(", ") || "?"}. Tu joues UN SEUL de ces participants — celui qui correspond à ton personnage. Ne parle jamais au nom des autres et ne rédige jamais leurs répliques.`,
      objective ? `Objectif de la réunion : ${objective}` : "",
      "Le joueur facilite : il donne la parole, recentre, arbitre et synthétise. Réagis à ce qui t'est adressé selon ton personnage — apporte, objecte ou temporise de façon réaliste ; si un message ne t'est pas adressé, réagis brièvement ou pas du tout.",
      scenarioDirective ? `Consigne du scénario (chacun n'applique que ce qui concerne son personnage) : ${scenarioDirective}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  },

  buildArtifacts(ws, step, log): JsonObject {
    const participants = participantIds(step.params);
    return {
      objectif: typeof step.params.objective === "string" ? step.params.objective : "",
      participants,
      dialogue: threadsForObservation(ws, step, participants),
      notes: notesForObservation(ws),
      synthese_envoyee: lastFormalisation(ws, log, step) || "(aucune synthèse envoyée)",
    };
  },

  buildOutput(ws, step, observation, log): JsonObject {
    const synthese = lastFormalisation(ws, log, step);
    const productive =
      FACILITATION_PRODUCTIVE_CRITERION in observation.criteria
        ? observation.criteria[FACILITATION_PRODUCTIVE_CRITERION] === true
        : synthese.length > 0;
    return {
      dialogue: stepDialogue(ws, step, participantIds(step.params)),
      outcomes: { synthese, productive },
    };
  },

  validateParams(params: JsonObject): string[] {
    const errors: string[] = [];
    if (participantIds(params).length < 2) {
      errors.push("params.participants doit lister au moins 2 acteurs de la réunion");
    }
    requireString(params, "objective", errors);
    optionalString(params, "directive", errors);
    return errors;
  },
};
