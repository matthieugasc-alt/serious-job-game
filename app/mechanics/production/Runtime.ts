/**
 * production/Runtime — logique pure (node-safe, sans React ni I/O).
 * Validation du brouillon, construction du livrable et de l'output.
 */

import type { JsonObject } from "@/app/lib/engine/mechanics";

export type DeliverableType = "mail" | "document";

export interface DeliverableDraft {
  /** Nom du destinataire (mail — figé côté UI, résolu depuis l'acteur). */
  to?: string;
  subject?: string;
  title?: string;
  body: string;
}

export function parseDeliverableType(params: JsonObject): DeliverableType | null {
  return params.deliverable_type === "mail" || params.deliverable_type === "document"
    ? params.deliverable_type
    : null;
}

/** Une erreur par champ requis vide (après trim). [] = prêt à rendre. */
export function validateDraft(
  type: DeliverableType,
  draft: DeliverableDraft,
): string[] {
  const errors: string[] = [];
  if (type === "mail" && (draft.subject ?? "").trim().length === 0) {
    errors.push("L'objet du mail est vide.");
  }
  if (type === "document" && (draft.title ?? "").trim().length === 0) {
    errors.push("Le titre du document est vide.");
  }
  if (draft.body.trim().length === 0) {
    errors.push("Le corps est vide.");
  }
  return errors;
}

/**
 * Livrable conforme au contrat : {type, to?, subject?, title?, body}.
 * Champs trimmés ; seules les clés pertinentes au type sont présentes
 * (JSON-sérialisable, aucun undefined).
 */
export function buildDeliverable(
  type: DeliverableType,
  draft: DeliverableDraft,
): JsonObject {
  const deliverable: JsonObject = { type, body: draft.body.trim() };
  if (type === "mail") {
    const to = (draft.to ?? "").trim();
    if (to.length > 0) deliverable.to = to;
    deliverable.subject = (draft.subject ?? "").trim();
  } else {
    deliverable.title = (draft.title ?? "").trim();
  }
  return deliverable;
}

/** Rendu texte du livrable pour le transcript (audit + observation). */
export function formatDeliverableContent(deliverable: JsonObject): string {
  const body = typeof deliverable.body === "string" ? deliverable.body : "";
  if (deliverable.type === "mail") {
    const lines: string[] = [];
    if (typeof deliverable.to === "string") lines.push(`À : ${deliverable.to}`);
    lines.push(`Objet : ${typeof deliverable.subject === "string" ? deliverable.subject : ""}`);
    return `${lines.join("\n")}\n\n${body}`;
  }
  const title = typeof deliverable.title === "string" ? deliverable.title : "";
  return `${title}\n\n${body}`;
}

/** Output conforme au manifest : { deliverable, body }. */
export function buildOutput(deliverable: JsonObject): {
  deliverable: JsonObject;
  body: string;
} {
  return {
    deliverable,
    body: typeof deliverable.body === "string" ? deliverable.body : "",
  };
}

/** Restaure le brouillon persisté (reprise après refresh). */
export function restoreDraft(scratch: JsonObject): Partial<DeliverableDraft> {
  const out: Partial<DeliverableDraft> = {};
  if (typeof scratch.subject === "string") out.subject = scratch.subject;
  if (typeof scratch.title === "string") out.title = scratch.title;
  if (typeof scratch.body === "string") out.body = scratch.body;
  return out;
}

/** Garde-fou au validate:scenarios — retourne [] si les params sont valides. */
export function validateParams(params: JsonObject): string[] {
  const errors: string[] = [];
  if (parseDeliverableType(params) === null) {
    errors.push('params.deliverable_type doit être "mail" ou "document"');
  }
  if (typeof params.instructions !== "string" || params.instructions.trim().length === 0) {
    errors.push("params.instructions doit être une string non vide");
  }
  for (const key of ["recipient_actor", "subject_hint", "template"] as const) {
    if (params[key] !== undefined && typeof params[key] !== "string") {
      errors.push(`params.${key} doit être une string`);
    }
  }
  if (
    params.document_ids !== undefined &&
    (!Array.isArray(params.document_ids) ||
      params.document_ids.some((d) => typeof d !== "string"))
  ) {
    errors.push("params.document_ids doit être un tableau de strings");
  }
  return errors;
}
