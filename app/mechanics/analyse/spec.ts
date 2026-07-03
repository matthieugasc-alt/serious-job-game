/**
 * analyse — spec HEADLESS v3 (capacité du moteur, zéro UI, zéro I/O).
 * Cohabite avec le Component.tsx v2 (intact jusqu'au jalon 3).
 *
 * Différences avec le v2 :
 *  - v2 : le joueur remplit un champ par finding (params.findings_prompts),
 *    l'output est { findings: { <prompt_id>: texte } }.
 *  - v3 : le joueur travaille dans le workspace — l'observable est RÉEL :
 *    notes du Tool `notes`, documents ouverts, conclusions envoyées en
 *    Messages. L'output { findings } est réinterprété depuis le workspace
 *    ({ notes, conclusions }) ; findings_prompts n'est plus requis.
 */

import type { JsonObject } from "@/app/lib/engine/mechanics";
import type { MechanicSpec } from "@/app/lib/engine/workspace";
import {
  documentsStatus,
  notesForObservation,
  playerMessages,
  rawNotes,
  requireInstructions,
} from "../specHelpers";

export const analyseSpec: MechanicSpec = {
  manifest: {
    id: "analyse",
    version: "3.0.0",
    title: "Analyse",
    description:
      "Le joueur lit les pièces du workspace, prend des notes et formule ses conclusions. L'observateur regarde documents ouverts, notes et messages.",
    output_keys: ["findings"],
    required_params: ["instructions"],
    default_tools: ["notes"],
  },

  /** Cadrage universel des acteurs — même esprit que la directive v2 :
   *  l'interlocuteur aide, précise, mais ne fait jamais l'analyse. */
  directive(params: JsonObject): string {
    const instructions =
      typeof params.instructions === "string" ? params.instructions : "";
    return [
      "Le joueur mène une analyse documentaire dans son poste de travail.",
      instructions ? `Consigne du moment : ${instructions}` : "",
      "Réponds à ses questions avec précision quand il t'interroge sur les pièces, mais ne fais JAMAIS l'analyse à sa place : c'est à lui d'identifier les conclusions et de te les exposer.",
    ]
      .filter(Boolean)
      .join("\n");
  },

  /** L'observable réel : notes + documents ouverts + conclusions envoyées. */
  buildArtifacts(ws, step, log): JsonObject {
    const docs = documentsStatus(ws, step);
    return {
      notes: notesForObservation(ws),
      documents_ouverts: docs.opened,
      documents_non_ouverts: docs.unopened,
      conclusions_envoyees: playerMessages(ws, log, step).map(
        (m) => `[à ${m.to_actors.join(", ")}] ${m.content}`,
      ),
    };
  },

  /** findings réinterprété depuis le workspace (voir en-tête). */
  buildOutput(ws, step, _observation, log): JsonObject {
    const conclusions = playerMessages(ws, log, step)
      .map((m) => m.content)
      .join("\n\n");
    return { findings: { notes: rawNotes(ws), conclusions } };
  },

  validateParams(params: JsonObject): string[] {
    const errors: string[] = [];
    requireInstructions(params, errors);
    return errors;
  },
};
