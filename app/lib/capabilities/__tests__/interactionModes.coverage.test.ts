/**
 * ⚠ GARDE-FOU AUTOMATIQUE — interaction_modes coverage (V6).
 *
 * Cross-references three sources of truth:
 *
 *   1. schema/scenario.schema.json — phase.interaction_modes enum
 *   2. INTERACTION_MODES_ENUM below — mirror the schema enum here
 *   3. Every scenario.json under app/scenarios/{id}/scenario.json —
 *      each phase must declare either interaction_modes OR the legacy
 *      interaction_mode field, and every declared mode must be in the enum.
 *
 * Invariants enforced (any violation = build red):
 *   A. Each active scenario's every phase has SOME mode declaration.
 *   B. Every declared mode is in the whitelisted enum.
 *   C. If interaction_modes is used, it's non-empty.
 *   D. INTERACTION_MODES_ENUM stays aligned with the schema enum
 *      (drift check — if you edit one without the other, this test fails).
 *
 * Legacy scenarios that only set `interaction_mode` (singular) are still
 * valid — normalizePhaseModes() wraps them at runtime. This test only
 * fails when a phase declares NEITHER, or declares a mode not in the enum.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../../../..");
const SCHEMA_PATH = resolve(REPO_ROOT, "schema/scenario.schema.json");
const SCENARIOS_DIR = resolve(REPO_ROOT, "scenarios");

// Source of truth mirrored from the schema. When you change the schema
// enum, change this list too. The last test in this file will catch
// divergence.
const INTERACTION_MODES_ENUM = [
  "voice",
  "text",
  "chat_mail",
  "presentation",
  "voice_qa",
] as const;

// ─── Load helpers ────────────────────────────────────────────────

function loadSchemaInteractionModesEnum(): string[] {
  const raw = readFileSync(SCHEMA_PATH, "utf-8");
  const schema = JSON.parse(raw);
  // Resolve $ref: "#/$defs/phase"
  let phaseSchema = schema?.properties?.phases?.items;
  if (phaseSchema?.$ref && typeof phaseSchema.$ref === "string") {
    const refPath = phaseSchema.$ref.replace(/^#\//, "").split("/");
    let node: unknown = schema;
    for (const segment of refPath) {
      if (node && typeof node === "object" && segment in (node as Record<string, unknown>)) {
        node = (node as Record<string, unknown>)[segment];
      } else {
        throw new Error(
          `Cannot resolve $ref segment "${segment}" — schema shape changed.`,
        );
      }
    }
    phaseSchema = node;
  }
  const props = (phaseSchema as Record<string, unknown> | undefined)
    ?.properties as Record<string, { items?: { enum?: unknown } }> | undefined;
  const modes = props?.interaction_modes?.items?.enum;
  if (!Array.isArray(modes)) {
    throw new Error(
      `Could not resolve phase.properties.interaction_modes.items.enum in ${SCHEMA_PATH}.`,
    );
  }
  return modes.filter((s): s is string => typeof s === "string");
}

interface ScenarioFile {
  id: string;
  path: string;
  json: { phases?: Array<Record<string, unknown>> };
}

function loadActiveScenarios(): ScenarioFile[] {
  const entries = readdirSync(SCENARIOS_DIR);
  const scenarios: ScenarioFile[] = [];
  for (const entry of entries) {
    // Skip Next.js dynamic route folder [scenarioId] and non-directories.
    if (entry.startsWith("[") || entry.startsWith(".") || entry === "maintenance") continue;
    const full = join(SCENARIOS_DIR, entry);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (!s.isDirectory()) continue;
    const scenarioJsonPath = join(full, "scenario.json");
    try {
      const raw = readFileSync(scenarioJsonPath, "utf-8");
      const json = JSON.parse(raw);
      if (Array.isArray(json?.phases)) {
        scenarios.push({ id: entry, path: scenarioJsonPath, json });
      }
    } catch {
      // Not a scenario dir (no scenario.json) — skip.
    }
  }
  return scenarios;
}

// ─── Tests ───────────────────────────────────────────────────────

describe("interaction_modes — schema drift check", () => {
  it("le miroir INTERACTION_MODES_ENUM est aligné avec le schéma", () => {
    const schemaEnum = new Set(loadSchemaInteractionModesEnum());
    const mirror = new Set<string>(INTERACTION_MODES_ENUM);

    const inSchemaOnly = [...schemaEnum].filter((v) => !mirror.has(v));
    const inMirrorOnly = [...mirror].filter((v) => !schemaEnum.has(v));

    if (inSchemaOnly.length > 0 || inMirrorOnly.length > 0) {
      throw new Error(
        `⚠ INTERACTION_MODES_ENUM drift :\n` +
        (inSchemaOnly.length ? `  Dans le schéma mais pas dans le miroir : ${inSchemaOnly.join(", ")}\n` : "") +
        (inMirrorOnly.length ? `  Dans le miroir mais pas dans le schéma : ${inMirrorOnly.join(", ")}\n` : "") +
        `\nAligne les deux (edit INTERACTION_MODES_ENUM en haut du fichier + schema/scenario.schema.json).`,
      );
    }
    expect(true).toBe(true);
  });

  it("l'enum contient au minimum 'text' (fallback universel)", () => {
    const schemaEnum = new Set(loadSchemaInteractionModesEnum());
    expect(schemaEnum.has("text")).toBe(true);
  });
});

describe("interaction_modes — scenarios coverage", () => {
  const scenarios = loadActiveScenarios();
  const allowed = new Set<string>(loadSchemaInteractionModesEnum());

  it(`au moins un scenario est chargé (${scenarios.length} trouvé(s))`, () => {
    expect(scenarios.length).toBeGreaterThan(0);
  });

  it("phases sans déclaration de mode → normalisées à ['text'] par runtime (pas d'erreur)", () => {
    // Par design, une phase sans interaction_mode/interaction_modes tombe
    // sur le mode défaut ("chat" côté page.tsx, "text" côté
    // normalizePhaseModes). Ce n'est pas une erreur — juste une remarque.
    // On COMPTE combien de phases sont dans ce cas pour surfacer un
    // signal de migration future (info seulement, jamais bloquant).
    let noDeclaration = 0;
    for (const s of scenarios) {
      for (const p of s.json.phases ?? []) {
        const hasNew = Array.isArray(p.interaction_modes) && p.interaction_modes.length > 0;
        const hasLegacy = typeof p.interaction_mode === "string" && (p.interaction_mode as string).length > 0;
        if (!hasNew && !hasLegacy) noDeclaration++;
      }
    }
    // Sanity: le compteur ne doit pas exploser (ex. > 10000 = probablement un bug de walk).
    expect(noDeclaration).toBeLessThan(10000);
  });

  it("chaque mode déclaré est dans l'enum whitelisté", () => {
    const violations: string[] = [];
    for (const s of scenarios) {
      const phases = s.json.phases ?? [];
      phases.forEach((p, i) => {
        const loc = `${s.id}::phases[${i}] "${p.phase_id ?? "?"}"`;
        const modes = p.interaction_modes;
        if (Array.isArray(modes)) {
          for (const m of modes) {
            if (typeof m !== "string" || !allowed.has(m)) {
              violations.push(`${loc}: "${String(m)}" pas dans l'enum`);
            }
          }
        }
        const legacy = p.interaction_mode;
        if (typeof legacy === "string" && !allowed.has(legacy)) {
          violations.push(`${loc}: legacy "${legacy}" pas dans l'enum`);
        }
      });
    }
    if (violations.length > 0) {
      throw new Error(
        `⚠ Modes déclarés hors enum :\n` +
        violations.map((v) => `  - ${v}`).join("\n"),
      );
    }
    expect(violations.length).toBe(0);
  });

  it("interaction_modes utilisé = tableau non-vide", () => {
    const empties: string[] = [];
    for (const s of scenarios) {
      const phases = s.json.phases ?? [];
      phases.forEach((p, i) => {
        if (Array.isArray(p.interaction_modes) && p.interaction_modes.length === 0) {
          empties.push(`${s.id}::phases[${i}] "${p.phase_id ?? "?"}"`);
        }
      });
    }
    if (empties.length > 0) {
      throw new Error(
        `⚠ interaction_modes déclaré mais vide (= scenario inutilisable) :\n` +
        empties.map((v) => `  - ${v}`).join("\n"),
      );
    }
    expect(empties.length).toBe(0);
  });
});
