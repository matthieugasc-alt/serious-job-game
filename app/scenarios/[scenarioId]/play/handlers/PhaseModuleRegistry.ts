// ══════════════════════════════════════════════════════════════════
// PhaseModuleRegistry — Auto-discoverable module registry (F4)
// ══════════════════════════════════════════════════════════════════
//
// Design principle (advisor: "Une règle vaut mieux qu'une convention"):
//
//   Adding a new module = writing the module + adding its export to
//   MODULE_REGISTRY. Zero synchronization required between hand-maintained
//   maps, schema enums, and test lists — everything is derived.
//
// Compare to the old hardcoded MODULE_MAP:
//
//   ❌ Before:
//      const MODULE_MAP: Record<string, PhaseModule> = {
//        interview: InterviewModule,   // <-- forgot to add? silent failure
//        contract: ContractModule,     //     scenario declares a module
//        mail: MailModule,             //     that never wires.
//      };
//
//   ✅ After: single-source-of-truth array + derived map + coverage test.
//
// The coverage test at __tests__/phaseModuleRegistry.coverage.test.ts
// cross-references schema/scenario.schema.json's `modules` enum against
// this registry and fails the build if a declared-but-unimplemented type
// is neither in the registry nor explicitly whitelisted.
// ══════════════════════════════════════════════════════════════════

import type { PhaseModule } from "./modules/types";
import {
  InterviewModule,
  ContractModule,
  MailModule,
} from "./modules";

// ── Registry: single source of truth ─────────────────────────────

/**
 * All implemented PhaseModules, in one place. Adding a new module?
 *   1. Create app/scenarios/[scenarioId]/play/handlers/modules/YourModule.ts
 *   2. Export it from ./modules/index.ts
 *   3. Add the identifier below.
 *   4. If it's a new module type, add the string to the schema's
 *      phases.items.modules.items.enum in schema/scenario.schema.json.
 *
 * The coverage test verifies (3) and (4) stay aligned. It also
 * verifies each module's `.type` matches a schema enum value.
 */
export const MODULE_REGISTRY = [
  InterviewModule,
  ContractModule,
  MailModule,
] as const satisfies readonly PhaseModule[];

/**
 * Types declared in the schema enum that we deliberately DO NOT
 * implement (yet). This whitelist is checked by the coverage test —
 * a type that's neither in MODULE_REGISTRY nor here fails the build.
 *
 * Semantics: these strings are tolerated in scenario JSON for legacy
 * reasons, but resolveModules() will fall back to legacy code paths.
 *
 * ADDING a type here = knowingly deferring implementation. REMOVING
 * a type here = you just implemented it (also add to MODULE_REGISTRY).
 */
export const KNOWN_UNIMPLEMENTED_MODULE_TYPES = [
  "chat",     // Chat is baked into base runtime, no dedicated module needed
  "timer",    // usePhaseTimer handles this at the hook level
  "debrief",  // TODO: extract debrief flow into a module
] as const;

// ── Derived map (runtime lookup) ────────────────────────────────

/**
 * MODULE_MAP is derived from MODULE_REGISTRY. Do not hand-edit.
 * The IIFE checks for duplicate `type` values at module load time
 * (fails loud on `import` if two modules claim the same type).
 */
const MODULE_MAP: Record<string, PhaseModule> = (() => {
  const map: Record<string, PhaseModule> = {};
  for (const mod of MODULE_REGISTRY) {
    if (map[mod.type]) {
      throw new Error(
        `[PhaseModuleRegistry] Duplicate module type "${mod.type}" — ` +
        `two modules cannot claim the same type. Fix MODULE_REGISTRY.`,
      );
    }
    map[mod.type] = mod;
  }
  return map;
})();

/** Introspection helper (used by tests + eventual dev tools). */
export function listRegisteredModuleTypes(): readonly string[] {
  return MODULE_REGISTRY.map((m) => m.type);
}

// ── Resolution ──────────────────────────────────────────────────

/**
 * Resolve the active modules for a given phase.
 *
 * Resolution order:
 *   1. Phase declares `modules: ["mail", "contract", ...]` → look up each
 *      in MODULE_MAP. Unknown/unimplemented types are silently skipped
 *      (schema enum forbids typos; unimplemented types are declarative).
 *   2. Phase declares `phase_type` → auto-detect via each module's
 *      canHandle(phase, scenario).
 *   3. Neither → null (legacy fallback in page.tsx).
 *
 * Returns null when no modules apply.
 */
export function resolveModules(
  phase: Record<string, unknown> | null,
  scenario: Record<string, unknown> | null,
): PhaseModule[] | null {
  if (!phase || !scenario) return null;

  // ── Path 1: explicit modules array in phase JSON ──
  const declaredModules = phase.modules;
  if (Array.isArray(declaredModules) && declaredModules.length > 0) {
    const resolved: PhaseModule[] = [];
    for (const moduleType of declaredModules) {
      if (typeof moduleType === "string" && MODULE_MAP[moduleType]) {
        resolved.push(MODULE_MAP[moduleType]);
      }
    }
    return resolved.length > 0 ? resolved : null;
  }

  // ── Path 2: auto-detect via canHandle() ──
  const phaseType = phase.phase_type;
  if (typeof phaseType === "string") {
    const detected: PhaseModule[] = [];
    for (const mod of MODULE_REGISTRY) {
      if (mod.canHandle(phase, scenario)) {
        detected.push(mod);
      }
    }
    return detected.length > 0 ? detected : null;
  }

  // ── Path 3: no modules config → legacy fallback ──
  return null;
}

/**
 * Check if any modules are active for a phase.
 * Convenience wrapper for resolveModules() !== null.
 */
export function hasActiveModules(
  phase: Record<string, unknown> | null,
  scenario: Record<string, unknown> | null,
): boolean {
  return resolveModules(phase, scenario) !== null;
}
