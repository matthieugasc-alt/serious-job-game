#!/usr/bin/env npx ts-node
/**
 * Founder Invariant Validator CLI
 *
 * Usage:
 *   npx ts-node scripts/validate-founder.ts
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

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

interface Issue {
  severity: "error" | "warning";
  scenario: string;
  code: string;
  message: string;
}

interface InvariantScenario {
  scenario_id: string;
  has_dynamic_negotiation: boolean;
  dynamic_variables?: string[];
  allowed_deltas: Record<string, { min: number; max: number }>;
  required_flags_at_completion: string[];
  valid_endings: string[];
  ending_conditions: Record<string, string>;
  rules: string[];
  forbidden_patterns: string[];
}

interface InvariantsFile {
  version: string;
  scenarios: Record<string, InvariantScenario>;
}

interface MicroDebrief {
  decision: string;
  impact: string;
  strength: string;
  risk: string;
  advice?: string;
}

interface FounderOutcome {
  outcomeId: string;
  label: string;
  summary: string;
  signal: string;
  deltas: Record<string, number>;
  setsFlags?: Record<string, any>;
  microDebrief: MicroDebrief;
}

interface FounderScenarioRules {
  order: number;
  title: string;
  scenarioId: string;
  outcomes: Record<string, FounderOutcome>;
}

interface FounderRules {
  version: string;
  scenarios: Record<string, FounderScenarioRules>;
}

// ═══════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════

const projectRoot = path.resolve(__dirname, "..");
const dataDir = path.join(projectRoot, "data");
const rulesFile = path.join(dataDir, "founder_rules.json");
const invariantsFile = path.join(dataDir, "founder_invariants.json");
const applyOutcomeFile = path.join(
  projectRoot,
  "app",
  "api",
  "founder",
  "apply-outcome",
  "route.ts"
);
const useDebriefFile = path.join(
  projectRoot,
  "app",
  "scenarios",
  "[scenarioId]",
  "play",
  "hooks",
  "useDebrief.ts"
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

const issues: Issue[] = [];

function error(scenario: string, code: string, message: string) {
  issues.push({ severity: "error", scenario, code, message });
}

function warning(scenario: string, code: string, message: string) {
  issues.push({ severity: "warning", scenario, code, message });
}

// ── 1. Invariants coverage ─────────────────────────────────────

function checkInvariantsCoverage(
  rules: FounderRules,
  invariants: InvariantsFile
) {
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

function checkEndingsMatch(
  rules: FounderRules,
  invariants: InvariantsFile
) {
  for (const [sid, inv] of Object.entries(invariants.scenarios)) {
    const scenarioRules = rules.scenarios[sid];
    if (!scenarioRules) continue;

    const ruleEndings = Object.keys(scenarioRules.outcomes);
    const invEndings = inv.valid_endings;

    for (const ending of invEndings) {
      if (!ruleEndings.includes(ending)) {
        error(
          sid,
          "MISSING_OUTCOME",
          `Invariant declares ending "${ending}" but no matching outcome in founder_rules.json`
        );
      }
    }

    for (const ending of ruleEndings) {
      if (!invEndings.includes(ending)) {
        warning(
          sid,
          "UNDECLARED_ENDING",
          `Outcome "${ending}" exists in founder_rules.json but not declared in invariant valid_endings`
        );
      }
    }
  }
}

// ── 3. Deltas within allowed ranges ────────────────────────────

function checkDeltaRanges(
  rules: FounderRules,
  invariants: InvariantsFile
) {
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
            sid,
            "DELTA_OUT_OF_RANGE",
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
    /debrief\?\.\w+\s*\|\|/,
    // && guard on numeric values (treats 0 as falsy)
    /debrief\?\.\w+\s*&&\s*typeof/,
    // campaign.burnRateMonthly || (should be ??)
    /campaign\.burnRateMonthly\s*\|\|/,
    // outcome.deltas.elapsedMonths || (should be ??)
    /outcome\.deltas\.\w+\s*\|\|/,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

    for (const pattern of dangerousPatterns) {
      if (pattern.test(line)) {
        error(
          "*",
          "DANGEROUS_FALSY_GUARD",
          `apply-outcome line ${i + 1}: Dangerous || or && on numeric value: "${line.trim()}"`
        );
      }
    }
  }
}

// ── 5. No hardcoded economic values in dynamic microDebrief ────

function checkMicroDebriefTemplates(
  rules: FounderRules,
  invariants: InvariantsFile
) {
  // Hardcoded economic patterns (prices, percentages) that should be templates
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
      const texts = [md.decision, md.impact, md.strength, md.risk, md.advice].filter(Boolean) as string[];

      for (const text of texts) {
        for (const pattern of hardcodedPatterns) {
          const match = text.match(pattern);
          if (match) {
            // Check if it's inside a {{template}} — if so, it's fine
            const templatePattern = /\{\{\w+\}\}/g;
            const templates = text.match(templatePattern) || [];
            // If the text has templates AND hardcoded values, that's suspicious
            error(
              sid,
              "HARDCODED_IN_DYNAMIC",
              `Outcome "${ending}" microDebrief contains hardcoded value "${match[0]}" — should use {{template}}`
            );
          }
        }
      }
    }
  }
}

// ── 6. useDebrief has specific branches for S3 and S5 ──────────

function checkUseDebriefBranches(invariants: InvariantsFile) {
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
        id,
        "MISSING_DEBRIEF_BRANCH",
        `useDebrief.ts has no specific branch for "${id}" — will fall to generic score-based ending`
      );
    }
  }

  // Verify all endings from invariants are reachable
  for (const { id } of scenariosNeedingBranch) {
    const inv = invariants.scenarios[id];
    if (!inv) continue;

    for (const ending of inv.valid_endings) {
      // Check that the ending string appears as an assignment in useDebrief
      const endingPattern = new RegExp(`ending\\s*=\\s*["']${ending}["']`);
      if (!endingPattern.test(content)) {
        error(
          id,
          "UNREACHABLE_ENDING",
          `Ending "${ending}" declared in invariants but not assigned in useDebrief.ts for "${id}"`
        );
      }
    }
  }
}

// ── 7. Template variables in dynamic scenarios ─────────────────

function checkTemplateVariables(
  rules: FounderRules,
  invariants: InvariantsFile
) {
  for (const [sid, inv] of Object.entries(invariants.scenarios)) {
    if (!inv.has_dynamic_negotiation) continue;
    if (!inv.dynamic_variables) continue;

    const scenarioRules = rules.scenarios[sid];
    if (!scenarioRules) continue;

    // Collect all {{var}} references from microDebriefs
    const usedVars = new Set<string>();
    for (const outcome of Object.values(scenarioRules.outcomes)) {
      const md = outcome.microDebrief;
      const texts = [md.decision, md.impact, md.strength, md.risk, md.advice].filter(Boolean) as string[];
      for (const text of texts) {
        const matches = text.matchAll(/\{\{(\w+)\}\}/g);
        for (const m of matches) {
          usedVars.add(m[1]);
        }
      }
    }

    // Check at least some templates are used
    if (usedVars.size === 0) {
      warning(
        sid,
        "NO_TEMPLATES",
        `Dynamic scenario "${sid}" has no {{template}} variables in its microDebrief texts`
      );
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

  const rules: FounderRules = JSON.parse(fs.readFileSync(rulesFile, "utf-8"));
  const invariants: InvariantsFile = JSON.parse(fs.readFileSync(invariantsFile, "utf-8"));

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
