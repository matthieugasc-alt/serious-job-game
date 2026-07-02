/**
 * ═════════════════════════════════════════════════════════════════
 * Moteur v2 — Critères, observations, verdicts (vocabulaire "step")
 * ═════════════════════════════════════════════════════════════════
 *
 * Généralisation du moteur E-chantier (applyPhaseObservation) au
 * modèle "séquence de mécaniques". Le principe est inchangé :
 *
 *   L'IA OBSERVE. LE MOTEUR DÉCIDE.
 *
 * - Une mécanique produit une Observation (booléens par critère).
 * - Le moteur croise l'observation avec les règles déclaratives du
 *   step (severity, required_criteria, min_criteria_count) et rend
 *   un verdict déterministe, auditable, reproductible.
 *
 * Aucune dépendance : ni React, ni I/O, ni legacy.
 */

export type CriterionSeverity = "critical" | "required" | "bonus" | "minor";

export const CRITERION_SEVERITIES = [
  "critical",
  "required",
  "bonus",
  "minor",
] as const satisfies readonly CriterionSeverity[];

/** Un critère observable, déclaré dans le JSON du scenario (jamais dans le code). */
export type StepCriterion = {
  id: string;
  /** Ce que l'IA doit chercher — injecté dans le prompt d'observation. */
  description: string;
  /** Valeur attendue pour que le critère soit "matché" (défaut: true). */
  expected?: boolean;
  severity?: CriterionSeverity;
  /** Poids explicite pour min_criteria_count (sinon dérivé de la severity). */
  weight?: number;
  /** Compétences transverses évaluées par ce critère (référentiel Z). */
  competencies?: string[];
  /** Famille d'erreur pédagogique (CF-chantier). */
  error_type?: string;
};

export type StepCompletionRules = {
  required_criteria?: string[];
  min_criteria_count?: number;
  critical_failure_criteria?: string[];
};

/** Ce que l'IA rapporte. Uniquement des observations, jamais de décision. */
export interface StepObservation {
  readonly criteria: Record<string, boolean>;
  /** Justification libre par critère — pour le replay admin, jamais lue par le moteur. */
  readonly evidence?: Record<string, string>;
  readonly meta?: { readonly model?: string; readonly at?: string };
}

/** Verdict du moteur. Chaque champ répond à "pourquoi ?" sans re-exécution. */
export interface StepEvaluationResult {
  readonly passed: boolean;
  readonly appliedRule:
    | "required_criteria"
    | "min_criteria_count"
    | "required_and_min"
    | "critical_failure"
    | "no_evaluation_declared"
    | "no_criteria_observed";
  readonly matched: readonly string[];
  readonly missing: readonly string[];
  readonly unexpected: readonly string[];
  readonly criticalFailures: readonly string[];
  readonly bonusMatched: readonly string[];
  readonly weightedScore: number | null;
  readonly weightedThreshold: number | null;
  readonly reason: string;
  readonly timestamp: string;
  readonly stepId: string;
  readonly observation: StepObservation;
}

interface StepWithEvaluation {
  step_id?: string;
  evaluation?: { observed_criteria: StepCriterion[] } | null;
  completion_rules?: StepCompletionRules | null;
}

/**
 * Croise une observation IA avec les règles déclaratives d'un step.
 * Déterministe, défensif (ne throw jamais), sans effet de bord.
 */
export function applyStepObservation(
  step: StepWithEvaluation | null | undefined,
  observation: StepObservation,
): StepEvaluationResult {
  const stepId = step?.step_id ?? "<unknown>";
  const timestamp = new Date().toISOString();

  const criteria = step?.evaluation?.observed_criteria;
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
        "Le step ne déclare pas de bloc `evaluation.observed_criteria` — le moteur ne peut pas décider.",
      timestamp,
      stepId,
      observation,
    });
  }

  const declaredIds = new Set(criteria.map((c) => c.id));
  const observedIds = new Set(Object.keys(observation.criteria ?? {}));
  const unexpected = [...observedIds].filter((id) => !declaredIds.has(id));

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
        "L'observation IA ne contient aucun critère. Vérifie le prompt et le contrat de sortie de l'observateur.",
      timestamp,
      stepId,
      observation,
    });
  }

  const matched: string[] = [];
  const missing: string[] = [];
  for (const c of criteria) {
    const expected = c.expected ?? true;
    if (observation.criteria[c.id] === expected) matched.push(c.id);
    else missing.push(c.id);
  }

  const severityOf = new Map<string, CriterionSeverity>();
  for (const c of criteria) severityOf.set(c.id, c.severity ?? "required");

  // Critical : observé=true ⇒ échec immédiat, court-circuite tout.
  const rules = step?.completion_rules ?? {};
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
        `Step échoué. Critère(s) critique(s) déclenché(s) : ${criticalFailures.join(", ")}. ` +
        `Un critère critique observé annule immédiatement le step.`,
      timestamp,
      stepId,
      observation,
    });
  }

  const bonusMatched = matched.filter((id) => severityOf.get(id) === "bonus");

  const requiredIds = rules.required_criteria ?? [];
  const minCount = rules.min_criteria_count;
  const usesRequired = requiredIds.length > 0;
  const usesMinCount = typeof minCount === "number" && minCount > 0;

  let appliedRule: StepEvaluationResult["appliedRule"] =
    "no_evaluation_declared";
  let requiredPass = true;
  let requiredMissing: string[] = [];

  if (usesRequired) {
    appliedRule = "required_criteria";
    requiredMissing = requiredIds.filter((id) => !matched.includes(id));
    requiredPass = requiredMissing.length === 0;
  }

  let weightedScore: number | null = null;
  let weightedThreshold: number | null = null;
  let minCountPass = true;

  if (usesMinCount) {
    weightedThreshold = minCount!;
    const eligible = usesRequired
      ? criteria.filter((c) => !requiredIds.includes(c.id))
      : criteria;
    weightedScore = eligible
      .filter((c) => matched.includes(c.id))
      .reduce((sum, c) => sum + effectiveWeight(c), 0);
    minCountPass = weightedScore >= weightedThreshold;
    appliedRule = usesRequired ? "required_and_min" : "min_criteria_count";
  }

  const passed =
    usesRequired || usesMinCount ? requiredPass && minCountPass : false;

  const parts: string[] = [passed ? "Step validé." : "Step non validé."];
  if (usesRequired) {
    parts.push(
      requiredMissing.length === 0
        ? `Tous les critères requis observés (${matched.length}).`
        : `Critères requis manquants : ${requiredMissing.join(", ")}.`,
    );
  }
  if (usesMinCount) {
    parts.push(`Seuil pondéré : ${weightedScore ?? 0}/${weightedThreshold ?? 0}.`);
  }
  if (!usesRequired && !usesMinCount) {
    parts.push("Aucune règle déclarée (required_criteria / min_criteria_count).");
  }
  if (bonusMatched.length > 0) parts.push(`Bonus observé(s) : ${bonusMatched.join(", ")}.`);
  if (unexpected.length > 0)
    parts.push(`⚠ Critères observés hors schéma (drift) : ${unexpected.join(", ")}.`);

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
    reason: parts.join(" "),
    timestamp,
    stepId,
    observation,
  });
}

/**
 * Poids effectif d'un critère pour min_criteria_count :
 *   1. `weight` explicite (gagne toujours)
 *   2. dérivé de la severity : critical 0, required 2, bonus 1, minor 0.5
 *   3. défaut 1 si ni weight ni severity
 */
export function effectiveWeight(c: StepCriterion): number {
  if (typeof c.weight === "number" && c.weight >= 0) return c.weight;
  if (c.severity === undefined) return 1;
  switch (c.severity) {
    case "critical":
      return 0;
    case "required":
      return 2;
    case "bonus":
      return 1;
    case "minor":
      return 0.5;
  }
}

function freeze<T>(x: T): Readonly<T> {
  return Object.freeze(x);
}
