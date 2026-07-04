/**
 * formation — spec HEADLESS v3 (capacité du moteur, zéro UI, zéro I/O).
 * Cohabite avec le Component.tsx v2 (intact jusqu'au jalon 3).
 *
 * Différences avec le v2 :
 *  - v2 : le joueur COCHAIT lui-même les objectifs couverts à la clôture.
 *  - v3 : la couverture est OBSERVÉE — convention : le rédacteur aligne
 *    les ids de ses observed_criteria sur les ids d'objectifs ; tout
 *    critère observé vrai portant l'id d'un objectif déclaré marque cet
 *    objectif couvert. Output { dialogue, objectives_covered } dérivé
 *    du workspace + de l'observation (ordre de déclaration conservé).
 */

import type { JsonObject } from "@/app/lib/engine/mechanics";
import type { MechanicSpec } from "@/app/lib/engine/workspace";
import {
  notesForObservation,
  optionalString,
  requireString,
  scopedScenarioDirective,
  stepDialogue,
  threadsForObservation,
} from "../specHelpers";

function actorIdOf(params: JsonObject): string {
  return typeof params.actor_id === "string" ? params.actor_id : "";
}

/** Parse défensif de params.objectives (mêmes règles que le Runtime v2). */
function parseObjectives(params: JsonObject): { id: string; label: string }[] {
  if (!Array.isArray(params.objectives)) return [];
  const out: { id: string; label: string }[] = [];
  for (const raw of params.objectives) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) continue;
    const o = raw as JsonObject;
    if (typeof o.id !== "string" || o.id.length === 0) continue;
    if (typeof o.label !== "string" || o.label.length === 0) continue;
    out.push({ id: o.id, label: o.label });
  }
  return out;
}

export const formationSpec: MechanicSpec = {
  manifest: {
    id: "formation",
    version: "3.0.0",
    title: "Formation",
    description:
      "Le joueur transmet un savoir à un acteur IA apprenant (fil Messages). La couverture des objectifs est observée via les critères alignés sur leurs ids.",
    output_keys: ["dialogue", "objectives_covered"],
    required_params: ["actor_id", "topic", "objectives"],
    default_tools: ["notes"],
  },

  /** Même consigne apprenant que le v2 (LEARNER_DIRECTIVE), sujet en plus. */
  directive(params: JsonObject): string {
    const topic = typeof params.topic === "string" ? params.topic : "";
    return [
      "Une session de formation est en cours dans le poste de travail du joueur : il doit te transmettre un savoir.",
      topic ? `Sujet de la formation : ${topic}` : "",
      "Tu es en position d'apprenant : pose des questions quand c'est flou, reformule quand tu crois avoir compris — mais ne déroule JAMAIS le contenu à sa place.",
      scopedScenarioDirective(params),
    ]
      .filter(Boolean)
      .join("\n");
  },

  /** L'observable réel : le fil de formation + objectifs déclarés. */
  buildArtifacts(ws, step, log): JsonObject {
    void log;
    return {
      sujet: typeof step.params.topic === "string" ? step.params.topic : "",
      objectifs_pedagogiques: parseObjectives(step.params).map(
        (o) => `${o.id} — ${o.label}`,
      ),
      dialogue: threadsForObservation(ws, step, [actorIdOf(step.params)]),
      notes: notesForObservation(ws),
    };
  },

  /** objectives_covered dérivé de l'OBSERVATION (voir en-tête) :
   *  ids d'objectifs dont le critère homonyme est observé vrai. */
  buildOutput(ws, step, observation, log): JsonObject {
    void log;
    const covered = parseObjectives(step.params)
      .filter((o) => observation.criteria[o.id] === true)
      .map((o) => o.id);
    return {
      dialogue: stepDialogue(ws, step, [actorIdOf(step.params)]),
      objectives_covered: covered,
    };
  },

  validateParams(params: JsonObject): string[] {
    const errors: string[] = [];
    requireString(params, "actor_id", errors);
    requireString(params, "topic", errors);
    if (!Array.isArray(params.objectives) || params.objectives.length === 0) {
      errors.push("params.objectives doit être un tableau non vide");
    } else {
      const parsed = parseObjectives(params);
      if (parsed.length !== params.objectives.length) {
        errors.push(
          "chaque entrée de params.objectives doit avoir id et label (strings non vides)",
        );
      }
      const ids = parsed.map((o) => o.id);
      if (new Set(ids).size !== ids.length) {
        errors.push("les id de params.objectives doivent être uniques");
      }
    }
    optionalString(params, "directive", errors);
    return errors;
  },
};
