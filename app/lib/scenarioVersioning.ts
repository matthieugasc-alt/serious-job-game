// ═══════════════════════════════════════════════════════════════════
// VS-chantier — Versioning des scénarios ("git blame")
// ═══════════════════════════════════════════════════════════════════
//
// À chaque évaluation, on capture les CONDITIONS EXACTES :
//   - scenario_version         : le champ scenario.version au moment T
//   - criterion_snapshot       : id + description + severity + competencies
//                                du critère tel qu'il était (permet le
//                                replay 6 mois plus tard même si le
//                                scenario a évolué depuis)
//   - engine_version           : version du moteur applyPhaseObservation
//   - ai_model                 : modèle IA utilisé (déjà dans meta)
//   - prompt_version           : hash court du prompt d'évaluation
//
// Un snapshot du scenario au moment de la publication est archivé dans
// data/scenario_versions/<id>/<version>.json. Ça permet de rejouer une
// campagne dans les conditions d'origine.
// ═══════════════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

// Bumped when applyPhaseObservation semantics change. Snapshot in each
// evaluation entry so old entries can be re-interpreted even after we
// change the moteur.
export const ENGINE_VERSION = "1.1.0";

/** Short hash of a prompt for versioning. First 8 chars of sha256. */
export function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex").slice(0, 8);
}

/**
 * Archive the current scenario.json under data/scenario_versions/<id>/<version>.json.
 * Idempotent: if a file with the same (id, version) already exists AND
 * differs from the current, we append `.dirty-<timestamp>.json` instead
 * of overwriting — that surfaces a version-string bump missing.
 */
export function archiveScenarioVersion(scenarioId: string, scenario: unknown): void {
  const s = scenario as { version?: string };
  const version = s?.version;
  if (!version) return; // no version → can't archive; VS1 garde-fou will warn

  const dir = path.resolve(process.cwd(), "data", "scenario_versions", scenarioId);
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `${version}.json`);
  const serialized = JSON.stringify(scenario, null, 2);
  if (fs.existsSync(filePath)) {
    // Check for silent drift
    const existing = fs.readFileSync(filePath, "utf-8");
    if (existing.trim() !== serialized.trim()) {
      const dirty = path.join(dir, `${version}.dirty-${Date.now()}.json`);
      fs.writeFileSync(dirty, serialized, "utf-8");
    }
    return;
  }
  fs.writeFileSync(filePath, serialized, "utf-8");
}

/** Read an archived scenario version. Returns null if absent. */
export function readScenarioVersion(scenarioId: string, version: string): unknown | null {
  const filePath = path.resolve(process.cwd(), "data", "scenario_versions", scenarioId, `${version}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

/** List all archived versions of a scenario, most recent first (semver-ish sort). */
export function listScenarioVersions(scenarioId: string): string[] {
  const dir = path.resolve(process.cwd(), "data", "scenario_versions", scenarioId);
  if (!fs.existsSync(dir)) return [];
  const versions = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.includes(".dirty-"))
    .map((f) => f.replace(/\.json$/, ""));
  return versions.sort(compareSemverDesc);
}

function compareSemverDesc(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return nb - na;
  }
  return 0;
}
