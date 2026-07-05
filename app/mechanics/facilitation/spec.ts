/**
 * facilitation — spec HEADLESS v3 (capacité du moteur, zéro UI, zéro I/O).
 *
 * Le joueur ANIME un collectif (COPIL, atelier, staff, sprint planning,
 * réunion de crise, comité) vers un objectif. Plusieurs acteurs IA sont
 * présents dans le MÊME fil Messages et répondent chacun selon leur rôle.
 * À NE PAS confondre avec `entretien` (échange dirigé à une personne) ni
 * `presentation` (exposer/convaincre un auditoire) : ici on fait AVANCER
 * un groupe. L'observable : distribution de la parole, dynamique et ce que
 * la réunion PRODUIT (décisions, actions, synthèse).
 *
 * PUR / node-safe : n'importe que des API de tools pures (aucun React).
 */

import type { JsonObject } from "@/app/lib/engine/mechanics";
import type { MechanicSpec } from "@/app/lib/engine/workspace";
import { listDecisions } from "@/app/workspace/tools/decision-engine/api";
import { selectAllTasks } from "@/app/workspace/tools/bloc-notes/api";
import { selectNotes } from "@/app/workspace/tools/whiteboard/api";
import {
  lastFormalisation,
  notesForObservation,
  optionalString,
  requireString,
  stepDialogue,
  threadsForObservation,
} from "../specHelpers";

function participantIds(params: JsonObject): string[] {
  return Array.isArray(params.participants)
    ? params.participants.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : [];
}

function production(ws: Parameters<MechanicSpec["buildArtifacts"]>[0]): JsonObject {
  const dec = ws.toolStates?.["decision-engine"] ?? null;
  const bloc = ws.toolStates?.["bloc-notes"] ?? null;
  const wb = ws.toolStates?.["whiteboard"] ?? null;
  return {
    decisions: dec ? listDecisions(dec).length : 0,
    actions: bloc ? selectAllTasks(bloc).length : 0,
    idees: wb ? selectNotes(wb).length : 0,
  };
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
    default_tools: ["bloc-notes", "decision-engine", "whiteboard"],
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
      production: production(ws),
      synthese_envoyee: lastFormalisation(ws, log, step) || "(aucune synthèse envoyée)",
    };
  },

  buildOutput(ws, step, _observation, _log): JsonObject {
    const p = production(ws) as { decisions: number; actions: number; idees: number };
    return {
      dialogue: stepDialogue(ws, step, participantIds(step.params)),
      outcomes: { ...p, productive: p.decisions + p.actions + p.idees > 0 },
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
