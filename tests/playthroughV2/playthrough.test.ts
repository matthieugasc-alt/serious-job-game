/**
 * ═════════════════════════════════════════════════════════════════
 * Playthrough headless des scénarios v2 (SCENARIO_IDS) contre le moteur
 * réel. founder_02_mvp est passé v3 → tests/playthroughV3/.
 * ═════════════════════════════════════════════════════════════════
 *
 * Ce que ces tests PROUVENT :
 *  A. chaque scénario est jouable de bout en bout en happy path, les
 *     chaînes inputs_from se résolvent avec les VRAIS formats d'outputs
 *     des Runtime, et chaque output respecte les output_keys du manifest ;
 *  B. chaque critère critical termine le scénario immédiatement, sur un
 *     ending existant (et mappé founder_rules pour les founder) ;
 *  C. chaque ending déclaré est atteignable par un vrai run (détection
 *     des endings shadowés par le first-match ou inatteignables) ;
 *  D. chaque outcome founder se résout et s'applique sans NaN, avec un
 *     microDebrief interpolé sans reste de template ;
 *  E. les 7 scénarios passent validateScenarioV2 avec 0 issue.
 *
 * Ce qu'ils ne prouvent PAS : l'UI (Components React), la qualité des
 * observations IA réelles, ni la persistance HTTP (routes API).
 */

import { describe, it, expect } from "vitest";
import type { ScenarioV2 } from "@/app/lib/engine/mechanics";
import { validateScenarioV2 } from "@/app/lib/engine/composer";
import { MECHANIC_MANIFESTS } from "@/app/mechanics/manifests";
import { loadRules } from "@/app/lib/founder";
import {
  SCENARIO_IDS,
  FOUNDER_SCENARIO_IDS,
  loadScenarioV2,
  playScenario,
  failStepsStrategy,
  stepCriticalCriteria,
  findPassedSetForEnding,
  endingForPassedSet,
  applyFounderOutcomeInMemory,
} from "./harness";

const scenarios = new Map<string, ScenarioV2>(
  SCENARIO_IDS.map((id) => [id, loadScenarioV2(id)]),
);
const founderRules = loadRules();
const isFounder = (id: string): boolean =>
  (FOUNDER_SCENARIO_IDS as readonly string[]).includes(id);

// ═══════════════════════════════════════════════════════════════════
// E. Garde-fou global : validation statique contre les manifests
// ═══════════════════════════════════════════════════════════════════

describe("E. validateScenarioV2 — 0 issue sur les scénarios v2 suivis", () => {
  for (const [id, scenario] of scenarios) {
    it(`${id} passe la validation statique`, () => {
      expect(validateScenarioV2(scenario, MECHANIC_MANIFESTS)).toEqual([]);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// A. Happy path : jouable de bout en bout, chaînes inputs_from OK
// ═══════════════════════════════════════════════════════════════════

describe("A. happy path — bout en bout, tout expected", () => {
  for (const [id, scenario] of scenarios) {
    it(`${id} : tous les steps passent, ending cohérent, outputs conformes`, () => {
      // playScenario throw si resolveStepInputs échoue (chaîne cassée) ou
      // si un output ne contient pas les output_keys de son manifest.
      const { session, trace } = playScenario(scenario);

      expect(session.isFinished).toBe(true);
      expect(session.ending).not.toBeNull();
      expect(scenario.endings.map((e) => e.id)).toContain(session.ending!.id);

      // Chaque step joué exactement une fois, tous passés.
      expect(trace).toHaveLength(scenario.sequence.length);
      for (const step of scenario.sequence) {
        const sr = session.stepResults[step.step_id];
        expect(sr, `résultat manquant pour ${step.step_id}`).toBeDefined();
        expect(sr.passed, `${step.step_id} devrait passer en happy path`).toBe(true);

        // Redite explicite du contrat output_keys (déjà assertée au vol).
        const manifest = MECHANIC_MANIFESTS[step.mechanic];
        for (const key of manifest.output_keys) {
          expect(
            sr.output[key],
            `${step.step_id} (${step.mechanic}) : output_key "${key}" absente`,
          ).not.toBeUndefined();
        }
      }

      // L'ending du run réel = l'ending prédit pour "tout passé".
      const allPassed = new Set(scenario.sequence.map((s) => s.step_id));
      expect(session.ending!.id).toBe(endingForPassedSet(scenario, allPassed)!.id);
    });

    if (isFounder(id)) {
      it(`${id} : l'ending happy path mappe dans founder_rules.json`, () => {
        const { session } = playScenario(scenario);
        expect(
          Object.keys(founderRules.scenarios[id].outcomes),
          `ending "${session.ending!.id}" sans outcome founder`,
        ).toContain(session.ending!.id);
      });
    }
  }
});

// ═══════════════════════════════════════════════════════════════════
// B. Criticals : chaque critère critical court-circuite proprement
// ═══════════════════════════════════════════════════════════════════

describe("B. criticals — le scénario se termine immédiatement", () => {
  for (const [id, scenario] of scenarios) {
    const criticalSteps = scenario.sequence
      .map((step) => ({ step, criticals: stepCriticalCriteria(step) }))
      .filter((x) => x.criticals.length > 0);

    if (criticalSteps.length === 0) {
      it(`${id} : aucun critère critical déclaré (rien à court-circuiter)`, () => {
        expect(criticalSteps).toHaveLength(0);
      });
      continue;
    }

    for (const { step, criticals } of criticalSteps) {
      for (const criticalId of criticals) {
        it(`${id} / ${step.step_id} : critical "${criticalId}" termine le scénario`, () => {
          const { session, trace } = playScenario(scenario, (s) =>
            s.step_id === step.step_id ? { fireCritical: criticalId } : {},
          );

          expect(session.isFinished).toBe(true);
          // Le run s'arrête AU step critical : rien après lui dans la trace.
          expect(trace[trace.length - 1].stepId).toBe(step.step_id);
          const stepIndex = scenario.sequence.findIndex(
            (s) => s.step_id === step.step_id,
          );
          for (const later of scenario.sequence.slice(stepIndex + 1)) {
            expect(session.stepResults[later.step_id]).toBeUndefined();
          }

          const sr = session.stepResults[step.step_id];
          expect(sr.passed).toBe(false);
          expect(sr.evaluation.appliedRule).toBe("critical_failure");
          expect(sr.evaluation.criticalFailures).toContain(criticalId);

          expect(session.ending).not.toBeNull();
          expect(scenario.endings.map((e) => e.id)).toContain(session.ending!.id);
          if (isFounder(id)) {
            expect(
              Object.keys(founderRules.scenarios[id].outcomes),
              `ending critical "${session.ending!.id}" sans outcome founder`,
            ).toContain(session.ending!.id);
          }
        });
      }
    }
  }
});

// ═══════════════════════════════════════════════════════════════════
// C. Atteignabilité : chaque ending déclaré est produit par un vrai run
// ═══════════════════════════════════════════════════════════════════

describe("C. endings — chaque ending déclaré est atteignable", () => {
  for (const [id, scenario] of scenarios) {
    for (const ending of scenario.endings) {
      it(`${id} : ending "${ending.id}" atteignable par un run réel`, () => {
        const passedSet = findPassedSetForEnding(scenario, ending.id);
        expect(
          passedSet,
          `Ending "${ending.id}" de ${id} structurellement inatteignable : ` +
            `aucun pattern passed/failed ne le produit (shadowé par un ending ` +
            `antérieur dans le first-match, ou conditions impossibles).`,
        ).not.toBeNull();

        // Joue RÉELLEMENT le pattern : échecs via failCriteria, retries
        // épuisés jusqu'à max_attempts par la boucle réelle du moteur.
        const toFail = scenario.sequence
          .map((s) => s.step_id)
          .filter((sid) => !passedSet!.has(sid));
        const { session } = playScenario(scenario, failStepsStrategy(toFail));

        expect(session.isFinished).toBe(true);
        const actuallyPassed = new Set(
          Object.values(session.stepResults)
            .filter((r) => r.passed)
            .map((r) => r.stepId),
        );
        expect([...actuallyPassed].sort()).toEqual([...passedSet!].sort());
        expect(
          session.ending?.id,
          `Le run réel (passés : ${[...passedSet!].join(", ") || "aucun"}) ` +
            `devait produire "${ending.id}" mais a produit "${session.ending?.id}".`,
        ).toBe(ending.id);
      });
    }
  }
});

// ═══════════════════════════════════════════════════════════════════
// D. Outcomes founder : résolution + application en mémoire
// ═══════════════════════════════════════════════════════════════════

describe("D. outcomes founder — deltas et microDebrief pour chaque ending", () => {
  for (const id of FOUNDER_SCENARIO_IDS) {
    const scenario = scenarios.get(id)!;

    it(`${id} : founder_rules couvre tous les endings du scénario`, () => {
      const outcomes = Object.keys(founderRules.scenarios[id]?.outcomes ?? {});
      for (const ending of scenario.endings) {
        expect(outcomes, `ending "${ending.id}" sans outcome`).toContain(ending.id);
      }
    });

    for (const ending of scenario.endings) {
      it(`${id} / ${ending.id} : outcome résolu, deltas finis, debrief interpolé`, () => {
        // Rejoue le run qui produit cet ending pour disposer des VRAIS
        // outputs de steps (dont l'agreement de négociation qui alimente
        // les deltas dynamiques de /api/v2/complete).
        const passedSet = findPassedSetForEnding(scenario, ending.id);
        expect(passedSet).not.toBeNull();
        const toFail = scenario.sequence
          .map((s) => s.step_id)
          .filter((sid) => !passedSet!.has(sid));
        const { session } = playScenario(scenario, failStepsStrategy(toFail));
        expect(session.ending?.id).toBe(ending.id);

        const stepOutputs = scenario.sequence
          .map((s) => session.stepResults[s.step_id]?.output)
          .filter((o): o is NonNullable<typeof o> => o !== undefined);

        const { outcome, microDebrief, stateAfter } = applyFounderOutcomeInMemory(
          id,
          ending.id,
          stepOutputs,
          founderRules,
          { ...founderRules.initialState },
        );

        // Outcome trouvé, deltas numériques appliqués sans NaN.
        expect(outcome.outcomeId).toBeTruthy();
        for (const [key, value] of Object.entries(stateAfter)) {
          expect(Number.isFinite(value), `${key} non fini : ${value}`).toBe(true);
        }

        // MicroDebrief : aucun reste de template {{...}}.
        //
        // EXCEPTION DOCUMENTÉE — founder_04_v1 / feature_trap :
        // {{devis_features_count}} n'a aucune source v2 (le scénario ne
        // produit plus de devis chiffré). /api/v2/complete le laisse
        // volontairement visible (cf. TODO-DEBT(founder-dynamic-deltas)
        // dans route.ts et le contrat de interpolateMicroDebrief : bug
        // visible plutôt que masqué). On tolère UNIQUEMENT ce token-là.
        const tolerated =
          id === "founder_04_v1" && ending.id === "feature_trap"
            ? ["{{devis_features_count}}"]
            : [];
        const fields: Record<string, string | undefined> = {
          decision: microDebrief.decision,
          impact: microDebrief.impact,
          strength: microDebrief.strength,
          risk: microDebrief.risk,
          advice: microDebrief.advice,
        };
        for (const [field, text] of Object.entries(fields)) {
          if (text === undefined) continue;
          const leftovers = (text.match(/\{\{\w+\}\}/g) ?? []).filter(
            (t) => !tolerated.includes(t),
          );
          expect(
            leftovers,
            `${id}/${ending.id} microDebrief.${field} : template non interpolé — "${text}"`,
          ).toEqual([]);
        }
      });
    }
  }
});
