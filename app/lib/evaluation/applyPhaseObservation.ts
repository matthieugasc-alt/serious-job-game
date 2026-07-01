// ═══════════════════════════════════════════════════════════════════
// APPLY PHASE OBSERVATION — E-chantier E3
// ═══════════════════════════════════════════════════════════════════
//
// The moteur that DECIDES whether a phase is validated, given:
//   - a phase's declarative `evaluation.observed_criteria`
//   - a phase's declarative `completion_rules.required_criteria` OR
//     `min_criteria_count`
//   - an AI-produced Observation: {criteria: {[id]: boolean}}
//
// The AI ONLY observes. The moteur ONLY decides. This is the axis
// of the E-chantier — see app/lib/types.ts:PhaseEvaluation.
//
// Every call produces an EvaluationResult that is:
//   - persisted into session.evaluation_history (E4)
//   - consumed by the /admin/replay view (E5)
//   - inspectable to answer "pourquoi cette phase est-elle validée ?"
//     without ever asking the IA.
//
// The result is deterministic given (phase, observation). Same inputs
// always yield the same result — reproducible for regression testing.
// ═══════════════════════════════════════════════════════════════════

import type {
  PhaseEvaluation,
  PhaseEvaluationCriterion,
  CompletionRules,
  CriterionSeverity,
} from "../types";

// ─── Public types ───────────────────────────────────────────────

/**
 * What the AI reports. Only observations, never decisions.
 * Keys are criterion ids from phase.evaluation.observed_criteria.
 * Values are booleans (what the AI observed).
 *
 * `evidence` is optional free-text per criterion — for the admin replay
 * view (E5), not consumed by the moteur.
 */
export interface PhaseObservation {
  readonly criteria: Record<string, boolean>;
  readonly evidence?: Record<string, string>;
  /** Optional: model + timestamp for audit. Recorded verbatim. */
  readonly meta?: {
    readonly model?: string;
    readonly at?: string;
  };
}

/**
 * The moteur's verdict. Every field is explanatory — meant to
 * answer "why did this pass/fail?" without re-running anything.
 */
export interface EvaluationResult {
  /** The final decision. */
  readonly passed: boolean;

  /** Which rule was applied. */
  readonly appliedRule:
    | "required_criteria"
    | "min_criteria_count"
    | "required_and_min"
    | "critical_failure"
    | "no_evaluation_declared"
    | "no_criteria_observed";

  /** Criteria that matched their expected value. */
  readonly matched: readonly string[];

  /** Criteria required-but-missing (required_criteria path). */
  readonly missing: readonly string[];

  /** Criteria the AI reported that aren't in the schema (schema drift). */
  readonly unexpected: readonly string[];

  /**
   * W-chantier — critical-severity criteria that were observed=true
   * (which triggered immediate failure). Empty when no critical fired.
   */
  readonly criticalFailures: readonly string[];

  /**
   * W-chantier — bonus-severity criteria that were matched. Never
   * gates the phase but boosts the pedagogical score.
   */
  readonly bonusMatched: readonly string[];

  /**
   * For min_criteria_count: weighted score achieved vs threshold.
   * Null when the rule is required_criteria only.
   */
  readonly weightedScore: number | null;
  readonly weightedThreshold: number | null;

  /** Short human-readable justification for the admin replay view. */
  readonly reason: string;

  /** ISO timestamp of the decision. */
  readonly timestamp: string;

  /** Phase id evaluated (for evaluation_history indexing). */
  readonly phaseId: string;

  /** Verbatim observation the moteur was given (for audit). */
  readonly observation: PhaseObservation;
}

// ─── The moteur ─────────────────────────────────────────────────

interface PhaseWithEvaluation {
  phase_id?: string;
  evaluation?: PhaseEvaluation | null;
  completion_rules?: CompletionRules | null;
}

/**
 * Cross-check an AI observation with the phase's declarative rules.
 *
 * Determinism: no side effects, no randomness, no I/O. Same inputs =
 * same output.
 *
 * Defensive: never throws. Malformed observations produce a `passed:
 * false` result with `reason` explaining the malformation.
 */
export function applyPhaseObservation(
  phase: PhaseWithEvaluation | null | undefined,
  observation: PhaseObservation,
): EvaluationResult {
  const phaseId = phase?.phase_id ?? "<unknown>";
  const timestamp = new Date().toISOString();

  // ── Guard: no evaluation contract declared ──
  const criteria = phase?.evaluation?.observed_criteria;
  if (!Array.isArray(criteria) || criteria.length === 0) {
    return freeze({
      passed: false,
      appliedRule: "no_evaluation_declared",
      matched: [],
      missing: [],
      unexpected: [],
      criticalFailures: [],
      bonusMatched: [],
      weightedScore: null,
      weightedThreshold: null,
      reason:
        "La phase ne déclare pas de bloc `evaluation.observed_criteria` — " +
        "le moteur ne peut pas décider. Ajoute la déclaration au JSON du " +
        "scenario ou utilise les completion_rules legacy (any_flags, …).",
      timestamp,
      phaseId,
      observation,
    });
  }

  const declaredIds = new Set(criteria.map((c) => c.id));
  const observedIds = new Set(Object.keys(observation.criteria ?? {}));

  // Criteria the AI observed but the scenario doesn't declare.
  const unexpected = [...observedIds].filter((id) => !declaredIds.has(id));

  // Guard: nothing observed at all.
  if (observedIds.size === 0) {
    return freeze({
      passed: false,
      appliedRule: "no_criteria_observed",
      matched: [],
      missing: criteria.map((c) => c.id),
      unexpected,
      criticalFailures: [],
      bonusMatched: [],
      weightedScore: 0,
      weightedThreshold: null,
      reason:
        "L'observation IA ne contient aucun critère. Vérifie le prompt " +
        "et le contrat de sortie côté /api/chat (E2).",
      timestamp,
      phaseId,
      observation,
    });
  }

  // Which declared criteria were matched (AI-observed value === expected)?
  const matched: string[] = [];
  const missing: string[] = [];
  for (const c of criteria) {
    const expected = c.expected ?? true;
    const observed = observation.criteria[c.id];
    if (observed === expected) matched.push(c.id);
    else missing.push(c.id);
  }

  // ── W-chantier: severity index for quick lookups ──
  const severityOf = new Map<string, CriterionSeverity>();
  for (const c of criteria) severityOf.set(c.id, effectiveSeverity(c));

  // ── W-chantier: critical failure short-circuit ──
  // A critical criterion FIRES when observation.criteria[id] === true
  // (regardless of `expected`, since criticals model "player did an
  // irrecoverable bad thing"). It short-circuits ALL other rules.
  const rules = phase?.completion_rules ?? {};
  const declaredCriticalIds = new Set(rules.critical_failure_criteria ?? []);
  const criticalFailures: string[] = [];
  for (const c of criteria) {
    const isCritical =
      severityOf.get(c.id) === "critical" || declaredCriticalIds.has(c.id);
    if (isCritical && observation.criteria?.[c.id] === true) {
      criticalFailures.push(c.id);
    }
  }

  if (criticalFailures.length > 0) {
    return freeze({
      passed: false,
      appliedRule: "critical_failure",
      matched,
      missing: [],
      unexpected,
      criticalFailures,
      bonusMatched: [],
      weightedScore: null,
      weightedThreshold: null,
      reason:
        `Phase échouée. Critère(s) critique(s) déclenché(s) : ${criticalFailures.join(", ")}. ` +
        `Un critère critique observé annule immédiatement la phase — les autres règles ne sont pas évaluées.`,
      timestamp,
      phaseId,
      observation,
    });
  }

  // ── Bonus-matched are surfaced separately (never gate) ──
  const bonusMatched = matched.filter(
    (id) => severityOf.get(id) === "bonus",
  );

  // ── Apply completion_rules (required + min_criteria_count) ──
  const requiredIds = rules.required_criteria ?? [];
  const minCount = rules.min_criteria_count;

  const usesRequired = requiredIds.length > 0;
  const usesMinCount = typeof minCount === "number" && minCount > 0;

  let appliedRule: EvaluationResult["appliedRule"] = "no_evaluation_declared";
  let requiredPass = true;
  let requiredMissing: string[] = [];

  if (usesRequired) {
    appliedRule = "required_criteria";
    requiredMissing = requiredIds.filter((id) => !matched.includes(id));
    requiredPass = requiredMissing.length === 0;
  }

  // Weighted score for min_count.
  let weightedScore: number | null = null;
  let weightedThreshold: number | null = null;
  let minCountPass = true;

  if (usesMinCount) {
    weightedThreshold = minCount!;
    // If both are used, only count NON-required matches toward the threshold
    // (required is enforced separately). Bonus + minor count with their weight.
    const eligibleCriteria = usesRequired
      ? criteria.filter((c) => !requiredIds.includes(c.id))
      : criteria;
    weightedScore = eligibleCriteria
      .filter((c) => matched.includes(c.id))
      .reduce((sum, c) => sum + effectiveWeight(c), 0);
    minCountPass = weightedScore >= weightedThreshold;
    appliedRule = usesRequired ? "required_and_min" : "min_criteria_count";
  }

  const passed = usesRequired || usesMinCount
    ? requiredPass && minCountPass
    : false;

  const reason = buildReason({
    passed,
    appliedRule,
    matched,
    requiredMissing,
    usesRequired,
    usesMinCount,
    weightedScore,
    weightedThreshold,
    unexpected,
    bonusMatched,
  });

  return freeze({
    passed,
    appliedRule,
    matched,
    missing: usesRequired ? requiredMissing : missing,
    unexpected,
    criticalFailures: [],
    bonusMatched,
    weightedScore,
    weightedThreshold,
    reason,
    timestamp,
    phaseId,
    observation,
  });
}

// ─── Helpers ────────────────────────────────────────────────────

function criterionWeight(c: PhaseEvaluationCriterion): number {
  const w = c.weight;
  if (typeof w !== "number" || w < 0) return 1;
  return w;
}

/**
 * W-chantier — severity-aware effective weight. The precedence is:
 *   1. Explicit `weight` on the criterion (always wins)
 *   2. Severity-derived default (ONLY when severity is explicitly set)
 *   3. Legacy default of 1 (when neither weight nor severity is set)
 *
 * Severity-derived defaults:
 *   critical: 0   (never contributes to min_count — it's a gate, not a score)
 *   required: 2
 *   bonus:    1
 *   minor:    0.5
 */
function effectiveWeight(c: PhaseEvaluationCriterion): number {
  if (typeof c.weight === "number" && c.weight >= 0) return c.weight;
  // Backward compat: if severity is not explicit, use legacy default of 1.
  if (c.severity === undefined) return 1;
  switch (c.severity) {
    case "critical": return 0;
    case "required": return 2;
    case "bonus":    return 1;
    case "minor":    return 0.5;
  }
}

function effectiveSeverity(c: PhaseEvaluationCriterion): CriterionSeverity {
  return c.severity ?? "required";
}

function buildReason(input: {
  passed: boolean;
  appliedRule: EvaluationResult["appliedRule"];
  matched: string[];
  requiredMissing: string[];
  usesRequired: boolean;
  usesMinCount: boolean;
  weightedScore: number | null;
  weightedThreshold: number | null;
  unexpected: string[];
  bonusMatched: string[];
}): string {
  const parts: string[] = [];

  if (input.passed) {
    parts.push("Phase validée.");
  } else {
    parts.push("Phase non validée.");
  }

  if (input.usesRequired) {
    if (input.requiredMissing.length === 0) {
      parts.push(`Tous les critères requis observés (${input.matched.length}).`);
    } else {
      parts.push(
        `Critères requis manquants : ${input.requiredMissing.join(", ")}.`,
      );
    }
  }

  if (input.usesMinCount) {
    parts.push(
      `Seuil pondéré : ${input.weightedScore ?? 0}/${input.weightedThreshold ?? 0}.`,
    );
  }

  if (!input.usesRequired && !input.usesMinCount) {
    parts.push(
      "Aucune règle E-chantier déclarée (required_criteria / min_criteria_count).",
    );
  }

  if (input.bonusMatched.length > 0) {
    parts.push(
      `Bonus observé(s) : ${input.bonusMatched.join(", ")}.`,
    );
  }

  if (input.unexpected.length > 0) {
    parts.push(
      `⚠ Critères observés hors schéma (drift) : ${input.unexpected.join(", ")}.`,
    );
  }

  return parts.join(" ");
}

function freeze<T>(x: T): Readonly<T> {
  return Object.freeze(x);
}
