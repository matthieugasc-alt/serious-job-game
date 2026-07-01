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
    | "no_evaluation_declared"
    | "no_criteria_observed";

  /** Criteria that matched their expected value. */
  readonly matched: readonly string[];

  /** Criteria required-but-missing (required_criteria path). */
  readonly missing: readonly string[];

  /** Criteria the AI reported that aren't in the schema (schema drift). */
  readonly unexpected: readonly string[];

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
  // Signals schema drift — the prompt says X but the JSON evaluation lists Y.
  const unexpected = [...observedIds].filter((id) => !declaredIds.has(id));

  // Guard: nothing observed at all.
  if (observedIds.size === 0) {
    return freeze({
      passed: false,
      appliedRule: "no_criteria_observed",
      matched: [],
      missing: criteria.map((c) => c.id),
      unexpected,
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

  // ── Apply completion_rules ──
  const rules = phase?.completion_rules ?? {};
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
    // (required is enforced separately).
    const eligibleCriteria = usesRequired
      ? criteria.filter((c) => !requiredIds.includes(c.id))
      : criteria;
    weightedScore = eligibleCriteria
      .filter((c) => matched.includes(c.id))
      .reduce((sum, c) => sum + criterionWeight(c), 0);
    minCountPass = weightedScore >= weightedThreshold;
    appliedRule = usesRequired ? "required_and_min" : "min_criteria_count";
  }

  const passed = usesRequired || usesMinCount
    ? requiredPass && minCountPass
    : false; // No rule declared → moteur refuses to guess.

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
  });

  return freeze({
    passed,
    appliedRule,
    matched,
    missing: usesRequired ? requiredMissing : missing,
    unexpected,
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
