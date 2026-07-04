/**
 * Garde-fous du Bloc-notes Universel (docs/TOOL_BLOC_NOTES.md §1) :
 *  (a) spec.ts / model.ts / api.ts PURS : aucun React, aucun import
 *      moteur hors types Json (engine/mechanics), imports internes only ;
 *  (b) le module n'est JAMAIS importé par app/mechanics (specs headless)
 *      ni référencé par un scénario (grep) — indépendance totale ;
 *  (c) enregistré dans TOOL_REGISTRY (icône 📓, applyOp câblé), l'ancien
 *      tool "notes" reste intact ;
 *  (d) "bloc-notes" est un tool CONNU du schéma (validateur mjs) mais
 *      interdit dans exits.reset.tools — testé côté composer/parité.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { TOOL_REGISTRY } from "../../registry";
import { applyNotebookOp } from "../model";

const moduleDir = join(__dirname, "..");
const repoRoot = join(moduleDir, "..", "..", "..", "..");

const PURE_FILES = ["spec.ts", "model.ts", "api.ts"] as const;

/** Tous les fichiers (récursif) d'un dossier, filtrés par extension. */
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
    /^@\/app\/lib\/engine\/mechanics$/, // types Json UNIQUEMENT (exception du contrat)
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
      // Jamais le moteur (workspace, sessionV3, reducer) ni les mécaniques.
      expect(/@\/app\/lib\/engine\/(workspace|sessionV3|workspaceReducer|composerV3|triggers|criteria|index)/.test(src)).toBe(false);
      expect(/app\/mechanics|scenarios\//.test(src)).toBe(false);
    });
  }

  it("les trois fichiers purs sont importables et opérants en node (déjà prouvé par cet import)", () => {
    expect(typeof applyNotebookOp).toBe("function");
  });
});

describe("(b) indépendance — jamais consommé par les mécaniques ni les scénarios", () => {
  it("app/mechanics/** n'IMPORTE jamais le module bloc-notes", () => {
    const files = walk(join(repoRoot, "app", "mechanics"), [".ts", ".tsx"]);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(
        /from\s+["'][^"']*bloc-notes[^"']*["']|require\(["'][^"']*bloc-notes[^"']*["']\)/.test(src),
        `app/mechanics importe le module bloc-notes : ${file}`,
      ).toBe(false);
      // Ni lecture directe de son état : le carnet n'appartient à personne.
      expect(
        /toolStates\[\s*["']bloc-notes["']\s*\]/.test(src),
        `app/mechanics lit toolStates["bloc-notes"] : ${file}`,
      ).toBe(false);
    }
  });

  it("aucun scénario ne CÂBLE bloc-notes (step.tools, reset.tools, deliverable tool)", () => {
    const files = walk(join(repoRoot, "scenarios"), [".json"]);
    expect(files.length).toBeGreaterThan(0);
    const forbidden = (trigger: unknown): boolean => {
      if (!trigger || typeof trigger !== "object") return false;
      const t = trigger as { type?: string; tool?: string; of?: unknown[] };
      if (t.type === "deliverable_submitted" && t.tool === "bloc-notes") return true;
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
          expect(tc.tool, `step.tools épingle bloc-notes : ${file}`).not.toBe("bloc-notes");
        }
        const completion = step.completion ?? {};
        expect(forbidden(completion.trigger), `trigger vise bloc-notes : ${file}`).toBe(false);
        for (const exit of completion.exits ?? []) {
          expect(forbidden(exit.trigger), `trigger d'exit vise bloc-notes : ${file}`).toBe(false);
          expect(
            (exit.reset?.tools ?? []).includes("bloc-notes"),
            `exits.reset.tools vise bloc-notes : ${file}`,
          ).toBe(false);
        }
      }
    }
  });

  it("le schéma mechanics-v3 ne suggère JAMAIS bloc-notes en default_tools", () => {
    const registry = JSON.parse(
      readFileSync(join(repoRoot, "schema", "mechanics-v3.json"), "utf8"),
    ) as { tools: string[]; mechanics: { default_tools: string[] }[] };
    expect(registry.tools).toContain("bloc-notes"); // connu du validateur…
    for (const m of registry.mechanics) {
      expect(m.default_tools).not.toContain("bloc-notes"); // …jamais possédé par une mécanique
    }
  });
});

describe("(c) enregistrement TOOL_REGISTRY", () => {
  it("bloc-notes est enregistré : icône 📓, applyOp = reducer pur du model", () => {
    const tool = TOOL_REGISTRY["bloc-notes"];
    expect(tool).toBeDefined();
    expect(tool.id).toBe("bloc-notes");
    expect(tool.icon).toBe("📓");
    expect(typeof tool.Component).toBe("function"); // placeholder, remplacé par l'agent UI
    expect(tool.applyOp).toBe(applyNotebookOp);
    expect(tool.initialState({})).toEqual({ notes: {}, tasks: {}, tagIndex: {}, order: [] });
    expect(tool.describeForObservation(null)).toContain("vide");
  });

  it("l'ancien tool notes reste intact (id, icône, contrat simple sans applyOp)", () => {
    const notes = TOOL_REGISTRY.notes;
    expect(notes).toBeDefined();
    expect(notes.icon).toBe("📝");
    expect(notes.applyOp).toBeUndefined();
    expect(notes.initialState({})).toEqual({ content: "" });
    expect(notes.describeForObservation({ content: "abc" })).toBe("abc");
  });
});
