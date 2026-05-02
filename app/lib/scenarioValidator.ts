/**
 * Scenario Validator — Non-destructive validation layer
 *
 * This module validates scenario JSON files against structural invariants.
 * It does NOT modify any files or affect runtime behavior.
 *
 * Usage:
 *   import { validateScenario } from './scenarioValidator';
 *   const result = validateScenario(scenarioJson, scenarioId, options);
 *   // result.errors   → blocking issues (scenario will break)
 *   // result.warnings → non-blocking issues (scenario may misbehave)
 */

import * as fs from "fs";
import * as path from "path";

// ═══════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════

export type ValidationSeverity = "error" | "warning";

export type ValidationIssue = {
  severity: ValidationSeverity;
  code: string;
  message: string;
  /** Where the issue was found (e.g., "phases[2].ai_actors[0]") */
  path?: string;
};

export type ValidationResult = {
  scenarioId: string;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  /** Total count of issues */
  total: number;
  /** True if no errors (warnings are OK) */
  valid: boolean;
};

export type ValidatorOptions = {
  /** Root directory of the project (default: process.cwd()) */
  projectRoot?: string;
  /** Directory where scenarios live (default: projectRoot/scenarios) */
  scenariosDir?: string;
  /** Directory for public assets (default: projectRoot/public) */
  publicDir?: string;
};

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function issue(
  severity: ValidationSeverity,
  code: string,
  message: string,
  issuePath?: string
): ValidationIssue {
  return { severity, code, message, path: issuePath };
}

function err(code: string, message: string, p?: string) {
  return issue("error", code, message, p);
}

function warn(code: string, message: string, p?: string) {
  return issue("warning", code, message, p);
}

// ═══════════════════════════════════════════════════════════════════
// MAIN VALIDATOR
// ═══════════════════════════════════════════════════════════════════

export function validateScenario(
  scenario: any,
  scenarioId: string,
  options: ValidatorOptions = {}
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const projectRoot = options.projectRoot || process.cwd();
  const scenariosDir =
    options.scenariosDir || path.join(projectRoot, "scenarios");
  const publicDir = options.publicDir || path.join(projectRoot, "public");
  const scenarioDir = path.join(scenariosDir, scenarioId);

  const isFounder = scenarioId.startsWith("founder_");

  // ─── 1. Basic structure ───────────────────────────────────────

  if (!scenario || typeof scenario !== "object") {
    issues.push(err("INVALID_JSON", "Scenario is not a valid object"));
    return buildResult(scenarioId, issues);
  }

  if (!scenario.scenario_id) {
    issues.push(err("MISSING_ID", "Missing scenario_id"));
  }

  if (!scenario.meta) {
    issues.push(err("MISSING_META", "Missing meta section"));
  } else {
    if (!scenario.meta.title)
      issues.push(err("MISSING_TITLE", "Missing meta.title"));
    if (!scenario.meta.job_family)
      issues.push(warn("MISSING_JOB_FAMILY", "Missing meta.job_family"));
  }

  if (!Array.isArray(scenario.phases) || scenario.phases.length === 0) {
    issues.push(err("NO_PHASES", "Scenario has no phases"));
    return buildResult(scenarioId, issues);
  }

  // ─── 2. Actors ────────────────────────────────────────────────

  const actors: any[] = scenario.actors || [];
  const actorIds = new Set(actors.map((a: any) => a.actor_id));
  // Dynamic actor placeholders that are resolved at runtime
  const dynamicPlaceholders = new Set(["chosen_cto", "chosen_kol", "player"]);

  for (let i = 0; i < actors.length; i++) {
    const actor = actors[i];
    const p = `actors[${i}]`;

    if (!actor.actor_id) {
      issues.push(err("ACTOR_NO_ID", `Actor at index ${i} has no actor_id`, p));
      continue;
    }

    if (!actor.name) {
      issues.push(warn("ACTOR_NO_NAME", `Actor "${actor.actor_id}" has no name`, p));
    }

    if (!actor.controlled_by) {
      issues.push(
        err(
          "ACTOR_NO_CONTROLLER",
          `Actor "${actor.actor_id}" has no controlled_by`,
          p
        )
      );
    }

    // Check prompt file exists for AI actors
    if (actor.controlled_by === "ai" && actor.prompt_file) {
      // prompt_file may already include "prompts/" prefix (e.g. "prompts/actor.md")
      // or be just a filename (e.g. "actor.md"). Handle both cases.
      const promptFile: string = actor.prompt_file;
      const promptPath = promptFile.startsWith("prompts/")
        ? path.join(scenarioDir, promptFile)
        : path.join(scenarioDir, "prompts", promptFile);
      if (!fs.existsSync(promptPath)) {
        // Also try with .md extension appended
        const promptPathMd = promptPath.endsWith(".md")
          ? promptPath
          : promptPath + ".md";
        if (!fs.existsSync(promptPathMd)) {
          issues.push(
            err(
              "PROMPT_FILE_MISSING",
              `Prompt file not found: ${actor.prompt_file} (looked in ${path.relative(projectRoot, promptPath)})`,
              `${p}.prompt_file`
            )
          );
        }
      }
    }

    // AI actor without prompt_file and without system_prompt
    if (
      actor.controlled_by === "ai" &&
      !actor.prompt_file &&
      !actor.system_prompt
    ) {
      issues.push(
        warn(
          "AI_ACTOR_NO_PROMPT",
          `AI actor "${actor.actor_id}" has no prompt_file and no system_prompt — will use generic fallback`,
          p
        )
      );
    }
  }

  // Duplicate actor_ids
  const seenActorIds = new Set<string>();
  for (const actor of actors) {
    if (!actor.actor_id) continue;
    if (seenActorIds.has(actor.actor_id)) {
      issues.push(
        err(
          "DUPLICATE_ACTOR_ID",
          `Duplicate actor_id: "${actor.actor_id}"`,
          "actors"
        )
      );
    }
    seenActorIds.add(actor.actor_id);
  }

  // ─── 3. Channels ──────────────────────────────────────────────

  const channels: any[] = scenario.channels || [];
  const channelIds = new Set(channels.map((c: any) => c.channel_id));

  if (channels.length === 0) {
    issues.push(warn("NO_CHANNELS", "Scenario has no channels defined"));
  }

  // ─── 4. Phases ────────────────────────────────────────────────

  const phases: any[] = scenario.phases;
  const phaseIds = new Set<string>();
  const allPhaseIds: string[] = [];

  // Collect all phase IDs first (for next_phase validation)
  for (const phase of phases) {
    const pid = phase.phase_id || phase.id;
    if (pid) allPhaseIds.push(pid);
  }
  const allPhaseIdSet = new Set(allPhaseIds);

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const pid = phase.phase_id || phase.id;
    const p = `phases[${i}]`;

    // 4a. phase_id exists and is unique
    if (!pid) {
      issues.push(err("PHASE_NO_ID", `Phase at index ${i} has no phase_id`, p));
      continue;
    }

    if (phaseIds.has(pid)) {
      issues.push(
        err("DUPLICATE_PHASE_ID", `Duplicate phase_id: "${pid}"`, p)
      );
    }
    phaseIds.add(pid);

    // 4b. ai_actors reference existing actors
    if (Array.isArray(phase.ai_actors)) {
      for (let j = 0; j < phase.ai_actors.length; j++) {
        const actorRef = phase.ai_actors[j];
        if (
          !actorIds.has(actorRef) &&
          !dynamicPlaceholders.has(actorRef)
        ) {
          issues.push(
            err(
              "PHASE_ACTOR_MISSING",
              `Phase "${pid}" references unknown actor: "${actorRef}"`,
              `${p}.ai_actors[${j}]`
            )
          );
        }
      }
    }

    // 4c. active_channels reference existing channels
    if (Array.isArray(phase.active_channels)) {
      for (const ch of phase.active_channels) {
        if (!channelIds.has(ch)) {
          issues.push(
            err(
              "PHASE_CHANNEL_MISSING",
              `Phase "${pid}" references unknown channel: "${ch}"`,
              `${p}.active_channels`
            )
          );
        }
      }
    }

    // 4d. next_phase points to an existing phase
    if (phase.next_phase && phase.next_phase !== "finish") {
      if (!allPhaseIdSet.has(phase.next_phase)) {
        issues.push(
          err(
            "INVALID_NEXT_PHASE",
            `Phase "${pid}" has next_phase="${phase.next_phase}" which does not exist`,
            `${p}.next_phase`
          )
        );
      }
    }

    // 4e. failure_rules.next_phase points to an existing phase
    if (phase.failure_rules?.next_phase) {
      if (!allPhaseIdSet.has(phase.failure_rules.next_phase)) {
        issues.push(
          err(
            "INVALID_FAILURE_NEXT_PHASE",
            `Phase "${pid}" failure_rules.next_phase="${phase.failure_rules.next_phase}" does not exist`,
            `${p}.failure_rules.next_phase`
          )
        );
      }
    }

    // 4f. At least one deterministic exit trigger
    const hasDeterministicTrigger = checkDeterministicTrigger(phase);
    if (!hasDeterministicTrigger) {
      // For Founder scenarios, this is a warning (they usually have flags from mail)
      // For classic scenarios, this is more serious
      const severity = isFounder ? "warning" : "error";
      issues.push(
        issue(
          severity as ValidationSeverity,
          "NO_DETERMINISTIC_TRIGGER",
          `Phase "${pid}" has no deterministic exit trigger. ` +
            `It relies solely on min_score (AI-based, non-deterministic). ` +
            `Add max_duration_sec, max_exchanges, send_advances_phase, any_flags, or all_flags.`,
          p
        )
      );
    }

    // 4g. scoring.criteria exists if scoring is defined
    if (phase.scoring) {
      if (
        !phase.scoring.criteria ||
        !Array.isArray(phase.scoring.criteria) ||
        phase.scoring.criteria.length === 0
      ) {
        issues.push(
          warn(
            "EMPTY_SCORING_CRITERIA",
            `Phase "${pid}" has scoring section but no criteria array`,
            `${p}.scoring`
          )
        );
      }
    }

    // 4h. entry_events reference existing actors
    const entryEvents = [
      ...(phase.entry_events || []),
      ...(phase.system_messages || []),
      ...(phase.incoming || []),
    ];
    for (let j = 0; j < entryEvents.length; j++) {
      const ev = entryEvents[j];
      const evActor = ev.actor || ev.source_actor;
      if (
        evActor &&
        !actorIds.has(evActor) &&
        !dynamicPlaceholders.has(evActor) &&
        evActor !== "system"
      ) {
        issues.push(
          warn(
            "ENTRY_EVENT_ACTOR_MISSING",
            `Phase "${pid}" entry_event references unknown actor: "${evActor}"`,
            `${p}.entry_events[${j}]`
          )
        );
      }
    }

    // 4i. interruptions reference existing actors
    if (Array.isArray(phase.interruptions)) {
      for (let j = 0; j < phase.interruptions.length; j++) {
        const intr = phase.interruptions[j];
        const intrActor = intr.actor || intr.source_actor;
        if (
          intrActor &&
          !actorIds.has(intrActor) &&
          !dynamicPlaceholders.has(intrActor) &&
          intrActor !== "system"
        ) {
          issues.push(
            warn(
              "INTERRUPTION_ACTOR_MISSING",
              `Phase "${pid}" interruption references unknown actor: "${intrActor}"`,
              `${p}.interruptions[${j}]`
            )
          );
        }
      }
    }
  }

  // ─── 5. Documents ─────────────────────────────────────────────

  const documents = scenario.resources?.documents || [];

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const p = `resources.documents[${i}]`;

    if (!doc.doc_id) {
      issues.push(err("DOC_NO_ID", `Document at index ${i} has no doc_id`, p));
    }

    // Check file_path exists
    if (doc.file_path) {
      // Skip internal markers (e.g. "_internal_contract_") — these are resolved at runtime
      const isInternalMarker = doc.file_path.startsWith("_internal_");
      if (!isInternalMarker) {
        // file_path can be absolute from public/ or relative
        const resolved = resolveDocPath(doc.file_path, publicDir, scenarioDir);
        if (!resolved) {
          issues.push(
            err(
              "DOC_FILE_MISSING",
              `Document "${doc.doc_id || i}": file_path "${doc.file_path}" not found`,
              `${p}.file_path`
            )
          );
        }
      }
    }

    // Check image_path exists
    if (doc.image_path) {
      const resolved = resolveDocPath(doc.image_path, publicDir, scenarioDir);
      if (!resolved) {
        issues.push(
          err(
            "DOC_IMAGE_MISSING",
            `Document "${doc.doc_id || i}": image_path "${doc.image_path}" not found`,
            `${p}.image_path`
          )
        );
      }
    }

    // Document with no content and no file — it's empty
    if (!doc.file_path && !doc.image_path && !doc.content) {
      issues.push(
        warn(
          "DOC_EMPTY",
          `Document "${doc.doc_id || i}" has no file_path, no image_path, and no content`,
          p
        )
      );
    }

    // available_from_phase references existing phase
    if (doc.available_from_phase && !allPhaseIdSet.has(doc.available_from_phase)) {
      issues.push(
        warn(
          "DOC_INVALID_PHASE_REF",
          `Document "${doc.doc_id || i}" available_from_phase="${doc.available_from_phase}" does not match any phase_id`,
          `${p}.available_from_phase`
        )
      );
    }

    // hidden_until_phase references existing phase
    if (doc.hidden_until_phase && !allPhaseIdSet.has(doc.hidden_until_phase)) {
      issues.push(
        warn(
          "DOC_INVALID_PHASE_REF",
          `Document "${doc.doc_id || i}" hidden_until_phase="${doc.hidden_until_phase}" does not match any phase_id`,
          `${p}.hidden_until_phase`
        )
      );
    }
  }

  // ─── 6. Orphan competencies field ─────────────────────────────

  // Check at scenario root level
  if (scenario.competencies_evaluated || scenario.competencies) {
    // This is OK as metadata — only a problem if phases use "competencies" instead of "scoring.criteria"
  }

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const pid = phase.phase_id || phase.id || `index_${i}`;

    if (phase.competencies && !phase.scoring?.criteria) {
      issues.push(
        err(
          "ORPHAN_COMPETENCIES",
          `Phase "${pid}" uses "competencies" field but the engine reads "scoring.criteria". ` +
            `This phase will never be scored. Rename to scoring.criteria.`,
          `phases[${i}].competencies`
        )
      );
    }

    // Also warn if both exist (confusing)
    if (phase.competencies && phase.scoring?.criteria) {
      issues.push(
        warn(
          "DUAL_COMPETENCIES",
          `Phase "${pid}" has both "competencies" AND "scoring.criteria". ` +
            `Only "scoring.criteria" is used by the engine. Remove the "competencies" field.`,
          `phases[${i}]`
        )
      );
    }
  }

  // ─── 7. Placeholder detection ─────────────────────────────────

  // Scan all string values in the scenario for suspicious unresolved placeholders
  const suspiciousPatterns = [
    { pattern: /\{\{[^}]*\}\}/g, desc: "Unresolved template variable" },
    { pattern: /\bundefined\b/gi, desc: "Literal 'undefined' in content" },
    { pattern: /\bnull\b/g, desc: "Literal 'null' in content" },
  ];

  // Only scan user-facing text fields, not the entire JSON
  const textFields = collectTextFields(scenario);
  for (const { value, fieldPath } of textFields) {
    for (const { pattern, desc } of suspiciousPatterns) {
      const matches = value.match(pattern);
      if (matches) {
        // Filter out legitimate template variables used in prompt files
        // (those are interpolated at runtime by /api/chat)
        const legitimateVars = new Set([
          "{{phaseTitle}}",
          "{{phaseObjective}}",
          "{{phaseFocus}}",
          "{{phasePrompt}}",
          "{{playerName}}",
          "{{message}}",
          "{{recentConversation}}",
          "{{narrative}}",
          "{{mode}}",
          "{{modeGuidance}}",
        ]);

        for (const match of matches) {
          if (legitimateVars.has(match)) continue;
          // Also allow {{establishment_*}} — resolved at runtime
          if (match.startsWith("{{establishment_")) continue;

          issues.push(
            warn(
              "SUSPICIOUS_PLACEHOLDER",
              `${desc}: "${match}" found in ${fieldPath}`,
              fieldPath
            )
          );
        }
      }
    }
  }

  // ─── 8. Initial events ────────────────────────────────────────

  if (Array.isArray(scenario.initial_events)) {
    for (let i = 0; i < scenario.initial_events.length; i++) {
      const ev = scenario.initial_events[i];
      if (
        ev.actor &&
        !actorIds.has(ev.actor) &&
        !dynamicPlaceholders.has(ev.actor) &&
        ev.actor !== "system"
      ) {
        issues.push(
          err(
            "INITIAL_EVENT_ACTOR_MISSING",
            `Initial event references unknown actor: "${ev.actor}"`,
            `initial_events[${i}]`
          )
        );
      }
    }
  }

  // ─── 9. Endings ───────────────────────────────────────────────

  if (!Array.isArray(scenario.endings) || scenario.endings.length === 0) {
    if (!scenario.default_ending) {
      issues.push(
        warn(
          "NO_ENDINGS",
          "Scenario has no endings and no default_ending — will use generic fallback"
        )
      );
    }
  }

  // ─── 10. Circular next_phase detection ────────────────────────

  const visited = new Set<string>();
  let current = phases[0]?.phase_id || phases[0]?.id;
  let steps = 0;
  while (current && steps < phases.length + 1) {
    if (visited.has(current)) {
      issues.push(
        err(
          "CIRCULAR_PHASE_CHAIN",
          `Circular phase chain detected: phase "${current}" appears twice in the next_phase chain`
        )
      );
      break;
    }
    visited.add(current);
    const phaseObj = phases.find(
      (ph: any) => (ph.phase_id || ph.id) === current
    );
    if (!phaseObj) break;
    current = phaseObj.next_phase;
    if (current === "finish") break;
    steps++;
  }

  // Check for orphan phases (not reachable from the chain)
  const reachable = new Set(visited);
  for (const phase of phases) {
    const pid = phase.phase_id || phase.id;
    if (pid && !reachable.has(pid)) {
      // Check if it's reachable via failure_rules
      const isFailureTarget = phases.some(
        (p: any) => p.failure_rules?.next_phase === pid
      );
      if (!isFailureTarget) {
        issues.push(
          warn(
            "ORPHAN_PHASE",
            `Phase "${pid}" is not reachable from the main phase chain (no next_phase points to it)`,
            `phases`
          )
        );
      }
    }
  }

  return buildResult(scenarioId, issues);
}

// ═══════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

function buildResult(
  scenarioId: string,
  issues: ValidationIssue[]
): ValidationResult {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  return {
    scenarioId,
    errors,
    warnings,
    total: issues.length,
    valid: errors.length === 0,
  };
}

/**
 * Check if a phase has at least one deterministic (non-AI) exit trigger.
 */
function checkDeterministicTrigger(phase: any): boolean {
  // Timer-based
  if (phase.max_duration_sec && typeof phase.max_duration_sec === "number")
    return true;

  // Time-based (simulated time)
  if (phase.auto_advance_at) return true;

  // Mail-based
  if (phase.mail_config?.send_advances_phase === true) return true;

  // Flag-based (flags can be set by mail on_send_flags or explicit actions)
  const rules = phase.completion_rules;
  if (!rules) return false;

  if (Array.isArray(rules.any_flags) && rules.any_flags.length > 0) return true;
  if (Array.isArray(rules.all_flags) && rules.all_flags.length > 0) return true;

  // Exchange-based
  if (
    rules.max_exchanges !== undefined &&
    typeof rules.max_exchanges === "number"
  )
    return true;

  // min_score alone is NOT deterministic
  return false;
}

/**
 * Try to resolve a document path to a real file.
 * Handles both "/scenarios/..." (public-relative) and relative paths.
 */
function resolveDocPath(
  docPath: string,
  publicDir: string,
  scenarioDir: string
): string | null {
  // Try as public-relative path (starts with /)
  if (docPath.startsWith("/")) {
    const full = path.join(publicDir, docPath);
    if (fs.existsSync(full)) return full;
  }

  // Try as scenario-relative path
  const scenarioRelative = path.join(scenarioDir, docPath);
  if (fs.existsSync(scenarioRelative)) return scenarioRelative;

  // Try in public directly
  const publicDirect = path.join(publicDir, docPath);
  if (fs.existsSync(publicDirect)) return publicDirect;

  return null;
}

/**
 * Recursively collect all string values from the scenario JSON,
 * along with their JSON paths. Only collects user-facing text fields.
 */
function collectTextFields(
  obj: any,
  prefix = ""
): Array<{ value: string; fieldPath: string }> {
  const results: Array<{ value: string; fieldPath: string }> = [];

  if (!obj || typeof obj !== "object") return results;

  // Skip prompt_file values (they are filenames, not content)
  const skipKeys = new Set(["prompt_file", "file_path", "image_path", "doc_id", "actor_id", "phase_id", "channel_id", "criterion_id", "event_id", "interrupt_id", "scenario_id", "ending_id"]);

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
