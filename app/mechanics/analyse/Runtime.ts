/**
 * analyse/Runtime — logique pure (node-safe, sans React ni I/O).
 * Parse des params, validation des saisies, construction de l'output.
 */

import type { JsonObject } from "@/app/lib/engine/mechanics";

export interface FindingsPrompt {
  id: string;
  label: string;
  placeholder?: string;
}

/** Parse défensif de params.findings_prompts (ignore les entrées invalides). */
export function parseFindingsPrompts(params: JsonObject): FindingsPrompt[] {
  if (!Array.isArray(params.findings_prompts)) return [];
  const out: FindingsPrompt[] = [];
  for (const raw of params.findings_prompts) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) continue;
    const o = raw as JsonObject;
    if (typeof o.id !== "string" || o.id.length === 0) continue;
    if (typeof o.label !== "string" || o.label.length === 0) continue;
    const prompt: FindingsPrompt = { id: o.id, label: o.label };
    if (typeof o.placeholder === "string") prompt.placeholder = o.placeholder;
    out.push(prompt);
  }
  return out;
}

/** Une erreur par champ vide (après trim). [] = analyse prête à valider. */
export function validateFindings(
  prompts: FindingsPrompt[],
  findings: Record<string, string>,
): string[] {
  const errors: string[] = [];
  for (const p of prompts) {
    if ((findings[p.id] ?? "").trim().length === 0) {
      errors.push(`Le champ « ${p.label} » est vide.`);
    }
  }
  return errors;
}

/** Résumé lisible pour le transcript (audit + matière d'observation). */
export function buildSummary(
  prompts: FindingsPrompt[],
  findings: Record<string, string>,
): string {
  return prompts
    .map((p) => `${p.label} :\n${(findings[p.id] ?? "").trim()}`)
    .join("\n\n");
}

/**
 * Output conforme au manifest : { findings: { id: texte } }.
 * Seules les clés déclarées dans findings_prompts sont conservées.
 */
export function buildOutput(
  prompts: FindingsPrompt[],
  findings: Record<string, string>,
): { findings: JsonObject } {
  const clean: JsonObject = {};
  for (const p of prompts) clean[p.id] = (findings[p.id] ?? "").trim();
  return { findings: clean };
}

/** Restaure les brouillons persistés dans le scratch (reprise après refresh). */
export function restoreFindings(scratch: JsonObject): Record<string, string> {
  const raw = scratch.findings;
  if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

/** Garde-fou au validate:scenarios — retourne [] si les params sont valides. */
export function validateParams(params: JsonObject): string[] {
  const errors: string[] = [];
  if (typeof params.instructions !== "string" || params.instructions.trim().length === 0) {
    errors.push("params.instructions doit être une string non vide");
  }
  if (!Array.isArray(params.findings_prompts) || params.findings_prompts.length === 0) {
    errors.push("params.findings_prompts doit être un tableau non vide");
  } else {
    const parsed = parseFindingsPrompts(params);
    if (parsed.length !== params.findings_prompts.length) {
      errors.push(
        "chaque entrée de params.findings_prompts doit avoir id et label (strings non vides)",
      );
    }
    const ids = parsed.map((p) => p.id);
    if (new Set(ids).size !== ids.length) {
      errors.push("les id de params.findings_prompts doivent être uniques");
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
