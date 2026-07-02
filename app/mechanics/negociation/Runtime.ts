/**
 * negociation/Runtime — logique pure (node-safe, sans React ni I/O).
 * Parse des termes, formatage des propositions, construction de
 * l'accord et de l'output.
 */

import type { Json, JsonObject } from "@/app/lib/engine/mechanics";

export interface TermDef {
  id: string;
  label: string;
  type: "number" | "text";
  /** Valeur d'ouverture affichée dans le champ (toujours une string UI). */
  opening?: string;
}

/** Parse défensif de params.terms (ignore les entrées invalides). */
export function parseTerms(params: JsonObject): TermDef[] {
  if (!Array.isArray(params.terms)) return [];
  const out: TermDef[] = [];
  for (const raw of params.terms) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) continue;
    const o = raw as JsonObject;
    if (typeof o.id !== "string" || o.id.length === 0) continue;
    if (typeof o.label !== "string" || o.label.length === 0) continue;
    if (o.type !== "number" && o.type !== "text") continue;
    const term: TermDef = { id: o.id, label: o.label, type: o.type };
    if (typeof o.opening === "string") term.opening = o.opening;
    else if (typeof o.opening === "number") term.opening = String(o.opening);
    out.push(term);
  }
  return out;
}

/** Valeurs initiales des champs : opening du scénario, sinon vide. */
export function initialTermValues(terms: TermDef[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const t of terms) values[t.id] = t.opening ?? "";
  return values;
}

/** Erreurs bloquant une proposition/conclusion. [] = termes valides. */
export function validateTermValues(
  terms: TermDef[],
  values: Record<string, string>,
): string[] {
  const errors: string[] = [];
  for (const t of terms) {
    const raw = (values[t.id] ?? "").trim();
    if (raw.length === 0) {
      errors.push(`Le terme « ${t.label} » est vide.`);
    } else if (t.type === "number" && !Number.isFinite(Number(raw))) {
      errors.push(`Le terme « ${t.label} » doit être un nombre.`);
    }
  }
  return errors;
}

/** Message joueur structuré : "Je propose : <label> : <valeur> ; …". */
export function formatProposal(
  terms: TermDef[],
  values: Record<string, string>,
): string {
  const parts = terms.map((t) => `${t.label} : ${(values[t.id] ?? "").trim()}`);
  return `Je propose : ${parts.join(" ; ")}`;
}

/**
 * Valeur finale d'un terme : number → nombre (si parseable, sinon la
 * saisie brute, pour rester auditable), text → string trimmée.
 */
export function coerceTermValue(term: TermDef, raw: string): Json {
  const trimmed = raw.trim();
  if (term.type === "number") {
    const n = Number(trimmed);
    return trimmed.length > 0 && Number.isFinite(n) ? n : trimmed;
  }
  return trimmed;
}

/** Accord conforme au contrat : { concluded, terms: {id: valeur} }. */
export function buildAgreement(
  concluded: boolean,
  terms: TermDef[],
  values: Record<string, string>,
): { concluded: boolean; terms: JsonObject } {
  const agreed: JsonObject = {};
  for (const t of terms) agreed[t.id] = coerceTermValue(t, values[t.id] ?? "");
  return { concluded, terms: agreed };
}

/** Output conforme au manifest : { agreement, proposals_count }. */
export function buildOutput(
  agreement: { concluded: boolean; terms: JsonObject },
  proposalsCount: number,
): { agreement: JsonObject; proposals_count: number } {
  return {
    agreement: { concluded: agreement.concluded, terms: agreement.terms },
    proposals_count: proposalsCount,
  };
}

/** Restaure l'état persisté (reprise après refresh). */
export function restoreNegotiation(
  scratch: JsonObject,
  terms: TermDef[],
): { values: Record<string, string>; proposals: JsonObject[] } {
  const values = initialTermValues(terms);
  const savedValues = scratch.terms;
  if (
    savedValues !== null &&
    savedValues !== undefined &&
    typeof savedValues === "object" &&
    !Array.isArray(savedValues)
  ) {
    for (const [k, v] of Object.entries(savedValues)) {
      if (k in values && typeof v === "string") values[k] = v;
    }
  }
  const proposals = Array.isArray(scratch.proposals)
    ? scratch.proposals.filter(
        (p): p is JsonObject =>
          p !== null && typeof p === "object" && !Array.isArray(p),
      )
    : [];
  return { values, proposals };
}

/** Garde-fou au validate:scenarios — retourne [] si les params sont valides. */
export function validateParams(params: JsonObject): string[] {
  const errors: string[] = [];
  if (typeof params.actor_id !== "string" || params.actor_id.trim().length === 0) {
    errors.push("params.actor_id doit être une string non vide");
  }
  if (typeof params.instructions !== "string" || params.instructions.trim().length === 0) {
    errors.push("params.instructions doit être une string non vide");
  }
  if (!Array.isArray(params.terms) || params.terms.length === 0) {
    errors.push("params.terms doit être un tableau non vide");
  } else {
    const parsed = parseTerms(params);
    if (parsed.length !== params.terms.length) {
      errors.push(
        'chaque terme doit avoir id, label (strings non vides), type "number" ou "text", et opening string|number si présent',
      );
    }
    const ids = parsed.map((t) => t.id);
    if (new Set(ids).size !== ids.length) {
      errors.push("les id de params.terms doivent être uniques");
    }
  }
  for (const key of ["directive", "opening_message"] as const) {
    if (params[key] !== undefined && typeof params[key] !== "string") {
      errors.push(`params.${key} doit être une string`);
    }
  }
  return errors;
}
