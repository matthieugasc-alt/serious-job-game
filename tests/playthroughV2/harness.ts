/**
 * ═════════════════════════════════════════════════════════════════
 * Harnais de playthrough headless v2 — joue les scénarios réels
 * contre le moteur réel, sans navigateur ni IA.
 * ═════════════════════════════════════════════════════════════════
 *
 * Principe : pour chaque step, l'output est construit par les VRAIES
 * fonctions pures des Runtime de mécaniques (buildOutput, buildDeliverable,
 * buildAgreement…) alimentées par un transcript/état synthétique plausible.
 * Seule l'OBSERVATION est synthétique (l'IA observatrice est remplacée par
 * un oracle déterministe) : par défaut chaque critère est observé à sa
 * valeur `expected` — sauf les critères critical, observés à false (un
 * critical observé à true déclenche l'échec immédiat, cf. criteria.ts).
 *
 * La boucle de jeu est la boucle réelle du moteur :
 *   getCurrentStep → resolveStepInputs → playMechanicStep →
 *   completeCurrentStep, jusqu'à isFinished.
 * Un throw de resolveStepInputs = chaîne inputs_from cassée = bug.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import type {
  ScenarioV2,
  StepInvocation,
  JsonObject,
  Json,
  TranscriptEvent,
  MechanicResult,
  EndingRule,
  ActorDef,
  StepResult,
} from "@/app/lib/engine/mechanics";
import type { StepCriterion, StepObservation } from "@/app/lib/engine/criteria";
import {
  initializeSessionV2,
  getCurrentStep,
  completeCurrentStep,
  computeEndingV2,
  recordTranscriptEvent,
  type SessionV2State,
} from "@/app/lib/engine/sessionV2";
import { resolveStepInputs } from "@/app/lib/engine/composer";
import { MECHANIC_MANIFESTS } from "@/app/mechanics/manifests";

// ── Fonctions pures des Runtime réels (jamais d'objets bricolés) ──
import { buildNoopResult } from "@/app/mechanics/_noop/Runtime";
import {
  resolveMinExchanges,
  buildOutput as buildEntretienOutput,
} from "@/app/mechanics/entretien/Runtime";
import {
  resolveQuestionCount,
  buildOutput as buildQaOutput,
} from "@/app/mechanics/qa/Runtime";
import {
  resolveTimeLimitS,
  computeDurationS,
  buildOutput as buildPresentationOutput,
} from "@/app/mechanics/presentation/Runtime";
import {
  parseFindingsPrompts,
  validateFindings,
  buildOutput as buildAnalyseOutput,
} from "@/app/mechanics/analyse/Runtime";
import {
  parseDeliverableType,
  validateDraft,
  buildDeliverable,
  formatDeliverableContent,
  buildOutput as buildProductionOutput,
} from "@/app/mechanics/production/Runtime";
import {
  parseOptions,
  parseConfig,
  validateDecision,
  splitCriteria,
  buildDeterministicObservation,
  mergeObservations,
  buildSummary as buildDecisionSummary,
  buildOutput as buildDecisionOutput,
  CHOICE_CRITERION_PREFIX,
} from "@/app/mechanics/decision/Runtime";
import {
  parseTerms,
  initialTermValues,
  validateTermValues,
  formatProposal,
  buildAgreement,
  buildOutput as buildNegociationOutput,
} from "@/app/mechanics/negociation/Runtime";

import {
  resolveOutcome,
  applyDelta,
  interpolateMicroDebrief,
  isValidDelta,
  FOUNDER_STATE_KEYS,
  type FounderRules,
  type FounderOutcome,
  type FounderState,
  type FounderMicroDebrief,
} from "@/app/lib/founder";

// ═══════════════════════════════════════════════════════════════════
// Chargement des scénarios réels
// ═══════════════════════════════════════════════════════════════════

export const SCENARIO_IDS = [
  "vitrine_signer_le_pilote",
  "founder_00_cto",
  "founder_01_incubator",
  "founder_02_mvp",
  "founder_03_clinical",
  "founder_04_v1",
  "founder_05_sales",
] as const;

export const FOUNDER_SCENARIO_IDS = SCENARIO_IDS.filter((id) =>
  id.startsWith("founder_"),
);

export function loadScenarioV2(scenarioId: string): ScenarioV2 {
  const file = path.join(process.cwd(), "scenarios", scenarioId, "scenario.json");
  const scenario = JSON.parse(fs.readFileSync(file, "utf-8")) as ScenarioV2;
  if (scenario.format !== "v2" || scenario.scenario_id !== scenarioId) {
    throw new Error(
      `Scénario ${scenarioId} : format v2 attendu avec scenario_id cohérent.`,
    );
  }
  return scenario;
}

// ═══════════════════════════════════════════════════════════════════
// Observation synthétique (l'oracle qui remplace l'IA observatrice)
// ═══════════════════════════════════════════════════════════════════

export interface PlayOptions {
  /** Critères à observer à l'INVERSE de leur expected (force l'échec). */
  failCriteria?: string[];
  /** Id d'un critère critical à observer à true (déclenche le critical). */
  fireCritical?: string;
}

function criticalIdsOf(step: StepInvocation): Set<string> {
  const ids = new Set<string>(step.completion_rules?.critical_failure_criteria ?? []);
  for (const c of step.evaluation.observed_criteria) {
    if (c.severity === "critical") ids.add(c.id);
  }
  return ids;
}

/** Ids de critères critical déclarés par un step (severity ou completion_rules). */
export function stepCriticalCriteria(step: StepInvocation): string[] {
  return [...criticalIdsOf(step)];
}

/**
 * Valeur observée d'un critère selon la stratégie du run :
 * - critical : false par défaut (ne déclenche pas), true si fireCritical.
 * - autre    : expected par défaut, !expected si dans failCriteria.
 */
function observedValue(
  c: StepCriterion,
  criticals: Set<string>,
  opts: PlayOptions,
): boolean {
  if (opts.fireCritical === c.id) return true;
  const expected = c.expected ?? true;
  if (opts.failCriteria?.includes(c.id)) return !expected;
  if (criticals.has(c.id)) return false; // critical au repos : jamais true
  return expected;
}

function buildSyntheticObservation(
  step: StepInvocation,
  criteria: StepCriterion[],
  opts: PlayOptions,
): StepObservation {
  const criticals = criticalIdsOf(step);
  const observed: Record<string, boolean> = {};
  const evidence: Record<string, string> = {};
  for (const c of criteria) {
    observed[c.id] = observedValue(c, criticals, opts);
    evidence[c.id] = `Observation synthétique du harnais (valeur : ${observed[c.id]}).`;
  }
  return {
    criteria: observed,
    evidence,
    meta: { model: "deterministic:playthrough-harness", at: new Date().toISOString() },
  };
}

// ═══════════════════════════════════════════════════════════════════
// playMechanicStep — MechanicResult réaliste par mécanique
// ═══════════════════════════════════════════════════════════════════

function actorName(actors: ActorDef[], actorId: unknown): string {
  if (typeof actorId !== "string") return "Interlocuteur";
  return actors.find((a) => a.actor_id === actorId)?.name ?? actorId;
}

function synthChatTranscript(
  session: SessionV2State,
  step: StepInvocation,
  exchanges: number,
  opener: "player" | "actor",
): TranscriptEvent[] {
  const actorId =
    typeof step.params.actor_id === "string"
      ? step.params.actor_id
      : session.scenario.actors[0]?.actor_id;
  const transcript: TranscriptEvent[] = [];
  const base = Date.now();
  for (let i = 0; i < exchanges; i++) {
    const player: TranscriptEvent = {
      at: base + i * 2000,
      channel: "chat",
      role: "player",
      content: `(synthétique) Message joueur ${i + 1}/${exchanges} — travaille l'objectif du step ${step.step_id}.`,
    };
    const actor: TranscriptEvent = {
      at: base + i * 2000 + 1000,
      channel: "chat",
      role: "actor",
      actor_id: actorId,
      content: `(synthétique) Réponse ${i + 1}/${exchanges} de l'acteur.`,
    };
    transcript.push(...(opener === "player" ? [player, actor] : [actor, player]));
  }
  for (const e of transcript) recordTranscriptEvent(session, step.step_id, e);
  return transcript;
}

function playEntretien(session: SessionV2State, step: StepInvocation): JsonObject {
  const min = resolveMinExchanges(step.params);
  const transcript = synthChatTranscript(session, step, min, "player");
  return buildEntretienOutput(transcript, session.scenario.actors);
}

function playQa(session: SessionV2State, step: StepInvocation): JsonObject {
  const count = resolveQuestionCount(step.params);
  if (count < 1) {
    throw new Error(`Step ${step.step_id} : question_count invalide dans les params.`);
  }
  const transcript = synthChatTranscript(session, step, count, "actor");
  return buildQaOutput(transcript, session.scenario.actors);
}

function playPresentation(session: SessionV2State, step: StepInvocation): JsonObject {
  const limitS = resolveTimeLimitS(step.time_limit_s);
  const startedAt = Date.now() - Math.min(90, limitS) * 1000;
  const durationS = computeDurationS(startedAt, Date.now(), limitS);
  const speech =
    `(synthétique) Exposé structuré pour le step ${step.step_id} : ` +
    `problème, solution, équipe et prochaines étapes, dans le temps imparti.`;
  recordTranscriptEvent(session, step.step_id, {
    at: Date.now(),
    channel: "voice",
    role: "player",
    content: speech,
  });
  return buildPresentationOutput(speech, durationS);
}

function playAnalyse(session: SessionV2State, step: StepInvocation): JsonObject {
  const prompts = parseFindingsPrompts(step.params);
  if (prompts.length === 0) {
    throw new Error(`Step ${step.step_id} : findings_prompts vide ou invalide.`);
  }
  const findings: Record<string, string> = {};
  for (const p of prompts) {
    findings[p.id] = `(synthétique) Conclusion argumentée — ${p.label}.`;
  }
  const errors = validateFindings(prompts, findings);
  if (errors.length > 0) {
    throw new Error(`Step ${step.step_id} : findings synthétiques invalides : ${errors.join(" ; ")}`);
  }
  return buildAnalyseOutput(prompts, findings);
}

function playProduction(session: SessionV2State, step: StepInvocation): JsonObject {
  const type = parseDeliverableType(step.params);
  if (type === null) {
    throw new Error(`Step ${step.step_id} : deliverable_type invalide.`);
  }
  const draft = {
    to:
      type === "mail"
        ? actorName(session.scenario.actors, step.params.recipient_actor)
        : undefined,
    subject: type === "mail" ? `(synthétique) Objet — ${step.title ?? step.step_id}` : undefined,
    title: type === "document" ? `(synthétique) Titre — ${step.title ?? step.step_id}` : undefined,
    body:
      `(synthétique) Corps du livrable pour ${step.step_id}. ` +
      `Il couvre les consignes déclarées : chiffres, engagements, structure.`,
  };
  const errors = validateDraft(type, draft);
  if (errors.length > 0) {
    throw new Error(`Step ${step.step_id} : brouillon synthétique invalide : ${errors.join(" ; ")}`);
  }
  const deliverable = buildDeliverable(type, draft);
  recordTranscriptEvent(session, step.step_id, {
    at: Date.now(),
    channel: type === "mail" ? "mail" : "editor",
    role: "player",
    content: formatDeliverableContent(deliverable),
  });
  return buildProductionOutput(deliverable);
}

function playDecision(
  session: SessionV2State,
  step: StepInvocation,
  opts: PlayOptions,
): MechanicResult {
  const options = parseOptions(step.params);
  const config = parseConfig(step.params);
  const criteria = step.evaluation.observed_criteria;
  const { structural, observed } = splitCriteria(criteria);
  const required = new Set(step.completion_rules?.required_criteria ?? []);
  const avoided = new Set([...(opts.failCriteria ?? [])]);
  if (opts.fireCritical) avoided.add(opts.fireCritical);

  // Choix réalistes : les options exigées par required_criteria (convention
  // choice_<option_id>), hors celles que le run veut faire échouer ;
  // à défaut, la première option non exclue (une décision est toujours prise).
  let choices = options
    .map((o) => o.id)
    .filter(
      (id) =>
        required.has(CHOICE_CRITERION_PREFIX + id) &&
        !avoided.has(CHOICE_CRITERION_PREFIX + id),
    );
  if (choices.length === 0) {
    const pick = options.find((o) => !avoided.has(CHOICE_CRITERION_PREFIX + o.id));
    if (pick) choices = [pick.id];
  }
  choices = choices.slice(0, config.maxChoices);

  const justification =
    `(synthétique) Justification étayée du choix pour ${step.step_id} : ` +
    `contraintes, budget et risques comparés explicitement. `.repeat(
      Math.max(1, Math.ceil(config.minJustificationChars / 80)),
    );
  const errors = validateDecision(choices, justification, config);
  if (errors.length > 0) {
    throw new Error(`Step ${step.step_id} : décision synthétique invalide : ${errors.join(" ; ")}`);
  }

  recordTranscriptEvent(session, step.step_id, {
    at: Date.now(),
    channel: "editor",
    role: "player",
    content: buildDecisionSummary(options, choices, justification),
  });

  // Observation : critères structurels déterministes (choice_*), le reste
  // par l'oracle synthétique — fusion exactement comme dans Component.tsx.
  const deterministic = buildDeterministicObservation(structural, choices);
  const ai = buildSyntheticObservation(step, observed, opts);
  return {
    observation: mergeObservations(deterministic, ai),
    output: buildDecisionOutput(choices, justification),
  };
}

function playNegociation(
  session: SessionV2State,
  step: StepInvocation,
  opts: PlayOptions,
): JsonObject {
  const terms = parseTerms(step.params);
  if (terms.length === 0) {
    throw new Error(`Step ${step.step_id} : params.terms vide ou invalide.`);
  }
  const values = initialTermValues(terms);
  for (const t of terms) {
    if ((values[t.id] ?? "").trim().length === 0) {
      values[t.id] = t.type === "number" ? "10000" : "(synthétique) Clause renégociée et validée.";
    }
  }
  const errors = validateTermValues(terms, values);
  if (errors.length > 0) {
    throw new Error(`Step ${step.step_id} : termes synthétiques invalides : ${errors.join(" ; ")}`);
  }
  // Heuristique documentée : si le run force l'échec d'un critère d'accord
  // (id contenant accord/conclu), le joueur synthétique NE conclut pas.
  const concluded = !(opts.failCriteria ?? []).some((id) => /accord|conclu/i.test(id));
  recordTranscriptEvent(session, step.step_id, {
    at: Date.now(),
    channel: "chat",
    role: "player",
    content: formatProposal(terms, values),
  });
  const agreement = buildAgreement(concluded, terms, values);
  return buildNegociationOutput(agreement, 1);
}

/**
 * Génère un MechanicResult réaliste pour le step courant, via les
 * fonctions pures du Runtime de sa mécanique. Vérifie que l'output
 * contient TOUTES les output_keys du manifest (throw sinon).
 */
export function playMechanicStep(
  session: SessionV2State,
  step: StepInvocation,
  opts: PlayOptions = {},
  resolvedInputs?: JsonObject,
): MechanicResult {
  const inputs = resolvedInputs ?? resolveStepInputs(session, step);
  const criteria = step.evaluation.observed_criteria;

  let result: MechanicResult;
  switch (step.mechanic) {
    case "_noop": {
      const noop = buildNoopResult({
        params:
          (opts.failCriteria?.length ?? 0) > 0
            ? { ...step.params, fail_criteria: opts.failCriteria as Json }
            : step.params,
        inputs,
        criteria,
      });
      result = opts.fireCritical
        ? {
            ...noop,
            observation: {
              ...noop.observation,
              criteria: { ...noop.observation.criteria, [opts.fireCritical]: true },
            },
          }
        : noop;
      break;
    }
    case "entretien":
      result = {
        observation: buildSyntheticObservation(step, criteria, opts),
        output: playEntretien(session, step),
      };
      break;
    case "qa":
      result = {
        observation: buildSyntheticObservation(step, criteria, opts),
        output: playQa(session, step),
      };
      break;
    case "presentation":
      result = {
        observation: buildSyntheticObservation(step, criteria, opts),
        output: playPresentation(session, step),
      };
      break;
    case "analyse":
      result = {
        observation: buildSyntheticObservation(step, criteria, opts),
        output: playAnalyse(session, step),
      };
      break;
    case "production":
      result = {
        observation: buildSyntheticObservation(step, criteria, opts),
        output: playProduction(session, step),
      };
      break;
    case "decision":
      result = playDecision(session, step, opts);
      break;
    case "negociation":
      result = {
        observation: buildSyntheticObservation(step, criteria, opts),
        output: playNegociation(session, step, opts),
      };
      break;
    default:
      throw new Error(
        `Step ${step.step_id} : mécanique inconnue du harnais "${step.mechanic}".`,
      );
  }

  // Assertion de contrat : toutes les output_keys du manifest sont présentes.
  const manifest = MECHANIC_MANIFESTS[step.mechanic];
  if (!manifest) {
    throw new Error(`Mécanique "${step.mechanic}" absente de MECHANIC_MANIFESTS.`);
  }
  const missing = manifest.output_keys.filter((k) => result.output[k] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `Step ${step.step_id} (${step.mechanic}) : output_keys manquantes dans l'output réel : ${missing.join(", ")}`,
    );
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// playScenario — boucle réelle du moteur
// ═══════════════════════════════════════════════════════════════════

export type Strategy = (
  step: StepInvocation,
  session: SessionV2State,
) => PlayOptions | undefined;

export interface StepTraceEntry {
  stepId: string;
  mechanic: string;
  attempt: number;
  action: "advanced" | "retry" | "ended";
  passed: boolean;
  opts: PlayOptions;
}

export interface PlaythroughResult {
  session: SessionV2State;
  trace: StepTraceEntry[];
}

export function playScenario(
  scenario: ScenarioV2,
  strategy: Strategy = () => ({}),
): PlaythroughResult {
  const session = initializeSessionV2(scenario);
  const trace: StepTraceEntry[] = [];
  let guard = 0;

  while (!session.isFinished) {
    if (++guard > 500) {
      throw new Error(
        `Scénario ${scenario.scenario_id} : boucle de jeu non terminée après 500 itérations (retry infini ?).`,
      );
    }
    const step = getCurrentStep(session);
    if (!step) {
      throw new Error(
        `Scénario ${scenario.scenario_id} : pas de step courant alors que la session n'est pas finie.`,
      );
    }
    // Un throw ici = chaîne inputs_from cassée avec les VRAIS outputs.
    const inputs = resolveStepInputs(session, step);
    const opts = strategy(step, session) ?? {};
    const result = playMechanicStep(session, step, opts, inputs);
    const action = completeCurrentStep(session, result.observation, result.output);
    const sr = session.stepResults[step.step_id];
    trace.push({
      stepId: step.step_id,
      mechanic: step.mechanic,
      attempt: sr?.attempts ?? 1,
      action,
      passed: sr?.passed ?? false,
      opts,
    });
  }
  return { session, trace };
}

// ═══════════════════════════════════════════════════════════════════
// Stratégies et solveur d'endings
// ═══════════════════════════════════════════════════════════════════

/**
 * Critères à faire échouer pour garantir l'échec d'un step :
 * required_criteria s'il y en a, sinon tous les critères non-critical
 * (le score pondéré tombe à 0 < min_criteria_count).
 */
export function failingCriteriaFor(step: StepInvocation): string[] {
  const required = step.completion_rules?.required_criteria ?? [];
  if (required.length > 0) return [...required];
  const criticals = criticalIdsOf(step);
  return step.evaluation.observed_criteria
    .filter((c) => !criticals.has(c.id))
    .map((c) => c.id);
}

/** Stratégie : échoue les steps listés (retries épuisés), passe le reste. */
export function failStepsStrategy(failStepIds: Iterable<string>): Strategy {
  const toFail = new Set(failStepIds);
  return (step) =>
    toFail.has(step.step_id) ? { failCriteria: failingCriteriaFor(step) } : {};
}

/** Ending que rendrait computeEndingV2 pour un ensemble de steps passés. */
export function endingForPassedSet(
  scenario: ScenarioV2,
  passed: ReadonlySet<string>,
): EndingRule | null {
  const stepResults: Record<string, StepResult> = {};
  for (const s of scenario.sequence) {
    stepResults[s.step_id] = {
      stepId: s.step_id,
      mechanic: s.mechanic,
      passed: passed.has(s.step_id),
    } as StepResult;
  }
  const fake = { scenario, stepResults } as unknown as SessionV2State;
  return computeEndingV2(fake);
}

/**
 * Cherche un ensemble de steps passés qui produit EXACTEMENT cet ending
 * (first-match compris). null = ending structurellement inatteignable
 * par pattern passed/failed (shadowé par un ending antérieur, ou
 * conditions impossibles).
 * Énumération exhaustive : n ≤ 8 steps → ≤ 256 combinaisons.
 */
export function findPassedSetForEnding(
  scenario: ScenarioV2,
  endingId: string,
): Set<string> | null {
  const ids = scenario.sequence.map((s) => s.step_id);
  const n = ids.length;
  // Des plus grands ensembles vers les plus petits : patterns plus "joueur".
  const masks = Array.from({ length: 1 << n }, (_, i) => i).sort(
    (a, b) => bitCount(b) - bitCount(a),
  );
  for (const mask of masks) {
    const passed = new Set<string>(ids.filter((_, i) => (mask >> i) & 1));
    if (endingForPassedSet(scenario, passed)?.id === endingId) return passed;
  }
  return null;
}

function bitCount(x: number): number {
  let c = 0;
  for (let v = x; v > 0; v >>= 1) c += v & 1;
  return c;
}

// ═══════════════════════════════════════════════════════════════════
// Founder — application d'un outcome en mémoire (miroir de
// app/api/v2/complete/route.ts, dont la logique n'est pas exportée)
// ═══════════════════════════════════════════════════════════════════

interface AgreementShape {
  concluded: boolean;
  terms: Record<string, unknown>;
}

/** Dernier output de step contenant un `agreement` (mécanique negociation). */
export function extractAgreement(outputs: JsonObject[]): AgreementShape | null {
  for (let i = outputs.length - 1; i >= 0; i--) {
    const agreement = outputs[i]?.agreement;
    if (!agreement || typeof agreement !== "object" || Array.isArray(agreement)) continue;
    const a = agreement as Record<string, unknown>;
    const terms = a.terms;
    if (!terms || typeof terms !== "object" || Array.isArray(terms)) continue;
    return { concluded: a.concluded === true, terms: terms as Record<string, unknown> };
  }
  return null;
}

export interface InMemoryFounderApplication {
  outcome: FounderOutcome;
  microDebrief: FounderMicroDebrief;
  stateAfter: FounderState;
}

/**
 * Résout puis applique un outcome founder sur un état de campagne en
 * mémoire, en reproduisant le chemin de /api/v2/complete : deltas
 * dynamiques (founder_02 "prix"), flags royalties (founder_04),
 * variables de template puis interpolation du microDebrief, applyDelta.
 */
export function applyFounderOutcomeInMemory(
  scenarioId: string,
  endingId: string,
  stepOutputs: JsonObject[],
  rules: FounderRules,
  state: FounderState,
  burnRateMonthly = 250,
): InMemoryFounderApplication {
  let outcome = resolveOutcome(scenarioId, endingId, rules);

  const burn = burnRateMonthly * (outcome.deltas.elapsedMonths ?? 0);
  const agreement = extractAgreement(stepOutputs);
  const agreedNumber = (key: string): number | null => {
    if (!agreement?.concluded) return null;
    const v = agreement.terms[key];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };

  const contractPrice = agreedNumber("prix");
  if (contractPrice != null) {
    outcome = {
      ...outcome,
      deltas: { ...outcome.deltas, treasury: -(contractPrice + burn) },
    };
  }

  const royaltiesPct = agreedNumber("pourcentage_ca");
  const royaltiesCap = agreedNumber("plafond_eur");
  const royaltiesDuration = agreedNumber("duree_ans");
  if (royaltiesPct != null) {
    outcome = {
      ...outcome,
      setsFlags: {
        ...(outcome.setsFlags || {}),
        royalties_pct: royaltiesPct,
        royalties_cap: royaltiesCap,
        royalties_duration_years: royaltiesDuration,
      },
    };
  }

  const treasuryAfter = state.treasury + outcome.deltas.treasury;
  const staticCash = -outcome.deltas.treasury - burn;
  const contractEquity = outcome.deltas.ownership < 0 ? -outcome.deltas.ownership : null;

  let dealDetail = "";
  if (royaltiesPct != null && royaltiesPct > 0) {
    dealDetail = `Interessement de ${royaltiesPct}%${
      royaltiesCap != null ? ` (plafond ${royaltiesCap} €)` : " sans plafond"
    }`;
  }
  if (contractEquity != null && contractEquity > 0) {
    dealDetail += (dealDetail ? " + " : "") + `${contractEquity}% de BSA`;
  }
  if (!dealDetail) dealDetail = "Conditions trop genereuses";

  const templateVars: Record<string, string | number | null> = {
    contract_price: contractPrice ?? (staticCash > 0 ? staticCash : null),
    contract_equity: contractEquity,
    burn,
    treasury_after: treasuryAfter,
    devis_total: staticCash > 0 ? staticCash : null,
    devis_cash_paid: staticCash > 0 ? staticCash : null,
    devis_features_count: null, // cf. TODO-DEBT(founder-dynamic-deltas) dans route.ts
    deal_detail: dealDetail,
  };

  const microDebrief = interpolateMicroDebrief(outcome.microDebrief, templateVars);

  if (!isValidDelta(outcome.deltas)) {
    throw new Error(
      `Outcome ${scenarioId}/${endingId} : deltas invalides (clé manquante ou non finie).`,
    );
  }
  const stateAfter = applyDelta(state, outcome.deltas);
  for (const key of FOUNDER_STATE_KEYS) {
    if (!Number.isFinite(stateAfter[key])) {
      throw new Error(
        `Outcome ${scenarioId}/${endingId} : ${key} non fini après applyDelta (${stateAfter[key]}).`,
      );
    }
  }

  return { outcome: { ...outcome, microDebrief }, microDebrief, stateAfter };
}
