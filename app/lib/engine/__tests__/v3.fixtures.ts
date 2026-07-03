/**
 * Fixtures partagées des tests moteur v3 — scénario synthétique et
 * specs FACTICES (le cœur se teste sans aucune mécanique réelle).
 */

import type {
  MechanicSpecManifest,
  ScenarioV3,
  StepInvocationV3,
} from "../workspace";
import type { DirectiveSource } from "../workspaceReducer";

export const FAKE_TOOLS = ["notes", "contrat"];

export const FAKE_SPECS: Record<string, MechanicSpecManifest> = {
  m_analyse: {
    id: "m_analyse",
    version: "1.0.0",
    title: "Analyse factice",
    description: "Spec de test — aucune mécanique réelle.",
    output_keys: ["findings"],
    required_params: ["instructions"],
    default_tools: ["notes"],
  },
  m_prod: {
    id: "m_prod",
    version: "1.0.0",
    title: "Production factice",
    description: "Spec de test — aucune mécanique réelle.",
    output_keys: ["deliverable"],
    required_params: ["instructions"],
    default_tools: [],
  },
};

/** Sources de directive factices pour le reducer (cadrage acteur). */
export const FAKE_DIRECTIVES: Record<string, DirectiveSource> = {
  m_analyse: { directive: () => "DIRECTIVE_ANALYSE" },
  m_prod: { directive: () => "DIRECTIVE_PROD" },
};

export function evalBlock(...ids: string[]) {
  return {
    evaluation: {
      observed_criteria: ids.map((id) => ({
        id,
        description: `critère ${id}`,
        severity: "required" as const,
      })),
    },
    completion_rules: { required_criteria: ids },
  };
}

/** Step minimal valide — surcharger ce qu'on teste. */
export function makeStep(
  partial: Partial<StepInvocationV3> & { step_id: string },
): StepInvocationV3 {
  return {
    mechanic: "m_analyse",
    params: { instructions: "consigne de test" },
    completion: { trigger: { type: "manual", label: "Terminer" } },
    ...evalBlock("c1"),
    ...partial,
  };
}

export function makeScenario(sequence: StepInvocationV3[]): ScenarioV3 {
  return {
    format: "v3",
    scenario_id: "test_v3",
    version: "1.0.0",
    locale: "fr-FR",
    meta: { title: "Scénario de test v3", description: "synthétique" },
    actors: [
      { actor_id: "alex", name: "Alexandre", role: "associé", prompt: "p" },
      { actor_id: "thomas", name: "Thomas", role: "prestataire", prompt: "p" },
    ],
    documents: [{ id: "doc_pack", title: "Data pack", content: "…" }],
    sequence,
    endings: [
      {
        id: "success",
        label: "Réussi",
        content: "Tous les steps passés.",
        requires_passed: sequence.map((s) => s.step_id),
      },
      { id: "failure", label: "Échec", content: "…", default: true },
    ],
  };
}
