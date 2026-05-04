// ══════════════════════════════════════════════════════════════════
// PhaseModuleRegistry — Resolves phase config → active modules
// ══════════════════════════════════════════════════════════════════
//
// Currently empty: no modules are registered.
// resolveModules() always returns null → 100% legacy fallback.
//
// When modules are implemented (InterviewModule, ContractModule, etc.),
// they will be registered here and resolved based on either:
//   1. Explicit `modules` array in the phase JSON
//   2. Auto-detection via each module's canHandle() method
//
// This file is the single source of truth for which modules exist.
// ══════════════════════════════════════════════════════════════════

import type { PhaseModule } from "./modules/types";
import { InterviewModule } from "./modules/InterviewModule";
import { ContractModule } from "./modules/ContractModule";
import { MailModule } from "./modules/MailModule";

// ── Registered modules ──

/**
 * All available modules, keyed by their type.
 * Modules are added here as they are implemented.
 */
const MODULE_MAP: Record<string, PhaseModule> = {
  interview: InterviewModule,
  contract: ContractModule,
  mail: MailModule,
};

// ── Resolution ──

/**
 * Resolve the active modules for a given phase.
 *
 * Resolution order:
 * 1. If phase declares `modules: ["chat", "contract", ...]` → look up each in MODULE_MAP
 * 2. Else if phase declares `phase_type` → auto-detect via canHandle()
 * 3. Else → return null (legacy fallback)
 *
 * Returns null when no modules apply → page.tsx uses its existing code.
 * Returns an empty array if modules were declared but none matched (config error).
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
    // Return resolved list (may be empty if module types aren't registered yet)
    return resolved.length > 0 ? resolved : null;
  }

  // ── Path 2: auto-detect from phase_type via canHandle() ──
  const phaseType = phase.phase_type;
  if (typeof phaseType === "string") {
    const detected: PhaseModule[] = [];
    for (const mod of Object.values(MODULE_MAP)) {
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
