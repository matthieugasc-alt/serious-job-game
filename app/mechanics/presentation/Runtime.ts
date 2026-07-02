/**
 * Logique pure de la mécanique "presentation" — aucune I/O, aucun React.
 * Découpage du temps (préparation / exposé, reprise après refresh) et
 * construction de l'output. Tout est testable en node.
 */

import type { JsonObject } from "@/app/lib/engine/mechanics";

export const DEFAULT_PREPARATION_S = 60;
export const DEFAULT_TIME_LIMIT_S = 180;
export const DEFAULT_LANG = "fr-FR";
/** Sursis minimal accordé après un refresh si le chrono était expiré. */
export const RESUME_GRACE_S = 10;

/** Temps de préparation du step (défaut : 60 s). 0 = pas de préparation. */
export function resolvePreparationS(params: JsonObject): number {
  const raw = params.preparation_s;
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0
    ? Math.floor(raw)
    : DEFAULT_PREPARATION_S;
}

/** Temps d'exposé : context.timeLimitS du step, défaut 180 s. */
export function resolveTimeLimitS(timeLimitS?: number): number {
  return typeof timeLimitS === "number" &&
    Number.isFinite(timeLimitS) &&
    timeLimitS >= 1
    ? Math.floor(timeLimitS)
    : DEFAULT_TIME_LIMIT_S;
}

/** Langue de transcription vocale (BCP-47), défaut fr-FR. */
export function resolveLang(params: JsonObject): string {
  return typeof params.lang === "string" && params.lang.trim() !== ""
    ? params.lang
    : DEFAULT_LANG;
}

/**
 * Secondes restantes d'une phase démarrée à `startedAtMs`, pour la
 * reprise après refresh. Si le chrono est expiré (ou startedAtMs
 * invalide dans le passé lointain), accorde `graceS` pour conclure
 * proprement plutôt que de couper net au remount.
 */
export function remainingSeconds(
  startedAtMs: unknown,
  nowMs: number,
  limitS: number,
  graceS: number = RESUME_GRACE_S,
): number {
  if (typeof startedAtMs !== "number" || !Number.isFinite(startedAtMs)) {
    return limitS;
  }
  const elapsedS = Math.floor((nowMs - startedAtMs) / 1000);
  if (elapsedS <= 0) return limitS;
  const remaining = limitS - elapsedS;
  return remaining > 0 ? remaining : Math.min(graceS, limitS);
}

/**
 * Durée effective de l'exposé en secondes, bornée [0, limitS].
 * startedAtMs invalide → 0 (défensif, jamais de NaN dans l'output).
 */
export function computeDurationS(
  startedAtMs: unknown,
  endedAtMs: number,
  limitS: number,
): number {
  if (typeof startedAtMs !== "number" || !Number.isFinite(startedAtMs)) {
    return 0;
  }
  const elapsed = Math.round((endedAtMs - startedAtMs) / 1000);
  return Math.max(0, Math.min(elapsed, limitS));
}

/** Output conforme au manifest : exactement { speech, duration_s }. */
export function buildOutput(
  speech: string,
  durationS: number,
): { speech: string; duration_s: number } {
  return { speech: speech.trim(), duration_s: durationS };
}

/** Garde-fou de validation scénario (retourne [] si tout est valide). */
export function validateParams(params: JsonObject): string[] {
  const errors: string[] = [];
  if (typeof params.brief !== "string" || params.brief.trim() === "") {
    errors.push("params.brief doit être une string non vide");
  }
  if (
    params.preparation_s !== undefined &&
    !(
      typeof params.preparation_s === "number" &&
      Number.isFinite(params.preparation_s) &&
      params.preparation_s >= 0
    )
  ) {
    errors.push("params.preparation_s doit être un nombre >= 0");
  }
  if (
    params.lang !== undefined &&
    (typeof params.lang !== "string" || params.lang.trim() === "")
  ) {
    errors.push("params.lang doit être une string non vide (tag BCP-47)");
  }
  return errors;
}
