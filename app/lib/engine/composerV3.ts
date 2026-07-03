/**
 * ═════════════════════════════════════════════════════════════════
 * Moteur v3 — ComposerV3 : validation statique d'un scénario workspace
 * ═════════════════════════════════════════════════════════════════
 *
 * Reprend TOUTES les règles v2 (steps, params, inputs, critères,
 * completion_rules, endings) et ajoute les règles v3 du contrat :
 *   - completion.trigger OBLIGATOIRE et bien formé (types connus,
 *     all/any non vides) — l'implicite est structurellement impossible
 *   - criterion_observed → critère déclaré dans le step
 *   - actor_validation / message_received / mail_sent.to /
 *     message_sent.to_actor → acteur déclaré
 *   - document_opened → document déclaré
 *   - tools (du step et des triggers) → registre de tools connu
 *   - threads → participants = acteurs déclarés
 *   - events → when/effect bien formés, refs acteur/fil/document valides
 *
 * Parité CLI : scripts/validate-scenarios-v3.mjs (mêmes codes).
 */

import type { Json, JsonObject, StepInvocation } from "./mechanics";
import type { SessionV2State } from "./sessionV2";
import { resolveStepInputs } from "./composer";
import type {
  CompletionTrigger,
  MechanicSpecManifest,
  NarrativeEvent,
  ScenarioV3,
  StepInvocationV3,
  WorkspaceAction,
} from "./workspace";
import type { SessionV3State } from "./sessionV3";

export interface ComposerIssueV3 {
  code:
    // Règles héritées du v2
    | "UNKNOWN_MECHANIC"
    | "DUPLICATE_STEP_ID"
    | "MISSING_PARAM"
    | "BAD_INPUT_REF"
    | "INPUT_REF_FORWARD"
    | "UNKNOWN_OUTPUT_KEY"
    | "UNKNOWN_ACTOR_REF"
    | "NO_CRITERIA"
    | "NO_COMPLETION_RULE"
    | "UNKNOWN_REQUIRED_CRITERION"
    | "BAD_ENDINGS"
    // Règles v3
    | "MISSING_TRIGGER"
    | "BAD_TRIGGER"
    | "UNKNOWN_TRIGGER_REF"
    | "UNKNOWN_TOOL"
    | "BAD_THREAD"
    | "BAD_EVENT"
    | "UNKNOWN_DOCUMENT_REF";
  stepId?: string;
  message: string;
}

const TRIGGER_TYPES = new Set<string>([
  "mail_sent",
  "message_sent",
  "message_received",
  "contract_signed",
  "contract_rejected",
  "deliverable_submitted",
  "document_opened",
  "timer_elapsed",
  "criterion_observed",
  "actor_validation",
  "manual",
  "all",
  "any",
]);

const ACTION_TYPES = new Set<WorkspaceAction["type"]>([
  "message_sent",
  "mail_sent",
  "mail_opened",
  "mail_draft_saved",
  "document_opened",
  "document_annotated",
  "tool_state_changed",
  "contract_signed",
  "contract_rejected",
  "deliverable_submitted",
  "notification_read",
  "manual_trigger",
  "clock_tick",
]);

const WHEN_TYPES = new Set<string>([
  "step_start",
  "delay",
  "after_action",
  "on_retry",
  "on_step_passed",
]);

const EFFECT_TYPES = new Set<string>([
  "message_received",
  "mail_received",
  "notification",
  "actor_reply",
]);

/**
 * Garde-fou statique complet d'un scénario v3 contre les manifests
 * headless et le registre de tools. Utilisé par validate:scenarios:v3
 * ET par le futur WorkspaceShell au chargement.
 */
export function validateScenarioV3(
  scenario: ScenarioV3,
  specs: Record<string, MechanicSpecManifest>,
  tools: string[],
): ComposerIssueV3[] {
  const issues: ComposerIssueV3[] = [];
  const push = (
    code: ComposerIssueV3["code"],
    stepId: string | undefined,
    message: string,
  ) => issues.push(stepId ? { code, stepId, message } : { code, message });

  const actorIds = new Set(scenario.actors.map((a) => a.actor_id));
  const documentIds = new Set(scenario.documents.map((d) => d.id));
  const toolIds = new Set(tools);
  const seen = new Map<string, StepInvocationV3>();
  /** Fils connus (cumulatif : un event peut viser un fil d'un step antérieur). */
  const knownThreadIds = new Set<string>();

  for (const step of scenario.sequence) {
    if (seen.has(step.step_id)) {
      push("DUPLICATE_STEP_ID", step.step_id, `step_id dupliqué : ${step.step_id}`);
    }

    const manifest = specs[step.mechanic];
    if (!manifest) {
      push(
        "UNKNOWN_MECHANIC",
        step.step_id,
        `Mécanique inconnue : "${step.mechanic}". Disponibles : ${Object.keys(specs).join(", ")}`,
      );
      seen.set(step.step_id, step);
      continue;
    }

    for (const key of manifest.required_params) {
      if (step.params?.[key] === undefined) {
        push(
          "MISSING_PARAM",
          step.step_id,
          `Param requis manquant pour ${step.mechanic} : "${key}"`,
        );
      }
    }

    // Convention : tout param *_actor / actor_id référence un acteur déclaré.
    for (const [k, v] of Object.entries(step.params ?? {})) {
      if ((k === "actor_id" || k.endsWith("_actor")) && typeof v === "string") {
        if (!actorIds.has(v)) {
          push(
            "UNKNOWN_ACTOR_REF",
            step.step_id,
            `params.${k} référence un acteur inconnu : "${v}"`,
          );
        }
      }
    }

    // inputs : { alias: "stepId" | "stepId.outputKey" } — steps précédents.
    for (const [alias, ref] of Object.entries(step.inputs ?? {})) {
      const [srcId, key, ...rest] = String(ref).split(".");
      const src = seen.get(srcId);
      if (rest.length > 0) {
        push(
          "BAD_INPUT_REF",
          step.step_id,
          `inputs.${alias} : référence invalide "${ref}" (format attendu : "stepId" ou "stepId.cle")`,
        );
      } else if (!src) {
        const existsLater = scenario.sequence.some((s) => s.step_id === srcId);
        push(
          existsLater ? "INPUT_REF_FORWARD" : "BAD_INPUT_REF",
          step.step_id,
          existsLater
            ? `inputs.${alias} : "${srcId}" est déclaré APRÈS ce step — un input ne peut venir que d'un step précédent`
            : `inputs.${alias} : step source inconnu "${srcId}"`,
        );
      } else if (key !== undefined) {
        const srcManifest = specs[src.mechanic];
        if (srcManifest && !srcManifest.output_keys.includes(key)) {
          push(
            "UNKNOWN_OUTPUT_KEY",
            step.step_id,
            `inputs.${alias} : "${key}" n'est pas une clé d'output de ${src.mechanic} (clés : ${srcManifest.output_keys.join(", ")})`,
          );
        }
      }
    }

    // Évaluation : le contrat IA-observe/moteur-décide reste obligatoire.
    const criteria = step.evaluation?.observed_criteria ?? [];
    if (criteria.length === 0) {
      push(
        "NO_CRITERIA",
        step.step_id,
        "Aucun observed_criteria déclaré — le moteur ne pourra pas décider.",
      );
    }
    const rules = step.completion_rules ?? {};
    const hasRule =
      (rules.required_criteria?.length ?? 0) > 0 ||
      (typeof rules.min_criteria_count === "number" && rules.min_criteria_count > 0);
    if (!hasRule) {
      push(
        "NO_COMPLETION_RULE",
        step.step_id,
        "Aucune completion_rule (required_criteria ou min_criteria_count).",
      );
    }
    const criterionIds = new Set(criteria.map((c) => c.id));
    for (const id of rules.required_criteria ?? []) {
      if (!criterionIds.has(id)) {
        push(
          "UNKNOWN_REQUIRED_CRITERION",
          step.step_id,
          `required_criteria référence un critère non déclaré : "${id}"`,
        );
      }
    }

    // ── v3 : threads ──
    const stepThreadIds = new Set<string>();
    for (const t of step.threads ?? []) {
      if (stepThreadIds.has(t.thread_id)) {
        push("BAD_THREAD", step.step_id, `thread_id dupliqué dans le step : "${t.thread_id}"`);
      }
      stepThreadIds.add(t.thread_id);
      knownThreadIds.add(t.thread_id);
      if (!Array.isArray(t.participants) || t.participants.length === 0) {
        push(
          "BAD_THREAD",
          step.step_id,
          `thread "${t.thread_id}" : au moins un participant IA requis`,
        );
      }
      for (const p of t.participants ?? []) {
        if (!actorIds.has(p)) {
          push(
            "BAD_THREAD",
            step.step_id,
            `thread "${t.thread_id}" : participant inconnu "${p}"`,
          );
        }
      }
    }

    // ── v3 : tools ──
    for (const tc of step.tools ?? []) {
      if (!toolIds.has(tc.tool)) {
        push(
          "UNKNOWN_TOOL",
          step.step_id,
          `tools : "${tc.tool}" absent du registre (connus : ${tools.join(", ")})`,
        );
      }
    }

    // ── v3 : document_ids ──
    for (const id of step.document_ids ?? []) {
      if (!documentIds.has(id)) {
        push(
          "UNKNOWN_DOCUMENT_REF",
          step.step_id,
          `document_ids : document inconnu "${id}"`,
        );
      }
    }

    // ── v3 : events narratifs ──
    const seenEventIds = new Set<string>();
    for (const ev of step.events ?? []) {
      validateEvent(ev, step, seenEventIds, actorIds, knownThreadIds, documentIds, push);
    }

    // ── v3 : completion.trigger OBLIGATOIRE ──
    const trigger = step.completion?.trigger;
    if (!trigger) {
      push(
        "MISSING_TRIGGER",
        step.step_id,
        "completion.trigger manquant — le schéma v3 refuse un step sans conditions de passage déclarées.",
      );
    } else {
      validateTrigger(trigger, step, criterionIds, actorIds, documentIds, toolIds, push);
    }

    seen.set(step.step_id, step);
  }

  // ── endings (inchangé v2) ──
  const defaults = scenario.endings.filter((e) => e.default).length;
  if (scenario.endings.length === 0 || defaults !== 1) {
    push(
      "BAD_ENDINGS",
      undefined,
      `endings : exactement un ending "default: true" requis (trouvé : ${defaults}).`,
    );
  }
  const stepIds = new Set(scenario.sequence.map((s) => s.step_id));
  for (const e of scenario.endings) {
    for (const id of e.requires_passed ?? []) {
      if (!stepIds.has(id)) {
        push(
          "BAD_ENDINGS",
          undefined,
          `ending "${e.id}" : requires_passed référence un step inconnu "${id}"`,
        );
      }
    }
  }

  return issues;
}

function validateTrigger(
  trigger: CompletionTrigger,
  step: StepInvocationV3,
  criterionIds: Set<string>,
  actorIds: Set<string>,
  documentIds: Set<string>,
  toolIds: Set<string>,
  push: (code: ComposerIssueV3["code"], stepId: string | undefined, message: string) => void,
): void {
  const t = trigger as CompletionTrigger & { min_count?: number };
  if (!t || typeof t !== "object" || !TRIGGER_TYPES.has(t.type)) {
    push(
      "BAD_TRIGGER",
      step.step_id,
      `trigger : type inconnu "${(t as { type?: string })?.type ?? "?"}" (union fermée : ${[...TRIGGER_TYPES].join(", ")})`,
    );
    return;
  }

  if ("min_count" in t && t.min_count !== undefined) {
    if (!Number.isInteger(t.min_count) || (t.min_count as number) < 1) {
      push("BAD_TRIGGER", step.step_id, `trigger ${t.type} : min_count doit être un entier ≥ 1`);
    }
  }

  switch (t.type) {
    case "all":
    case "any":
      if (!Array.isArray(t.of) || t.of.length === 0) {
        push("BAD_TRIGGER", step.step_id, `trigger ${t.type} : la liste "of" ne peut pas être vide`);
      } else {
        for (const sub of t.of) {
          validateTrigger(sub, step, criterionIds, actorIds, documentIds, toolIds, push);
        }
      }
      break;
    case "mail_sent":
      if (t.to !== undefined && !actorIds.has(t.to)) {
        push("UNKNOWN_TRIGGER_REF", step.step_id, `trigger mail_sent : destinataire inconnu "${t.to}"`);
      }
      break;
    case "message_sent":
      if (t.to_actor !== undefined && !actorIds.has(t.to_actor)) {
        push("UNKNOWN_TRIGGER_REF", step.step_id, `trigger message_sent : acteur inconnu "${t.to_actor}"`);
      }
      break;
    case "message_received":
      if (!actorIds.has(t.from_actor)) {
        push("UNKNOWN_TRIGGER_REF", step.step_id, `trigger message_received : acteur inconnu "${t.from_actor}"`);
      }
      break;
    case "actor_validation":
      if (!actorIds.has(t.actor)) {
        push("UNKNOWN_TRIGGER_REF", step.step_id, `trigger actor_validation : acteur inconnu "${t.actor}"`);
      }
      break;
    case "criterion_observed":
      if (!criterionIds.has(t.criterion)) {
        push(
          "UNKNOWN_TRIGGER_REF",
          step.step_id,
          `trigger criterion_observed : critère non déclaré "${t.criterion}"`,
        );
      }
      break;
    case "document_opened":
      if (!documentIds.has(t.document_id)) {
        push(
          "UNKNOWN_TRIGGER_REF",
          step.step_id,
          `trigger document_opened : document inconnu "${t.document_id}"`,
        );
      }
      break;
    case "deliverable_submitted":
      if (t.tool !== undefined && !toolIds.has(t.tool)) {
        push("UNKNOWN_TOOL", step.step_id, `trigger deliverable_submitted : tool inconnu "${t.tool}"`);
      }
      break;
    case "timer_elapsed":
      if (typeof t.seconds !== "number" || !(t.seconds > 0)) {
        push("BAD_TRIGGER", step.step_id, "trigger timer_elapsed : seconds doit être un nombre > 0");
      }
      if (t.from !== undefined && t.from !== "step_start" && t.from !== "scenario_start") {
        push("BAD_TRIGGER", step.step_id, `trigger timer_elapsed : from invalide "${t.from}"`);
      }
      break;
    case "manual":
      if (typeof t.label !== "string" || t.label.length === 0) {
        push("BAD_TRIGGER", step.step_id, "trigger manual : label requis (bouton explicite)");
      }
      break;
    case "contract_signed":
    case "contract_rejected":
      break;
  }
}

function validateEvent(
  ev: NarrativeEvent,
  step: StepInvocationV3,
  seenEventIds: Set<string>,
  actorIds: Set<string>,
  knownThreadIds: Set<string>,
  documentIds: Set<string>,
  push: (code: ComposerIssueV3["code"], stepId: string | undefined, message: string) => void,
): void {
  if (typeof ev.event_id !== "string" || ev.event_id.length === 0) {
    push("BAD_EVENT", step.step_id, "event : event_id requis");
    return;
  }
  if (seenEventIds.has(ev.event_id)) {
    push("BAD_EVENT", step.step_id, `event "${ev.event_id}" : event_id dupliqué dans le step`);
  }
  seenEventIds.add(ev.event_id);

  const when = ev.when as NarrativeEvent["when"] & { seconds?: Json; action?: Json };
  if (!when || !WHEN_TYPES.has(when.type)) {
    push(
      "BAD_EVENT",
      step.step_id,
      `event "${ev.event_id}" : when.type inconnu "${(when as { type?: string })?.type ?? "?"}"`,
    );
  } else if (when.type === "delay") {
    if (typeof when.seconds !== "number" || !(when.seconds > 0)) {
      push("BAD_EVENT", step.step_id, `event "${ev.event_id}" : delay.seconds doit être > 0`);
    }
  } else if (when.type === "after_action") {
    if (!ACTION_TYPES.has(when.action as WorkspaceAction["type"])) {
      push(
        "BAD_EVENT",
        step.step_id,
        `event "${ev.event_id}" : after_action.action inconnue "${String(when.action)}"`,
      );
    }
  }

  const effect = ev.effect;
  if (!effect || !EFFECT_TYPES.has(effect.type)) {
    push(
      "BAD_EVENT",
      step.step_id,
      `event "${ev.event_id}" : effect.type inconnu "${(effect as { type?: string })?.type ?? "?"}"`,
    );
    return;
  }
  if (effect.type === "message_received" || effect.type === "actor_reply") {
    if (!actorIds.has(effect.actor_id)) {
      push("BAD_EVENT", step.step_id, `event "${ev.event_id}" : acteur inconnu "${effect.actor_id}"`);
    }
    if (!knownThreadIds.has(effect.thread_id)) {
      push(
        "BAD_EVENT",
        step.step_id,
        `event "${ev.event_id}" : fil inconnu "${effect.thread_id}" (déclaré dans aucun step jusqu'ici)`,
      );
    }
  }
  if (effect.type === "mail_received") {
    if (!actorIds.has(effect.from_actor)) {
      push("BAD_EVENT", step.step_id, `event "${ev.event_id}" : acteur inconnu "${effect.from_actor}"`);
    }
    for (const id of effect.attachment_document_ids ?? []) {
      if (!documentIds.has(id)) {
        push(
          "UNKNOWN_DOCUMENT_REF",
          step.step_id,
          `event "${ev.event_id}" : pièce jointe inconnue "${id}"`,
        );
      }
    }
  }
}

/**
 * Résolution des inputs inter-steps — RÉUTILISE resolveStepInputs du
 * composer v2 (même format `inputs`, mêmes stepResults) : seul le type
 * nominal de la session diffère, d'où le pont structurel ci-dessous.
 */
export function resolveStepInputsV3(
  session: SessionV3State,
  step: StepInvocationV3,
): JsonObject {
  const bridge = { stepResults: session.stepResults } as unknown as SessionV2State;
  return resolveStepInputs(bridge, step as unknown as StepInvocation);
}
