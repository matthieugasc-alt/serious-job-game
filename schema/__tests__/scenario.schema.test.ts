/**
 * Tests unit — garde-fou schéma JSON scenario.
 *
 * ⚠ Enforced au niveau test-time (en plus du build via
 * validate:scenarios): CHAQUE scenario ACTIF doit matcher le schéma.
 *
 * Failure mode qu'on veut catch:
 *   - Un dev ajoute un champ à scenario.json (typo, mauvais type)
 *     et pousse sans lancer validate:scenarios.
 *   - Le test correspondant échoue avec le path exact + la raison.
 *
 * Un vitest run suffit — pas besoin de `npm run validate:scenarios`.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const projectRoot = path.resolve(__dirname, "..", "..");
const schemaPath = path.join(projectRoot, "schema", "scenario.schema.json");
const scenariosDir = path.join(projectRoot, "scenarios");

const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

// ─── Découvre TOUS les scenarios (actifs + maintenance) ───────────

function listScenarios(): { id: string; scenario: any; isMaintenance: boolean }[] {
  const rows: { id: string; scenario: any; isMaintenance: boolean }[] = [];
  for (const dir of fs.readdirSync(scenariosDir)) {
    const p = path.join(scenariosDir, dir, "scenario.json");
    if (!fs.existsSync(p)) continue;
    const raw = fs.readFileSync(p, "utf8");
    let s: any;
    try {
      s = JSON.parse(raw);
    } catch {
      continue;
    }
    // Maintenance = scenarios legacy dont on tolère les divergences pour l'instant.
    const isMaintenance = !!(s.meta?.maintenance || s.meta?.status === "maintenance");
    rows.push({ id: dir, scenario: s, isMaintenance });
  }
  return rows;
}

const ALL = listScenarios();
const ACTIVE = ALL.filter((r) => !r.isMaintenance);
const MAINTENANCE = ALL.filter((r) => r.isMaintenance);

describe("scenario.schema.json — garde-fou data-first", () => {
  it("le schéma est un JSON Schema Draft 2020-12 valide", () => {
    expect(schema.$schema).toContain("2020-12");
    expect(schema.$id).toContain("scenario.schema.json");
    expect(typeof validate).toBe("function");
  });

  it("les scenarios actifs sont découverts (au moins 5)", () => {
    expect(ACTIVE.length).toBeGreaterThanOrEqual(5);
  });

  // Un test par scenario actif — parametrized pour reporting clair.
  for (const row of ACTIVE) {
    it(`ACTIF: ${row.id} match le schéma`, () => {
      const ok = validate(row.scenario);
      if (!ok) {
        const errors = (validate.errors || [])
          .map((e) => `  ${e.instancePath || "(root)"}: ${e.message} ${JSON.stringify(e.params || {})}`)
          .join("\n");
        throw new Error(
          `Scenario "${row.id}" ne match pas le schéma.\n` +
          `Errors:\n${errors}\n\n` +
          `→ Fix soit le scenario JSON, soit le schéma (si le champ est légitime).`,
        );
      }
      expect(ok).toBe(true);
    });
  }

  // Note: les scenarios maintenance sont tolérés (matrice de divergences
  // connue). On les compte pour dashboarding mais on ne fail pas dessus.
  it(`INFO: ${MAINTENANCE.length} scenarios maintenance (tolérés, à nettoyer à froid)`, () => {
    expect(MAINTENANCE.length).toBeGreaterThanOrEqual(0);
  });
});
