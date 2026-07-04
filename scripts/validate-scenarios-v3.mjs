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
  "timer_elapsed", "criterion_observed", "actor_validation",
  "mail_scored", "mail_scored_below", "manual",
  "all", "any",
]);
/** Nœuds de trigger autorisés à porter bind_actor (chantier B). */
const BINDABLE_TRIGGER_TYPES = new Set(["mail_sent", "message_sent", "any"]);

/** Le trigger (ou un sous-trigger) mentionne-t-il un des types donnés ? */
function triggerTreeMentions(trigger, types) {
  if (!trigger || typeof trigger !== "object") return false;
  if (types.includes(trigger.type)) return true;
  if (trigger.type === "all" || trigger.type === "any") {
    return (trigger.of ?? []).some((t) => triggerTreeMentions(t, types));
  }
  return false;
}

/** Collecte les alias bind_actor déclarés dans un arbre de trigger. */
function collectBindAliases(trigger, into) {
  if (!trigger || typeof trigger !== "object") return;
  if (typeof trigger.bind_actor === "string" && trigger.bind_actor.length > 0) {
    into.add(trigger.bind_actor);
  }
  if (trigger.type === "all" || trigger.type === "any") {
    for (const sub of trigger.of ?? []) collectBindAliases(sub, into);
  }
}
const ACTION_TYPES = new Set([
  "message_sent", "mail_sent", "mail_opened", "mail_draft_saved",
  "document_opened", "document_annotated", "tool_state_changed", "tool_op",
  "contract_signed", "contract_rejected", "deliverable_submitted",
  "notification_read", "manual_trigger", "clock_tick",
]);
/** Tools persistants : jamais réinitialisés par un exit goto (TOOL_BLOC_NOTES.md §1). */
const NON_RESETTABLE_TOOLS = new Set(["bloc-notes"]);
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

  const endingIds = new Set((scenario.endings ?? []).map((e) => e.id));
  const allStepIds = new Set(scenario.sequence.map((s) => s.step_id));
  const seen = new Map();
  const knownThreadIds = new Set();
  /** Alias liés par les steps ANTÉRIEURS (chantier B). */
  const boundAliases = new Set();
  const actorOk = (ref) => actorIds.has(ref) || boundAliases.has(ref);

  const validateTrigger = (t, stepId, criterionIds, actorRefOk = actorOk) => {
    if (!t || typeof t !== "object" || !TRIGGER_TYPES.has(t.type)) {
      push("BAD_TRIGGER", stepId, `trigger : type inconnu "${t?.type ?? "?"}"`);
      return;
    }
    if (t.min_count !== undefined && (!Number.isInteger(t.min_count) || t.min_count < 1))
      push("BAD_TRIGGER", stepId, `trigger ${t.type} : min_count doit être un entier ≥ 1`);
    // Chantier B : bind_actor — placement, forme, non-collision.
    if (t.bind_actor !== undefined) {
      if (!BINDABLE_TRIGGER_TYPES.has(t.type))
        push("BAD_TRIGGER", stepId, `trigger ${t.type} : bind_actor n'est autorisé que sur mail_sent, message_sent et any`);
      else if (typeof t.bind_actor !== "string" || t.bind_actor.length === 0)
        push("BAD_TRIGGER", stepId, `trigger ${t.type} : bind_actor doit être une chaîne non vide`);
      else if (actorIds.has(t.bind_actor))
        push("BAD_TRIGGER", stepId, `trigger ${t.type} : l'alias bind_actor "${t.bind_actor}" entre en collision avec un actor_id déclaré`);
    }
    switch (t.type) {
      case "all":
      case "any":
        if (!Array.isArray(t.of) || t.of.length === 0)
          push("BAD_TRIGGER", stepId, `trigger ${t.type} : la liste "of" ne peut pas être vide`);
        else for (const sub of t.of) validateTrigger(sub, stepId, criterionIds, actorRefOk);
        break;
      case "mail_sent":
        if (t.to !== undefined && !actorRefOk(t.to))
          push("UNKNOWN_TRIGGER_REF", stepId, `trigger mail_sent : destinataire inconnu "${t.to}"`);
        break;
      case "message_sent":
        if (t.to_actor !== undefined && !actorRefOk(t.to_actor))
          push("UNKNOWN_TRIGGER_REF", stepId, `trigger message_sent : acteur inconnu "${t.to_actor}"`);
        break;
      case "message_received":
        if (!actorRefOk(t.from_actor))
          push("UNKNOWN_TRIGGER_REF", stepId, `trigger message_received : acteur inconnu "${t.from_actor}"`);
        break;
      case "actor_validation":
        if (!actorRefOk(t.actor))
          push("UNKNOWN_TRIGGER_REF", stepId, `trigger actor_validation : acteur inconnu "${t.actor}"`);
        break;
      case "mail_scored":
      case "mail_scored_below":
        if (typeof t.min_score !== "number" || t.min_score < 0)
          push("BAD_TRIGGER", stepId, `trigger ${t.type} : min_score doit être un nombre ≥ 0`);
        if (t.scale !== undefined && (typeof t.scale !== "number" || !(t.scale > 0)))
          push("BAD_TRIGGER", stepId, `trigger ${t.type} : scale doit être un nombre > 0`);
        else if (typeof t.min_score === "number" && typeof t.scale === "number" && t.min_score > t.scale)
          push("BAD_TRIGGER", stepId, `trigger ${t.type} : min_score (${t.min_score}) dépasse scale (${t.scale})`);
        if (t.to !== undefined && !actorRefOk(t.to))
          push("UNKNOWN_TRIGGER_REF", stepId, `trigger ${t.type} : destinataire inconnu "${t.to}"`);
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
      if ((k === "actor_id" || k.endsWith("_actor")) && typeof v === "string" && !actorOk(v))
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
        if (!actorOk(p))
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
        if (!actorOk(effect.actor_id))
          push("BAD_EVENT", step.step_id, `event "${ev.event_id}" : acteur inconnu "${effect.actor_id}"`);
        if (!knownThreadIds.has(effect.thread_id))
          push("BAD_EVENT", step.step_id, `event "${ev.event_id}" : fil inconnu "${effect.thread_id}"`);
      }
      if (effect.type === "mail_received") {
        if (!actorOk(effect.from_actor))
          push("BAD_EVENT", step.step_id, `event "${ev.event_id}" : acteur inconnu "${effect.from_actor}"`);
        for (const id of effect.attachment_document_ids ?? []) {
          if (!documentIds.has(id))
            push("UNKNOWN_DOCUMENT_REF", step.step_id, `event "${ev.event_id}" : pièce jointe inconnue "${id}"`);
        }
      }
    }

    // ── v3 : completion — trigger (sucre) OU exits (chantier A) ──
    const completion = step.completion ?? {};
    const trigger = completion.trigger;
    const exitsDeclared = completion.exits !== undefined;
    const hasExits = Array.isArray(completion.exits) && completion.exits.length > 0;

    if (!trigger && !hasExits)
      push("MISSING_TRIGGER", step.step_id, "completion.trigger ou completion.exits manquant — aucune complétion implicite en v3");
    if (exitsDeclared && !hasExits)
      push("BAD_EXIT", step.step_id, "exits : la liste ne peut pas être vide.");
    if (trigger && hasExits)
      push("BAD_EXIT", step.step_id, "completion : trigger et exits sont exclusifs (trigger = sucre pour une sortie unique).");
    if (trigger) validateTrigger(trigger, step.step_id, criterionIds);

    if (hasExits) {
      const exitIds = new Set();
      let hasGoto = false;
      for (const exit of completion.exits) {
        const id = typeof exit?.id === "string" && exit.id.length > 0 ? exit.id : null;
        if (!id) push("BAD_EXIT", step.step_id, "exit : id requis (chaîne non vide)");
        else if (exitIds.has(id)) push("BAD_EXIT", step.step_id, `exit "${id}" : id dupliqué dans le step`);
        else exitIds.add(id);
        const label = id ?? "?";

        if (!exit?.trigger) push("BAD_EXIT", step.step_id, `exit "${label}" : trigger requis`);
        else validateTrigger(exit.trigger, step.step_id, criterionIds);

        if (exit?.evaluate !== undefined && typeof exit.evaluate !== "boolean")
          push("BAD_EXIT", step.step_id, `exit "${label}" : evaluate doit être un booléen`);

        const route = exit?.route;
        if (route === "next") {
          // ok
        } else if (route && typeof route === "object" && typeof route.goto === "string") {
          hasGoto = true;
          if (!allStepIds.has(route.goto))
            push("BAD_EXIT", step.step_id, `exit "${label}" : goto vers un step inconnu "${route.goto}"`);
        } else if (route && typeof route === "object" && typeof route.end === "string") {
          if (!endingIds.has(route.end))
            push("UNKNOWN_ENDING_REF", step.step_id, `exit "${label}" : ending inconnu "${route.end}"`);
        } else {
          push("BAD_EXIT", step.step_id, `exit "${label}" : route invalide — attendu "next", {"goto": "<step_id>"} ou {"end": "<ending_id>"}`);
        }

        for (const threadId of exit?.reset?.threads ?? []) {
          if (!knownThreadIds.has(threadId))
            push("BAD_EXIT", step.step_id, `exit "${label}" : reset.threads vise un fil inconnu "${threadId}"`);
        }
        for (const toolId of exit?.reset?.tools ?? []) {
          if (!toolIds.has(toolId))
            push("BAD_EXIT", step.step_id, `exit "${label}" : reset.tools vise un tool inconnu "${toolId}"`);
          else if (NON_RESETTABLE_TOOLS.has(toolId))
            push("TOOL_RESET_FORBIDDEN", step.step_id, `exit "${label}" : reset.tools ne peut pas viser "${toolId}" — ce tool est persistant, jamais réinitialisé par une phase (TOOL_BLOC_NOTES.md §1)`);
        }

        // Events de sortie : alias liés par CE trigger disponibles.
        const exitAliases = new Set();
        if (exit?.trigger) collectBindAliases(exit.trigger, exitAliases);
        const exitActorOk = (ref) => actorOk(ref) || exitAliases.has(ref);
        const seenExitEventIds = new Set();
        for (const ev of exit?.events ?? []) {
          if (typeof ev?.event_id !== "string" || ev.event_id.length === 0) {
            push("BAD_EXIT", step.step_id, `exit "${label}" : event sans event_id`);
            continue;
          }
          if (seenExitEventIds.has(ev.event_id))
            push("BAD_EXIT", step.step_id, `exit "${label}" : event_id dupliqué "${ev.event_id}"`);
          seenExitEventIds.add(ev.event_id);
          const effect = ev.effect;
          if (!effect || !EFFECT_TYPES.has(effect.type)) {
            push("BAD_EXIT", step.step_id, `exit "${label}" : event "${ev.event_id}" — effect.type inconnu "${effect?.type ?? "?"}"`);
            continue;
          }
          if (effect.type === "message_received" || effect.type === "actor_reply") {
            if (!exitActorOk(effect.actor_id))
              push("BAD_EXIT", step.step_id, `exit "${label}" : event "${ev.event_id}" — acteur inconnu "${effect.actor_id}"`);
            if (!knownThreadIds.has(effect.thread_id))
              push("BAD_EXIT", step.step_id, `exit "${label}" : event "${ev.event_id}" — fil inconnu "${effect.thread_id}"`);
          }
          if (effect.type === "mail_received") {
            if (!exitActorOk(effect.from_actor))
              push("BAD_EXIT", step.step_id, `exit "${label}" : event "${ev.event_id}" — acteur inconnu "${effect.from_actor}"`);
            for (const docId of effect.attachment_document_ids ?? []) {
              if (!documentIds.has(docId))
                push("UNKNOWN_DOCUMENT_REF", step.step_id, `exit "${label}" : event "${ev.event_id}" — pièce jointe inconnue "${docId}"`);
            }
          }
        }
      }

      if (hasGoto) {
        const fallback = completion.on_goto_exhausted;
        if (!fallback || typeof fallback.end !== "string" || fallback.end.length === 0)
          push("BAD_EXIT", step.step_id, 'on_goto_exhausted: {"end": "<ending_id>"} est OBLIGATOIRE dès qu\'une sortie route en goto (garde-fou anti-boucle)');
        else if (!endingIds.has(fallback.end))
          push("UNKNOWN_ENDING_REF", step.step_id, `on_goto_exhausted : ending inconnu "${fallback.end}"`);
      }
    }

    if (completion.max_gotos !== undefined && (!Number.isInteger(completion.max_gotos) || completion.max_gotos < 1))
      push("BAD_EXIT", step.step_id, "completion.max_gotos doit être un entier ≥ 1.");

    // ── Chantier C : scoring déclaratif ──
    const scoring = step.scoring;
    const mentionsScoring = [trigger, ...(completion.exits ?? []).map((e) => e?.trigger)]
      .filter(Boolean)
      .some((t) => triggerTreeMentions(t, ["mail_scored", "mail_scored_below"]));
    if (mentionsScoring && (typeof scoring?.brief !== "string" || scoring.brief.length === 0))
      push("BAD_SCORING", step.step_id, "un trigger mail_scored / mail_scored_below exige un bloc scoring.brief déclaré sur le step.");
    if (scoring !== undefined) {
      if (typeof scoring.brief !== "string" || scoring.brief.length === 0)
        push("BAD_SCORING", step.step_id, "scoring.brief requis (chaîne non vide).");
      if (scoring.scale !== undefined && (typeof scoring.scale !== "number" || !(scoring.scale > 0)))
        push("BAD_SCORING", step.step_id, "scoring.scale doit être un nombre > 0.");
    }

    // ── Chantier B : alias liés par CE step → disponibles ensuite.
    for (const t of [trigger, ...(completion.exits ?? []).map((e) => e?.trigger)]) {
      if (t) collectBindAliases(t, boundAliases);
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
