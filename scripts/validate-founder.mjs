#!/usr/bin/env node
/**
 * Founder Invariant Validator CLI — version moteur v2 (mécaniques).
 *
 * Usage:
 *   node scripts/validate-founder.mjs
 *   npm run validate:founder
 *
 * Réécrit lors de la purge du legacy v1 (archive/legacy-v1/ARCHIVE.md).
 * L'ancien validateur vérifiait des invariants du player par phases
 * (useDebrief, apply-outcome legacy). Ce qui reste précieux en v2 :
 *
 *   1. Chaque scénario founder_* (format v2) est couvert par
 *      data/founder_rules.json (scenarios[scenario_id] existe).
 *   2. Chaque ending déclaré dans scenario.json (endings[].id) a un
 *      outcome correspondant dans founder_rules.json — sinon
 *      /api/v2/complete → resolveOutcome() jette à runtime.
 *   3. Réciproque : chaque outcome de founder_rules.json correspond à
 *      un ending déclaré (sinon outcome mort = règle inatteignable).
 *   4. Exactement un ending `default: true` par scénario (filet de
 *      sécurité computeEndingV2).
 *
 * Exit codes:
 *   0 = all checks pass
 *   1 = at least one error
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const rulesFile = path.join(projectRoot, "data", "founder_rules.json");
const scenariosDir = path.join(projectRoot, "scenarios");

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

const errors = [];
const warnings = [];

// ─── Load founder_rules.json ────────────────────────────────────

if (!fs.existsSync(rulesFile)) {
  console.error(`${c.red}✗ data/founder_rules.json introuvable${c.reset}`);
  process.exit(1);
}
const rules = JSON.parse(fs.readFileSync(rulesFile, "utf8"));
const ruleScenarios = rules.scenarios ?? {};

// ─── Discover founder scenarios (format v2) ─────────────────────

const founderDirs = fs
  .readdirSync(scenariosDir)
  .filter((d) => d.startsWith("founder_"))
  .filter((d) => fs.existsSync(path.join(scenariosDir, d, "scenario.json")));

if (founderDirs.length === 0) {
  console.error(`${c.red}✗ Aucun scénario founder_* trouvé dans scenarios/${c.reset}`);
  process.exit(1);
}

const seenScenarioIds = new Set();

for (const dir of founderDirs) {
  const scenario = JSON.parse(
    fs.readFileSync(path.join(scenariosDir, dir, "scenario.json"), "utf8"),
  );
  const sid = scenario.scenario_id ?? dir;
  seenScenarioIds.add(sid);

  // v2 (Shell) et v3 (WorkspacePlayer) partagent le même flux de fin
  // (/api/v2/complete) : les invariants endings ↔ outcomes s'appliquent
  // aux deux formats.
  if (scenario.format !== "v2" && scenario.format !== "v3") {
    errors.push(`${dir} : format "${scenario.format}" ≠ "v2"/"v3" (le flow founder est branché sur /api/v2/complete)`);
    continue;
  }

  // 1. Couverture founder_rules
  const scenarioRules = ruleScenarios[sid];
  if (!scenarioRules) {
    errors.push(`${sid} : absent de founder_rules.json → /api/v2/complete refusera la complétion campagne`);
    continue;
  }

  const endingIds = (scenario.endings ?? []).map((e) => e.id);
  const outcomeIds = Object.keys(scenarioRules.outcomes ?? {});

  // 2. Chaque ending v2 doit avoir un outcome économique
  for (const id of endingIds) {
    if (!outcomeIds.includes(id)) {
      errors.push(`${sid} : ending "${id}" sans outcome dans founder_rules.json → resolveOutcome() jettera à runtime`);
    }
  }

  // 3. Chaque outcome doit correspondre à un ending déclaré
  for (const id of outcomeIds) {
    if (!endingIds.includes(id)) {
      warnings.push(`${sid} : outcome "${id}" de founder_rules.json ne correspond à aucun ending v2 (outcome mort)`);
    }
  }

  // 4. Exactement un ending default
  const defaults = (scenario.endings ?? []).filter((e) => e.default === true);
  if (defaults.length !== 1) {
    errors.push(`${sid} : ${defaults.length} ending(s) default (exactement 1 requis pour computeEndingV2)`);
  }
}

// Réciproque globale : founder_rules ne référence pas de scénario disparu
for (const sid of Object.keys(ruleScenarios)) {
  if (!seenScenarioIds.has(sid)) {
    warnings.push(`founder_rules.json : scénario "${sid}" introuvable dans scenarios/`);
  }
}

// ─── Report ─────────────────────────────────────────────────────

console.log(`${c.bold}${c.cyan}Founder Invariant Validator (v2)${c.reset}`);
console.log(`${founderDirs.length} scénario(s) founder vérifié(s) contre founder_rules.json\n`);

for (const w of warnings) console.log(`${c.yellow}⚠ ${w}${c.reset}`);
for (const e of errors) console.log(`${c.red}✗ ${e}${c.reset}`);

if (errors.length === 0) {
  console.log(`${c.green}✓ endings v2 ↔ outcomes founder_rules.json : cohérents${c.reset}`);
  process.exit(0);
} else {
  console.log(`\n${c.red}${errors.length} erreur(s).${c.reset}`);
  process.exit(1);
}
