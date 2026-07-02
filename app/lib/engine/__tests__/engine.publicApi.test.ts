/**
 * Tests unit — verrouille la surface publique de @revealio/engine (v2).
 *
 * ⚠ GARDE-FOU AUTOMATIQUE :
 * Le module `app/lib/engine/index.ts` est la seule API stable du moteur
 * v2 (mécaniques). Si quelqu'un retire ou renomme un export sans mettre
 * à jour ENGINE_PUBLIC_API, le test échoue avec le nom exact du symbole.
 *
 * Le test valide 2 propriétés :
 *   1. Chaque symbole listé dans ENGINE_PUBLIC_API est réellement
 *      exporté par index.ts (import * as engine).
 *   2. Aucun export runtime "inattendu" n'apparaît sans être listé.
 *
 * Les exports type-only (ScenarioV2, MechanicModule, …) n'existent pas
 * au runtime : ils sont vérifiés par tsc, pas ici.
 */

import { describe, it, expect } from "vitest";
import * as engine from "../index";

// ─── Source de vérité : exports runtime de l'API publique v2 ──────

const ENGINE_PUBLIC_API = {
  // 1. criteria — moteur d'évaluation par critères observés
  criteria: [
    "CRITERION_SEVERITIES",
    "applyStepObservation",
    "effectiveWeight",
  ],

  // 2. sessionV2 — état de partie pur (sans React)
  session: [
    "initializeSessionV2",
    "cloneSessionV2",
    "getCurrentStep",
    "recordTranscriptEvent",
    "completeCurrentStep",
    "computeEndingV2",
    "serializeSessionV2",
    "restoreSessionV2",
  ],

  // 3. composer — validation statique + câblage des inputs
  composer: [
    "validateScenarioV2",
    "resolveStepInputs",
  ],

  // 4. Registre des mécaniques
  registry: [
    "MECHANIC_MANIFESTS",
  ],
} as const;

// ─── Tests ──────────────────────────────────────────────────────

describe("engine v2 — public API surface (garde-fou)", () => {
  it("chaque symbole listé dans ENGINE_PUBLIC_API est exporté", () => {
    const allExpected = Object.values(ENGINE_PUBLIC_API).flat();
    const missing: string[] = [];
    for (const name of allExpected) {
      if (!(name in engine)) missing.push(name);
    }
    if (missing.length > 0) {
      throw new Error(
        `⚠ Symboles listés dans ENGINE_PUBLIC_API mais absents de @revealio/engine :\n` +
        missing.map((n) => `  - ${n}`).join("\n") +
        `\n\nSoit ajouter l'export dans app/lib/engine/index.ts, soit retirer le nom ` +
        `de ENGINE_PUBLIC_API (bump majeur package.json requis).`,
      );
    }
    expect(missing.length).toBe(0);
  });

  it("aucun symbole runtime exporté n'échappe à ENGINE_PUBLIC_API", () => {
    const allExpected = new Set(Object.values(ENGINE_PUBLIC_API).flat() as string[]);
    const unexpected = Object.keys(engine).filter((n) => !allExpected.has(n));
    if (unexpected.length > 0) {
      throw new Error(
        `⚠ Symboles exportés par @revealio/engine mais absents de ENGINE_PUBLIC_API :\n` +
        unexpected.map((n) => `  - ${n}`).join("\n") +
        `\n\nAjoute chaque nom dans ENGINE_PUBLIC_API pour verrouiller l'API, ` +
        `ou retire l'export du barrel si non voulu.`,
      );
    }
    expect(unexpected.length).toBe(0);
  });

  it("les catégories couvrent tous les exports", () => {
    expect(Object.keys(ENGINE_PUBLIC_API).length).toBe(4);
    for (const [cat, list] of Object.entries(ENGINE_PUBLIC_API)) {
      expect(list.length, `catégorie "${cat}" vide`).toBeGreaterThan(0);
    }
  });

  it("les fonctions critiques du moteur v2 sont bien callable", () => {
    expect(typeof engine.applyStepObservation).toBe("function");
    expect(typeof engine.initializeSessionV2).toBe("function");
    expect(typeof engine.completeCurrentStep).toBe("function");
    expect(typeof engine.computeEndingV2).toBe("function");
    expect(typeof engine.validateScenarioV2).toBe("function");
    expect(typeof engine.resolveStepInputs).toBe("function");
    expect(Array.isArray(engine.CRITERION_SEVERITIES)).toBe(true);
    expect(typeof engine.MECHANIC_MANIFESTS).toBe("object");
    expect(Object.keys(engine.MECHANIC_MANIFESTS).length).toBeGreaterThan(0);
  });
});
