#!/usr/bin/env npx ts-node
/**
 * Scenario Validator CLI
 *
 * Usage:
 *   npx ts-node scripts/validate-scenarios.ts
 *   npm run validate:scenarios
 *   npm run validate:scenarios -- --scenario=client_qui_hesite
 *
 * Options:
 *   --scenario=ID    Validate a single scenario by folder name
 *   --errors-only    Only show errors, hide warnings
 *   --json           Output as JSON instead of human-readable
 *
 * Exit codes:
 *   0 = all scenarios valid (no errors, warnings OK)
 *   1 = at least one scenario has errors
 */

import * as fs from "fs";
import * as path from "path";
import { validateScenario, type ValidationResult } from "../app/lib/scenarioValidator";

// ═══════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════

const projectRoot = path.resolve(__dirname, "..");
const scenariosDir = path.join(projectRoot, "scenarios");

// ═══════════════════════════════════════════════════════════════════
// CLI ARGS
// ═══════════════════════════════════════════════════════════════════

const args = process.argv.slice(2);
const singleScenario = args
  .find((a) => a.startsWith("--scenario="))
  ?.split("=")[1];
const errorsOnly = args.includes("--errors-only");
const jsonOutput = args.includes("--json");

// ═══════════════════════════════════════════════════════════════════
// COLORS (ANSI escape codes)
// ═══════════════════════════════════════════════════════════════════

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
};

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════

function discoverScenarios(): string[] {
  if (!fs.existsSync(scenariosDir)) {
    console.error(`${c.red}ERROR: Scenarios directory not found: ${scenariosDir}${c.reset}`);
    process.exit(1);
  }

  const entries = fs.readdirSync(scenariosDir, { withFileTypes: true });
  const ids: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const jsonPath = path.join(scenariosDir, entry.name, "scenario.json");
      if (fs.existsSync(jsonPath)) {
        ids.push(entry.name);
      }
    }
  }

  return ids.sort();
}

function loadScenarioJson(scenarioId: string): any {
  const jsonPath = path.join(scenariosDir, scenarioId, "scenario.json");
  const raw = fs.readFileSync(jsonPath, "utf-8");
  return JSON.parse(raw);
}

function run() {
  const scenarioIds = singleScenario
    ? [singleScenario]
    : discoverScenarios();

  if (scenarioIds.length === 0) {
    console.error(`${c.red}No scenarios found.${c.reset}`);
    process.exit(1);
  }

  const results: ValidationResult[] = [];
  let totalErrors = 0;
  let totalWarnings = 0;

  if (!jsonOutput) {
    console.log();
    console.log(
      `${c.bold}${c.cyan}══════════════════════════════════════════════════════════${c.reset}`
    );
    console.log(
      `${c.bold}${c.cyan}  SCENARIO VALIDATOR${c.reset}`
    );
    console.log(
      `${c.bold}${c.cyan}══════════════════════════════════════════════════════════${c.reset}`
    );
    console.log(
      `${c.dim}  Scanning ${scenarioIds.length} scenario(s)...${c.reset}`
    );
    console.log();
  }

  for (const id of scenarioIds) {
    let scenario: any;

    try {
      scenario = loadScenarioJson(id);
    } catch (e: any) {
      const result: ValidationResult = {
        scenarioId: id,
        errors: [
          {
            severity: "error",
            code: "JSON_PARSE_ERROR",
            message: `Failed to parse scenario.json: ${e.message}`,
          },
        ],
        warnings: [],
        total: 1,
        valid: false,
      };
      results.push(result);
      totalErrors += 1;
      continue;
    }

    const result = validateScenario(scenario, id, { projectRoot });
    results.push(result);
    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;
  }

  // ─── Output ──────────────────────────────────────────────────

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          totalScenarios: results.length,
          totalErrors,
          totalWarnings,
          allValid: totalErrors === 0,
          results,
        },
        null,
        2
      )
    );
  } else {
    for (const result of results) {
      const statusTag =
        result.errors.length > 0
          ? `${c.bgRed}${c.white} FAIL ${c.reset}`
          : result.warnings.length > 0
            ? `${c.bgYellow}${c.white} WARN ${c.reset}`
            : `${c.bgGreen}${c.white}  OK  ${c.reset}`;

      // Get meta info from the scenario
      const scenarioJson = (() => {
        try {
          return loadScenarioJson(result.scenarioId);
        } catch {
          return null;
        }
      })();
      const title = scenarioJson?.meta?.title || "?";
      const metaStatus = scenarioJson?.meta?.status || "active";
      const metaTag =
        metaStatus === "maintenance"
          ? ` ${c.dim}[maintenance]${c.reset}`
          : "";

      console.log(
        `${statusTag} ${c.bold}${result.scenarioId}${c.reset}${metaTag} — ${c.dim}${title}${c.reset}`
      );

      if (result.errors.length > 0) {
        for (const issue of result.errors) {
          const loc = issue.path ? ` ${c.dim}(${issue.path})${c.reset}` : "";
          console.log(
            `  ${c.red}✗ [${issue.code}]${c.reset} ${issue.message}${loc}`
          );
        }
      }

      if (!errorsOnly && result.warnings.length > 0) {
        for (const issue of result.warnings) {
          const loc = issue.path ? ` ${c.dim}(${issue.path})${c.reset}` : "";
          console.log(
            `  ${c.yellow}⚠ [${issue.code}]${c.reset} ${issue.message}${loc}`
          );
        }
      }

      if (result.total > 0) console.log();
    }

    // ─── Summary ─────────────────────────────────────────────────

    console.log(
      `${c.bold}${c.cyan}──────────────────────────────────────────────────────────${c.reset}`
    );
    console.log(
      `${c.bold}  SUMMARY${c.reset}`
    );
    console.log(
      `${c.cyan}──────────────────────────────────────────────────────────${c.reset}`
    );

    const passed = results.filter((r) => r.valid).length;
    const failed = results.filter((r) => !r.valid).length;

    console.log(
      `  Scenarios: ${c.bold}${results.length}${c.reset}  |  ` +
        `${c.green}${passed} passed${c.reset}  |  ` +
        `${failed > 0 ? c.red : c.dim}${failed} failed${c.reset}`
    );
    console.log(
      `  Errors:    ${c.bold}${totalErrors > 0 ? c.red : c.green}${totalErrors}${c.reset}  |  ` +
        `Warnings: ${c.bold}${totalWarnings > 0 ? c.yellow : c.green}${totalWarnings}${c.reset}`
    );
    console.log();

    if (totalErrors > 0) {
      console.log(
        `  ${c.bgRed}${c.white}${c.bold} VALIDATION FAILED ${c.reset}  Fix the errors above before deploying.`
      );
    } else if (totalWarnings > 0) {
      console.log(
        `  ${c.bgYellow}${c.white}${c.bold} VALIDATION PASSED ${c.reset}  ${totalWarnings} warning(s) to review.`
      );
    } else {
      console.log(
        `  ${c.bgGreen}${c.white}${c.bold} VALIDATION PASSED ${c.reset}  All scenarios are clean.`
      );
    }

    console.log();
  }

  process.exit(totalErrors > 0 ? 1 : 0);
}

run();
