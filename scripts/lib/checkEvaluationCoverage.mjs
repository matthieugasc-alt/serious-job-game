// ═══════════════════════════════════════════════════════════════════
// E-chantier E6 — evaluation coverage checks (extracted from
// validate-scenarios.mjs for unit testability).
// ═══════════════════════════════════════════════════════════════════
//
// Given a phase object, returns an array of {severity, code, message,
// path} issues. Exports the same shape as validate-scenarios.mjs's
// err()/warn() helpers.
//
// Four invariants enforced:
//   EVAL_DUPLICATE_CRITERION_ID          — 2 criteria share the same id
//   EVAL_REQUIRED_CRITERION_NOT_DECLARED — required_criteria refs unknown id
//   EVAL_MIN_COUNT_UNREACHABLE           — min_criteria_count > observed.length
//   EVAL_RULE_WITHOUT_CRITERIA           — rule declared but no evaluation block
// ═══════════════════════════════════════════════════════════════════

/**
 * @param {object} phase          - the phase object
 * @param {string} phasePath      - JSON path prefix (e.g. "phases[0]")
 * @returns {Array<{severity:string, code:string, message:string, path:string}>}
 */
export function checkEvaluationCoverage(phase, phasePath) {
  const issues = [];
  if (!phase) return issues;
  const pid = phase.phase_id || "?";
  const p = phasePath;

  const observedCriteria = Array.isArray(phase.evaluation?.observed_criteria)
    ? phase.evaluation.observed_criteria
    : [];
  const observedIds = new Set(
    observedCriteria
      .map((c) => (typeof c?.id === "string" ? c.id : null))
      .filter(Boolean),
  );
  const requiredCriteria = Array.isArray(phase.completion_rules?.required_criteria)
    ? phase.completion_rules.required_criteria
    : [];

  // Duplicate ids
  const seen = new Set();
  const dupes = new Set();
  for (const c of observedCriteria) {
    if (typeof c?.id !== "string") continue;
    if (seen.has(c.id)) dupes.add(c.id);
    seen.add(c.id);
  }
  if (dupes.size > 0) {
    issues.push({
      severity: "error",
      code: "EVAL_DUPLICATE_CRITERION_ID",
      message: `Phase "${pid}" has duplicate observed_criteria ids: ${[...dupes].join(", ")}`,
      path: `${p}.evaluation.observed_criteria`,
    });
  }

  // required_criteria refs unknown id
  for (const reqId of requiredCriteria) {
    if (typeof reqId !== "string") continue;
    if (!observedIds.has(reqId)) {
      issues.push({
        severity: "error",
        code: "EVAL_REQUIRED_CRITERION_NOT_DECLARED",
        message: `Phase "${pid}" completion_rules.required_criteria references "${reqId}" which is not declared in evaluation.observed_criteria`,
        path: `${p}.completion_rules.required_criteria`,
      });
    }
  }

  // min_criteria_count unreachable
  const minCount = phase.completion_rules?.min_criteria_count;
  if (
    typeof minCount === "number" &&
    minCount > 0 &&
    observedIds.size > 0 &&
    minCount > observedIds.size
  ) {
    issues.push({
      severity: "error",
      code: "EVAL_MIN_COUNT_UNREACHABLE",
      message: `Phase "${pid}" completion_rules.min_criteria_count=${minCount} exceeds available observed_criteria (${observedIds.size}) — phase can never pass`,
      path: `${p}.completion_rules.min_criteria_count`,
    });
  }

  // rule declared without evaluation
  if (
    (requiredCriteria.length > 0 || typeof minCount === "number") &&
    observedIds.size === 0
  ) {
    issues.push({
      severity: "error",
      code: "EVAL_RULE_WITHOUT_CRITERIA",
      message: `Phase "${pid}" declares completion_rules.required_criteria or min_criteria_count but no evaluation.observed_criteria — the AI has no criteria to observe`,
      path: `${p}.completion_rules`,
    });
  }

  return issues;
}
