/**
 * ═════════════════════════════════════════════════════════════════
 * Moteur v3 — ComposerV3 : validation statique d'un scénario workspace
 * ═════════════════════════════════════════════════════════════════
 *
 * Reprend TOUTES les règles v2 (steps, params, inputs, critères,
 * completion_rules, endings) et ajoute les règles v3 du contrat :
 *   - completion.trigger OU completion.exits OBLIGATOIRE et bien formé
 *     (types connus, all/any non vides) — l'implicite est
 *     structurellement impossible ; trigger et exits sont exclusifs
 *   - criterion_observed → critère déclaré dans le step
 *   - actor_validation / message_received / mail_sent.to /
 *     message_sent.to_actor → acteur déclaré OU alias lié par un step
 *     antérieur (chantier B, bind_actor)
 *   - document_opened → document déclaré
 *   - tools (du step et des triggers) → registre de tools connu
 *   - threads → participants = acteurs déclarés ou alias liés
 *   - events → when/effect bien formés, refs acteur/fil/document valides
 *   - exits (chantier A) : id/trigger/route bien formés, goto → step
 *     connu + on_goto_exhausted obligatoire, end → ending connu,
 *     reset → fils/tools connus, events de sortie valides
 *   - scoring (chantier C) : mail_scored / mail_scored_below exigent un
 *     bloc step.scoring.brief ; min_score/scale cohérents
 *
 * Parité CLI : scripts/validate-scenarios-v3.mjs (mêmes codes).
 */

import type { Json, JsonObject } from "./mechanics";
import type {
  CompletionTrigger,
  ExitNarrativeEvent,
  MechanicSpecManifest,
  NarrativeEvent,
  ScenarioV3,
  StepExit,
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
    | "UNKNOWN_DOCUMENT_REF"
    // Chantiers A/B/C
    | "BAD_EXIT"
    | "UNKNOWN_ENDING_REF"
    | "BAD_SCORING";
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
  "mail_scored",
  "mail_scored_below",
  "manual",
  "all",
  "any",
]);

/** Nœuds de trigger autorisés à porter bind_actor (chantier B). */
const BINDABLE_TRIGGER_TYPES = new Set<string>(["mail_sent", "message_sent", "any"]);

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
  const endingIds = new Set((scenario.endings ?? []).map((e) => e.id));
  const allStepIds = new Set(scenario.sequence.map((s) => s.step_id));
  const seen = new Map<string, StepInvocationV3>();
  /** Fils connus (cumulatif : un event peut viser un fil d'un step antérieur). */
  const knownThreadIds = new Set<string>();
  /** Alias liés par les steps ANTÉRIEURS (chantier B) : un alias n'est
   *  utilisable qu'après le step qui le lie (sauf events de la sortie
   *  qui le lie, résolus après binding au runtime). */
  const boundAliases = new Set<string>();

  for (const step of scenario.sequence) {
    /** Refs d'acteur valides pour CE step : acteurs déclarés + alias antérieurs. */
    const actorOk = (ref: string) => actorIds.has(ref) || boundAliases.has(ref);
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

    // Convention : tout param *_actor / actor_id référence un acteur
    // déclaré OU un alias lié par un step antérieur (chantier B).
    for (const [k, v] of Object.entries(step.params ?? {})) {
      if ((k === "actor_id" || k.endsWith("_actor")) && typeof v === "string") {
        if (!actorOk(v)) {
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
        if (!actorOk(p)) {
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
      validateEvent(ev, step, seenEventIds, actorOk, knownThreadIds, documentIds, push);
    }

    // ── v3 : completion — trigger (sucre) OU exits (chantier A) ──
    const completion = step.completion ?? {};
    const trigger = completion.trigger;
    const exitsDeclared = completion.exits !== undefined;
    const hasExits = Array.isArray(completion.exits) && completion.exits.length > 0;

    if (!trigger && !hasExits) {
      push(
        "MISSING_TRIGGER",
        step.step_id,
        "completion.trigger ou completion.exits manquant — le schéma v3 refuse un step sans conditions de passage déclarées.",
      );
    }
    if (exitsDeclared && !hasExits) {
      push("BAD_EXIT", step.step_id, "exits : la liste ne peut pas être vide.");
    }
    if (trigger && hasExits) {
      push(
        "BAD_EXIT",
        step.step_id,
        "completion : trigger et exits sont exclusifs (trigger = sucre pour une sortie unique).",
      );
    }
    if (trigger) {
      validateTrigger(trigger, step, criterionIds, actorOk, actorIds, documentIds, toolIds, push);
    }
    if (hasExits) {
      validateExits(
        step,
        completion.exits as StepExit[],
        criterionIds,
        actorOk,
        actorIds,
        documentIds,
        toolIds,
        knownThreadIds,
        allStepIds,
        endingIds,
        push,
      );
    }
    if (
      completion.max_gotos !== undefined &&
      (!Number.isInteger(completion.max_gotos) || (completion.max_gotos as number) < 1)
    ) {
      push("BAD_EXIT", step.step_id, "completion.max_gotos doit être un entier ≥ 1.");
    }

    // ── Chantier C : scoring déclaratif ──
    const scoring = step.scoring;
    const mentionsScoring = [trigger, ...(completion.exits ?? []).map((e) => e?.trigger)]
      .filter(Boolean)
      .some((t) => triggerTreeMentions(t as CompletionTrigger, ["mail_scored", "mail_scored_below"]));
    if (mentionsScoring && (typeof scoring?.brief !== "string" || scoring.brief.length === 0)) {
      push(
        "BAD_SCORING",
        step.step_id,
        "un trigger mail_scored / mail_scored_below exige un bloc scoring.brief déclaré sur le step.",
      );
    }
    if (scoring !== undefined) {
      if (typeof scoring.brief !== "string" || scoring.brief.length === 0) {
        push("BAD_SCORING", step.step_id, "scoring.brief requis (chaîne non vide).");
      }
      if (scoring.scale !== undefined && (typeof scoring.scale !== "number" || !(scoring.scale > 0))) {
        push("BAD_SCORING", step.step_id, "scoring.scale doit être un nombre > 0.");
      }
    }

    // ── Chantier B : les alias liés par CE step servent aux steps suivants.
    for (const t of [trigger, ...(completion.exits ?? []).map((e) => e?.trigger)]) {
      if (t) collectBindAliases(t as CompletionTrigger, boundAliases);
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

/** Le trigger (ou un sous-trigger) mentionne-t-il un des types donnés ?
 *  (miroir local de triggerMentions — le composer reste autonome). */
function triggerTreeMentions(trigger: CompletionTrigger, types: readonly string[]): boolean {
  if (!trigger || typeof trigger !== "object") return false;
  if (types.includes(trigger.type)) return true;
  if (trigger.type === "all" || trigger.type === "any") {
    return (trigger.of ?? []).some((t) => triggerTreeMentions(t, types));
  }
  return false;
}

/** Collecte les alias bind_actor déclarés dans un arbre de trigger. */
function collectBindAliases(trigger: CompletionTrigger, into: Set<string>): void {
  if (!trigger || typeof trigger !== "object") return;
  const alias = (trigger as { bind_actor?: unknown }).bind_actor;
  if (typeof alias === "string" && alias.length > 0) into.add(alias);
  if (trigger.type === "all" || trigger.type === "any") {
    for (const sub of trigger.of ?? []) collectBindAliases(sub, into);
  }
}

function validateTrigger(
  trigger: CompletionTrigger,
  step: StepInvocationV3,
  criterionIds: Set<string>,
  actorOk: (ref: string) => boolean,
  actorIds: Set<string>,
  documentIds: Set<string>,
  toolIds: Set<string>,
  push: (code: ComposerIssueV3["code"], stepId: string | undefined, message: string) => void,
): void {
  const t = trigger as CompletionTrigger & { min_count?: number; bind_actor?: unknown };
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

  // Chantier B : bind_actor — placement, forme, non-collision.
  if ("bind_actor" in t && t.bind_actor !== undefined) {
    if (!BINDABLE_TRIGGER_TYPES.has(t.type)) {
      push(
        "BAD_TRIGGER",
        step.step_id,
        `trigger ${t.type} : bind_actor n'est autorisé que sur mail_sent, message_sent et any`,
      );
    } else if (typeof t.bind_actor !== "string" || t.bind_actor.length === 0) {
      push("BAD_TRIGGER", step.step_id, `trigger ${t.type} : bind_actor doit être une chaîne non vide`);
    } else if (actorIds.has(t.bind_actor)) {
      push(
        "BAD_TRIGGER",
        step.step_id,
        `trigger ${t.type} : l'alias bind_actor "${t.bind_actor}" entre en collision avec un actor_id déclaré`,
      );
    }
  }

  switch (t.type) {
    case "all":
    case "any":
      if (!Array.isArray(t.of) || t.of.length === 0) {
        push("BAD_TRIGGER", step.step_id, `trigger ${t.type} : la liste "of" ne peut pas être vide`);
      } else {
        for (const sub of t.of) {
          validateTrigger(sub, step, criterionIds, actorOk, actorIds, documentIds, toolIds, push);
        }
      }
      break;
    case "mail_sent":
      if (t.to !== undefined && !actorOk(t.to)) {
        push("UNKNOWN_TRIGGER_REF", step.step_id, `trigger mail_sent : destinataire inconnu "${t.to}"`);
      }
      break;
    case "message_sent":
      if (t.to_actor !== undefined && !actorOk(t.to_actor)) {
        push("UNKNOWN_TRIGGER_REF", step.step_id, `trigger message_sent : acteur inconnu "${t.to_actor}"`);
      }
      break;
    case "message_received":
      if (!actorOk(t.from_actor)) {
        push("UNKNOWN_TRIGGER_REF", step.step_id, `trigger message_received : acteur inconnu "${t.from_actor}"`);
      }
      break;
    case "actor_validation":
      if (!actorOk(t.actor)) {
        push("UNKNOWN_TRIGGER_REF", step.step_id, `trigger actor_validation : acteur inconnu "${t.actor}"`);
      }
      break;
    case "mail_scored":
    case "mail_scored_below":
      if (typeof t.min_score !== "number" || t.min_score < 0) {
        push("BAD_TRIGGER", step.step_id, `trigger ${t.type} : min_score doit être un nombre ≥ 0`);
      }
      if (t.scale !== undefined && (typeof t.scale !== "number" || !(t.scale > 0))) {
        push("BAD_TRIGGER", step.step_id, `trigger ${t.type} : scale doit être un nombre > 0`);
      } else if (
        typeof t.min_score === "number" &&
        typeof t.scale === "number" &&
        t.min_score > t.scale
      ) {
        push("BAD_TRIGGER", step.step_id, `trigger ${t.type} : min_score (${t.min_score}) dépasse scale (${t.scale})`);
      }
      if (t.to !== undefined && !actorOk(t.to)) {
        push("UNKNOWN_TRIGGER_REF", step.step_id, `trigger ${t.type} : destinataire inconnu "${t.to}"`);
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

/**
 * Chantier A — validation des sorties multiples d'un step.
 * Les events d'une sortie peuvent référencer les alias que le trigger de
 * CETTE sortie lie (le binding précède l'exécution des events au runtime).
 */
function validateExits(
  step: StepInvocationV3,
  exits: StepExit[],
  criterionIds: Set<string>,
  actorOk: (ref: string) => boolean,
  actorIds: Set<string>,
  documentIds: Set<string>,
  toolIds: Set<string>,
  knownThreadIds: Set<string>,
  allStepIds: Set<string>,
  endingIds: Set<string>,
  push: (code: ComposerIssueV3["code"], stepId: string | undefined, message: string) => void,
): void {
  const exitIds = new Set<string>();
  let hasGoto = false;

  for (const exit of exits) {
    const id = typeof exit?.id === "string" && exit.id.length > 0 ? exit.id : null;
    if (!id) {
      push("BAD_EXIT", step.step_id, "exit : id requis (chaîne non vide)");
    } else if (exitIds.has(id)) {
      push("BAD_EXIT", step.step_id, `exit "${id}" : id dupliqué dans le step`);
    } else {
      exitIds.add(id);
    }
    const label = id ?? "?";

    if (!exit?.trigger) {
      push("BAD_EXIT", step.step_id, `exit "${label}" : trigger requis`);
    } else {
      validateTrigger(exit.trigger, step, criterionIds, actorOk, actorIds, documentIds, toolIds, push);
    }

    if (exit?.evaluate !== undefined && typeof exit.evaluate !== "boolean") {
      push("BAD_EXIT", step.step_id, `exit "${label}" : evaluate doit être un booléen`);
    }

    // Route : "next" | {goto} | {end}.
    const route = exit?.route;
    if (route === "next") {
      // ok
    } else if (route && typeof route === "object" && "goto" in route && typeof route.goto === "string") {
      hasGoto = true;
      if (!allStepIds.has(route.goto)) {
        push("BAD_EXIT", step.step_id, `exit "${label}" : goto vers un step inconnu "${route.goto}"`);
      }
    } else if (route && typeof route === "object" && "end" in route && typeof route.end === "string") {
      if (!endingIds.has(route.end)) {
        push("UNKNOWN_ENDING_REF", step.step_id, `exit "${label}" : ending inconnu "${route.end}"`);
      }
    } else {
      push(
        "BAD_EXIT",
        step.step_id,
        `exit "${label}" : route invalide — attendu "next", {"goto": "<step_id>"} ou {"end": "<ending_id>"}`,
      );
    }

    // Reset déclaratif : fils et tools connus.
    for (const threadId of exit?.reset?.threads ?? []) {
      if (!knownThreadIds.has(threadId)) {
        push("BAD_EXIT", step.step_id, `exit "${label}" : reset.threads vise un fil inconnu "${threadId}"`);
      }
    }
    for (const toolId of exit?.reset?.tools ?? []) {
      if (!toolIds.has(toolId)) {
        push("BAD_EXIT", step.step_id, `exit "${label}" : reset.tools vise un tool inconnu "${toolId}"`);
      }
    }

    // Events de sortie : alias de CE trigger disponibles.
    const exitAliases = new Set<string>();
    if (exit?.trigger) collectBindAliases(exit.trigger, exitAliases);
    const exitActorOk = (ref: string) => actorOk(ref) || exitAliases.has(ref);
    const seenExitEventIds = new Set<string>();
    for (const ev of exit?.events ?? []) {
      validateExitEvent(ev, step, label, seenExitEventIds, exitActorOk, knownThreadIds, documentIds, push);
    }
  }

  if (hasGoto) {
    const fallback = step.completion?.on_goto_exhausted;
    if (!fallback || typeof fallback.end !== "string" || fallback.end.length === 0) {
      push(
        "BAD_EXIT",
        step.step_id,
        "on_goto_exhausted: {\"end\": \"<ending_id>\"} est OBLIGATOIRE dès qu'une sortie route en goto (garde-fou anti-boucle)",
      );
    } else if (!endingIds.has(fallback.end)) {
      push("UNKNOWN_ENDING_REF", step.step_id, `on_goto_exhausted : ending inconnu "${fallback.end}"`);
    }
  }
}

/** Event de sortie : comme un event de step, mais `when` est ignoré
 *  (le déclencheur est la sortie elle-même). */
function validateExitEvent(
  ev: ExitNarrativeEvent,
  step: StepInvocationV3,
  exitLabel: string,
  seenEventIds: Set<string>,
  actorOk: (ref: string) => boolean,
  knownThreadIds: Set<string>,
  documentIds: Set<string>,
  push: (code: ComposerIssueV3["code"], stepId: string | undefined, message: string) => void,
): void {
  if (typeof ev?.event_id !== "string" || ev.event_id.length === 0) {
    push("BAD_EXIT", step.step_id, `exit "${exitLabel}" : event sans event_id`);
    return;
  }
  if (seenEventIds.has(ev.event_id)) {
    push("BAD_EXIT", step.step_id, `exit "${exitLabel}" : event_id dupliqué "${ev.event_id}"`);
  }
  seenEventIds.add(ev.event_id);

  const effect = ev.effect;
  if (!effect || !EFFECT_TYPES.has(effect.type)) {
    push(
      "BAD_EXIT",
      step.step_id,
      `exit "${exitLabel}" : event "${ev.event_id}" — effect.type inconnu "${(effect as { type?: string })?.type ?? "?"}"`,
    );
    return;
  }
  if (effect.type === "message_received" || effect.type === "actor_reply") {
    if (!actorOk(effect.actor_id)) {
      push("BAD_EXIT", step.step_id, `exit "${exitLabel}" : event "${ev.event_id}" — acteur inconnu "${effect.actor_id}"`);
    }
    if (!knownThreadIds.has(effect.thread_id)) {
      push("BAD_EXIT", step.step_id, `exit "${exitLabel}" : event "${ev.event_id}" — fil inconnu "${effect.thread_id}"`);
    }
  }
  if (effect.type === "mail_received") {
    if (!actorOk(effect.from_actor)) {
      push("BAD_EXIT", step.step_id, `exit "${exitLabel}" : event "${ev.event_id}" — acteur inconnu "${effect.from_actor}"`);
    }
    for (const docId of effect.attachment_document_ids ?? []) {
      if (!documentIds.has(docId)) {
        push("UNKNOWN_DOCUMENT_REF", step.step_id, `exit "${exitLabel}" : event "${ev.event_id}" — pièce jointe inconnue "${docId}"`);
      }
    }
  }
}

function validateEvent(
  ev: NarrativeEvent,
  step: StepInvocationV3,
  seenEventIds: Set<string>,
  actorOk: (ref: string) => boolean,
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
    if (!actorOk(effect.actor_id)) {
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
    if (!actorOk(effect.from_actor)) {
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
 * Résolution des inputs déclarés d'un step depuis les outputs des steps
 * précédents (format `inputs` hérité du v2 : "stepId" ou "stepId.cle").
 * Runtime-strict : une référence irrésoluble throw — c'est un bug de
 * scénario que validateScenarioV3 aurait dû attraper.
 */
export function resolveStepInputsV3(
  session: SessionV3State,
  step: StepInvocationV3,
): JsonObject {
  const resolved: JsonObject = {};
  for (const [alias, ref] of Object.entries(step.inputs ?? {})) {
    const [srcId, key] = ref.split(".");
    const src = session.stepResults[srcId];
    if (!src) {
      throw new Error(
        `Step ${step.step_id} : input "${alias}" référence "${srcId}" qui n'a pas encore produit d'output.`,
      );
    }
    if (key === undefined) {
      resolved[alias] = src.output;
    } else {
      const value: Json | undefined = src.output[key];
      if (value === undefined) {
        throw new Error(
          `Step ${step.step_id} : input "${alias}" — clé "${key}" absente de l'output de "${srcId}".`,
        );
      }
      resolved[alias] = value;
    }
  }
  return resolved;
}
