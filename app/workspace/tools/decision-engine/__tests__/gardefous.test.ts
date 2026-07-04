/**
 * Garde-fous du Decision Engine (docs/TOOL_DECISION_ENGINE.md §2/§10,
 * mêmes règles que TOOL_BLOC_NOTES.md §1) :
 *  (a) spec/model/api/presets PURS ; (b) jamais importé par mécaniques ni
 *  scénarios ; (c) enregistré dans TOOL_REGISTRY ; (d) connu du schéma mais
 *  interdit dans exits.reset.tools (tool persistant).
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { TOOL_REGISTRY } from "../../registry";
import { applyDecisionOp } from "../model";

const moduleDir = join(__dirname, "..");
const repoRoot = join(moduleDir, "..", "..", "..", "..");
const PURE_FILES = ["spec.ts", "model.ts", "api.ts", "presets.ts"] as const;

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

describe("(a) couche pure — spec/model/api/presets", () => {
  const whitelist = [/^\.\/(spec|model|api|presets)$/, /^@\/app\/lib\/engine\/mechanics$/];
  for (const file of PURE_FILES) {
    it(`${file} : aucun React, aucun import moteur hors types Json`, () => {
      const src = readFileSync(join(moduleDir, file), "utf8");
      expect(/from\s+["']react["']/.test(src), `${file} importe react`).toBe(false);
      const specifiers = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      for (const spec of specifiers) {
        expect(whitelist.some((rx) => rx.test(spec)), `import interdit dans ${file} : "${spec}"`).toBe(true);
      }
      expect(/@\/app\/lib\/engine\/(workspace|sessionV3|workspaceReducer|composerV3|triggers|criteria|index)/.test(src)).toBe(false);
      expect(/app\/mechanics|scenarios\//.test(src)).toBe(false);
    });
  }
});

describe("(b) indépendance — jamais consommé par les mécaniques ni les scénarios", () => {
  it("app/mechanics/** n'importe jamais le module et ne lit pas son état", () => {
    const files = walk(join(repoRoot, "app", "mechanics"), [".ts", ".tsx"]);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(/from\s+["'][^"']*decision-engine[^"']*["']/.test(src), `mechanics importe decision-engine : ${file}`).toBe(false);
      expect(/toolStates\[\s*["']decision-engine["']\s*\]/.test(src), `mechanics lit toolStates["decision-engine"] : ${file}`).toBe(false);
    }
  });

  it("aucun scénario ne câble decision-engine dans exits.reset.tools", () => {
    const files = walk(join(repoRoot, "scenarios"), [".json"]);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const scenario = JSON.parse(readFileSync(file, "utf8")) as {
        sequence?: { completion?: { exits?: { reset?: { tools?: string[] } }[] } }[];
      };
      for (const step of scenario.sequence ?? []) {
        for (const exit of step.completion?.exits ?? []) {
          expect((exit.reset?.tools ?? []).includes("decision-engine"), `reset.tools vise decision-engine : ${file}`).toBe(false);
        }
      }
    }
  });

  it("le schéma connaît decision-engine mais aucune mécanique ne le possède", () => {
    const registry = JSON.parse(readFileSync(join(repoRoot, "schema", "mechanics-v3.json"), "utf8")) as {
      tools: string[];
      mechanics: { default_tools: string[] }[];
    };
    expect(registry.tools).toContain("decision-engine");
    for (const m of registry.mechanics) expect(m.default_tools).not.toContain("decision-engine");
  });
});

describe("(c) enregistrement TOOL_REGISTRY", () => {
  it("decision-engine : applyOp = reducer pur, état initial vide, description neutre", () => {
    const tool = TOOL_REGISTRY["decision-engine"];
    expect(tool).toBeDefined();
    expect(tool.id).toBe("decision-engine");
    expect(tool.icon.length).toBeGreaterThan(0);
    expect(typeof tool.Component).toBe("function");
    expect(tool.applyOp).toBe(applyDecisionOp);
    expect(tool.initialState({})).toEqual({ decisions: {}, boards: {}, ui: {} });
    expect(tool.describeForObservation(null)).toContain("vide");
  });
});
