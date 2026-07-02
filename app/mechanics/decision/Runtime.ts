/**
 * decision/Runtime — logique pure (node-safe, sans React ni I/O).
 *
 * Cœur de la mécanique : la partition des critères entre observation
 * déterministe (convention "choice_<option_id>" : true ssi l'option est
 * choisie) et observation IA (justification…), puis la fusion des deux
 * observations. Le moteur décide toujours — ici on OBSERVE seulement.
 */

import type { Json, JsonObject } from "@/app/lib/engine/mechanics";
import type { StepCriterion, StepObservation } from "@/app/lib/engine/criteria";

export const CHOICE_CRITERION_PREFIX = "choice_";

export interface DecisionOption {
  id: string;
  label: string;
  description: string;
}

export interface DecisionConfig {
  maxChoices: number;
  requireJustification: boolean;
  minJustificationChars: number;
}

/** Parse défensif de params.options (ignore les entrées invalides). */
export function parseOptions(params: JsonObject): DecisionOption[] {
  if (!Array.isArray(params.options)) return [];
  const out: DecisionOption[] = [];
  for (const raw of params.options) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) continue;
    const o = raw as JsonObject;
    if (typeof o.id !== "string" || o.id.length === 0) continue;
    if (typeof o.label !== "string" || o.label.length === 0) continue;
    if (typeof o.description !== "string") continue;
    out.push({ id: o.id, label: o.label, description: o.description });
  }
  return out;
}

/** Options optionnelles avec leurs défauts : 1 choix, justification ≥ 50 chars. */
export function parseConfig(params: JsonObject): DecisionConfig {
  return {
    maxChoices:
      typeof params.max_choices === "number" &&
      Number.isInteger(params.max_choices) &&
      params.max_choices >= 1
        ? params.max_choices
        : 1,
    requireJustification:
      typeof params.require_justification === "boolean"
        ? params.require_justification
        : true,
    minJustificationChars:
      typeof params.min_justification_chars === "number" &&
      params.min_justification_chars >= 0
        ? params.min_justification_chars
        : 50,
  };
}

/** Erreurs bloquant le "Trancher". [] = décision prête. */
export function validateDecision(
  choices: string[],
  justification: string,
  config: DecisionConfig,
): string[] {
  const errors: string[] = [];
  if (choices.length === 0) {
    errors.push("Choisissez au moins une option.");
  }
  if (choices.length > config.maxChoices) {
    errors.push(`Au plus ${config.maxChoices} option(s) peuvent être choisies.`);
  }
  if (
    config.requireJustification &&
    justification.trim().length < config.minJustificationChars
  ) {
    errors.push(
      `La justification doit faire au moins ${config.minJustificationChars} caractères.`,
    );
  }
  return errors;
}

/**
 * Partitionne les critères du step : "structurels" (id commençant par
 * choice_ → observation déterministe) vs "observés" (IA).
 */
export function splitCriteria(criteria: StepCriterion[]): {
  structural: StepCriterion[];
  observed: StepCriterion[];
} {
  const structural: StepCriterion[] = [];
  const observed: StepCriterion[] = [];
  for (const c of criteria) {
    (c.id.startsWith(CHOICE_CRITERION_PREFIX) ? structural : observed).push(c);
  }
  return { structural, observed };
}

/**
 * Observation déterministe des critères structurels :
 * "choice_<option_id>" = true ssi <option_id> figure dans les choix.
 */
export function buildDeterministicObservation(
  structural: StepCriterion[],
  choices: string[],
): StepObservation {
  const criteria: Record<string, boolean> = {};
  const evidence: Record<string, string> = {};
  for (const c of structural) {
    const optionId = c.id.slice(CHOICE_CRITERION_PREFIX.length);
    const chosen = choices.includes(optionId);
    criteria[c.id] = chosen;
    evidence[c.id] = chosen
      ? `Option « ${optionId} » choisie par le joueur (observation déterministe).`
      : `Option « ${optionId} » non choisie par le joueur (observation déterministe).`;
  }
  return {
    criteria,
    evidence,
    meta: { model: "deterministic:decision", at: new Date().toISOString() },
  };
}

/**
 * Fusionne l'observation déterministe et l'observation IA.
 * En cas de collision d'id, le déterministe GAGNE (les critères
 * structurels ne sont jamais réinterprétés par l'IA).
 */
export function mergeObservations(
  deterministic: StepObservation,
  observed: StepObservation | null,
): StepObservation {
  if (!observed) return deterministic;
  return {
    criteria: { ...observed.criteria, ...deterministic.criteria },
    evidence: { ...(observed.evidence ?? {}), ...(deterministic.evidence ?? {}) },
    meta: observed.meta ?? deterministic.meta,
  };
}

/** Résumé lisible pour le transcript (audit + matière d'observation). */
export function buildSummary(
  options: DecisionOption[],
  choices: string[],
  justification: string,
): string {
  const labels = choices.map(
    (id) => options.find((o) => o.id === id)?.label ?? id,
  );
  const head = `Décision : ${labels.join(" ; ")}`;
  const j = justification.trim();
  return j.length > 0 ? `${head}\n\nJustification :\n${j}` : head;
}

/** Output conforme au manifest : { choice, choices, justification }. */
export function buildOutput(
  choices: string[],
  justification: string,
): { choice: Json; choices: string[]; justification: string } {
  return {
    choice: choices[0] ?? null,
    choices: [...choices],
    justification: justification.trim(),
  };
}

/** Restaure la sélection persistée (reprise après refresh). */
export function restoreDecision(scratch: JsonObject): {
  choices: string[];
  justification: string;
} {
  const choices = Array.isArray(scratch.choices)
    ? scratch.choices.filter((c): c is string => typeof c === "string")
    : [];
  const justification =
    typeof scratch.justification === "string" ? scratch.justification : "";
  return { choices, justification };
}

/** Garde-fou au validate:scenarios — retourne [] si les params sont valides. */
export function validateParams(params: JsonObject): string[] {
  const errors: string[] = [];
  if (typeof params.instructions !== "string" || params.instructions.trim().length === 0) {
    errors.push("params.instructions doit être une string non vide");
  }
  if (!Array.isArray(params.options) || params.options.length < 2) {
    errors.push("params.options doit être un tableau d'au moins 2 options");
  } else {
    const parsed = parseOptions(params);
    if (parsed.length !== params.options.length) {
      errors.push(
        "chaque option doit avoir id, label (strings non vides) et description (string)",
      );
    }
    const ids = parsed.map((o) => o.id);
    if (new Set(ids).size !== ids.length) {
      errors.push("les id de params.options doivent être uniques");
    }
  }
  if (
    params.max_choices !== undefined &&
    (typeof params.max_choices !== "number" ||
      !Number.isInteger(params.max_choices) ||
      params.max_choices < 1)
  ) {
    errors.push("params.max_choices doit être un entier ≥ 1");
  }
  if (
    params.require_justification !== undefined &&
    typeof params.require_justification !== "boolean"
  ) {
    errors.push("params.require_justification doit être un booléen");
  }
  if (
    params.min_justification_chars !== undefined &&
    (typeof params.min_justification_chars !== "number" ||
      params.min_justification_chars < 0)
  ) {
    errors.push("params.min_justification_chars doit être un nombre ≥ 0");
  }
  return errors;
}
