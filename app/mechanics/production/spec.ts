/**
 * production — spec HEADLESS v3 (capacité du moteur, zéro UI, zéro I/O).
 * Cohabite avec le Component.tsx v2 (intact jusqu'au jalon 3).
 *
 * Différences avec le v2 :
 *  - v2 : éditeur dédié (objet/titre + corps) avec bouton « rendre » ;
 *    output construit depuis le brouillon du composant.
 *  - v3 : le livrable est produit dans le workspace RÉEL — un mail
 *    s'envoie depuis l'app Mail (le dernier mail envoyé au destinataire
 *    est le livrable) ; un document se rédige dans le Tool `editeur`
 *    (deliverable_submitted { title, body }), avec repli sur son état
 *    puis sur le Tool notes (compat jalon 1). Output { deliverable, body }
 *    de même forme qu'en v2 ({ type, to?, subject?, title?, body }).
 */

import type { JsonObject } from "@/app/lib/engine/mechanics";
import type { MechanicSpec } from "@/app/lib/engine/workspace";
import {
  EDITEUR_TOOL_ID,
  normalizeEditeurState,
} from "@/app/workspace/tools/editeur/spec";
import {
  formatMail,
  lastDeliverablePayload,
  lastSentMail,
  notesForObservation,
  playerMessages,
  rawNotes,
  requireInstructions,
  sentMails,
} from "../specHelpers";

function recipientActor(params: JsonObject): string | undefined {
  return typeof params.recipient_actor === "string"
    ? params.recipient_actor
    : undefined;
}

/**
 * Livrable document : payload deliverable_submitted du Tool editeur
 * (rendu explicite), repli sur l'état de l'éditeur (brouillon), puis
 * sur le Tool notes (compat jalon 1, avant l'existence de l'éditeur).
 */
function documentDeliverable(
  ws: Parameters<MechanicSpec["buildOutput"]>[0],
  step: Parameters<MechanicSpec["buildOutput"]>[1],
  log: Parameters<MechanicSpec["buildOutput"]>[3],
): { title: string; body: string } {
  const fallbackTitle = step.title ?? step.step_id;
  const payload = lastDeliverablePayload(log, step, EDITEUR_TOOL_ID);
  if (payload) {
    const title =
      typeof payload.title === "string" && payload.title.trim().length > 0
        ? payload.title.trim()
        : fallbackTitle;
    return {
      title,
      body: typeof payload.body === "string" ? payload.body : "",
    };
  }
  const draft = normalizeEditeurState(ws.toolStates[EDITEUR_TOOL_ID] ?? null, {});
  if (draft.title.trim().length > 0 || draft.body.trim().length > 0) {
    return {
      title: draft.title.trim().length > 0 ? draft.title.trim() : fallbackTitle,
      body: draft.body,
    };
  }
  return { title: fallbackTitle, body: rawNotes(ws) };
}

export const productionSpec: MechanicSpec = {
  manifest: {
    id: "production",
    version: "3.0.0",
    title: "Production",
    description:
      "Le joueur produit un livrable (mail, note, document) et le remet explicitement. L'observateur regarde le livrable soumis et les échanges associés.",
    output_keys: ["deliverable", "body"],
    required_params: ["deliverable_type", "instructions"],
    default_tools: ["notes"],
  },

  /** L'acteur précise le besoin, il ne rédige jamais à la place du joueur. */
  directive(params: JsonObject): string {
    const instructions =
      typeof params.instructions === "string" ? params.instructions : "";
    const type =
      typeof params.deliverable_type === "string" ? params.deliverable_type : "";
    return [
      `Le joueur doit produire un livrable${type ? ` (${type})` : ""} depuis son poste de travail.`,
      instructions ? `Consigne du moment : ${instructions}` : "",
      "Donne les précisions demandées (attentes, format, contenu manquant), mais ne rédige JAMAIS le livrable à sa place.",
    ]
      .filter(Boolean)
      .join("\n");
  },

  /** L'observable réel : le dernier mail envoyé au destinataire (livrable
   *  mail) ou le document de l'éditeur (livrable document, repli notes),
   *  + les échanges du step. */
  buildArtifacts(ws, step, log): JsonObject {
    const to = recipientActor(step.params);
    const mail = lastSentMail(log, step, to);
    const doc = documentDeliverable(ws, step, log);
    return {
      livrable_mail: mail ? formatMail(mail) : "(aucun mail envoyé)",
      livrable_document:
        doc.body.length > 0
          ? `Titre : ${doc.title}\n\n${doc.body}`
          : "(aucun document rédigé)",
      mails_envoyes: sentMails(log, step).length,
      notes: notesForObservation(ws),
      messages_envoyes: playerMessages(ws, log, step).map((m) => m.content),
    };
  },

  /** deliverable réinterprété depuis le workspace (voir en-tête). */
  buildOutput(ws, step, _observation, log): JsonObject {
    const type =
      step.params.deliverable_type === "document" ? "document" : "mail";
    if (type === "mail") {
      const mail = lastSentMail(log, step, recipientActor(step.params));
      const deliverable: JsonObject = {
        type: "mail",
        to: mail?.to.join(", ") ?? "",
        subject: mail?.subject ?? "",
        body: mail?.body ?? "",
      };
      return { deliverable, body: mail?.body ?? "" };
    }
    const doc = documentDeliverable(ws, step, log);
    return {
      deliverable: { type: "document", title: doc.title, body: doc.body },
      body: doc.body,
    };
  },

  validateParams(params: JsonObject): string[] {
    const errors: string[] = [];
    if (params.deliverable_type !== "mail" && params.deliverable_type !== "document") {
      errors.push('params.deliverable_type doit être "mail" ou "document"');
    }
    requireInstructions(params, errors);
    if (
      params.recipient_actor !== undefined &&
      typeof params.recipient_actor !== "string"
    ) {
      errors.push("params.recipient_actor doit être une string");
    }
    return errors;
  },
};
