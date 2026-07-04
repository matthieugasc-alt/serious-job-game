/**
 * Garde-fous du Tableau blanc (pattern TOOL_BLOC_NOTES.md §1) :
 *  (a) spec/model/api PURS ; (b) jamais importé par app/mechanics ;
 *  (c) enregistré dans TOOL_REGISTRY ; (d) connu du schéma.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { TOOL_REGISTRY } from "../../registry";
import { applyWhiteboardOp } from "../model";

const moduleDir = join(__dirname, "..");
const repoRoot = join(moduleDir, "..", "..", "..", "..");
const PURE_FILES = ["spec.ts", "model.ts", "api.ts"] as const;

function walk(dir: string, exts: string[]): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, exts));
    else if (exts.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

describe("(a) couche pure", () => {
  const whitelist = [/^\.\/(spec|model|api)$/, /^@\/app\/lib\/engine\/mechanics$/];
  for (const file of PURE_FILES) {
    it(`${file} : aucun React, aucun import moteur hors types Json`, () => {
      const src = readFileSync(join(moduleDir, file), "utf8");
      expect(/from\s+["']react["']/.test(src)).toBe(false);
      for (const spec of [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1])) {
        expect(whitelist.some((rx) => rx.test(spec)), `import interdit dans ${file} : "${spec}"`).toBe(true);
      }
    });
  }
});

describe("(b) indépendance des mécaniques", () => {
  it("app/mechanics/** n'importe jamais le module whiteboard", () => {
    const files = walk(join(repoRoot, "app", "mechanics"), [".ts", ".tsx"]);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(/from\s+["'][^"']*tools\/whiteboard[^"']*["']/.test(readFileSync(file, "utf8")), file).toBe(false);
    }
  });
});

describe("(c)+(d) enregistrement + schéma", () => {
  it("whiteboard est dans TOOL_REGISTRY (applyOp câblé, état initial vide)", () => {
    const tool = TOOL_REGISTRY.whiteboard;
    expect(tool).toBeDefined();
    expect(tool.id).toBe("whiteboard");
    expect(typeof tool.Component).toBe("function");
    expect(tool.applyOp).toBe(applyWhiteboardOp);
    expect(tool.initialState({})).toEqual({ notes: {} });
    expect(tool.describeForObservation(null)).toContain("vide");
  });
  it("le schéma mechanics-v3 connaît whiteboard", () => {
    const registry = JSON.parse(readFileSync(join(repoRoot, "schema", "mechanics-v3.json"), "utf8")) as { tools: string[] };
    expect(registry.tools).toContain("whiteboard");
  });
});
