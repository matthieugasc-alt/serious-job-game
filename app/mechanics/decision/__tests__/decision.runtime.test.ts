import { describe, it, expect } from "vitest";
import type { StepCriterion, StepObservation } from "@/app/lib/engine/criteria";
import {
  CHOICE_CRITERION_PREFIX,
  parseOptions,
  parseConfig,
  validateDecision,
  splitCriteria,
  buildDeterministicObservation,
  mergeObservations,
  buildSummary,
  buildOutput,
  restoreDecision,
  validateParams,
} from "../Runtime";

const crit = (id: string): StepCriterion => ({ id, description: `desc ${id}` });

describe("decision — parseOptions / parseConfig", () => {
  it("parse les options valides et ignore les invalides", () => {
    const opts = parseOptions({
      options: [
        { id: "a", label: "A", description: "da" },
        { id: "", label: "x", description: "y" },
        { id: "b", label: "B" },
        "texte",
        null,
      ],
    });
    expect(opts).toEqual([{ id: "a", label: "A", description: "da" }]);
  });

  it("parseConfig applique les défauts : 1 choix, justification requise ≥ 50", () => {
    expect(parseConfig({})).toEqual({
      maxChoices: 1,
      requireJustification: true,
      minJustificationChars: 50,
    });
  });

  it("parseConfig respecte les overrides et rejette les valeurs absurdes", () => {
    expect(
      parseConfig({
        max_choices: 3,
        require_justification: false,
        min_justification_chars: 0,
      }),
    ).toEqual({ maxChoices: 3, requireJustification: false, minJustificationChars: 0 });
    expect(parseConfig({ max_choices: 0 }).maxChoices).toBe(1);
    expect(parseConfig({ max_choices: 1.5 }).maxChoices).toBe(1);
    expect(parseConfig({ min_justification_chars: -5 }).minJustificationChars).toBe(50);
  });
});

describe("decision — validateDecision", () => {
  const config = { maxChoices: 1, requireJustification: true, minJustificationChars: 10 };

  it("valide un choix + justification suffisante", () => {
    expect(validateDecision(["a"], "une justification", config)).toEqual([]);
  });

  it("refuse aucun choix, trop de choix, justification trop courte", () => {
    expect(validateDecision([], "une justification", config)).toHaveLength(1);
    expect(validateDecision(["a", "b"], "une justification", config)).toHaveLength(1);
    expect(validateDecision(["a"], "court", config)).toHaveLength(1);
    expect(validateDecision(["a"], "             ", config)).toHaveLength(1);
  });

  it("justification facultative si require_justification=false", () => {
    expect(
      validateDecision(["a"], "", { ...config, requireJustification: false }),
    ).toEqual([]);
  });
});

describe("decision — splitCriteria", () => {
  it("partitionne selon le préfixe choice_", () => {
    const { structural, observed } = splitCriteria([
      crit("choice_a"),
      crit("justif_solide"),
      crit("choice_b"),
    ]);
    expect(structural.map((c) => c.id)).toEqual(["choice_a", "choice_b"]);
    expect(observed.map((c) => c.id)).toEqual(["justif_solide"]);
  });

  it("gère tout-structurel, tout-observé et vide", () => {
    expect(splitCriteria([crit("choice_a")]).observed).toEqual([]);
    expect(splitCriteria([crit("x")]).structural).toEqual([]);
    expect(splitCriteria([])).toEqual({ structural: [], observed: [] });
  });
});

describe("decision — buildDeterministicObservation", () => {
  it("choice_<id> = true ssi l'option est choisie", () => {
    const obs = buildDeterministicObservation(
      [crit("choice_a"), crit("choice_b")],
      ["a"],
    );
    expect(obs.criteria).toEqual({ choice_a: true, choice_b: false });
  });

  it("fournit une evidence par critère et un meta déterministe", () => {
    const obs = buildDeterministicObservation([crit("choice_a")], []);
    expect(obs.evidence?.choice_a).toContain("non choisie");
    expect(obs.evidence?.choice_a).toContain("déterministe");
    expect(obs.meta?.model).toBe("deterministic:decision");
  });

  it("extrait correctement l'option_id après le préfixe", () => {
    const obs = buildDeterministicObservation(
      [crit(`${CHOICE_CRITERION_PREFIX}option_composite_x`)],
      ["option_composite_x"],
    );
    expect(obs.criteria.choice_option_composite_x).toBe(true);
  });
});

describe("decision — mergeObservations", () => {
  const det: StepObservation = {
    criteria: { choice_a: true },
    evidence: { choice_a: "déterministe" },
    meta: { model: "deterministic:decision" },
  };
  const ai: StepObservation = {
    criteria: { justif_solide: true },
    evidence: { justif_solide: "l'IA a vu une justification" },
    meta: { model: "gpt-test" },
  };

  it("retourne le déterministe seul si pas d'observation IA", () => {
    expect(mergeObservations(det, null)).toEqual(det);
  });

  it("fusionne critères et evidences des deux observations", () => {
    const merged = mergeObservations(det, ai);
    expect(merged.criteria).toEqual({ choice_a: true, justif_solide: true });
    expect(merged.evidence).toEqual({
      choice_a: "déterministe",
      justif_solide: "l'IA a vu une justification",
    });
    expect(merged.meta?.model).toBe("gpt-test");
  });

  it("en cas de collision d'id, le déterministe gagne", () => {
    const drift: StepObservation = {
      criteria: { choice_a: false, autre: true },
      evidence: { choice_a: "l'IA se trompe" },
    };
    const merged = mergeObservations(det, drift);
    expect(merged.criteria.choice_a).toBe(true);
    expect(merged.evidence?.choice_a).toBe("déterministe");
    expect(merged.criteria.autre).toBe(true);
  });

  it("supporte des observations IA sans evidence ni meta", () => {
    const merged = mergeObservations(det, { criteria: { x: false } });
    expect(merged.criteria).toEqual({ choice_a: true, x: false });
    expect(merged.meta?.model).toBe("deterministic:decision");
  });
});

describe("decision — buildSummary / buildOutput", () => {
  const options = [
    { id: "a", label: "Option A", description: "" },
    { id: "b", label: "Option B", description: "" },
  ];

  it("buildSummary utilise les labels et inclut la justification", () => {
    const s = buildSummary(options, ["a", "b"], " parce que ");
    expect(s).toContain("Option A");
    expect(s).toContain("Option B");
    expect(s).toContain("parce que");
  });

  it("buildOutput : choice = premier id, choices = tous, justification trimmée", () => {
    expect(buildOutput(["b", "a"], " ok ")).toEqual({
      choice: "b",
      choices: ["b", "a"],
      justification: "ok",
    });
  });

  it("buildOutput sans choix : choice = null (JSON-sérialisable)", () => {
    const out = buildOutput([], "");
    expect(out.choice).toBeNull();
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});

describe("decision — restoreDecision (scratch)", () => {
  it("restaure choix et justification, filtre les non-strings", () => {
    expect(
      restoreDecision({ choices: ["a", 3, "b"], justification: "j" }),
    ).toEqual({ choices: ["a", "b"], justification: "j" });
    expect(restoreDecision({})).toEqual({ choices: [], justification: "" });
  });
});

describe("decision — validateParams", () => {
  const valid = {
    instructions: "Tranchez.",
    options: [
      { id: "a", label: "A", description: "da" },
      { id: "b", label: "B", description: "db" },
    ],
  };

  it("accepte des params valides avec optionnels", () => {
    expect(validateParams(valid)).toEqual([]);
    expect(
      validateParams({
        ...valid,
        max_choices: 2,
        require_justification: false,
        min_justification_chars: 0,
      }),
    ).toEqual([]);
  });

  it("refuse moins de 2 options, options mal formées ou ids dupliqués", () => {
    expect(
      validateParams({ ...valid, options: [valid.options[0]] }),
    ).not.toEqual([]);
    expect(
      validateParams({ ...valid, options: [{ id: "a" }, { id: "b" }] }),
    ).not.toEqual([]);
    expect(
      validateParams({
        ...valid,
        options: [valid.options[0], { ...valid.options[1], id: "a" }],
      }),
    ).not.toEqual([]);
  });

  it("refuse instructions vides et optionnels mal typés", () => {
    expect(validateParams({ ...valid, instructions: "" })).not.toEqual([]);
    expect(validateParams({ ...valid, max_choices: 0 })).not.toEqual([]);
    expect(validateParams({ ...valid, max_choices: "2" })).not.toEqual([]);
    expect(validateParams({ ...valid, require_justification: "oui" })).not.toEqual([]);
    expect(validateParams({ ...valid, min_justification_chars: -1 })).not.toEqual([]);
  });
});
