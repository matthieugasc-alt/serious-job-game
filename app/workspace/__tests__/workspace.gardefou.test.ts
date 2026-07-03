/**
 * Garde-fous du workspace (contrat §1) :
 *  (a) WorkspaceShell.tsx ≤ 250 lignes ;
 *  (b) imports du shell sur liste blanche (react, apps/registry,
 *      primitives ui, types engine) ;
 *  (c) chaque app du registre est complète (id/title/icon/badge/Component) ;
 *  (d) chaque tool a une spec PURE dans tools/<id>/spec.ts, importable
 *      sans React (describeForObservation appelé ici, en node).
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { WorkspaceState } from "@/app/lib/engine/workspace";
import { APP_ORDER, APP_REGISTRY, TOOL_REGISTRY } from "../apps/registry";
import { notesSpec } from "../tools/notes/spec";
import { contratSpec } from "../tools/contrat/spec";

const wsDir = join(__dirname, "..");
const shellSource = readFileSync(join(wsDir, "WorkspaceShell.tsx"), "utf8");

const emptyWorkspace: WorkspaceState = {
  threads: {},
  mailbox: { inbox: [], sent: [], drafts: {} },
  documents: {},
  toolStates: {},
  notifications: [],
  stepStartedAt: 0,
  scenarioStartedAt: 0,
};

describe("WorkspaceShell — garde-fous", () => {
  it("(a) fait 250 lignes ou moins", () => {
    expect(shellSource.split("\n").length).toBeLessThanOrEqual(250);
  });

  it("(b) n'importe que la liste blanche", () => {
    const specifiers = [...shellSource.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    const whitelist = [
      /^react$/,
      /^\.\/apps\/registry$/,
      /^@\/app\/player\/primitives\/ui$/,
      /^@\/app\/lib\/engine\//,
    ];
    expect(specifiers.length).toBeGreaterThan(0);
    for (const spec of specifiers) {
      expect(
        whitelist.some((rx) => rx.test(spec)),
        `import interdit dans WorkspaceShell : "${spec}"`,
      ).toBe(true);
    }
  });
});

describe("APP_REGISTRY — garde-fou", () => {
  it("(c) chaque app a id/title/icon/badge/Component cohérents", () => {
    const ids = Object.keys(APP_REGISTRY);
    expect(ids.length).toBeGreaterThanOrEqual(4);
    for (const required of ["messages", "mail", "documents", "notes"]) {
      expect(ids, `app manquante : ${required}`).toContain(required);
    }
    for (const [key, app] of Object.entries(APP_REGISTRY)) {
      expect(app.id).toBe(key);
      expect(app.title.length).toBeGreaterThan(0);
      expect(app.icon.length).toBeGreaterThan(0);
      expect(typeof app.badge).toBe("function");
      expect(typeof app.badge(emptyWorkspace)).toBe("number");
      expect(typeof app.Component).toBe("function");
    }
    expect([...APP_ORDER].sort()).toEqual(ids.sort());
  });
});

describe("TOOL_REGISTRY — garde-fou", () => {
  const toolsDir = join(wsDir, "tools");
  const folders = readdirSync(toolsDir).filter((d) =>
    statSync(join(toolsDir, d)).isDirectory(),
  );

  it("chaque dossier de tool est dans TOOL_REGISTRY avec le contrat complet", () => {
    expect(folders.sort()).toEqual(Object.keys(TOOL_REGISTRY).sort());
    for (const [key, tool] of Object.entries(TOOL_REGISTRY)) {
      expect(tool.id).toBe(key);
      expect(tool.title.length).toBeGreaterThan(0);
      expect(tool.icon.length).toBeGreaterThan(0);
      expect(typeof tool.Component).toBe("function");
      expect(typeof tool.initialState).toBe("function");
      expect(typeof tool.describeForObservation).toBe("function");
    }
  });

  it("(d) chaque tool a un spec.ts PUR (aucun import React ni composant)", () => {
    for (const id of folders) {
      const specPath = join(toolsDir, id, "spec.ts");
      expect(existsSync(specPath), `spec.ts manquant pour le tool "${id}"`).toBe(true);
      const src = readFileSync(specPath, "utf8");
      expect(
        /from\s+["']react["']|require\(["']react["']\)/.test(src),
        `spec du tool "${id}" importe react`,
      ).toBe(false);
      expect(
        /from\s+["'][^"']*(Tool|\.tsx)["']/.test(src),
        `spec du tool "${id}" importe un composant`,
      ).toBe(false);
    }
  });

  it("describeForObservation est pur et lisible (notes)", () => {
    const s0 = notesSpec.initialState({});
    expect(notesSpec.describeForObservation(s0)).toBe("Bloc-notes vide.");
    expect(notesSpec.describeForObservation({ content: "hypothèse : churn vétos" })).toContain(
      "churn vétos",
    );
  });

  it("describeForObservation est pur et lisible (contrat)", () => {
    const config = {
      terms: [
        { id: "prix", label: "Prix", type: "number", opening: 45000, suffix: "€" },
        { id: "delai", label: "Délai", type: "number", opening: 6, suffix: "semaines" },
      ],
    };
    const s0 = contratSpec.initialState(config);
    expect(s0.status).toBe("open");
    expect(s0.values.prix).toBe(45000);
    const snapshot = JSON.stringify(s0);
    const described = contratSpec.describeForObservation(s0);
    expect(typeof described).toBe("string");
    expect(described).toContain("prix=45000");
    expect(described).toContain("négociation en cours");
    // Pureté : l'état n'est pas muté, deux appels donnent le même résultat.
    expect(JSON.stringify(s0)).toBe(snapshot);
    expect(contratSpec.describeForObservation(s0)).toBe(described);
  });
});
