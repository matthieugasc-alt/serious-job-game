/**
 * debat — spec HEADLESS v3 (capacité du moteur, zéro UI, zéro I/O).
 *
 * DÉBAT PAR MAIL : le joueur argumente PAR MAIL avec un acteur IA qui lui
 * répond par mail (le step déclare cet acteur dans `mail_actors`, ce qui
 * arme la boucle de réponse — effet moteur `mail_reply`). À la différence
 * d'`entretien` (dialogue en messagerie instantanée), l'échange est
 * asynchrone et écrit : arguments posés, objections, contre-arguments.
 * L'observateur regarde le fil de mails et les notes.
 *
 * PUR / node-safe : aucun React, aucun import de Tool.
 */

import type { JsonObject } from "@/app/lib/engine/mechanics";
import type { MechanicSpec } from "@/app/lib/engine/workspace";
import {
  mailThread,
  notesForObservation,
  optionalString,
  requireString,
  scopedScenarioDirective,
} from "../specHelpers";

export const debatSpec: MechanicSpec = {
  manifest: {
    id: "debat",
    version: "3.0.0",
    title: "Débat par mail",
    description:
      "Le joueur argumente par mail avec un acteur IA qui lui répond par mail (échange écrit, asynchrone). L'observateur regarde le fil de mails : qualité des arguments, réponses aux objections, progression vers l'objectif.",
    output_keys: ["dialogue", "exchange_count"],
    required_params: ["actor_id", "objective"],
    default_tools: [],
  },

  directive(params: JsonObject): string {
    const objective = typeof params.objective === "string" ? params.objective : "";
    return [
      "Un débat PAR MAIL est en cours : le joueur t'écrit, tu lui réponds PAR MAIL, en restant strictement dans ton rôle.",
      objective ? `Ce que le joueur cherche à obtenir de toi : ${objective}` : "",
      "Défends ta position avec des arguments concrets. Réagis point par point à ce qu'il avance ; objecte quand c'est justifié ; ne concède que si son argument est réellement solide — jamais par complaisance. Écris comme un vrai mail (salutation brève, corps argumenté, signature courte), pas comme un chat.",
      scopedScenarioDirective(params),
    ]
      .filter(Boolean)
      .join("\n");
  },

  buildArtifacts(ws, step, _log): JsonObject {
    return {
      objectif: typeof step.params.objective === "string" ? step.params.objective : "",
      dialogue: mailThread(ws),
      notes: notesForObservation(ws),
    };
  },

  buildOutput(ws, _step, _observation, _log): JsonObject {
    const thread = mailThread(ws);
    return {
      dialogue: thread,
      exchange_count: thread.filter((m) => m.from === "player").length,
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
