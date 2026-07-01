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

import fs from "node:fs";
import path from "node:path";

// CF-chantier: valid competency ids loaded from data/competencies.json.
// Cached at module load.
let cachedCompetencyIds = null;
function loadValidCompetencyIds() {
  if (cachedCompetencyIds) return cachedCompetencyIds;
  try {
    const raw = fs.readFileSync(path.resolve(process.cwd(), "data", "competencies.json"), "utf-8");
    const ref = JSON.parse(raw);
    cachedCompetencyIds = new Set((ref.competencies ?? []).map((c) => c.id));
  } catch {
    cachedCompetencyIds = new Set();
  }
  return cachedCompetencyIds;
}

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

  // W-chantier W5 — critical_failure_criteria must reference severity='critical'
  const criticalIds = Array.isArray(phase.completion_rules?.critical_failure_criteria)
    ? phase.completion_rules.critical_failure_criteria
    : [];
  const severityOf = new Map();
  for (const c of observedCriteria) {
    if (typeof c?.id === "string") severityOf.set(c.id, c.severity);
  }
  for (const cid of criticalIds) {
    if (typeof cid !== "string") continue;
    if (!observedIds.has(cid)) {
      issues.push({
        severity: "error",
        code: "EVAL_CRITICAL_NOT_DECLARED",
        message: `Phase "${pid}" completion_rules.critical_failure_criteria references "${cid}" which is not declared in evaluation.observed_criteria`,
        path: `${p}.completion_rules.critical_failure_criteria`,
      });
    } else if (severityOf.get(cid) !== undefined && severityOf.get(cid) !== "critical") {
      issues.push({
        severity: "error",
        code: "EVAL_CRITICAL_SEVERITY_MISMATCH",
        message: `Phase "${pid}" completion_rules.critical_failure_criteria contains "${cid}" but its severity is "${severityOf.get(cid)}", not "critical". Set severity: "critical" on the criterion or remove it from critical_failure_criteria.`,
        path: `${p}.evaluation.observed_criteria`,
      });
    }
  }

  // CF-chantier — validate competency ids referenced by criteria.
  const validCompetencies = loadValidCompetencyIds();
  for (const c of observedCriteria) {
    if (!c || typeof c.id !== "string") continue;
    const competencies = Array.isArray(c.competencies) ? c.competencies : [];
    for (const compId of competencies) {
      if (typeof compId !== "string") continue;
      // If referential is empty (fresh install), skip validation.
      if (validCompetencies.size === 0) continue;
      if (!validCompetencies.has(compId)) {
        issues.push({
          severity: "error",
          code: "EVAL_UNKNOWN_COMPETENCY",
          message: `Phase "${pid}" criterion "${c.id}" references unknown competency "${compId}" — add it to data/competencies.json or fix the reference`,
          path: `${p}.evaluation.observed_criteria`,
        });
      }
    }
  }

  // W-chantier W5 — no-fail-path: a migrated phase (declares evaluation)
  // MUST have at least one path to failure (required_criteria non-empty
  // OR at least one criterion with severity='critical' OR critical_failure_criteria).
  // Otherwise the phase can never fail → not pedagogical.
  if (observedIds.size > 0) {
    const hasRequired = requiredCriteria.length > 0;
    const hasCriticalDeclared = criticalIds.length > 0;
    const hasCriticalSeverity = observedCriteria.some(
      (c) => c?.severity === "critical",
    );
    if (!hasRequired && !hasCriticalDeclared && !hasCriticalSeverity) {
      issues.push({
        severity: "error",
        code: "EVAL_NO_FAIL_PATH",
        message: `Phase "${pid}" declares evaluation.observed_criteria but has no path to failure: no required_criteria, no critical_failure_criteria, no criterion with severity="critical". The phase cannot fail via the E/W-chantier — it's not pedagogical.`,
        path: `${p}`,
      });
    }
  }

  return issues;
}
