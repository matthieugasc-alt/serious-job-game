#!/usr/bin/env node
/**
 * Scenario Validator CLI
 *
 * Usage:
 *   node scripts/validate-scenarios.mjs
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

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ═══════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════

const projectRoot = path.resolve(__dirname, "..");
const scenariosDir = path.join(projectRoot, "scenarios");
const publicDir = path.join(projectRoot, "public");

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
// VALIDATOR (inline — avoids TS import issues)
// ═══════════════════════════════════════════════════════════════════

function err(code, message, p) {
  return { severity: "error", code, message, path: p };
}

function warn(code, message, p) {
  return { severity: "warning", code, message, path: p };
}

function resolveDocPath(docPath) {
  if (docPath.startsWith("/")) {
    const full = path.join(publicDir, docPath);
    if (fs.existsSync(full)) return full;
  }
  const publicDirect = path.join(publicDir, docPath);
  if (fs.existsSync(publicDirect)) return publicDirect;
  return null;
}

function checkDeterministicTrigger(phase) {
  if (phase.max_duration_sec && typeof phase.max_duration_sec === "number") return true;
  if (phase.auto_advance_at) return true;
  if (phase.mail_config?.send_advances_phase === true) return true;
  const rules = phase.completion_rules;
  if (!rules) return false;
  if (Array.isArray(rules.any_flags) && rules.any_flags.length > 0) return true;
  if (Array.isArray(rules.all_flags) && rules.all_flags.length > 0) return true;
  if (rules.max_exchanges !== undefined && typeof rules.max_exchanges === "number") return true;
  return false;
}

function collectTextFields(obj, prefix = "") {
  const results = [];
  if (!obj || typeof obj !== "object") return results;
  const skipKeys = new Set([
    "prompt_file", "file_path", "image_path", "doc_id", "actor_id",
    "phase_id", "channel_id", "criterion_id", "event_id", "interrupt_id",
    "scenario_id", "ending_id",
  ]);
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = prefix ? `${prefix}.${key}` : key;
    if (skipKeys.has(key)) continue;
    if (typeof value === "string" && value.length > 0) {
      results.push({ value, fieldPath: currentPath });
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        if (typeof value[i] === "string" && value[i].length > 0) {
          results.push({ value: value[i], fieldPath: `${currentPath}[${i}]` });
        } else if (typeof value[i] === "object") {
          results.push(...collectTextFields(value[i], `${currentPath}[${i}]`));
        }
      }
    } else if (typeof value === "object") {
      results.push(...collectTextFields(value, currentPath));
    }
  }
  return results;
}

function validateScenario(scenario, scenarioId) {
  const issues = [];
  const scenarioDir = path.join(scenariosDir, scenarioId);
  const isFounder = scenarioId.startsWith("founder_");

  // ─── 1. Basic structure ───────────────────────────────────────

  if (!scenario || typeof scenario !== "object") {
    issues.push(err("INVALID_JSON", "Scenario is not a valid object"));
    return buildResult(scenarioId, issues);
  }

  if (!scenario.scenario_id) issues.push(err("MISSING_ID", "Missing scenario_id"));
  if (!scenario.meta) {
    issues.push(err("MISSING_META", "Missing meta section"));
  } else {
    if (!scenario.meta.title) issues.push(err("MISSING_TITLE", "Missing meta.title"));
    if (!scenario.meta.job_family) issues.push(warn("MISSING_JOB_FAMILY", "Missing meta.job_family"));
  }

  if (!Array.isArray(scenario.phases) || scenario.phases.length === 0) {
    issues.push(err("NO_PHASES", "Scenario has no phases"));
    return buildResult(scenarioId, issues);
  }

  // ─── 2. Actors ────────────────────────────────────────────────

  const actors = scenario.actors || [];
  const actorIds = new Set(actors.map((a) => a.actor_id));
  const dynamicPlaceholders = new Set(["chosen_cto", "chosen_kol", "player"]);

  for (let i = 0; i < actors.length; i++) {
    const actor = actors[i];
    const p = `actors[${i}]`;

    if (!actor.actor_id) {
      issues.push(err("ACTOR_NO_ID", `Actor at index ${i} has no actor_id`, p));
      continue;
    }
    if (!actor.name) issues.push(warn("ACTOR_NO_NAME", `Actor "${actor.actor_id}" has no name`, p));
    if (!actor.controlled_by) issues.push(err("ACTOR_NO_CONTROLLER", `Actor "${actor.actor_id}" has no controlled_by`, p));

    // Check prompt file for AI actors
    if (actor.controlled_by === "ai" && actor.prompt_file) {
      // prompt_file may already include "prompts/" prefix — handle both cases
      const promptFile = actor.prompt_file;
      const promptPath = promptFile.startsWith("prompts/")
        ? path.join(scenarioDir, promptFile)
        : path.join(scenarioDir, "prompts", promptFile);
      const promptPathMd = promptPath.endsWith(".md") ? promptPath : promptPath + ".md";
      if (!fs.existsSync(promptPath) && !fs.existsSync(promptPathMd)) {
        issues.push(err("PROMPT_FILE_MISSING", `Prompt file not found: ${actor.prompt_file}`, `${p}.prompt_file`));
      }
    }

    if (actor.controlled_by === "ai" && !actor.prompt_file && !actor.system_prompt) {
      issues.push(warn("AI_ACTOR_NO_PROMPT", `AI actor "${actor.actor_id}" has no prompt_file — will use generic fallback`, p));
    }
  }

  // Duplicate actor_ids
  const seenActorIds = new Set();
  for (const actor of actors) {
    if (!actor.actor_id) continue;
    if (seenActorIds.has(actor.actor_id)) {
      issues.push(err("DUPLICATE_ACTOR_ID", `Duplicate actor_id: "${actor.actor_id}"`, "actors"));
    }
    seenActorIds.add(actor.actor_id);
  }

  // ─── 3. Channels ──────────────────────────────────────────────

  const channels = scenario.channels || [];
  const channelIds = new Set(channels.map((c) => c.channel_id));
  if (channels.length === 0) issues.push(warn("NO_CHANNELS", "Scenario has no channels defined"));

  // ─── 4. Phases ────────────────────────────────────────────────

  const phases = scenario.phases;
  const phaseIds = new Set();
  const allPhaseIds = phases.map((p) => p.phase_id || p.id).filter(Boolean);
  const allPhaseIdSet = new Set(allPhaseIds);

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const pid = phase.phase_id || phase.id;
    const p = `phases[${i}]`;

    if (!pid) {
      issues.push(err("PHASE_NO_ID", `Phase at index ${i} has no phase_id`, p));
      continue;
    }
    if (phaseIds.has(pid)) issues.push(err("DUPLICATE_PHASE_ID", `Duplicate phase_id: "${pid}"`, p));
    phaseIds.add(pid);

    // ai_actors reference existing actors
    if (Array.isArray(phase.ai_actors)) {
      for (let j = 0; j < phase.ai_actors.length; j++) {
        const ref = phase.ai_actors[j];
        if (!actorIds.has(ref) && !dynamicPlaceholders.has(ref)) {
          issues.push(err("PHASE_ACTOR_MISSING", `Phase "${pid}" references unknown actor: "${ref}"`, `${p}.ai_actors[${j}]`));
        }
      }
    }

    // active_channels
    if (Array.isArray(phase.active_channels)) {
      for (const ch of phase.active_channels) {
        if (!channelIds.has(ch)) {
          issues.push(err("PHASE_CHANNEL_MISSING", `Phase "${pid}" references unknown channel: "${ch}"`, `${p}.active_channels`));
        }
      }
    }

    // next_phase
    if (phase.next_phase && phase.next_phase !== "finish") {
      if (!allPhaseIdSet.has(phase.next_phase)) {
        issues.push(err("INVALID_NEXT_PHASE", `Phase "${pid}" has next_phase="${phase.next_phase}" which does not exist`, `${p}.next_phase`));
      }
    }

    // failure_rules.next_phase
    if (phase.failure_rules?.next_phase && !allPhaseIdSet.has(phase.failure_rules.next_phase)) {
      issues.push(err("INVALID_FAILURE_NEXT_PHASE", `Phase "${pid}" failure_rules.next_phase="${phase.failure_rules.next_phase}" does not exist`, `${p}.failure_rules.next_phase`));
    }

    // Deterministic exit trigger
    if (!checkDeterministicTrigger(phase)) {
      const severity = isFounder ? "warning" : "error";
      issues.push({
        severity, code: "NO_DETERMINISTIC_TRIGGER",
        message: `Phase "${pid}" has no deterministic exit trigger. Relies solely on min_score (AI-based). Add max_duration_sec, max_exchanges, send_advances_phase, any_flags, or all_flags.`,
        path: p,
      });
    }

    // scoring.criteria
    if (phase.scoring && (!phase.scoring.criteria || !Array.isArray(phase.scoring.criteria) || phase.scoring.criteria.length === 0)) {
      issues.push(warn("EMPTY_SCORING_CRITERIA", `Phase "${pid}" has scoring section but no criteria array`, `${p}.scoring`));
    }

    // entry_events actor refs
    const entryEvents = [...(phase.entry_events || []), ...(phase.system_messages || []), ...(phase.incoming || [])];
    for (let j = 0; j < entryEvents.length; j++) {
      const ev = entryEvents[j];
      const evActor = ev.actor || ev.source_actor;
      if (evActor && !actorIds.has(evActor) && !dynamicPlaceholders.has(evActor) && evActor !== "system") {
        issues.push(warn("ENTRY_EVENT_ACTOR_MISSING", `Phase "${pid}" entry_event references unknown actor: "${evActor}"`, `${p}.entry_events[${j}]`));
      }
    }

    // interruptions actor refs
    if (Array.isArray(phase.interruptions)) {
      for (let j = 0; j < phase.interruptions.length; j++) {
        const intr = phase.interruptions[j];
        const intrActor = intr.actor || intr.source_actor;
        if (intrActor && !actorIds.has(intrActor) && !dynamicPlaceholders.has(intrActor) && intrActor !== "system") {
          issues.push(warn("INTERRUPTION_ACTOR_MISSING", `Phase "${pid}" interruption references unknown actor: "${intrActor}"`, `${p}.interruptions[${j}]`));
        }
      }
    }
  }

  // ─── 5. Documents ─────────────────────────────────────────────

  const documents = scenario.resources?.documents || [];
  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const p = `resources.documents[${i}]`;

    if (!doc.doc_id) issues.push(err("DOC_NO_ID", `Document at index ${i} has no doc_id`, p));

    if (doc.file_path && !doc.file_path.startsWith("_internal_") && !resolveDocPath(doc.file_path)) {
      issues.push(err("DOC_FILE_MISSING", `Document "${doc.doc_id || i}": file_path "${doc.file_path}" not found`, `${p}.file_path`));
    }
    if (doc.image_path && !resolveDocPath(doc.image_path)) {
      issues.push(err("DOC_IMAGE_MISSING", `Document "${doc.doc_id || i}": image_path "${doc.image_path}" not found`, `${p}.image_path`));
    }
    if (!doc.file_path && !doc.image_path && !doc.content) {
      issues.push(warn("DOC_EMPTY", `Document "${doc.doc_id || i}" has no file_path, no image_path, and no content`, p));
    }
    if (doc.available_from_phase && !allPhaseIdSet.has(doc.available_from_phase)) {
      issues.push(warn("DOC_INVALID_PHASE_REF", `Document "${doc.doc_id || i}" available_from_phase="${doc.available_from_phase}" does not match any phase_id`, `${p}.available_from_phase`));
    }
    if (doc.hidden_until_phase && !allPhaseIdSet.has(doc.hidden_until_phase)) {
      issues.push(warn("DOC_INVALID_PHASE_REF", `Document "${doc.doc_id || i}" hidden_until_phase="${doc.hidden_until_phase}" does not match any phase_id`, `${p}.hidden_until_phase`));
    }
  }

  // ─── 6. Orphan competencies ───────────────────────────────────

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const pid = phase.phase_id || phase.id || `index_${i}`;
    if (phase.competencies && !phase.scoring?.criteria) {
      issues.push(err("ORPHAN_COMPETENCIES", `Phase "${pid}" uses "competencies" but engine reads "scoring.criteria". This phase will never be scored.`, `phases[${i}].competencies`));
    }
    if (phase.competencies && phase.scoring?.criteria) {
      issues.push(warn("DUAL_COMPETENCIES", `Phase "${pid}" has both "competencies" AND "scoring.criteria". Only "scoring.criteria" is used.`, `phases[${i}]`));
    }
  }

  // ─── 7. Placeholder detection ─────────────────────────────────

  const suspiciousPatterns = [
    { pattern: /\{\{[^}]*\}\}/g, desc: "Unresolved template variable" },
    { pattern: /\bundefined\b/gi, desc: "Literal 'undefined'" },
  ];
  const legitimateVars = new Set([
    "{{phaseTitle}}", "{{phaseObjective}}", "{{phaseFocus}}", "{{phasePrompt}}",
    "{{playerName}}", "{{message}}", "{{recentConversation}}", "{{narrative}}",
    "{{mode}}", "{{modeGuidance}}",
  ]);

  const textFields = collectTextFields(scenario);
  for (const { value, fieldPath } of textFields) {
    for (const { pattern, desc } of suspiciousPatterns) {
      const matches = value.match(pattern);
      if (!matches) continue;
      for (const match of matches) {
        if (legitimateVars.has(match)) continue;
        if (match.startsWith("{{establishment_")) continue;
        issues.push(warn("SUSPICIOUS_PLACEHOLDER", `${desc}: "${match}" found`, fieldPath));
      }
    }
  }

  // ─── 8. Initial events ────────────────────────────────────────

  if (Array.isArray(scenario.initial_events)) {
    for (let i = 0; i < scenario.initial_events.length; i++) {
      const ev = scenario.initial_events[i];
      if (ev.actor && !actorIds.has(ev.actor) && !dynamicPlaceholders.has(ev.actor) && ev.actor !== "system") {
        issues.push(err("INITIAL_EVENT_ACTOR_MISSING", `Initial event references unknown actor: "${ev.actor}"`, `initial_events[${i}]`));
      }
    }
  }

  // ─── 9. Endings ───────────────────────────────────────────────

  if ((!Array.isArray(scenario.endings) || scenario.endings.length === 0) && !scenario.default_ending) {
    issues.push(warn("NO_ENDINGS", "No endings and no default_ending — will use generic fallback"));
  }

  // ─── 10. Circular next_phase detection ────────────────────────

  const visited = new Set();
  let current = phases[0]?.phase_id || phases[0]?.id;
  let steps = 0;
  while (current && steps < phases.length + 1) {
    if (visited.has(current)) {
      issues.push(err("CIRCULAR_PHASE_CHAIN", `Circular phase chain detected at "${current}"`));
      break;
    }
    visited.add(current);
    const phaseObj = phases.find((ph) => (ph.phase_id || ph.id) === current);
    if (!phaseObj) break;
    current = phaseObj.next_phase;
    if (current === "finish") break;
    steps++;
  }

  // Orphan phases
  for (const phase of phases) {
    const pid = phase.phase_id || phase.id;
    if (pid && !visited.has(pid)) {
      const isFailureTarget = phases.some((p) => p.failure_rules?.next_phase === pid);
      if (!isFailureTarget) {
        issues.push(warn("ORPHAN_PHASE", `Phase "${pid}" is not reachable from the main phase chain`));
      }
    }
  }

  return buildResult(scenarioId, issues);
}

function buildResult(scenarioId, issues) {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  return { scenarioId, errors, warnings, total: issues.length, valid: errors.length === 0 };
}

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════

function discoverScenarios() {
  if (!fs.existsSync(scenariosDir)) {
    console.error(`${c.red}ERROR: Scenarios directory not found: ${scenariosDir}${c.reset}`);
    process.exit(1);
  }
  const entries = fs.readdirSync(scenariosDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(scenariosDir, e.name, "scenario.json")))
    .map((e) => e.name)
    .sort();
}

function run() {
  const scenarioIds = singleScenario ? [singleScenario] : discoverScenarios();
  if (scenarioIds.length === 0) {
    console.error(`${c.red}No scenarios found.${c.reset}`);
    process.exit(1);
  }

  const results = [];
  let totalErrors = 0;
  let totalWarnings = 0;

  if (!jsonOutput) {
    console.log();
    console.log(`${c.bold}${c.cyan}══════════════════════════════════════════════════════════${c.reset}`);
    console.log(`${c.bold}${c.cyan}  SCENARIO VALIDATOR${c.reset}`);
    console.log(`${c.bold}${c.cyan}══════════════════════════════════════════════════════════${c.reset}`);
    console.log(`${c.dim}  Scanning ${scenarioIds.length} scenario(s)...${c.reset}`);
    console.log();
  }

  for (const id of scenarioIds) {
    let scenario;
    try {
      const raw = fs.readFileSync(path.join(scenariosDir, id, "scenario.json"), "utf-8");
      scenario = JSON.parse(raw);
    } catch (e) {
      const result = {
        scenarioId: id,
        errors: [{ severity: "error", code: "JSON_PARSE_ERROR", message: `Failed to parse: ${e.message}` }],
        warnings: [], total: 1, valid: false,
      };
      results.push(result);
      totalErrors += 1;
      continue;
    }

    const result = validateScenario(scenario, id);
    results.push(result);
    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;
  }

  // ─── Output ──────────────────────────────────────────────────

  if (jsonOutput) {
    console.log(JSON.stringify({ totalScenarios: results.length, totalErrors, totalWarnings, allValid: totalErrors === 0, results }, null, 2));
  } else {
    for (const result of results) {
      const statusTag = result.errors.length > 0
        ? `${c.bgRed}${c.white} FAIL ${c.reset}`
        : result.warnings.length > 0
          ? `${c.bgYellow}${c.white} WARN ${c.reset}`
          : `${c.bgGreen}${c.white}  OK  ${c.reset}`;

      let title = "?";
      let metaStatus = "active";
      try {
        const raw = fs.readFileSync(path.join(scenariosDir, result.scenarioId, "scenario.json"), "utf-8");
        const s = JSON.parse(raw);
        title = s?.meta?.title || "?";
        metaStatus = s?.meta?.status || "active";
      } catch {}

      const metaTag = metaStatus === "maintenance" ? ` ${c.dim}[maintenance]${c.reset}` : "";
      console.log(`${statusTag} ${c.bold}${result.scenarioId}${c.reset}${metaTag} — ${c.dim}${title}${c.reset}`);

      if (result.errors.length > 0) {
        for (const issue of result.errors) {
          const loc = issue.path ? ` ${c.dim}(${issue.path})${c.reset}` : "";
          console.log(`  ${c.red}✗ [${issue.code}]${c.reset} ${issue.message}${loc}`);
        }
      }
      if (!errorsOnly && result.warnings.length > 0) {
        for (const issue of result.warnings) {
          const loc = issue.path ? ` ${c.dim}(${issue.path})${c.reset}` : "";
          console.log(`  ${c.yellow}⚠ [${issue.code}]${c.reset} ${issue.message}${loc}`);
        }
      }
      if (result.total > 0) console.log();
    }

    // Summary
    console.log(`${c.bold}${c.cyan}──────────────────────────────────────────────────────────${c.reset}`);
    console.log(`${c.bold}  SUMMARY${c.reset}`);
    console.log(`${c.cyan}──────────────────────────────────────────────────────────${c.reset}`);

    const passed = results.filter((r) => r.valid).length;
    const failed = results.filter((r) => !r.valid).length;

    console.log(`  Scenarios: ${c.bold}${results.length}${c.reset}  |  ${c.green}${passed} passed${c.reset}  |  ${failed > 0 ? c.red : c.dim}${failed} failed${c.reset}`);
    console.log(`  Errors:    ${c.bold}${totalErrors > 0 ? c.red : c.green}${totalErrors}${c.reset}  |  Warnings: ${c.bold}${totalWarnings > 0 ? c.yellow : c.green}${totalWarnings}${c.reset}`);
    console.log();

    if (totalErrors > 0) {
      console.log(`  ${c.bgRed}${c.white}${c.bold} VALIDATION FAILED ${c.reset}  Fix the errors above before deploying.`);
    } else if (totalWarnings > 0) {
      console.log(`  ${c.bgYellow}${c.white}${c.bold} VALIDATION PASSED ${c.reset}  ${totalWarnings} warning(s) to review.`);
    } else {
      console.log(`  ${c.bgGreen}${c.white}${c.bold} VALIDATION PASSED ${c.reset}  All scenarios are clean.`);
    }
    console.log();
  }

  process.exit(totalErrors > 0 ? 1 : 0);
}

run();
