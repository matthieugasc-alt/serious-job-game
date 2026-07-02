#!/usr/bin/env node
/**
 * validate:scenarios:v2 — garde-fou des scénarios v2 (format mécaniques).
 *
 * Vérifie tous les scenarios/<dir>/scenario.json avec format === "v2" :
 *   structure top-level, mécaniques connues (schema/mechanics.json),
 *   params requis, inputs_from (référence arrière + clés d'output),
 *   critères + completion_rules, endings.
 *
 * Duplique volontairement la logique de app/lib/engine/composer.ts en
 * version mjs (node sans TS). Le test composer.parity.test.ts vérifie
 * que les deux implémentations rendent les mêmes verdicts sur les
 * mêmes fixtures — pas de dérive silencieuse.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mechanicsSpec = JSON.parse(
  readFileSync(join(root, "schema", "mechanics.json"), "utf8"),
);
const manifests = Object.fromEntries(
  mechanicsSpec.mechanics.map((m) => [m.id, m]),
);

export function validateScenarioV2(scenario) {
  const issues = [];
  const push = (code, stepId, message) => issues.push({ code, stepId, message });

  for (const key of ["scenario_id", "version", "locale", "meta", "actors", "documents", "sequence", "endings"]) {
    if (scenario[key] === undefined) push("MISSING_SECTION", null, `Section top-level manquante : ${key}`);
  }
  if (issues.length > 0) return issues;

  const actorIds = new Set(scenario.actors.map((a) => a.actor_id));
  for (const a of scenario.actors) {
    for (const k of ["actor_id", "name", "role", "prompt"]) {
      if (typeof a[k] !== "string" || a[k].length === 0)
        push("BAD_ACTOR", null, `Acteur ${a.actor_id ?? "?"} : champ "${k}" manquant`);
    }
  }
  const seen = new Map();

  for (const step of scenario.sequence) {
    if (seen.has(step.step_id)) push("DUPLICATE_STEP_ID", step.step_id, `step_id dupliqué`);

    const manifest = manifests[step.mechanic];
    if (!manifest) {
      push("UNKNOWN_MECHANIC", step.step_id, `Mécanique inconnue : "${step.mechanic}"`);
      seen.set(step.step_id, step);
      continue;
    }
    for (const key of manifest.required_params) {
      if (step.params?.[key] === undefined)
        push("MISSING_PARAM", step.step_id, `Param requis manquant pour ${step.mechanic} : "${key}"`);
    }
    for (const [k, v] of Object.entries(step.params ?? {})) {
      if ((k === "actor_id" || k.endsWith("_actor")) && typeof v === "string" && !actorIds.has(v))
        push("UNKNOWN_ACTOR_REF", step.step_id, `params.${k} → acteur inconnu "${v}"`);
    }
    for (const [alias, ref] of Object.entries(step.inputs ?? {})) {
      const parts = String(ref).split(".");
      const [srcId, key] = parts;
      const src = seen.get(srcId);
      if (parts.length > 2) push("BAD_INPUT_REF", step.step_id, `inputs.${alias} : "${ref}" invalide`);
      else if (!src) {
        const later = scenario.sequence.some((s) => s.step_id === srcId);
        push(later ? "INPUT_REF_FORWARD" : "BAD_INPUT_REF", step.step_id,
          later ? `inputs.${alias} : "${srcId}" déclaré après ce step` : `inputs.${alias} : step source inconnu "${srcId}"`);
      } else if (key !== undefined) {
        const srcManifest = manifests[src.mechanic];
        if (srcManifest && !srcManifest.output_keys.includes(key))
          push("UNKNOWN_OUTPUT_KEY", step.step_id, `inputs.${alias} : "${key}" hors output_keys de ${src.mechanic}`);
      }
    }
    const criteria = step.evaluation?.observed_criteria ?? [];
    if (criteria.length === 0) push("NO_CRITERIA", step.step_id, "Aucun observed_criteria");
    for (const c of criteria) {
      if (typeof c.description !== "string" || c.description.length === 0)
        push("BAD_CRITERION", step.step_id, `Critère ${c.id} : description manquante (l'IA ne saura pas quoi observer)`);
      if (c.severity && !["critical", "required", "bonus", "minor"].includes(c.severity))
        push("BAD_CRITERION", step.step_id, `Critère ${c.id} : severity inconnue "${c.severity}"`);
    }
    const rules = step.completion_rules ?? {};
    const hasRule = (rules.required_criteria?.length ?? 0) > 0 ||
      (typeof rules.min_criteria_count === "number" && rules.min_criteria_count > 0);
    if (!hasRule) push("NO_COMPLETION_RULE", step.step_id, "Aucune completion_rule");
    const ids = new Set(criteria.map((c) => c.id));
    for (const id of rules.required_criteria ?? []) {
      if (!ids.has(id)) push("UNKNOWN_REQUIRED_CRITERION", step.step_id, `required_criteria → critère non déclaré "${id}"`);
    }
    seen.set(step.step_id, step);
  }

  const defaults = (scenario.endings ?? []).filter((e) => e.default).length;
  if ((scenario.endings ?? []).length === 0 || defaults !== 1)
    push("BAD_ENDINGS", null, `Exactement un ending default requis (trouvé : ${defaults})`);
  const stepIds = new Set(scenario.sequence.map((s) => s.step_id));
  for (const e of scenario.endings ?? []) {
    for (const id of e.requires_passed ?? []) {
      if (!stepIds.has(id)) push("BAD_ENDINGS", null, `ending "${e.id}" : step inconnu "${id}"`);
    }
  }
  return issues;
}

// ─── CLI ───
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const scenariosDir = join(root, "scenarios");
  let checked = 0;
  let failed = 0;
  for (const dir of readdirSync(scenariosDir)) {
    const file = join(scenariosDir, dir, "scenario.json");
    if (!existsSync(file)) continue;
    const scenario = JSON.parse(readFileSync(file, "utf8"));
    if (scenario.format !== "v2") continue;
    checked += 1;
    const issues = validateScenarioV2(scenario);
    if (issues.length > 0) {
      failed += 1;
      console.error(`\n✗ ${dir}`);
      for (const i of issues)
        console.error(`  [${i.code}${i.stepId ? ` · ${i.stepId}` : ""}] ${i.message}`);
    } else {
      console.log(`✓ ${dir}`);
    }
  }
  console.log(`\n${checked} scénario(s) v2 vérifié(s), ${failed} en échec.`);
  process.exit(failed > 0 ? 1 : 0);
}
