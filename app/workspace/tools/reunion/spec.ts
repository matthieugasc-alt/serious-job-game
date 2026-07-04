/**
 * Spec PURE du Tool reunion — importable par le moteur (AUCUN React).
 * Salle de réunion minimale pour presentation/qa en attendant l'app
 * Agenda. Config déclarée par le step :
 *   { brief: string, time_limit_s: number, preparation_s?: number,
 *     mode: "presentation" | "qa" }
 *  - presentation : phase préparation (si preparation_s > 0) puis prise
 *    de parole chronométrée ; « Terminer » ou expiration →
 *    deliverable_submitted { tool_id: "reunion", payload: { speech, duration_s } }.
 *  - qa : le tool n'affiche que timer + brief — l'échange questions/
 *    réponses passe par le THREAD du step (le jury est un acteur).
 * Le garde-fou workspace.gardefou.test.ts vérifie cette pureté.
 */

import type { Json, JsonObject } from "@/app/lib/engine/mechanics";

export const REUNION_TOOL_ID = "reunion";

export const DEFAULT_TIME_LIMIT_S = 180;

export type ReunionMode = "presentation" | "qa";

export interface ReunionConfig {
  brief: string;
  timeLimitS: number;
  preparationS: number;
  mode: ReunionMode;
}

/** Lecture défensive de la config déclarée par le step. */
export function parseReunionConfig(config: JsonObject): ReunionConfig {
  const rawLimit = config.time_limit_s;
  const rawPrep = config.preparation_s;
  return {
    brief: typeof config.brief === "string" ? config.brief : "",
    timeLimitS:
      typeof rawLimit === "number" && Number.isFinite(rawLimit) && rawLimit >= 1
        ? Math.floor(rawLimit)
        : DEFAULT_TIME_LIMIT_S,
    preparationS:
      typeof rawPrep === "number" && Number.isFinite(rawPrep) && rawPrep >= 0
        ? Math.floor(rawPrep)
        : 0,
    mode: config.mode === "qa" ? "qa" : "presentation",
  };
}

export type ReunionPhase = "prepare" | "active" | "done";

export type ReunionToolState = {
  phase: ReunionPhase;
  /** Horodatages posés par le composant à l'entrée de chaque phase
   *  (reprise après refresh) — null tant que la phase n'a pas commencé. */
  prepare_started_at: number | null;
  active_started_at: number | null;
  /** Prise de parole (texte). Mode qa : reste vide, l'échange vit dans le fil. */
  speech: string;
};

export function initialReunionState(config: JsonObject): ReunionToolState {
  const { preparationS } = parseReunionConfig(config);
  return {
    phase: preparationS > 0 ? "prepare" : "active",
    prepare_started_at: null,
    active_started_at: null,
    speech: "",
  };
}

/** Relit un état sérialisé (Json) en état réunion bien formé. */
export function normalizeReunionState(
  state: Json,
  config: JsonObject,
): ReunionToolState {
  const base = initialReunionState(config);
  if (!state || typeof state !== "object" || Array.isArray(state)) return base;
  const s = state as Partial<ReunionToolState> & JsonObject;
  return {
    phase:
      s.phase === "prepare" || s.phase === "active" || s.phase === "done"
        ? s.phase
        : base.phase,
    prepare_started_at:
      typeof s.prepare_started_at === "number" ? s.prepare_started_at : null,
    active_started_at:
      typeof s.active_started_at === "number" ? s.active_started_at : null,
    speech: typeof s.speech === "string" ? s.speech : "",
  };
}

/** Secondes restantes d'une phase (reprise après refresh comprise). */
export function remainingReunionSeconds(
  startedAtMs: number | null,
  nowMs: number,
  limitS: number,
): number {
  if (typeof startedAtMs !== "number" || !Number.isFinite(startedAtMs)) {
    return limitS;
  }
  const elapsedS = Math.floor((nowMs - startedAtMs) / 1000);
  return Math.max(0, limitS - Math.max(0, elapsedS));
}

/** Durée effective de la prise de parole, bornée [0, limitS]. */
export function computeReunionDurationS(
  startedAtMs: number | null,
  endedAtMs: number,
  limitS: number,
): number {
  if (typeof startedAtMs !== "number" || !Number.isFinite(startedAtMs)) {
    return 0;
  }
  const elapsed = Math.round((endedAtMs - startedAtMs) / 1000);
  return Math.max(0, Math.min(elapsed, limitS));
}

/** Résumé lisible par l'observateur IA — jamais de logique d'évaluation. */
export function describeReunionForObservation(state: Json): string {
  const s = normalizeReunionState(state, {});
  const speech = s.speech.trim();
  if (s.phase === "prepare") {
    return "Réunion : phase de préparation en cours, prise de parole non commencée.";
  }
  if (s.phase === "active") {
    return speech.length > 0
      ? `Réunion en cours. Prise de parole (en cours de rédaction) : ${speech}`
      : "Réunion en cours, aucune prise de parole saisie pour le moment.";
  }
  return speech.length > 0
    ? `Réunion terminée. Prise de parole rendue : ${speech}`
    : "Réunion terminée sans prise de parole saisie (mode qa : l'échange est dans le fil de discussion).";
}

export const reunionSpec = {
  id: REUNION_TOOL_ID,
  title: "Réunion",
  icon: "🎤",
  initialState: initialReunionState,
  describeForObservation: describeReunionForObservation,
} as const;
