/**
 * Spec PURE du Tool editeur — importable par le moteur (AUCUN React).
 * Éditeur de document pour la mécanique production quand
 * deliverable_type = "document" (one-pager, roadmap, recommandation…).
 * Config déclarée par le step : { template?: string, title_hint?: string }.
 *  - template : visible en référence (panneau repliable) ET préremplit
 *    le corps à la création ;
 *  - title_hint : placeholder du champ titre.
 * « Rendre le document » → deliverable_submitted
 *   { tool_id: "editeur", payload: { title, body } }.
 * Le garde-fou workspace.gardefou.test.ts vérifie cette pureté.
 */

import type { Json, JsonObject } from "@/app/lib/engine/mechanics";

export const EDITEUR_TOOL_ID = "editeur";

export type EditeurToolState = { title: string; body: string };

/** Lecture défensive de la config déclarée par le step. */
export function parseEditeurConfig(config: JsonObject): {
  template: string;
  titleHint: string;
} {
  return {
    template: typeof config.template === "string" ? config.template : "",
    titleHint: typeof config.title_hint === "string" ? config.title_hint : "",
  };
}

/** Le template préremplit le corps à la création (config du step). */
export function initialEditeurState(config: JsonObject): EditeurToolState {
  return { title: "", body: parseEditeurConfig(config).template };
}

/** Relit un état sérialisé (Json) en état éditeur bien formé. */
export function normalizeEditeurState(
  state: Json,
  config: JsonObject,
): EditeurToolState {
  const base = initialEditeurState(config);
  if (!state || typeof state !== "object" || Array.isArray(state)) return base;
  const s = state as Partial<EditeurToolState> & JsonObject;
  return {
    title: typeof s.title === "string" ? s.title : base.title,
    body: typeof s.body === "string" ? s.body : base.body,
  };
}

/** L'observateur IA lit le document tel quel : titre + corps. */
export function describeEditeurForObservation(state: Json): string {
  const s = normalizeEditeurState(state, {});
  const title = s.title.trim();
  const body = s.body.trim();
  if (title.length === 0 && body.length === 0) return "Document vide.";
  return [
    `Titre : ${title.length > 0 ? title : "(sans titre)"}`,
    body.length > 0 ? body : "(corps vide)",
  ].join("\n\n");
}

export const editeurSpec = {
  id: EDITEUR_TOOL_ID,
  title: "Éditeur",
  icon: "📄",
  initialState: initialEditeurState,
  describeForObservation: describeEditeurForObservation,
} as const;
