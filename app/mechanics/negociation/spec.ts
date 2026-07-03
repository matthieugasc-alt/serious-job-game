/**
 * negociation — spec HEADLESS v3 (capacité du moteur, zéro UI, zéro I/O).
 * Cohabite avec le Component.tsx v2 (intact jusqu'au jalon 3).
 *
 * Différences avec le v2 :
 *  - v2 : écran dédié (chat + champs de termes + boutons conclure/rompre) ;
 *    opening_message injecté par le Component ; output construit depuis
 *    l'état local du composant.
 *  - v3 : le fil de discussion vit dans Messages et les termes dans le
 *    Tool `contrat` (panneau). L'ouverture et les relances sont des events
 *    du scénario. L'output { agreement, proposals_count } est réinterprété
 *    depuis le journal (action contract_signed → terms) et l'état du Tool
 *    contrat (proposals). Même forme d'agreement qu'en v2
 *    ({ concluded, terms }) : /api/v2/complete (deltas founder « prix »)
 *    reste alimenté à l'identique.
 */

import type { Json, JsonObject } from "@/app/lib/engine/mechanics";
import type { MechanicSpec } from "@/app/lib/engine/workspace";
import {
  normalizeContratState,
  describeContratForObservation,
} from "@/app/workspace/tools/contrat/spec";
import { requireInstructions, stepLog, threadTranscript } from "../specHelpers";

export const negociationSpec: MechanicSpec = {
  manifest: {
    id: "negociation",
    version: "3.0.0",
    title: "Négociation",
    description:
      "Le joueur négocie des termes avec un acteur IA ; le Tool contrat (panneau) porte propositions et signature. L'observateur regarde le fil et l'état du contrat.",
    output_keys: ["agreement", "proposals_count"],
    required_params: ["actor_id", "instructions", "terms"],
    default_tools: ["contrat"],
  },

  /** Cadrage universel + directive spécifique du scénario (params.directive,
   *  ex : paliers de prix de Thomas). Les threads persistant entre steps,
   *  un AUTRE acteur peut recevoir ce cadrage : la consigne spécifique est
   *  explicitement scopée à params.actor_id. */
  directive(params: JsonObject): string {
    const instructions =
      typeof params.instructions === "string" ? params.instructions : "";
    const actorId = typeof params.actor_id === "string" ? params.actor_id : "";
    const scenarioDirective =
      typeof params.directive === "string" ? params.directive : "";
    return [
      "Une négociation est en cours dans le poste de travail du joueur ; les termes se formalisent dans un panneau Contrat (propositions, signature).",
      instructions ? `Enjeu du moment : ${instructions}` : "",
      "Si tu es la partie qui négocie : défends tes intérêts, chiffre tes réponses, et ne laisse jamais croire qu'un accord est conclu si tu le refuses. Sinon, reste dans ton rôle habituel.",
      scenarioDirective && actorId
        ? `Consigne spécifique pour l'acteur « ${actorId} » (à ignorer si tu joues un autre personnage) : ${scenarioDirective}`
        : scenarioDirective,
    ]
      .filter(Boolean)
      .join("\n");
  },

  /** L'observable réel : état du Tool contrat + fil de discussion. */
  buildArtifacts(ws, step, log): JsonObject {
    const actorId =
      typeof step.params.actor_id === "string" ? step.params.actor_id : "";
    const threadIds = Object.keys(ws.threads).filter((id) =>
      ws.threads[id].participants.includes(actorId),
    );
    const contratState = normalizeContratState(
      ws.toolStates["contrat"] ?? null,
      { terms: (step.params.terms ?? []) as Json },
    );
    return {
      contrat: describeContratForObservation(ws.toolStates["contrat"] ?? null),
      statut_contrat: contratState.status,
      termes_affiches: contratState.values,
      propositions: contratState.proposals.map((p) => p.values),
      discussion: threadIds
        .map((id) => `— Fil ${id} —\n${threadTranscript(ws, id)}`)
        .join("\n\n"),
    };
  },

  /** agreement depuis le journal (contract_signed.terms fait foi) avec
   *  repli sur l'état du Tool contrat. Même contrat de sortie qu'en v2. */
  buildOutput(ws, step, _observation, log): JsonObject {
    const contratState = normalizeContratState(
      ws.toolStates["contrat"] ?? null,
      { terms: (step.params.terms ?? []) as Json },
    );
    let signedTerms: JsonObject | null = null;
    for (const e of stepLog(log, step)) {
      if (e.action.type === "contract_signed") signedTerms = e.action.terms;
    }
    const concluded = signedTerms !== null || contratState.status === "signed";
    return {
      agreement: {
        concluded,
        terms: signedTerms ?? contratState.values,
      },
      proposals_count: contratState.proposals.length,
    };
  },

  validateParams(params: JsonObject): string[] {
    const errors: string[] = [];
    if (typeof params.actor_id !== "string" || params.actor_id.trim().length === 0) {
      errors.push("params.actor_id doit être une string non vide");
    }
    requireInstructions(params, errors);
    if (!Array.isArray(params.terms) || params.terms.length === 0) {
      errors.push("params.terms doit être un tableau non vide");
    } else {
      const valid = params.terms.filter(
        (t) =>
          t !== null &&
          typeof t === "object" &&
          !Array.isArray(t) &&
          typeof (t as JsonObject).id === "string" &&
          typeof (t as JsonObject).label === "string",
      );
      if (valid.length !== params.terms.length) {
        errors.push("chaque terme doit avoir id et label (strings non vides)");
      }
    }
    if (params.directive !== undefined && typeof params.directive !== "string") {
      errors.push("params.directive doit être une string");
    }
    return errors;
  },
};
