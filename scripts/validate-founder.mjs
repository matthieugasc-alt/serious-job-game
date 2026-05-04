#!/usr/bin/env node
/**
 * Founder Invariant Validator CLI
 *
 * Usage:
 *   node scripts/validate-founder.mjs
 *   npm run validate:founder
 *
 * Checks:
 *   1. All scenarios in founder_rules.json have matching invariants
 *   2. All declared endings exist in founder_rules.json outcomes
 *   3. No dangerous || on numeric flags in apply-outcome
 *   4. No hardcoded economic values in dynamic microDebrief
 *   5. S3 and S5 have specific branches in useDebrief
 *   6. Deltas are within allowed ranges
 *   7. Template variables in dynamic scenarios use {{var}} syntax
 *
 * Exit codes:
 *   0 = all checks pass
 *   1 = at least one error
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ═══════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════

const projectRoot = path.resolve(__dirname, "..");
const dataDir = path.join(projectRoot, "data");
const rulesFile = path.join(dataDir, "founder_rules.json");
const invariantsFile = path.join(dataDir, "founder_invariants.json");
const applyOutcomeFile = path.join(
  projectRoot, "app", "api", "founder", "apply-outcome", "route.ts"
);
const useDebriefFile = path.join(
  projectRoot, "app", "scenarios", "[scenarioId]", "play", "hooks", "useDebrief.ts"
);

// ═══════════════════════════════════════════════════════════════════
// COLORS
// ═══════════════════════════════════════════════════════════════════

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
};

// ═══════════════════════════════════════════════════════════════════
// VALIDATORS
// ═══════════════════════════════════════════════════════════════════

const issues = [];

function error(scenario, code, message) {
  issues.push({ severity: "error", scenario, code, message });
}

function warning(scenario, code, message) {
  issues.push({ severity: "warning", scenario, code, message });
}

// ── 1. Invariants coverage ─────────────────────────────────────

function checkInvariantsCoverage(rules, invariants) {
  const ruleScenarios = Object.keys(rules.scenarios);
  const invScenarios = Object.keys(invariants.scenarios);

  for (const sid of ruleScenarios) {
    if (!invScenarios.includes(sid)) {
      error(sid, "MISSING_INVARIANT", `Scenario "${sid}" in founder_rules.json has no invariant entry`);
    }
  }

  for (const sid of invScenarios) {
    if (!ruleScenarios.includes(sid)) {
      warning(sid, "ORPHAN_INVARIANT", `Invariant defined for "${sid}" but scenario not in founder_rules.json`);
    }
  }
}

// ── 2. Endings match ───────────────────────────────────────────

function checkEndingsMatch(rules, invariants) {
  for (const [sid, inv] of Object.entries(invariants.scenarios)) {
    const scenarioRules = rules.scenarios[sid];
    if (!scenarioRules) continue;

    const ruleEndings = Object.keys(scenarioRules.outcomes);
    const invEndings = inv.valid_endings;

    for (const ending of invEndings) {
      if (!ruleEndings.includes(ending)) {
        error(
          sid, "MISSING_OUTCOME",
          `Invariant declares ending "${ending}" but no matching outcome in founder_rules.json`
        );
      }
    }

    for (const ending of ruleEndings) {
      if (!invEndings.includes(ending)) {
        warning(
          sid, "UNDECLARED_ENDING",
          `Outcome "${ending}" exists in founder_rules.json but not declared in invariant valid_endings`
        );
      }
    }
  }
}

// ── 3. Deltas within allowed ranges ────────────────────────────

function checkDeltaRanges(rules, invariants) {
  for (const [sid, inv] of Object.entries(invariants.scenarios)) {
    const scenarioRules = rules.scenarios[sid];
    if (!scenarioRules) continue;

    // Skip delta range checks for dynamic negotiation scenarios
    // (their deltas are overridden at runtime by actual contract values)
    if (inv.has_dynamic_negotiation) continue;

    for (const [ending, outcome] of Object.entries(scenarioRules.outcomes)) {
      for (const [key, range] of Object.entries(inv.allowed_deltas)) {
        const delta = outcome.deltas[key];
        if (delta === undefined) continue;

        if (delta < range.min || delta > range.max) {
          error(
            sid, "DELTA_OUT_OF_RANGE",
            `Outcome "${ending}": delta.${key} = ${delta}, allowed [${range.min}, ${range.max}]`
          );
        }
      }
    }
  }
}

// ── 4. No dangerous || on numeric flags in apply-outcome ───────

function checkApplyOutcomeGuards() {
  if (!fs.existsSync(applyOutcomeFile)) {
    warning("*", "FILE_NOT_FOUND", `apply-outcome route not found at ${applyOutcomeFile}`);
    return;
  }

  const content = fs.readFileSync(applyOutcomeFile, "utf-8");
  const lines = content.split("\n");

  // Patterns that indicate dangerous falsy guards on numeric values
  const dangerousPatterns = [
    // || fallback on numeric values (treats 0 as absence)
    { re: /debrief\?\.\w+\s*\|\|/, desc: "|| fallback on debrief numeric" },
    // && guard on numeric values (treats 0 as falsy) — but allow `!= null &&`
    { re: /debrief\?\.\w+\s*&&\s*typeof/, desc: "&& guard on debrief numeric" },
    // campaign.burnRateMonthly || (should be ??)
    { re: /campaign\.burnRateMonthly\s*\|\|/, desc: "|| fallback on burnRateMonthly" },
    // outcome.deltas.X || (should be ??)
    { re: /outcome\.deltas\.\w+\s*\|\|/, desc: "|| fallback on outcome delta" },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

    for (const { re, desc } of dangerousPatterns) {
      if (re.test(line)) {
        error(
          "*", "DANGEROUS_FALSY_GUARD",
          `apply-outcome line ${i + 1}: ${desc} — "${line.trim()}"`
        );
      }
    }
  }
}

// ── 5. No hardcoded economic values in dynamic microDebrief ────

function checkMicroDebriefTemplates(rules, invariants) {
  const hardcodedPatterns = [
    /\d{1,3}[\s.]?\d{3}\s*€/,        // e.g. "12 000 €", "15000€"
    /\d+\s*%\s*d['']?equity/i,         // e.g. "3% d'equity"
    /\d+\s*%\s*d['']?BSA/i,            // e.g. "3% de BSA"
    /\d+\s*%\s*d['']?interessement/i,  // e.g. "5% d'intéressement"
  ];

  for (const [sid, inv] of Object.entries(invariants.scenarios)) {
    if (!inv.has_dynamic_negotiation) continue;

    const scenarioRules = rules.scenarios[sid];
    if (!scenarioRules) continue;

    for (const [ending, outcome] of Object.entries(scenarioRules.outcomes)) {
      const md = outcome.microDebrief;
      const texts = [md.decision, md.impact, md.strength, md.risk, md.advice].filter(Boolean);

      for (const text of texts) {
        for (const pattern of hardcodedPatterns) {
          const match = text.match(pattern);
          if (match) {
            error(
              sid, "HARDCODED_IN_DYNAMIC",
              `Outcome "${ending}" microDebrief contains hardcoded value "${match[0]}" — should use {{template}}`
            );
          }
        }
      }
    }
  }
}

// ── 6. useDebrief has specific branches for S3 and S5 ──────────

function checkUseDebriefBranches(invariants) {
  if (!fs.existsSync(useDebriefFile)) {
    warning("*", "FILE_NOT_FOUND", `useDebrief.ts not found at ${useDebriefFile}`);
    return;
  }

  const content = fs.readFileSync(useDebriefFile, "utf-8");

  // Check that S3 and S5 have explicit branches (not falling to generic)
  const scenariosNeedingBranch = [
    { id: "founder_03_clinical", pattern: /founder_03_clinical/ },
    { id: "founder_05_sales", pattern: /founder_05_sales/ },
  ];

  for (const { id, pattern } of scenariosNeedingBranch) {
    if (!pattern.test(content)) {
      error(
        id, "MISSING_DEBRIEF_BRANCH",
        `useDebrief.ts has no specific branch for "${id}" — will fall to generic score-based ending`
      );
    }
  }

  // Verify all endings from invariants are reachable
  for (const { id } of scenariosNeedingBranch) {
    const inv = invariants.scenarios[id];
    if (!inv) continue;

    for (const ending of inv.valid_endings) {
      const endingPattern = new RegExp(`ending\\s*=\\s*["']${ending}["']`);
      if (!endingPattern.test(content)) {
        error(
          id, "UNREACHABLE_ENDING",
          `Ending "${ending}" declared in invariants but not assigned in useDebrief.ts for "${id}"`
        );
      }
    }
  }
}

// ── 7. Template variables in dynamic scenarios ─────────────────

function checkTemplateVariables(rules, invariants) {
  for (const [sid, inv] of Object.entries(invariants.scenarios)) {
    if (!inv.has_dynamic_negotiation) continue;
    if (!inv.dynamic_variables) continue;

    const scenarioRules = rules.scenarios[sid];
    if (!scenarioRules) continue;

    // Collect all {{var}} references from microDebriefs
    const usedVars = new Set();
    for (const outcome of Object.values(scenarioRules.outcomes)) {
      const md = outcome.microDebrief;
      const texts = [md.decision, md.impact, md.strength, md.risk, md.advice].filter(Boolean);
      for (const text of texts) {
        const matches = text.matchAll(/\{\{(\w+)\}\}/g);
        for (const m of matches) {
          usedVars.add(m[1]);
        }
      }
    }

    if (usedVars.size === 0) {
      warning(
        sid, "NO_TEMPLATES",
        `Dynamic scenario "${sid}" has no {{template}} variables in its microDebrief texts`
      );
    }
  }
}

// ── 8. Hidden metric delta bounds ──────────────────────────────

function checkHiddenMetricBounds(rules, invariants) {
  const hiddenMetrics = ["productQuality", "techDebt", "investorConfidence", "marketValidation"];

  for (const [sid, inv] of Object.entries(invariants.scenarios)) {
    if (!inv.allowed_hidden_metric_deltas) {
      warning(sid, "NO_HIDDEN_METRIC_BOUNDS", `No allowed_hidden_metric_deltas declared`);
      continue;
    }

    const scenarioRules = rules.scenarios[sid];
    if (!scenarioRules) continue;

    for (const [ending, outcome] of Object.entries(scenarioRules.outcomes)) {
      for (const metric of hiddenMetrics) {
        const delta = outcome.deltas[metric];
        if (delta === undefined) continue;

        const range = inv.allowed_hidden_metric_deltas[metric];
        if (!range) {
          warning(sid, "MISSING_HIDDEN_METRIC_RANGE",
            `No range for "${metric}" in allowed_hidden_metric_deltas`);
          continue;
        }

        if (delta < range.min || delta > range.max) {
          error(sid, "HIDDEN_METRIC_OUT_OF_RANGE",
            `Outcome "${ending}": delta.${metric} = ${delta}, allowed [${range.min}, ${range.max}]`);
        }
      }
    }
  }
}

// ── 9. Hidden metrics are clamped 0-100 in BOUNDS ─────────────

function checkHiddenMetricClamped() {
  const founderTsFile = path.join(projectRoot, "app", "lib", "founder.ts");
  if (!fs.existsSync(founderTsFile)) {
    warning("*", "FILE_NOT_FOUND", `founder.ts not found at ${founderTsFile}`);
    return;
  }

  const content = fs.readFileSync(founderTsFile, "utf-8");
  const hiddenMetrics = ["productQuality", "techDebt", "investorConfidence", "marketValidation"];

  // Check HIDDEN_METRICS array exists
  if (!content.includes("HIDDEN_METRICS")) {
    error("*", "MISSING_HIDDEN_METRICS", "HIDDEN_METRICS constant not found in founder.ts");
    return;
  }

  // Check HIDDEN_METRIC_BOUNDS exists
  if (!content.includes("HIDDEN_METRIC_BOUNDS")) {
    error("*", "MISSING_HIDDEN_METRIC_BOUNDS", "HIDDEN_METRIC_BOUNDS constant not found in founder.ts");
    return;
  }

  // Check each hidden metric appears in BOUNDS with min:0, max:100
  for (const metric of hiddenMetrics) {
    // Look for the metric in BOUNDS block with 0-100 range
    const boundsPattern = new RegExp(`${metric}:\\s*\\{\\s*min:\\s*0,\\s*max:\\s*100\\s*\\}`);
    if (!boundsPattern.test(content)) {
      error("*", "HIDDEN_METRIC_NOT_CLAMPED",
        `"${metric}" not found in BOUNDS with { min: 0, max: 100 }`);
    }
  }
}

// ── 10. Hidden metrics not exposed in dashboard JSX ───────────

function checkNoHiddenMetricExposed() {
  const dashboardFile = path.join(projectRoot, "app", "founder", "[campaignId]", "page.tsx");
  if (!fs.existsSync(dashboardFile)) {
    warning("*", "FILE_NOT_FOUND", `Dashboard page.tsx not found at ${dashboardFile}`);
    return;
  }

  const content = fs.readFileSync(dashboardFile, "utf-8");
  const hiddenMetrics = ["productQuality", "techDebt", "investorConfidence", "marketValidation"];

  // Find JSX return block (everything after "return (")
  const returnIdx = content.lastIndexOf("return (");
  if (returnIdx < 0) {
    warning("*", "NO_RETURN_FOUND", "Could not locate JSX return block in dashboard");
    return;
  }
  const jsxBlock = content.slice(returnIdx);

  for (const metric of hiddenMetrics) {
    // Check if the metric name appears in JSX rendered content
    // Pattern: st.metric or state.metric or stateAfter.metric in JSX context
    const exposurePatterns = [
      new RegExp(`\\bst\\.${metric}\\b`),
      new RegExp(`\\bstate\\.${metric}\\b`),
      new RegExp(`\\bstateAfter\\.${metric}\\b`),
    ];

    for (const pattern of exposurePatterns) {
      if (pattern.test(jsxBlock)) {
        error("*", "HIDDEN_METRIC_EXPOSED",
          `"${metric}" appears in dashboard JSX — hidden metrics must not be shown to player`);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════

function run() {
  console.log();
  console.log(
    `${c.bold}${c.cyan}══════════════════════════════════════════════════════════${c.reset}`
  );
  console.log(
    `${c.bold}${c.cyan}  FOUNDER INVARIANT VALIDATOR${c.reset}`
  );
  console.log(
    `${c.bold}${c.cyan}══════════════════════════════════════════════════════════${c.reset}`
  );

  // Load files
  if (!fs.existsSync(rulesFile)) {
    console.error(`${c.red}ERROR: founder_rules.json not found at ${rulesFile}${c.reset}`);
    process.exit(1);
  }
  if (!fs.existsSync(invariantsFile)) {
    console.error(`${c.red}ERROR: founder_invariants.json not found at ${invariantsFile}${c.reset}`);
    process.exit(1);
  }

  const rules = JSON.parse(fs.readFileSync(rulesFile, "utf-8"));
  const invariants = JSON.parse(fs.readFileSync(invariantsFile, "utf-8"));

  console.log(
    `${c.dim}  Rules: ${Object.keys(rules.scenarios).length} scenarios${c.reset}`
  );
  console.log(
    `${c.dim}  Invariants: ${Object.keys(invariants.scenarios).length} scenarios${c.reset}`
  );
  console.log();

  // Run all checks
  checkInvariantsCoverage(rules, invariants);
  checkEndingsMatch(rules, invariants);
  checkDeltaRanges(rules, invariants);
  checkApplyOutcomeGuards();
  checkMicroDebriefTemplates(rules, invariants);
  checkUseDebriefBranches(invariants);
  checkTemplateVariables(rules, invariants);
  checkHiddenMetricBounds(rules, invariants);
  checkHiddenMetricClamped();
  checkNoHiddenMetricExposed();

  // ─── Output ──────────────────────────────────────────────────

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  // Group by scenario
  const scenarios = [...new Set(issues.map((i) => i.scenario))].sort();

  for (const sid of scenarios) {
    const scenarioIssues = issues.filter((i) => i.scenario === sid);
    const hasErrors = scenarioIssues.some((i) => i.severity === "error");
    const hasWarnings = scenarioIssues.some((i) => i.severity === "warning");

    const statusTag = hasErrors
      ? `${c.bgRed}${c.white} FAIL ${c.reset}`
      : hasWarnings
        ? `${c.bgYellow}${c.white} WARN ${c.reset}`
        : `${c.bgGreen}${c.white}  OK  ${c.reset}`;

    console.log(`${statusTag} ${c.bold}${sid}${c.reset}`);

    for (const issue of scenarioIssues) {
      if (issue.severity === "error") {
        console.log(`  ${c.red}✗ [${issue.code}]${c.reset} ${issue.message}`);
      } else {
        console.log(`  ${c.yellow}⚠ [${issue.code}]${c.reset} ${issue.message}`);
      }
    }
    console.log();
  }

  // If no issues at all, report per-scenario OK
  if (issues.length === 0) {
    for (const sid of Object.keys(rules.scenarios).sort()) {
      console.log(`${c.bgGreen}${c.white}  OK  ${c.reset} ${c.bold}${sid}${c.reset}`);
    }
    console.log();
  }

  // ─── Summary ─────────────────────────────────────────────────

  console.log(
    `${c.bold}${c.cyan}──────────────────────────────────────────────────────────${c.reset}`
  );
  console.log(`${c.bold}  SUMMARY${c.reset}`);
  console.log(
    `${c.cyan}──────────────────────────────────────────────────────────${c.reset}`
  );

  console.log(
    `  Scenarios: ${c.bold}${Object.keys(rules.scenarios).length}${c.reset}  |  ` +
    `Errors: ${c.bold}${errors.length > 0 ? c.red : c.green}${errors.length}${c.reset}  |  ` +
    `Warnings: ${c.bold}${warnings.length > 0 ? c.yellow : c.green}${warnings.length}${c.reset}`
  );
  console.log();

  if (errors.length > 0) {
    console.log(
      `  ${c.bgRed}${c.white}${c.bold} VALIDATION FAILED ${c.reset}  Fix the errors above.`
    );
  } else if (warnings.length > 0) {
    console.log(
      `  ${c.bgYellow}${c.white}${c.bold} VALIDATION PASSED ${c.reset}  ${warnings.length} warning(s) to review.`
    );
  } else {
    console.log(
      `  ${c.bgGreen}${c.white}${c.bold} VALIDATION PASSED ${c.reset}  All founder invariants OK.`
    );
  }

  console.log();
  process.exit(errors.length > 0 ? 1 : 0);
}

run();
