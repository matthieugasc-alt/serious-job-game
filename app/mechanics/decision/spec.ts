/**
 * decision — spec HEADLESS v3 (capacité du moteur, zéro UI, zéro I/O).
 * Cohabite avec le Component.tsx v2 (intact jusqu'au jalon 3).
 *
 * Différences avec le v2 :
 *  - v2 : cases à cocher + justification saisie ; les critères choice_*
 *    étaient observés DÉTERMINISTIQUEMENT par l'UI ; output
 *    { choice, choices, justification }.
 *  - v3 : le choix se tranche en discussion et se FORMALISE par le
 *    message/mail qui l'engage (ex : mail de cadrage). Les critères
 *    choice_* sont observés par l'IA depuis cette formalisation. Output
 *    { choice, justification } (plus de `choices` structuré) : choice =
 *    texte de la formalisation, justification = notes ou formalisation.
 */

import type { JsonObject } from "@/app/lib/engine/mechanics";
import type { MechanicSpec } from "@/app/lib/engine/workspace";
import {
  formatMail,
  lastSentMail,
  notesForObservation,
  playerMessages,
  rawNotes,
  requireInstructions,
  sentMails,
} from "../specHelpers";

function optionLabels(params: JsonObject): string[] {
  if (!Array.isArray(params.options)) return [];
  return params.options
    .filter(
      (o): o is JsonObject =>
        o !== null && typeof o === "object" && !Array.isArray(o),
    )
    .map((o) => (typeof o.label === "string" ? o.label : String(o.id ?? "")))
    .filter((l) => l.length > 0);
}

export const decisionSpec: MechanicSpec = {
  manifest: {
    id: "decision",
    version: "3.0.0",
    title: "Décision",
    description:
      "Le joueur tranche entre des options et formalise son choix (message ou mail de cadrage). L'observateur regarde le choix exprimé et sa justification.",
    output_keys: ["choice", "justification"],
    required_params: ["instructions", "options"],
    default_tools: ["notes"],
  },

  /** Même esprit que le v2 : l'acteur challenge, exige une logique,
   *  mais ne décide jamais à la place du joueur. */
  directive(params: JsonObject): string {
    const instructions =
      typeof params.instructions === "string" ? params.instructions : "";
    const labels = optionLabels(params);
    return [
      "Le joueur doit trancher une décision et la formaliser.",
      instructions ? `Consigne du moment : ${instructions}` : "",
      labels.length > 0 ? `Options en jeu : ${labels.join(" ; ")}.` : "",
      "Challenge ses arbitrages, exige une justification claire et cohérente, mais ne décide JAMAIS à sa place et ne propose pas toi-même la réponse.",
    ]
      .filter(Boolean)
      .join("\n");
  },

  /** L'observable réel : discussion, mail(s) de formalisation, notes. */
  buildArtifacts(ws, step, log): JsonObject {
    return {
      options: optionLabels(step.params),
      notes: notesForObservation(ws),
      messages_envoyes: playerMessages(ws, log, step).map(
        (m) => `[à ${m.to_actors.join(", ")}] ${m.content}`,
      ),
      mails_envoyes: sentMails(log, step).map(formatMail),
    };
  },

  /** choice = la formalisation (dernier mail envoyé, sinon dernier
   *  message) ; justification = notes si présentes, sinon la même
   *  formalisation (elle porte l'argumentaire). */
  buildOutput(ws, step, _observation, log): JsonObject {
    const mail = lastSentMail(log, step);
    const messages = playerMessages(ws, log, step);
    const lastMessage = messages[messages.length - 1]?.content ?? "";
    const formalisation = mail
      ? `Objet : ${mail.subject}\n\n${mail.body}`
      : lastMessage;
    const notes = rawNotes(ws);
    return {
      choice: formalisation,
      justification: notes.length > 0 ? notes : formalisation,
    };
  },

  validateParams(params: JsonObject): string[] {
    const errors: string[] = [];
    requireInstructions(params, errors);
    if (!Array.isArray(params.options) || params.options.length < 2) {
      errors.push("params.options doit être un tableau d'au moins 2 options");
    } else if (optionLabels(params).length !== params.options.length) {
      errors.push("chaque option doit avoir un id et un label lisibles");
    }
    return errors;
  },
};
