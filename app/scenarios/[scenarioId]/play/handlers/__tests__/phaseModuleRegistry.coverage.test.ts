/**
 * ⚠ GARDE-FOU AUTOMATIQUE — Module registry ↔ schema coverage (F4)
 *
 * Cross-references three sources of truth and fails the build if they
 * diverge:
 *
 *   1. `MODULE_REGISTRY`            — implemented modules (registry.ts)
 *   2. `KNOWN_UNIMPLEMENTED_MODULE_TYPES` — declared-but-not-implemented
 *   3. `schema/scenario.schema.json` — the enum of allowed strings
 *
 * The invariant enforced:
 *
 *     schema_enum  ==  registry_types  ∪  known_unimplemented
 *
 * i.e. every value the schema allows must be EITHER implemented
 * (in MODULE_REGISTRY) OR explicitly whitelisted as "not yet".
 *
 * Failure modes this catches:
 *   - New module type added to schema but nobody wired it in the registry.
 *   - Module removed from the registry but still allowed by the schema.
 *   - Whitelist entry that no longer appears in the schema (dead code).
 *   - A module claiming a `.type` that the schema forbids.
 *   - Two modules claiming the same `.type` (caught at import time,
 *     but we re-assert here for the friendly error message).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  MODULE_REGISTRY,
  KNOWN_UNIMPLEMENTED_MODULE_TYPES,
  listRegisteredModuleTypes,
} from "../PhaseModuleRegistry";

// ─── Load the schema enum ────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_PATH = resolve(__dirname, "../../../../../../schema/scenario.schema.json");

function loadSchemaModulesEnum(): string[] {
  const raw = readFileSync(SCHEMA_PATH, "utf-8");
  const schema = JSON.parse(raw);

  // The schema uses $ref: "#/$defs/phase" for phases.items — resolve it.
  let phaseSchema = schema?.properties?.phases?.items;
  if (phaseSchema?.$ref && typeof phaseSchema.$ref === "string") {
    const refPath = phaseSchema.$ref.replace(/^#\//, "").split("/");
    let node: unknown = schema;
    for (const segment of refPath) {
      if (node && typeof node === "object" && segment in (node as Record<string, unknown>)) {
        node = (node as Record<string, unknown>)[segment];
      } else {
        throw new Error(
          `Cannot resolve $ref "${phaseSchema.$ref}" — segment "${segment}" not found in ${SCHEMA_PATH}.`,
        );
      }
    }
    phaseSchema = node;
  }

  const enumArr = (phaseSchema as Record<string, unknown> | undefined)
    ?.properties as Record<string, { items?: { enum?: unknown } }> | undefined;
  const modules = enumArr?.modules?.items?.enum;

  if (!Array.isArray(modules)) {
    throw new Error(
      `Could not resolve phase.properties.modules.items.enum in ${SCHEMA_PATH} — ` +
      `if you refactored the schema, update this test.`,
    );
  }
  return modules.filter((s): s is string => typeof s === "string");
}

// ─── Tests ───────────────────────────────────────────────────────

describe("PhaseModuleRegistry — schema coverage (garde-fou F4)", () => {
  it("chaque type du schéma est SOIT implémenté SOIT whitelisté", () => {
    const schemaTypes = new Set(loadSchemaModulesEnum());
    const implemented = new Set(listRegisteredModuleTypes());
    const whitelisted = new Set<string>(KNOWN_UNIMPLEMENTED_MODULE_TYPES);
    const covered = new Set([...implemented, ...whitelisted]);

    const missing = [...schemaTypes].filter((t) => !covered.has(t));
    if (missing.length > 0) {
      throw new Error(
        `⚠ Types de module autorisés par le schéma mais ni implémentés ni whitelistés :\n` +
        missing.map((t) => `  - "${t}"`).join("\n") +
        `\n\nDeux options :\n` +
        `  a) Implémenter le module et l'ajouter à MODULE_REGISTRY dans PhaseModuleRegistry.ts.\n` +
        `  b) L'ajouter à KNOWN_UNIMPLEMENTED_MODULE_TYPES si le report est intentionnel.`,
      );
    }
    expect(missing.length).toBe(0);
  });

  it("chaque type dans MODULE_REGISTRY correspond à une valeur du schéma", () => {
    const schemaTypes = new Set(loadSchemaModulesEnum());
    const implemented = listRegisteredModuleTypes();
    const orphans = implemented.filter((t) => !schemaTypes.has(t));
    if (orphans.length > 0) {
      throw new Error(
        `⚠ Modules implémentés mais absents de l'enum du schéma :\n` +
        orphans.map((t) => `  - "${t}"`).join("\n") +
        `\n\nAjoute chacun à schema/scenario.schema.json ` +
        `(properties.phases.items.properties.modules.items.enum).`,
      );
    }
    expect(orphans.length).toBe(0);
  });

  it("KNOWN_UNIMPLEMENTED_MODULE_TYPES ne contient que des types du schéma", () => {
    const schemaTypes = new Set(loadSchemaModulesEnum());
    const dead = [...KNOWN_UNIMPLEMENTED_MODULE_TYPES].filter(
      (t) => !schemaTypes.has(t),
    );
    if (dead.length > 0) {
      throw new Error(
        `⚠ KNOWN_UNIMPLEMENTED_MODULE_TYPES contient des entrées mortes ` +
        `(plus dans le schéma) :\n` +
        dead.map((t) => `  - "${t}"`).join("\n") +
        `\n\nRetire-les de PhaseModuleRegistry.ts.`,
      );
    }
    expect(dead.length).toBe(0);
  });

  it("KNOWN_UNIMPLEMENTED et MODULE_REGISTRY ne se chevauchent pas", () => {
    const implemented = new Set(listRegisteredModuleTypes());
    const clash = [...KNOWN_UNIMPLEMENTED_MODULE_TYPES].filter((t) =>
      implemented.has(t),
    );
    if (clash.length > 0) {
      throw new Error(
        `⚠ Types listés dans les deux : MODULE_REGISTRY ET ` +
        `KNOWN_UNIMPLEMENTED_MODULE_TYPES :\n` +
        clash.map((t) => `  - "${t}"`).join("\n") +
        `\n\nRetire-les de la whitelist puisque tu les as implémentés.`,
      );
    }
    expect(clash.length).toBe(0);
  });

  it("aucun doublon de type dans MODULE_REGISTRY", () => {
    const types = listRegisteredModuleTypes();
    const dupes = types.filter((t, i) => types.indexOf(t) !== i);
    if (dupes.length > 0) {
      throw new Error(
        `⚠ Doublons dans MODULE_REGISTRY :\n` +
        [...new Set(dupes)].map((t) => `  - "${t}"`).join("\n") +
        `\n\nDeux modules ne peuvent pas partager le même .type.`,
      );
    }
    expect(dupes.length).toBe(0);
  });

  it("MODULE_REGISTRY est non-vide (sanity)", () => {
    expect(MODULE_REGISTRY.length).toBeGreaterThan(0);
  });
});
