/**
 * Parité composerV3 (TS) ↔ validate-scenarios-v3.mjs (CLI node) :
 * mêmes codes d'erreur sur les mêmes fixtures — pas de dérive
 * silencieuse entre le garde-fou du moteur et celui de la CI.
 */

import { describe, it, expect } from "vitest";
import type { CompletionTrigger, ScenarioV3 } from "../workspace";
import { validateScenarioV3 } from "../composerV3";
// @ts-expect-error — module node pur, sans types (dualité assumée, cf. v2)
import { validateScenarioV3 as validateMjs } from "../../../../scripts/validate-scenarios-v3.mjs";
import { FAKE_SPECS, FAKE_TOOLS, makeScenario, makeStep } from "./v3.fixtures";

function tsCodes(s: ScenarioV3): string[] {
  return validateScenarioV3(s, FAKE_SPECS, FAKE_TOOLS)
    .map((i) => i.code)
    .sort();
}
function mjsCodes(s: ScenarioV3): string[] {
  return (validateMjs(s, FAKE_SPECS, FAKE_TOOLS) as { code: string }[])
    .map((i) => i.code)
    .sort();
}

function fixtures(): ScenarioV3[] {
  const valid = makeScenario([
    makeStep({
      step_id: "s1",
      threads: [{ thread_id: "th_alex", participants: ["alex"] }],
      tools: [{ tool: "notes" }],
      events: [
        {
          event_id: "e1",
          when: { type: "delay", seconds: 30 },
          effect: { type: "actor_reply", thread_id: "th_alex", actor_id: "alex" },
        },
      ],
      completion: {
        trigger: {
          type: "all",
          of: [
            { type: "message_sent", to_actor: "alex", min_count: 2 },
            { type: "criterion_observed", criterion: "c1" },
          ],
        },
      },
    }),
    makeStep({
      step_id: "s2",
      mechanic: "m_prod",
      inputs: { a: "s1.findings" },
      completion: { trigger: { type: "any", of: [{ type: "contract_signed" }, { type: "contract_rejected" }] } },
    }),
  ]);

  const brokenTriggers = makeScenario([
    makeStep({
      step_id: "s1",
      completion: {
        trigger: {
          type: "all",
          of: [
            { type: "criterion_observed", criterion: "c_absent" },
            { type: "actor_validation", actor: "fantome" },
            { type: "timer_elapsed", seconds: -5 },
            { type: "document_opened", document_id: "doc_absent" },
            { type: "deliverable_submitted", tool: "tableur" },
          ],
        },
      },
    }),
  ]);

  const brokenStructure = makeScenario([
    makeStep({
      step_id: "s1",
      mechanic: "inconnue",
      completion: { trigger: { type: "manual", label: "" } },
    }),
    makeStep({
      step_id: "s1", // dupliqué
      params: {},
      threads: [{ thread_id: "th", participants: ["fantome"] }],
      tools: [{ tool: "tableur" }],
      inputs: { x: "s9.y" },
      events: [
        {
          event_id: "e",
          when: { type: "delay", seconds: 0 },
          effect: { type: "message_received", thread_id: "nulle_part", actor_id: "fantome" },
        },
      ],
      completion: { trigger: { type: "pas_un_type" } as unknown as CompletionTrigger },
    }),
  ]);
  brokenStructure.endings = brokenStructure.endings.filter((e) => !e.default);

  const missingTrigger = makeScenario([makeStep({ step_id: "s1" })]);
  delete (missingTrigger.sequence[0] as { completion?: unknown }).completion;

  return [valid, brokenTriggers, brokenStructure, missingTrigger];
}

describe("parité TS ↔ mjs", () => {
  it("mêmes codes, triés, sur chaque fixture", () => {
    for (const scenario of fixtures()) {
      expect(mjsCodes(scenario)).toEqual(tsCodes(scenario));
    }
  });

  it("la fixture valide passe des deux côtés", () => {
    expect(tsCodes(fixtures()[0])).toEqual([]);
    expect(mjsCodes(fixtures()[0])).toEqual([]);
  });
});
