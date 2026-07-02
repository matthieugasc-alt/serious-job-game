/**
 * Garde-fous statiques du composer : chaque code d'erreur est couvert.
 */

import { describe, it, expect } from "vitest";
import type { ScenarioV2 } from "../mechanics";
import { validateScenarioV2 } from "../composer";
import { MECHANIC_MANIFESTS } from "@/app/mechanics/manifests";

function base(): ScenarioV2 {
  return {
    format: "v2",
    scenario_id: "t",
    version: "1.0.0",
    locale: "fr-FR",
    meta: { title: "t", description: "t" },
    actors: [{ actor_id: "alice", name: "Alice", role: "NPC", prompt: "p" }],
    documents: [],
    sequence: [
      {
        step_id: "s1",
        mechanic: "_noop",
        params: { echo: "x" },
        evaluation: {
          observed_criteria: [{ id: "c1", description: "d" }],
        },
        completion_rules: { required_criteria: ["c1"] },
      },
    ],
    endings: [{ id: "end", label: "Fin", content: "…", default: true }],
  };
}

const codes = (s: ScenarioV2) =>
  validateScenarioV2(s, MECHANIC_MANIFESTS).map((i) => i.code);

describe("validateScenarioV2 — codes d'erreur", () => {
  it("scénario minimal valide → aucun issue", () => {
    expect(codes(base())).toEqual([]);
  });

  it("UNKNOWN_MECHANIC", () => {
    const s = base();
    s.sequence[0].mechanic = "inexistante";
    expect(codes(s)).toContain("UNKNOWN_MECHANIC");
  });

  it("DUPLICATE_STEP_ID", () => {
    const s = base();
    s.sequence.push({ ...s.sequence[0] });
    expect(codes(s)).toContain("DUPLICATE_STEP_ID");
  });

  it("MISSING_PARAM", () => {
    const s = base();
    s.sequence[0].params = {};
    expect(codes(s)).toContain("MISSING_PARAM");
  });

  it("UNKNOWN_ACTOR_REF via params.actor_id", () => {
    const s = base();
    s.sequence[0].params = { echo: "x", actor_id: "bob" };
    expect(codes(s)).toContain("UNKNOWN_ACTOR_REF");
  });

  it("BAD_INPUT_REF (source inconnue) et INPUT_REF_FORWARD", () => {
    const s = base();
    s.sequence.push({
      ...s.sequence[0],
      step_id: "s2",
      inputs: { a: "shadow.echo", b: "s3.echo" },
    });
    s.sequence.push({ ...s.sequence[0], step_id: "s3" });
    const c = codes(s);
    expect(c).toContain("BAD_INPUT_REF");
    expect(c).toContain("INPUT_REF_FORWARD");
  });

  it("UNKNOWN_OUTPUT_KEY", () => {
    const s = base();
    s.sequence.push({
      ...s.sequence[0],
      step_id: "s2",
      inputs: { a: "s1.cle_inexistante" },
    });
    expect(codes(s)).toContain("UNKNOWN_OUTPUT_KEY");
  });

  it("NO_CRITERIA + NO_COMPLETION_RULE", () => {
    const s = base();
    s.sequence[0].evaluation = { observed_criteria: [] };
    s.sequence[0].completion_rules = {};
    const c = codes(s);
    expect(c).toContain("NO_CRITERIA");
    expect(c).toContain("NO_COMPLETION_RULE");
  });

  it("UNKNOWN_REQUIRED_CRITERION", () => {
    const s = base();
    s.sequence[0].completion_rules = { required_criteria: ["fantome"] };
    expect(codes(s)).toContain("UNKNOWN_REQUIRED_CRITERION");
  });

  it("BAD_ENDINGS : zéro default, double default, step inconnu", () => {
    const s = base();
    s.endings = [{ id: "e", label: "l", content: "c" }];
    expect(codes(s)).toContain("BAD_ENDINGS");

    const s2 = base();
    s2.endings.push({ id: "e2", label: "l", content: "c", default: true });
    expect(codes(s2)).toContain("BAD_ENDINGS");

    const s3 = base();
    s3.endings.unshift({
      id: "e3",
      label: "l",
      content: "c",
      requires_passed: ["step_fantome"],
    });
    expect(codes(s3)).toContain("BAD_ENDINGS");
  });
});
