/**
 * Garde-fou du registre de mécaniques — triple cohérence :
 *   dossiers app/mechanics/<id>/ ↔ MECHANIC_MANIFESTS ↔ schema/mechanics.json
 *
 * Toute mécanique ajoutée sans être enregistrée partout fait échouer
 * ce test. C'est le pattern MODULE_REGISTRY (F4) transposé au moteur v2.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { MECHANIC_MANIFESTS } from "../manifests";

const mechanicsDir = join(__dirname, "..");
const schemaFile = join(__dirname, "..", "..", "..", "schema", "mechanics.json");

const folderIds = readdirSync(mechanicsDir).filter(
  (d) =>
    statSync(join(mechanicsDir, d)).isDirectory() &&
    !d.startsWith("__") &&
    existsSync(join(mechanicsDir, d, "manifest.ts")),
);

const schemaMechanics: {
  id: string;
  version: string;
  output_keys: string[];
  required_params: string[];
}[] = JSON.parse(readFileSync(schemaFile, "utf8")).mechanics;

describe("registre de mécaniques — garde-fou", () => {
  it("chaque dossier de mécanique est dans MECHANIC_MANIFESTS", () => {
    expect(Object.keys(MECHANIC_MANIFESTS).sort()).toEqual(folderIds.sort());
  });

  it("schema/mechanics.json est synchrone avec les manifests", () => {
    const fromSchema = Object.fromEntries(schemaMechanics.map((m) => [m.id, m]));
    expect(Object.keys(fromSchema).sort()).toEqual(
      Object.keys(MECHANIC_MANIFESTS).sort(),
    );
    for (const [id, manifest] of Object.entries(MECHANIC_MANIFESTS)) {
      expect(fromSchema[id].version).toBe(manifest.version);
      expect([...fromSchema[id].output_keys].sort()).toEqual(
        [...manifest.output_keys].sort(),
      );
      expect([...fromSchema[id].required_params].sort()).toEqual(
        [...manifest.required_params].sort(),
      );
    }
  });

  it("chaque manifest a un id cohérent avec son dossier et une doc", () => {
    for (const [key, m] of Object.entries(MECHANIC_MANIFESTS)) {
      expect(m.id).toBe(key);
      expect(m.title.length).toBeGreaterThan(0);
      expect(m.description.length).toBeGreaterThan(10);
    }
  });
});
