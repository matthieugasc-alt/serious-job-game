/**
 * ═════════════════════════════════════════════════════════════════
 * Test GÉNÉRIQUE de jouabilité — découvre TOUS les scénarios v2.
 * ═════════════════════════════════════════════════════════════════
 *
 * Contrairement à playthrough.test.ts (liste figée SCENARIO_IDS +
 * assertions founder spécifiques), ce fichier découvre dynamiquement
 * chaque scenarios/<dir>/scenario.json avec format === "v2" : tout
 * scénario ajouté au repo est automatiquement couvert, sans liste en
 * dur à maintenir.
 *
 * Ce qu'il PROUVE pour chaque scénario découvert :
 *  a. validateScenarioV2 contre MECHANIC_MANIFESTS = 0 issue
 *     (+ cohérence scenario_id ↔ nom du dossier) ;
 *  b. le happy path se joue de bout en bout via le harnais réel
 *     (moteur réel, Runtime réels) → isFinished, ending non-null et
 *     déclaré, tous les steps passés ;
 *  c. chaque ending déclaré est atteignable par un run réel — via le
 *     solveur exhaustif du harnais (findPassedSetForEnding, 2^n
 *     combinaisons ; exhaustif et trivial pour les mono-step).
 *
 * Si une future mécanique n'est pas couverte par le harnais,
 * playMechanicStep throw avec un message explicite : le test échoue
 * en pointant l'extension à faire dans harness.ts.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { describe, it, expect } from "vitest";
import type { ScenarioV2 } from "@/app/lib/engine/mechanics";
import { validateScenarioV2 } from "@/app/lib/engine/composer";
import { MECHANIC_MANIFESTS } from "@/app/mechanics/manifests";
import {
  playScenario,
  failStepsStrategy,
  findPassedSetForEnding,
  endingForPassedSet,
} from "./harness";

// ═══════════════════════════════════════════════════════════════════
// Découverte dynamique : scenarios/*/scenario.json avec format "v2"
// ═══════════════════════════════════════════════════════════════════

/** Le solveur d'endings énumère 2^n combinaisons : borne de tractabilité. */
const MAX_SOLVER_STEPS = 14;

interface DiscoveredScenario {
  dir: string;
  scenario: ScenarioV2;
}

function discoverScenariosV2(): DiscoveredScenario[] {
  const scenariosDir = path.join(process.cwd(), "scenarios");
  const found: DiscoveredScenario[] = [];
  for (const dir of fs.readdirSync(scenariosDir).sort()) {
    const file = path.join(scenariosDir, dir, "scenario.json");
    if (!fs.existsSync(file)) continue;
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as ScenarioV2;
    if (parsed.format !== "v2") continue;
    found.push({ dir, scenario: parsed });
  }
  return found;
}

const discovered = discoverScenariosV2();

// Garde-fou méta : la découverte elle-même fonctionne (au moins le
// scénario vitrine existe). Si ce test échoue, tous les autres sont vides.
describe("découverte dynamique des scénarios v2", () => {
  it("trouve au moins un scénario v2 dans scenarios/", () => {
    expect(discovered.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// a. Validation statique : 0 issue contre les manifests réels
// ═══════════════════════════════════════════════════════════════════

describe("a. validateScenarioV2 — 0 issue sur chaque scénario découvert", () => {
  for (const { dir, scenario } of discovered) {
    it(`${dir} : validation statique sans issue`, () => {
      expect(validateScenarioV2(scenario, MECHANIC_MANIFESTS)).toEqual([]);
    });

    it(`${dir} : scenario_id cohérent avec le dossier`, () => {
      expect(scenario.scenario_id).toBe(dir);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// b. Happy path : jouable de bout en bout contre le moteur réel
// ═══════════════════════════════════════════════════════════════════

describe("b. happy path — bout en bout, ending atteint", () => {
  for (const { dir, scenario } of discovered) {
    it(`${dir} : session finie, ending non-null et déclaré, steps passés`, () => {
      // playScenario throw si une chaîne inputs_from casse, si une
      // mécanique n'est pas couverte par le harnais, ou si un output
      // ne respecte pas les output_keys de son manifest.
      const { session, trace } = playScenario(scenario);

      expect(session.isFinished).toBe(true);
      expect(session.ending).not.toBeNull();
      expect(scenario.endings.map((e) => e.id)).toContain(session.ending!.id);

      // Happy path : chaque step joué une fois et passé.
      expect(trace).toHaveLength(scenario.sequence.length);
      for (const step of scenario.sequence) {
        expect(
          session.stepResults[step.step_id]?.passed,
          `${dir}/${step.step_id} devrait passer en happy path`,
        ).toBe(true);
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// c. Atteignabilité : chaque ending déclaré est produit par un run réel
// ═══════════════════════════════════════════════════════════════════

describe("c. endings — chaque ending déclaré est atteignable", () => {
  for (const { dir, scenario } of discovered) {
    it(`${dir} : taille de séquence compatible avec le solveur exhaustif`, () => {
      expect(
        scenario.sequence.length,
        `${dir} dépasse ${MAX_SOLVER_STEPS} steps : le solveur 2^n devient ` +
          `intraitable, il faudra un solveur ciblé dans harness.ts.`,
      ).toBeLessThanOrEqual(MAX_SOLVER_STEPS);
    });

    for (const ending of scenario.endings) {
      it(`${dir} : ending "${ending.id}" atteignable par un run réel`, () => {
        const passedSet = findPassedSetForEnding(scenario, ending.id);
        expect(
          passedSet,
          `Ending "${ending.id}" de ${dir} structurellement inatteignable : ` +
            `aucun pattern passed/failed ne le produit (shadowé par un ` +
            `ending antérieur dans le first-match, ou conditions impossibles).`,
        ).not.toBeNull();

        // Joue RÉELLEMENT le pattern trouvé : les échecs passent par
        // failCriteria et l'épuisement des retries du moteur réel.
        const toFail = scenario.sequence
          .map((s) => s.step_id)
          .filter((sid) => !passedSet!.has(sid));
        const { session } = playScenario(scenario, failStepsStrategy(toFail));

        expect(session.isFinished).toBe(true);
        expect(
          session.ending?.id,
          `Le run réel (passés : ${[...passedSet!].join(", ") || "aucun"}) ` +
            `devait produire "${ending.id}" mais a produit "${session.ending?.id}".`,
        ).toBe(ending.id);

        // Cohérence solveur ↔ moteur sur l'ensemble effectivement passé.
        const actuallyPassed = new Set(
          Object.values(session.stepResults)
            .filter((r) => r.passed)
            .map((r) => r.stepId),
        );
        expect(endingForPassedSet(scenario, actuallyPassed)?.id).toBe(ending.id);
      });
    }
  }
});
