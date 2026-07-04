/**
 * Tests unit — verrouille la surface publique de @revealio/engine (v3).
 *
 * ⚠ GARDE-FOU AUTOMATIQUE :
 * Le module `app/lib/engine/index.ts` est la seule API stable du moteur
 * v3 (poste de travail). Si quelqu'un retire ou renomme un export sans
 * mettre à jour ENGINE_PUBLIC_API, le test échoue avec le nom exact du
 * symbole.
 *
 * Le test valide 2 propriétés :
 *   1. Chaque symbole listé dans ENGINE_PUBLIC_API est réellement
 *      exporté par index.ts (import * as engine).
 *   2. Aucun export runtime "inattendu" n'apparaît sans être listé.
 *
 * Les exports type-only (ScenarioV3, MechanicSpec, …) n'existent pas
 * au runtime : ils sont vérifiés par tsc, pas ici.
 */

import { describe, it, expect } from "vitest";
import * as engine from "../index";

// ─── Source de vérité : exports runtime de l'API publique v3 ──────

const ENGINE_PUBLIC_API = {
  // 1. criteria — moteur d'évaluation par critères observés
  criteria: [
    "CRITERION_SEVERITIES",
    "applyStepObservation",
    "effectiveWeight",
  ],

  // 2. sessionV3 — état de partie pur (sans React)
  session: [
    "initializeSessionV3",
    "cloneSessionV3",
    "getCurrentStepV3",
    "serializeSessionV3",
    "restoreSessionV3",
    "computeEndingV3",
  ],

  // 3. workspaceReducer — le cœur du moteur
  reducer: [
    "applyWorkspaceAction",
    "enterStep",
    "applyNarrativeEffect",
    "recordActorMessage",
    "recordStepObservation",
    "recordMailScore",
    "resolveStepParamsV3",
    "completeStepV3",
  ],

  // 4. triggers — évaluation déclarative des CompletionTrigger
  triggers: [
    "ACTOR_VALIDATION_PREFIX",
    "actorValidationCriterion",
    "evaluateTrigger",
    "triggerMentions",
    "completionTriggerList",
    "collectTimerTriggers",
    "collectTriggerBindings",
  ],

  // 5. composerV3 — validation statique + câblage des inputs
  composer: [
    "validateScenarioV3",
    "resolveStepInputsV3",
  ],

  // 6. Registre des mécaniques headless
  registry: [
    "MECHANIC_SPECS",
    "MECHANIC_SPEC_MANIFESTS",
  ],
} as const;

// ─── Tests ──────────────────────────────────────────────────────

describe("engine v3 — public API surface (garde-fou)", () => {
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
    expect(Object.keys(ENGINE_PUBLIC_API).length).toBe(6);
    for (const [cat, list] of Object.entries(ENGINE_PUBLIC_API)) {
      expect(list.length, `catégorie "${cat}" vide`).toBeGreaterThan(0);
    }
  });

  it("les fonctions critiques du moteur v3 sont bien callable", () => {
    expect(typeof engine.applyStepObservation).toBe("function");
    expect(typeof engine.initializeSessionV3).toBe("function");
    expect(typeof engine.applyWorkspaceAction).toBe("function");
    expect(typeof engine.completeStepV3).toBe("function");
    expect(typeof engine.computeEndingV3).toBe("function");
    expect(typeof engine.evaluateTrigger).toBe("function");
    expect(typeof engine.validateScenarioV3).toBe("function");
    expect(typeof engine.resolveStepInputsV3).toBe("function");
    expect(Array.isArray(engine.CRITERION_SEVERITIES)).toBe(true);
    expect(typeof engine.MECHANIC_SPECS).toBe("object");
    expect(Object.keys(engine.MECHANIC_SPECS).length).toBeGreaterThan(0);
    expect(Object.keys(engine.MECHANIC_SPEC_MANIFESTS).sort()).toEqual(
      Object.keys(engine.MECHANIC_SPECS).sort(),
    );
  });
});
