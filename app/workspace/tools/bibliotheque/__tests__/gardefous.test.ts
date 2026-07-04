/**
 * Garde-fous du Gestionnaire Documentaire (docs/TOOL_GESTIONNAIRE_DOC.md §1,
 * mêmes règles que docs/TOOL_BLOC_NOTES.md) :
 *  (a) spec.ts / model.ts / api.ts PURS : aucun React, aucun import moteur
 *      hors types Json (engine/mechanics), imports internes only ;
 *  (b) le module n'est JAMAIS importé par app/mechanics ni référencé par
 *      un scénario (grep) — indépendance totale ;
 *  (c) enregistré dans TOOL_REGISTRY (icône, applyOp câblé) ;
 *  (d) "bibliotheque" est un tool CONNU du schéma mais interdit dans
 *      exits.reset.tools (tool persistant).
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { TOOL_REGISTRY } from "../../registry";
import { applyLibraryOp } from "../model";

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

describe("(a) couche pure — spec.ts / model.ts / api.ts", () => {
  const whitelist = [
    /^\.\/(spec|model|api)$/, // imports internes au module
    /^@\/app\/lib\/engine\/mechanics$/, // types Json UNIQUEMENT
  ];

  for (const file of PURE_FILES) {
    it(`${file} : aucun React, aucun import moteur hors types Json`, () => {
      const src = readFileSync(join(moduleDir, file), "utf8");
      expect(/from\s+["']react["']|require\(["']react["']\)/.test(src), `${file} importe react`).toBe(false);
      const specifiers = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      expect(specifiers.length).toBeGreaterThan(0);
      for (const spec of specifiers) {
        expect(
          whitelist.some((rx) => rx.test(spec)),
          `import interdit dans ${file} : "${spec}"`,
        ).toBe(true);
      }
      expect(/@\/app\/lib\/engine\/(workspace|sessionV3|workspaceReducer|composerV3|triggers|criteria|index)/.test(src)).toBe(false);
      expect(/app\/mechanics|scenarios\//.test(src)).toBe(false);
    });
  }

  it("les trois fichiers purs sont importables et opérants en node", () => {
    expect(typeof applyLibraryOp).toBe("function");
  });
});

describe("(b) indépendance — jamais consommé par les mécaniques ni les scénarios", () => {
  it("app/mechanics/** n'IMPORTE jamais le module bibliotheque et ne lit pas son état", () => {
    const files = walk(join(repoRoot, "app", "mechanics"), [".ts", ".tsx"]);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(
        /from\s+["'][^"']*bibliotheque[^"']*["']|require\(["'][^"']*bibliotheque[^"']*["']\)/.test(src),
        `app/mechanics importe le module bibliotheque : ${file}`,
      ).toBe(false);
      expect(
        /toolStates\[\s*["']bibliotheque["']\s*\]/.test(src),
        `app/mechanics lit toolStates["bibliotheque"] : ${file}`,
      ).toBe(false);
    }
  });

  it("aucun scénario ne CÂBLE bibliotheque (step.tools, reset.tools, deliverable tool)", () => {
    const files = walk(join(repoRoot, "scenarios"), [".json"]);
    expect(files.length).toBeGreaterThan(0);
    const forbidden = (trigger: unknown): boolean => {
      if (!trigger || typeof trigger !== "object") return false;
      const t = trigger as { type?: string; tool?: string; of?: unknown[] };
      if (t.type === "deliverable_submitted" && t.tool === "bibliotheque") return true;
      return Array.isArray(t.of) ? t.of.some(forbidden) : false;
    };
    for (const file of files) {
      const scenario = JSON.parse(readFileSync(file, "utf8")) as {
        sequence?: {
          tools?: { tool?: string }[];
          completion?: { trigger?: unknown; exits?: { trigger?: unknown; reset?: { tools?: string[] } }[] };
        }[];
      };
      for (const step of scenario.sequence ?? []) {
        for (const tc of step.tools ?? []) {
          expect(tc.tool, `step.tools épingle bibliotheque : ${file}`).not.toBe("bibliotheque");
        }
        const completion = step.completion ?? {};
        expect(forbidden(completion.trigger), `trigger vise bibliotheque : ${file}`).toBe(false);
        for (const exit of completion.exits ?? []) {
          expect(forbidden(exit.trigger), `trigger d'exit vise bibliotheque : ${file}`).toBe(false);
          expect(
            (exit.reset?.tools ?? []).includes("bibliotheque"),
            `exits.reset.tools vise bibliotheque : ${file}`,
          ).toBe(false);
        }
      }
    }
  });

  it("le schéma mechanics-v3 connaît bibliotheque mais aucune mécanique ne le possède", () => {
    const registry = JSON.parse(
      readFileSync(join(repoRoot, "schema", "mechanics-v3.json"), "utf8"),
    ) as { tools: string[]; mechanics: { default_tools: string[] }[] };
    expect(registry.tools).toContain("bibliotheque");
    for (const m of registry.mechanics) {
      expect(m.default_tools).not.toContain("bibliotheque");
    }
  });
});

describe("(c) enregistrement TOOL_REGISTRY", () => {
  it("bibliotheque est enregistré : applyOp = reducer pur du model, état initial vide", () => {
    const tool = TOOL_REGISTRY.bibliotheque;
    expect(tool).toBeDefined();
    expect(tool.id).toBe("bibliotheque");
    expect(tool.icon.length).toBeGreaterThan(0);
    expect(typeof tool.Component).toBe("function");
    expect(tool.applyOp).toBe(applyLibraryOp);
    expect(tool.initialState({})).toEqual({ entries: {}, folders: {}, desk: { windows: [], layout: "single" }, desks: {} });
    expect(tool.describeForObservation(null)).toContain("vide");
  });
});
