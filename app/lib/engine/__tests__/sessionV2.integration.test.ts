/**
 * Test d'intégration du socle v2 : trois steps _noop chaînés par
 * inputs_from. Éprouve le contrat outputs → inputs AVANT de construire
 * la moindre mécanique réelle dessus (décision figée du chantier).
 */

import { describe, it, expect } from "vitest";
import type { ScenarioV2, JsonObject } from "../mechanics";
import {
  initializeSessionV2,
  completeCurrentStep,
  getCurrentStep,
  serializeSessionV2,
  restoreSessionV2,
} from "../sessionV2";
import { resolveStepInputs, validateScenarioV2 } from "../composer";
import { MECHANIC_MANIFESTS } from "@/app/mechanics/manifests";
import { buildNoopResult } from "@/app/mechanics/_noop/Runtime";

const criteria = (id: string) => ({
  observed_criteria: [
    { id, description: `critère ${id}`, severity: "required" as const },
  ],
});
const rules = (id: string) => ({ required_criteria: [id] });

const scenario: ScenarioV2 = {
  format: "v2",
  scenario_id: "test_chain",
  version: "1.0.0",
  locale: "fr-FR",
  meta: { title: "Chaîne de test", description: "3 steps noop chaînés" },
  actors: [],
  documents: [],
  sequence: [
    {
      step_id: "s1",
      mechanic: "_noop",
      params: { echo: "premier" },
      evaluation: criteria("c1"),
      completion_rules: rules("c1"),
    },
    {
      step_id: "s2",
      mechanic: "_noop",
      params: { echo: "second" },
      inputs: { precedent: "s1.echo" },
      evaluation: criteria("c2"),
      completion_rules: rules("c2"),
    },
    {
      step_id: "s3",
      mechanic: "_noop",
      params: { echo: "troisième" },
      inputs: { tout_s2: "s2", echo_s1: "s1.echo" },
      evaluation: criteria("c3"),
      completion_rules: rules("c3"),
    },
  ],
  endings: [
    {
      id: "success",
      label: "Réussi",
      content: "Tous les steps passés.",
      requires_passed: ["s1", "s2", "s3"],
    },
    { id: "failure", label: "Échec", content: "Au moins un step raté.", default: true },
  ],
};

function playStep(session: ReturnType<typeof initializeSessionV2>, fail = false) {
  const step = getCurrentStep(session)!;
  const inputs = resolveStepInputs(session, step);
  const result = buildNoopResult({
    params: fail
      ? { ...step.params, fail_criteria: step.evaluation.observed_criteria.map((c) => c.id) }
      : step.params,
    inputs,
    criteria: step.evaluation.observed_criteria,
  });
  return { action: completeCurrentStep(session, result.observation, result.output), inputs };
}

describe("socle v2 — boucle complète et contrat inputs_from", () => {
  it("valide le scénario de test contre les manifests", () => {
    expect(validateScenarioV2(scenario, MECHANIC_MANIFESTS)).toEqual([]);
  });

  it("chaîne 3 steps en propageant les outputs via inputs_from", () => {
    const session = initializeSessionV2(scenario);

    const r1 = playStep(session);
    expect(r1.action).toBe("advanced");
    expect(session.stepResults.s1.passed).toBe(true);
    expect(session.stepResults.s1.output.echo).toBe("premier");

    const r2 = playStep(session);
    expect(r2.inputs.precedent).toBe("premier"); // s1.echo résolu
    expect(r2.action).toBe("advanced");

    const r3 = playStep(session);
    expect(r3.inputs.echo_s1).toBe("premier");
    expect((r3.inputs.tout_s2 as JsonObject).echo).toBe("second");
    expect(
      ((r3.inputs.tout_s2 as JsonObject).received_inputs as JsonObject).precedent,
    ).toBe("premier");
    expect(r3.action).toBe("ended");

    expect(session.isFinished).toBe(true);
    expect(session.ending?.id).toBe("success");
    expect(session.evaluationHistory).toHaveLength(3);
  });

  it("retry borné puis avance en échec, ending default", () => {
    const session = initializeSessionV2(scenario);
    expect(playStep(session, true).action).toBe("retry"); // essai 1
    expect(session.stepResults.s1.attempts).toBe(1);
    expect(playStep(session, true).action).toBe("advanced"); // essai 2 = max
    expect(session.stepResults.s1.passed).toBe(false);

    playStep(session);
    playStep(session);
    expect(session.isFinished).toBe(true);
    expect(session.ending?.id).toBe("failure"); // default : s1 non passé
  });

  it("un step on_failure=end_scenario termine immédiatement", () => {
    const s2: ScenarioV2 = JSON.parse(JSON.stringify(scenario));
    s2.sequence[0].on_failure = "end_scenario";
    const session = initializeSessionV2(s2);
    expect(playStep(session, true).action).toBe("ended");
    expect(session.ending?.id).toBe("failure");
  });

  it("deep-save : sérialisation/restauration symétrique en milieu de partie", () => {
    const session = initializeSessionV2(scenario);
    playStep(session);
    const restored = restoreSessionV2(serializeSessionV2(session));
    expect(restored.currentStepIndex).toBe(1);
    expect(restored.stepResults.s1.output.echo).toBe("premier");
    const r2 = playStep(restored);
    expect(r2.inputs.precedent).toBe("premier");
  });

  it("resolveStepInputs throw sur référence irrésoluble (bug de scénario)", () => {
    const session = initializeSessionV2(scenario);
    expect(() =>
      resolveStepInputs(session, {
        ...scenario.sequence[1],
        inputs: { x: "s_inexistant.echo" },
      }),
    ).toThrow(/step_inexistant|s_inexistant/i);
  });
});
