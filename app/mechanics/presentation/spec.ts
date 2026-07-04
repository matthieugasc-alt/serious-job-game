/**
 * presentation — spec HEADLESS v3 (capacité du moteur, zéro UI, zéro I/O).
 * Cohabite avec le Component.tsx v2 (intact jusqu'au jalon 3).
 *
 * Différences avec le v2 :
 *  - v2 : écran dédié (préparation + exposé chronométré, micro
 *    voiceCapture) ; output construit par le composant.
 *  - v3 : l'exposé se prononce dans le Tool `reunion` (panneau du
 *    workspace, mode "presentation") qui émet deliverable_submitted
 *    { tool_id: "reunion", payload: { speech, duration_s } }. L'output
 *    { speech, duration_s } est dérivé de ce payload (dernier du step),
 *    avec repli sur l'état du tool. Les temps (time_limit_s,
 *    preparation_s) vivent dans la CONFIG du tool déclarée par le step.
 */

import type { JsonObject } from "@/app/lib/engine/mechanics";
import type {
  LoggedAction,
  MechanicSpec,
  StepInvocationV3,
  WorkspaceState,
} from "@/app/lib/engine/workspace";
import {
  describeReunionForObservation,
  normalizeReunionState,
  REUNION_TOOL_ID,
} from "@/app/workspace/tools/reunion/spec";
import {
  lastDeliverablePayload,
  optionalString,
  requireString,
  scopedScenarioDirective,
} from "../specHelpers";

/** speech/duration_s : payload du tool reunion, repli sur son état. */
function resolveSpeech(
  ws: WorkspaceState,
  step: StepInvocationV3,
  log: readonly LoggedAction[],
): { speech: string; duration_s: number } {
  const payload = lastDeliverablePayload(log, step, REUNION_TOOL_ID);
  if (payload) {
    return {
      speech: typeof payload.speech === "string" ? payload.speech : "",
      duration_s:
        typeof payload.duration_s === "number" && Number.isFinite(payload.duration_s)
          ? payload.duration_s
          : 0,
    };
  }
  const toolState = normalizeReunionState(ws.toolStates[REUNION_TOOL_ID] ?? null, {});
  return { speech: toolState.speech.trim(), duration_s: 0 };
}

export const presentationSpec: MechanicSpec = {
  manifest: {
    id: "presentation",
    version: "3.0.0",
    title: "Présentation",
    description:
      "Le joueur prépare puis prononce un exposé sous contrainte de temps dans le Tool réunion. L'observateur regarde le discours rendu et sa durée.",
    output_keys: ["speech", "duration_s"],
    required_params: ["brief"],
    default_tools: ["reunion"],
  },

  /** Les acteurs sont l'audience : ils écoutent, ils n'exposent pas. */
  directive(params: JsonObject): string {
    const brief = typeof params.brief === "string" ? params.brief : "";
    return [
      "Le joueur prépare puis prononce un exposé sous contrainte de temps (salle de réunion du poste de travail).",
      brief ? `Brief de l'exposé : ${brief}` : "",
      "Tu es dans l'audience : écoute, réagis brièvement, questionne si on t'y invite — mais ne fais JAMAIS l'exposé à sa place.",
      scopedScenarioDirective(params),
    ]
      .filter(Boolean)
      .join("\n");
  },

  /** L'observable réel : l'exposé rendu (payload) + l'état de la salle. */
  buildArtifacts(ws, step, log): JsonObject {
    const { speech, duration_s } = resolveSpeech(ws, step, log);
    return {
      brief: typeof step.params.brief === "string" ? step.params.brief : "",
      expose: speech.length > 0 ? speech : "(exposé non rendu)",
      duree_s: duration_s,
      salle_de_reunion: describeReunionForObservation(
        ws.toolStates[REUNION_TOOL_ID] ?? null,
      ),
    };
  },

  /** Mêmes output_keys qu'en v2, dérivés du payload (voir en-tête). */
  buildOutput(ws, step, _observation, log): JsonObject {
    const { speech, duration_s } = resolveSpeech(ws, step, log);
    return { speech, duration_s };
  },

  validateParams(params: JsonObject): string[] {
    const errors: string[] = [];
    requireString(params, "brief", errors);
    optionalString(params, "directive", errors);
    return errors;
  },
};
