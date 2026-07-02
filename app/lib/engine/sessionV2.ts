/**
 * ═════════════════════════════════════════════════════════════════
 * Moteur v2 — Session : état pur d'une partie "séquence de mécaniques"
 * ═════════════════════════════════════════════════════════════════
 *
 * Zéro React, zéro I/O. La session est un objet JSON sérialisable :
 * deep-save = JSON.stringify(session), reprise = JSON.parse.
 *
 * La session ne connaît AUCUNE mécanique. Elle orchestre :
 *   - la position dans la séquence
 *   - les résultats de steps (verdicts moteur + outputs)
 *   - les transcripts par step (audit, replay, observation)
 *   - le scratch par step (reprise d'une mécanique interrompue)
 *   - l'ending
 */

import type {
  ScenarioV2,
  StepInvocation,
  StepResult,
  JsonObject,
  TranscriptEvent,
  EndingRule,
} from "./mechanics";
import type { StepEvaluationResult, StepObservation } from "./criteria";
import { applyStepObservation } from "./criteria";

export interface SessionV2State {
  format: "session_v2";
  scenarioId: string;
  scenario: ScenarioV2;
  currentStepIndex: number;
  /** Verdicts + outputs par step_id (dernier essai). */
  stepResults: Record<string, StepResult>;
  /** Tous les verdicts rendus, dans l'ordre (y compris les retries). */
  evaluationHistory: StepEvaluationResult[];
  /** Transcript par step_id — la matière de l'observation et du replay. */
  transcripts: Record<string, TranscriptEvent[]>;
  /** État interne persisté de la mécanique en cours, par step_id. */
  scratch: Record<string, JsonObject>;
  isFinished: boolean;
  ending: EndingRule | null;
  realStartTime: number;
}

export function initializeSessionV2(scenario: ScenarioV2): SessionV2State {
  return {
    format: "session_v2",
    scenarioId: scenario.scenario_id,
    scenario,
    currentStepIndex: 0,
    stepResults: {},
    evaluationHistory: [],
    transcripts: {},
    scratch: {},
    isFinished: false,
    ending: null,
    realStartTime: Date.now(),
  };
}

export function cloneSessionV2(session: SessionV2State): SessionV2State {
  return JSON.parse(JSON.stringify(session)) as SessionV2State;
}

export function getCurrentStep(session: SessionV2State): StepInvocation | null {
  return session.scenario.sequence[session.currentStepIndex] ?? null;
}

export function recordTranscriptEvent(
  session: SessionV2State,
  stepId: string,
  event: TranscriptEvent,
): void {
  if (!session.transcripts[stepId]) session.transcripts[stepId] = [];
  session.transcripts[stepId].push(event);
}

/**
 * Applique le résultat d'une mécanique au step courant.
 * C'est ICI que le moteur décide (applyStepObservation), jamais dans
 * la mécanique ni dans l'IA.
 *
 * Retourne l'action décidée : advanced | retry | ended.
 */
export function completeCurrentStep(
  session: SessionV2State,
  observation: StepObservation,
  output: JsonObject,
): "advanced" | "retry" | "ended" {
  const step = getCurrentStep(session);
  if (!step || session.isFinished) return "ended";

  const evaluation = applyStepObservation(step, observation);
  session.evaluationHistory.push(evaluation);

  const prev = session.stepResults[step.step_id];
  const attempts = (prev?.attempts ?? 0) + 1;
  session.stepResults[step.step_id] = {
    stepId: step.step_id,
    mechanic: step.mechanic,
    evaluation,
    output,
    attempts,
    passed: evaluation.passed,
  };

  if (evaluation.passed) return advance(session);

  // Échec — politique déclarée par le step.
  const policy = step.on_failure ?? "retry";
  const maxAttempts = step.max_attempts ?? 2;

  if (policy === "end_scenario" || evaluation.appliedRule === "critical_failure") {
    return finish(session);
  }
  if (policy === "advance") return advance(session);
  // retry borné : au-delà de max_attempts, on avance (échec enregistré).
  if (attempts >= maxAttempts) return advance(session);
  return "retry";
}

function advance(session: SessionV2State): "advanced" | "ended" {
  if (session.currentStepIndex + 1 >= session.scenario.sequence.length) {
    return finish(session);
  }
  session.currentStepIndex += 1;
  return "advanced";
}

function finish(session: SessionV2State): "ended" {
  session.isFinished = true;
  session.ending = computeEndingV2(session);
  return "ended";
}

/**
 * Ending déterministe : première règle qui matche, dans l'ordre de
 * déclaration ; sinon la règle `default: true` ; sinon null.
 */
export function computeEndingV2(session: SessionV2State): EndingRule | null {
  const passedIds = Object.values(session.stepResults)
    .filter((r) => r.passed)
    .map((r) => r.stepId);

  let fallback: EndingRule | null = null;
  for (const rule of session.scenario.endings) {
    if (rule.default) {
      fallback = fallback ?? rule;
      continue;
    }
    const requiresOk = (rule.requires_passed ?? []).every((id) =>
      passedIds.includes(id),
    );
    const minOk =
      rule.min_passed === undefined || passedIds.length >= rule.min_passed;
    if (requiresOk && minOk) return rule;
  }
  return fallback;
}

/** Sérialisation deep-save. Symétrique de restoreSessionV2. */
export function serializeSessionV2(session: SessionV2State): string {
  return JSON.stringify(session);
}

export function restoreSessionV2(raw: string): SessionV2State {
  const parsed = JSON.parse(raw) as SessionV2State;
  if (parsed?.format !== "session_v2") {
    throw new Error("Snapshot invalide : format session_v2 attendu.");
  }
  return parsed;
}
