import type { JsonObject } from "@/app/lib/engine/mechanics";
import type { StepCriterion, StepObservation } from "@/app/lib/engine/criteria";

/**
 * Logique pure de la mécanique noop : observe tous les critères comme
 * matchés (expected), sauf ceux listés dans params.fail_criteria.
 * Déterministe — c'est le harnais des tests d'intégration du socle.
 */
export function buildNoopResult(input: {
  params: JsonObject;
  inputs: JsonObject;
  criteria: StepCriterion[];
}): { observation: StepObservation; output: JsonObject } {
  const failList = Array.isArray(input.params.fail_criteria)
    ? (input.params.fail_criteria as string[])
    : [];

  const criteria: Record<string, boolean> = {};
  for (const c of input.criteria) {
    const expected = c.expected ?? true;
    criteria[c.id] = failList.includes(c.id) ? !expected : expected;
  }

  return {
    observation: {
      criteria,
      meta: { model: "deterministic:_noop", at: new Date().toISOString() },
    },
    output: {
      echo: (input.params.echo as string) ?? "",
      received_inputs: input.inputs,
    },
  };
}
