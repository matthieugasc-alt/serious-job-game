#!/usr/bin/env node
/**
 * validate:scenarios:v3 — garde-fou des scénarios v3 (format workspace).
 *
 * Vérifie tous les scenarios/<dir>/scenario.json avec format === "v3" :
 *   structure top-level, mécaniques headless connues
 *   (schema/mechanics-v3.json), params requis, inputs, critères +
 *   completion_rules, endings — PLUS les règles v3 : completion.trigger
 *   obligatoire et bien formé, refs acteur/critère/document/tool/fil,
 *   events narratifs bien formés.
 *
 * Duplique volontairement la logique de app/lib/engine/composerV3.ts en
 * version mjs (node sans TS) — même dualité que le v2. Le test
 * composerV3.parity.test.ts vérifie que les deux implémentations
 * rendent les mêmes codes sur les mêmes fixtures.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const registry = JSON.parse(
  readFileSync(join(root, "schema", "mechanics-v3.json"), "utf8"),
);
export const V3_SPECS = Object.fromEntries(
  registry.mechanics.map((m) => [m.id, m]),
);
export const V3_TOOLS = registry.tools;

const TRIGGER_TYPES = new Set([
  "mail_sent", "message_sent", "message_received", "contract_signed",
  "contract_rejected", "deliverable_submitted", "document_opened",
  "timer_elapsed", "criterion_observed", "actor_validation", "manual",
  "all", "any",
]);
const ACTION_TYPES = new Set([
  "message_sent", "mail_sent", "mail_opened", "mail_draft_saved",
  "document_opened", "document_annotated", "tool_state_changed",
  "contract_signed", "contract_rejected", "deliverable_submitted",
  "notification_read", "manual_trigger", "clock_tick",
]);
const WHEN_TYPES = new Set(["step_start", "delay", "after_action", "on_retry", "on_step_passed"]);
const EFFECT_TYPES = new Set(["message_received", "mail_received", "notification", "actor_reply"]);

export function validateScenarioV3(scenario, specs = V3_SPECS, tools = V3_TOOLS) {
  const issues = [];
  const push = (code, stepId, message) => issues.push({ code, stepId, message });

  for (const key of ["scenario_id", "version", "locale", "meta", "actors", "documents", "sequence", "endings"]) {
    if (scenario[key] === undefined) push("MISSING_SECTION", null, `Section top-level manquante : ${key}`);
  }
  if (issues.length > 0) return issues;

  const actorIds = new Set(scenario.actors.map((a) => a.actor_id));
  const documentIds = new Set(scenario.documents.map((d) => d.id));
  const toolIds = new Set(tools);
  for (const a of scenario.actors) {
    for (const k of ["actor_id", "name", "role", "prompt"]) {
      if (typeof a[k] !== "string" || a[k].length === 0)
        push("BAD_ACTOR", null, `Acteur ${a.actor_id ?? "?"} : champ "${k}" manquant`);
    }
  }

  const seen = new Map();
  const knownThreadIds = new Set();

  const validateTrigger = (t, stepId, criterionIds) => {
    if (!t || typeof t !== "object" || !TRIGGER_TYPES.has(t.type)) {
      push("BAD_TRIGGER", stepId, `trigger : type inconnu "${t?.type ?? "?"}"`);
      return;
    }
    if (t.min_count !== undefined && (!Number.isInteger(t.min_count) || t.min_count < 1))
      push("BAD_TRIGGER", stepId, `trigger ${t.type} : min_count doit être un entier ≥ 1`);
    switch (t.type) {
      case "all":
      case "any":
        if (!Array.isArray(t.of) || t.of.length === 0)
          push("BAD_TRIGGER", stepId, `trigger ${t.type} : la liste "of" ne peut pas être vide`);
        else for (const sub of t.of) validateTrigger(sub, stepId, criterionIds);
        break;
      case "mail_sent":
        if (t.to !== undefined && !actorIds.has(t.to))
          push("UNKNOWN_TRIGGER_REF", stepId, `trigger mail_sent : destinataire inconnu "${t.to}"`);
        break;
      case "message_sent":
        if (t.to_actor !== undefined && !actorIds.has(t.to_actor))
          push("UNKNOWN_TRIGGER_REF", stepId, `trigger message_sent : acteur inconnu "${t.to_actor}"`);
        break;
      case "message_received":
        if (!actorIds.has(t.from_actor))
          push("UNKNOWN_TRIGGER_REF", stepId, `trigger message_received : acteur inconnu "${t.from_actor}"`);
        break;
      case "actor_validation":
        if (!actorIds.has(t.actor))
          push("UNKNOWN_TRIGGER_REF", stepId, `trigger actor_validation : acteur inconnu "${t.actor}"`);
        break;
      case "criterion_observed":
        if (!criterionIds.has(t.criterion))
          push("UNKNOWN_TRIGGER_REF", stepId, `trigger criterion_observed : critère non déclaré "${t.criterion}"`);
        break;
      case "document_opened":
        if (!documentIds.has(t.document_id))
          push("UNKNOWN_TRIGGER_REF", stepId, `trigger document_opened : document inconnu "${t.document_id}"`);
        break;
      case "deliverable_submitted":
        if (t.tool !== undefined && !toolIds.has(t.tool))
          push("UNKNOWN_TOOL", stepId, `trigger deliverable_submitted : tool inconnu "${t.tool}"`);
        break;
      case "timer_elapsed":
        if (typeof t.seconds !== "number" || !(t.seconds > 0))
          push("BAD_TRIGGER", stepId, "trigger timer_elapsed : seconds doit être un nombre > 0");
        if (t.from !== undefined && t.from !== "step_start" && t.from !== "scenario_start")
          push("BAD_TRIGGER", stepId, `trigger timer_elapsed : from invalide "${t.from}"`);
        break;
      case "manual":
        if (typeof t.label !== "string" || t.label.length === 0)
          push("BAD_TRIGGER", stepId, "trigger manual : label requis");
        break;
    }
  };

  for (const step of scenario.sequence) {
    if (seen.has(step.step_id)) push("DUPLICATE_STEP_ID", step.step_id, "step_id dupliqué");

    const manifest = specs[step.mechanic];
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
        const srcManifest = specs[src.mechanic];
        if (srcManifest && !srcManifest.output_keys.includes(key))
          push("UNKNOWN_OUTPUT_KEY", step.step_id, `inputs.${alias} : "${key}" hors output_keys de ${src.mechanic}`);
      }
    }

    const criteria = step.evaluation?.observed_criteria ?? [];
    if (criteria.length === 0) push("NO_CRITERIA", step.step_id, "Aucun observed_criteria");
    for (const c of criteria) {
      if (typeof c.description !== "string" || c.description.length === 0)
        push("BAD_CRITERION", step.step_id, `Critère ${c.id} : description manquante`);
      if (c.severity && !["critical", "required", "bonus", "minor"].includes(c.severity))
        push("BAD_CRITERION", step.step_id, `Critère ${c.id} : severity inconnue "${c.severity}"`);
    }
    const rules = step.completion_rules ?? {};
    const hasRule = (rules.required_criteria?.length ?? 0) > 0 ||
      (typeof rules.min_criteria_count === "number" && rules.min_criteria_count > 0);
    if (!hasRule) push("NO_COMPLETION_RULE", step.step_id, "Aucune completion_rule");
    const criterionIds = new Set(criteria.map((c) => c.id));
    for (const id of rules.required_criteria ?? []) {
      if (!criterionIds.has(id))
        push("UNKNOWN_REQUIRED_CRITERION", step.step_id, `required_criteria → critère non déclaré "${id}"`);
    }

    // ── v3 : threads ──
    const stepThreadIds = new Set();
    for (const t of step.threads ?? []) {
      if (stepThreadIds.has(t.thread_id))
        push("BAD_THREAD", step.step_id, `thread_id dupliqué dans le step : "${t.thread_id}"`);
      stepThreadIds.add(t.thread_id);
      knownThreadIds.add(t.thread_id);
      if (!Array.isArray(t.participants) || t.participants.length === 0)
        push("BAD_THREAD", step.step_id, `thread "${t.thread_id}" : au moins un participant IA requis`);
      for (const p of t.participants ?? []) {
        if (!actorIds.has(p))
          push("BAD_THREAD", step.step_id, `thread "${t.thread_id}" : participant inconnu "${p}"`);
      }
    }

    // ── v3 : tools ──
    for (const tc of step.tools ?? []) {
      if (!toolIds.has(tc.tool))
        push("UNKNOWN_TOOL", step.step_id, `tools : "${tc.tool}" absent du registre`);
    }

    // ── v3 : document_ids ──
    for (const id of step.document_ids ?? []) {
      if (!documentIds.has(id))
        push("UNKNOWN_DOCUMENT_REF", step.step_id, `document_ids : document inconnu "${id}"`);
    }

    // ── v3 : events narratifs ──
    const seenEventIds = new Set();
    for (const ev of step.events ?? []) {
      if (typeof ev.event_id !== "string" || ev.event_id.length === 0) {
        push("BAD_EVENT", step.step_id, "event : event_id requis");
        continue;
      }
      if (seenEventIds.has(ev.event_id))
        push("BAD_EVENT", step.step_id, `event "${ev.event_id}" : event_id dupliqué dans le step`);
      seenEventIds.add(ev.event_id);
      const when = ev.when;
      if (!when || !WHEN_TYPES.has(when.type))
        push("BAD_EVENT", step.step_id, `event "${ev.event_id}" : when.type inconnu "${when?.type ?? "?"}"`);
      else if (when.type === "delay" && (typeof when.seconds !== "number" || !(when.seconds > 0)))
        push("BAD_EVENT", step.step_id, `event "${ev.event_id}" : delay.seconds doit être > 0`);
      else if (when.type === "after_action" && !ACTION_TYPES.has(when.action))
        push("BAD_EVENT", step.step_id, `event "${ev.event_id}" : after_action.action inconnue "${when.action}"`);
      const effect = ev.effect;
      if (!effect || !EFFECT_TYPES.has(effect.type)) {
        push("BAD_EVENT", step.step_id, `event "${ev.event_id}" : effect.type inconnu "${effect?.type ?? "?"}"`);
        continue;
      }
      if (effect.type === "message_received" || effect.type === "actor_reply") {
        if (!actorIds.has(effect.actor_id))
          push("BAD_EVENT", step.step_id, `event "${ev.event_id}" : acteur inconnu "${effect.actor_id}"`);
        if (!knownThreadIds.has(effect.thread_id))
          push("BAD_EVENT", step.step_id, `event "${ev.event_id}" : fil inconnu "${effect.thread_id}"`);
      }
      if (effect.type === "mail_received") {
        if (!actorIds.has(effect.from_actor))
          push("BAD_EVENT", step.step_id, `event "${ev.event_id}" : acteur inconnu "${effect.from_actor}"`);
        for (const id of effect.attachment_document_ids ?? []) {
          if (!documentIds.has(id))
            push("UNKNOWN_DOCUMENT_REF", step.step_id, `event "${ev.event_id}" : pièce jointe inconnue "${id}"`);
        }
      }
    }

    // ── v3 : completion.trigger OBLIGATOIRE ──
    const trigger = step.completion?.trigger;
    if (!trigger)
      push("MISSING_TRIGGER", step.step_id, "completion.trigger manquant — aucune complétion implicite en v3");
    else validateTrigger(trigger, step.step_id, criterionIds);

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
  const dirs = existsSync(scenariosDir) ? readdirSync(scenariosDir) : [];
  for (const dir of dirs) {
    const file = join(scenariosDir, dir, "scenario.json");
    if (!existsSync(file)) continue;
    const scenario = JSON.parse(readFileSync(file, "utf8"));
    if (scenario.format !== "v3") continue;
    checked += 1;
    const issues = validateScenarioV3(scenario);
    if (issues.length > 0) {
      failed += 1;
      console.error(`\n✗ ${dir}`);
      for (const i of issues)
        console.error(`  [${i.code}${i.stepId ? ` · ${i.stepId}` : ""}] ${i.message}`);
    } else {
      console.log(`✓ ${dir}`);
    }
  }
  console.log(`\n${checked} scénario(s) v3 vérifié(s), ${failed} en échec.`);
  process.exit(failed > 0 ? 1 : 0);
}
