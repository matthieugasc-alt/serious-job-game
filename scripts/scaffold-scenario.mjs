#!/usr/bin/env node
/**
 * scaffold-scenario.mjs — CLI pour créer un nouveau scenario Revealio.
 *
 * Usage:
 *   npm run scaffold:scenario -- --id=<snake_case_id> --title="<Human title>"
 *
 * Options:
 *   --id=<string>          (obligatoire) snake_case, unique
 *   --title=<string>       (obligatoire) titre affiché à l'utilisateur
 *   --job-family=<string>  (optionnel, défaut "custom") ex: "founder", "sales", "management"
 *   --difficulty=<string>  (optionnel, défaut "intermediate") junior|intermediate|senior
 *   --duration=<number>    (optionnel, défaut 15) minutes estimées
 *   --force                (optionnel) écrase un dossier existant
 *
 * Ce que fait le script:
 *   1. Vérifie les args (id snake_case, unique sauf --force)
 *   2. Copie récursif de scripts/templates/scenario/ → scenarios/<id>/
 *   3. Patch le scenario.json avec les args
 *   4. Rewrite README.md (remplace {{SCENARIO_ID}} et {{SCENARIO_TITLE}})
 *   5. Lance validate:scenarios sur le nouveau scenario
 *   6. Print les next steps
 *
 * Exit codes:
 *   0 = succès, le scenario existe et passe la validation
 *   1 = erreur d'argument (id manquant, format invalide, dossier existe)
 *   2 = erreur système (template introuvable, copie échouée)
 *   3 = validation post-scaffold échouée (bug template — reporter)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const templateDir = path.join(__dirname, "templates", "scenario");
const scenariosDir = path.join(projectRoot, "scenarios");

// ─── Colors ──────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

function log(msg) {
  process.stdout.write(msg + "\n");
}
function err(msg) {
  process.stderr.write(`${c.red}${msg}${c.reset}\n`);
}

// ─── Args ────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    if (a === "--force") {
      out.force = true;
      continue;
    }
    const m = a.match(/^--([a-z-]+)=(.*)$/);
    if (m) out[m[1].replace(/-/g, "_")] = m[2];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (!args.id || !args.title) {
  err("Usage: npm run scaffold:scenario -- --id=<snake_case> --title=\"<Human title>\"");
  err("");
  err("Options:");
  err("  --job-family=<string>   défaut 'custom'");
  err("  --difficulty=<string>   défaut 'intermediate'");
  err("  --duration=<number>     défaut 15 (minutes)");
  err("  --force                 écrase un dossier existant");
  process.exit(1);
}

const SCENARIO_ID = args.id;
const SCENARIO_TITLE = args.title;
const JOB_FAMILY = args.job_family || "custom";
const DIFFICULTY = args.difficulty || "intermediate";
const DURATION = parseInt(args.duration || "15", 10);

if (!/^[a-z][a-z0-9_]*$/.test(SCENARIO_ID)) {
  err(`Invalid --id="${SCENARIO_ID}" — must be snake_case (lowercase, digits, underscore, starts with letter).`);
  process.exit(1);
}

const destDir = path.join(scenariosDir, SCENARIO_ID);
if (fs.existsSync(destDir) && !args.force) {
  err(`scenarios/${SCENARIO_ID}/ already exists. Use --force to overwrite.`);
  process.exit(1);
}

// ─── Sanity check template ───────────────────────────────────────
if (!fs.existsSync(templateDir)) {
  err(`Template introuvable: ${templateDir}`);
  process.exit(2);
}

// ─── Copie récursive du template ────────────────────────────────
function copyRecursive(src, dst) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dst, entry));
    }
  } else {
    fs.copyFileSync(src, dst);
  }
}

log(`${c.bold}${c.cyan}▶ Scaffolding scenario "${SCENARIO_ID}"${c.reset}`);
try {
  if (fs.existsSync(destDir) && args.force) {
    fs.rmSync(destDir, { recursive: true, force: true });
  }
  copyRecursive(templateDir, destDir);
  log(`  ${c.green}✓${c.reset} Fichiers copiés depuis le template`);
} catch (e) {
  err(`Copie échouée: ${e.message}`);
  process.exit(2);
}

// ─── Patch scenario.json ─────────────────────────────────────────
const scenarioJsonPath = path.join(destDir, "scenario.json");
const scenario = JSON.parse(fs.readFileSync(scenarioJsonPath, "utf8"));

scenario.scenario_id = SCENARIO_ID;
scenario.meta.title = SCENARIO_TITLE;
scenario.meta.job_family = JOB_FAMILY;
scenario.meta.difficulty = DIFFICULTY;
scenario.meta.estimated_duration_min = DURATION;

fs.writeFileSync(scenarioJsonPath, JSON.stringify(scenario, null, 2) + "\n", "utf8");
log(`  ${c.green}✓${c.reset} scenario.json patché (id, title, job_family, difficulty, duration)`);

// ─── Patch README.md (placeholders {{SCENARIO_ID}}, {{SCENARIO_TITLE}}) ─
const readmePath = path.join(destDir, "README.md");
if (fs.existsSync(readmePath)) {
  const readme = fs.readFileSync(readmePath, "utf8")
    .replace(/\{\{SCENARIO_ID\}\}/g, SCENARIO_ID)
    .replace(/\{\{SCENARIO_TITLE\}\}/g, SCENARIO_TITLE);
  fs.writeFileSync(readmePath, readme, "utf8");
  log(`  ${c.green}✓${c.reset} README.md personnalisé`);
}

// ─── Lance validate:scenarios ciblé ──────────────────────────────
log("");
log(`${c.bold}▶ Validation du scenario généré${c.reset}`);
const result = spawnSync("node", [
  path.join(__dirname, "validate-scenarios.mjs"),
  `--scenario=${SCENARIO_ID}`,
], { cwd: projectRoot, stdio: "inherit" });

if (result.status !== 0) {
  err("");
  err("⚠ Le scenario généré ne passe pas validate:scenarios.");
  err("  C'est un bug du template — signaler à l'équipe (scripts/templates/scenario/).");
  process.exit(3);
}

// ─── Next steps ──────────────────────────────────────────────────
log("");
log(`${c.bold}${c.green}✓ Scenario "${SCENARIO_ID}" créé avec succès.${c.reset}`);
log("");
log(`${c.bold}Prochaines étapes:${c.reset}`);
log(`  ${c.cyan}1.${c.reset} Édite ${c.bold}scenarios/${SCENARIO_ID}/scenario.json${c.reset} (autocomplete IDE actif via $schema)`);
log(`  ${c.cyan}2.${c.reset} Écris le prompt de l'actor IA dans ${c.bold}scenarios/${SCENARIO_ID}/prompts/npc_example.md${c.reset}`);
log(`  ${c.cyan}3.${c.reset} (Optionnel) ajoute des PDFs dans ${c.bold}scenarios/${SCENARIO_ID}/documents/${c.reset}`);
log(`  ${c.cyan}4.${c.reset} Lance ${c.bold}npm run dev${c.reset} et ouvre http://localhost:3000/scenarios/${SCENARIO_ID}/play`);
log("");
log(`${c.dim}Voir scenarios/${SCENARIO_ID}/README.md pour les concepts clés.${c.reset}`);
