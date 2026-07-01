/**
 * Tests unit — garde-fou E6 (checkEvaluationCoverage).
 *
 * Exhaustif sur les 4 codes d'erreur émis par le helper:
 *   - EVAL_DUPLICATE_CRITERION_ID
 *   - EVAL_REQUIRED_CRITERION_NOT_DECLARED
 *   - EVAL_MIN_COUNT_UNREACHABLE
 *   - EVAL_RULE_WITHOUT_CRITERIA
 *
 * Le helper est appelé par scripts/validate-scenarios.mjs pendant
 * `npm run validate:scenarios` (part du build/CI).
 */

import { describe, it, expect } from "vitest";
// @ts-expect-error — .mjs sans .d.ts
import { checkEvaluationCoverage } from "../lib/checkEvaluationCoverage.mjs";

const P = "phases[0]";

function issuesFor(phase: unknown) {
  return checkEvaluationCoverage(phase, P) as Array<{ code: string; message: string; path: string }>;
}

describe("checkEvaluationCoverage — happy paths", () => {
  it("phase sans evaluation ni completion_rules E → aucune issue", () => {
    expect(issuesFor({ phase_id: "p1", completion_rules: { any_flags: ["done"] } })).toEqual([]);
  });

  it("phase E-chantier valide → aucune issue", () => {
    const phase = {
      phase_id: "p1",
      evaluation: {
        observed_criteria: [
          { id: "a", description: "…" },
          { id: "b", description: "…" },
          { id: "c", description: "…" },
        ],
      },
      completion_rules: {
        required_criteria: ["a"],
        min_criteria_count: 1,
      },
    };
    expect(issuesFor(phase)).toEqual([]);
  });

  it("min_criteria_count = observed.length (exactement) + required OK → aucune issue", () => {
    // NOTE post-W5: la phase doit avoir au moins un chemin d'échec.
    // Ici required_criteria fournit ce chemin (a manquant = échec).
    const phase = {
      phase_id: "p1",
      evaluation: { observed_criteria: [{ id: "a", description: "" }, { id: "b", description: "" }] },
      completion_rules: { min_criteria_count: 2, required_criteria: ["a"] },
    };
    expect(issuesFor(phase)).toEqual([]);
  });
});

describe("checkEvaluationCoverage — EVAL_DUPLICATE_CRITERION_ID", () => {
  it("2 critères avec le même id → erreur", () => {
    const phase = {
      phase_id: "p1",
      evaluation: {
        observed_criteria: [
          { id: "dup", description: "1st" },
          { id: "dup", description: "2nd" },
        ],
      },
    };
    const issues = issuesFor(phase);
    expect(issues.some((i) => i.code === "EVAL_DUPLICATE_CRITERION_ID")).toBe(true);
    expect(issues[0].message).toContain("dup");
  });

  it("plusieurs dupes distinctes → toutes surfacées", () => {
    const phase = {
      phase_id: "p1",
      evaluation: {
        observed_criteria: [
          { id: "a", description: "" },
          { id: "a", description: "" },
          { id: "b", description: "" },
          { id: "b", description: "" },
        ],
      },
    };
    const issues = issuesFor(phase);
    const msg = issues.find((i) => i.code === "EVAL_DUPLICATE_CRITERION_ID")?.message ?? "";
    expect(msg).toContain("a");
    expect(msg).toContain("b");
  });
});

describe("checkEvaluationCoverage — EVAL_REQUIRED_CRITERION_NOT_DECLARED", () => {
  it("required_criteria ref un id inconnu → erreur avec l'id", () => {
    const phase = {
      phase_id: "p1",
      evaluation: { observed_criteria: [{ id: "known", description: "" }] },
      completion_rules: { required_criteria: ["known", "ghost_criterion"] },
    };
    const issues = issuesFor(phase);
    expect(issues.some((i) => i.code === "EVAL_REQUIRED_CRITERION_NOT_DECLARED")).toBe(true);
    expect(issues.find((i) => i.code === "EVAL_REQUIRED_CRITERION_NOT_DECLARED")?.message)
      .toContain("ghost_criterion");
  });

  it("plusieurs ids inconnus → une erreur par id", () => {
    const phase = {
      phase_id: "p1",
      evaluation: { observed_criteria: [{ id: "a", description: "" }] },
      completion_rules: { required_criteria: ["x", "y", "z"] },
    };
    const issues = issuesFor(phase).filter((i) => i.code === "EVAL_REQUIRED_CRITERION_NOT_DECLARED");
    expect(issues.length).toBe(3);
  });
});

describe("checkEvaluationCoverage — EVAL_MIN_COUNT_UNREACHABLE", () => {
  it("min_criteria_count > observed.length → erreur", () => {
    const phase = {
      phase_id: "p1",
      evaluation: { observed_criteria: [{ id: "a", description: "" }, { id: "b", description: "" }] },
      completion_rules: { min_criteria_count: 5 },
    };
    const issues = issuesFor(phase);
    expect(issues.some((i) => i.code === "EVAL_MIN_COUNT_UNREACHABLE")).toBe(true);
  });

  it("min_criteria_count = 0 → OK (rule désactivée)", () => {
    const phase = {
      phase_id: "p1",
      evaluation: { observed_criteria: [{ id: "a", description: "" }] },
      completion_rules: { min_criteria_count: 0 },
    };
    expect(issuesFor(phase).filter((i) => i.code === "EVAL_MIN_COUNT_UNREACHABLE")).toEqual([]);
  });
});

describe("checkEvaluationCoverage — EVAL_RULE_WITHOUT_CRITERIA", () => {
  it("required_criteria sans bloc evaluation → erreur", () => {
    const phase = {
      phase_id: "p1",
      completion_rules: { required_criteria: ["some_id"] },
    };
    const issues = issuesFor(phase);
    expect(issues.some((i) => i.code === "EVAL_RULE_WITHOUT_CRITERIA")).toBe(true);
  });

  it("min_criteria_count sans bloc evaluation → erreur", () => {
    const phase = {
      phase_id: "p1",
      completion_rules: { min_criteria_count: 2 },
    };
    const issues = issuesFor(phase);
    expect(issues.some((i) => i.code === "EVAL_RULE_WITHOUT_CRITERIA")).toBe(true);
  });
});

describe("checkEvaluationCoverage — W5 EVAL_CRITICAL_NOT_DECLARED", () => {
  it("critical_failure_criteria ref un id inconnu → erreur", () => {
    const phase = {
      phase_id: "p1",
      evaluation: { observed_criteria: [{ id: "a", description: "", severity: "critical" }] },
      completion_rules: { required_criteria: ["a"], critical_failure_criteria: ["ghost"] },
    };
    const issues = issuesFor(phase);
    expect(issues.some((i) => i.code === "EVAL_CRITICAL_NOT_DECLARED")).toBe(true);
  });
});

describe("checkEvaluationCoverage — W5 EVAL_CRITICAL_SEVERITY_MISMATCH", () => {
  it("critical_failure_criteria ref un id avec severity != critical → erreur", () => {
    const phase = {
      phase_id: "p1",
      evaluation: {
        observed_criteria: [{ id: "a", description: "", severity: "required" }],
      },
      completion_rules: { required_criteria: ["a"], critical_failure_criteria: ["a"] },
    };
    const issues = issuesFor(phase);
    expect(issues.some((i) => i.code === "EVAL_CRITICAL_SEVERITY_MISMATCH")).toBe(true);
  });

  it("severity=critical alignée → pas d'erreur mismatch", () => {
    const phase = {
      phase_id: "p1",
      evaluation: {
        observed_criteria: [
          { id: "greet", description: "", severity: "required" },
          { id: "insulte", description: "", severity: "critical" },
        ],
      },
      completion_rules: { required_criteria: ["greet"], critical_failure_criteria: ["insulte"] },
    };
    expect(issuesFor(phase).filter((i) => i.code === "EVAL_CRITICAL_SEVERITY_MISMATCH")).toEqual([]);
  });
});

describe("checkEvaluationCoverage — W5 EVAL_NO_FAIL_PATH", () => {
  it("evaluation déclarée mais ni required, ni critical → erreur", () => {
    const phase = {
      phase_id: "p1",
      evaluation: {
        observed_criteria: [
          { id: "bonus1", description: "", severity: "bonus" },
          { id: "minor1", description: "", severity: "minor" },
        ],
      },
      completion_rules: { min_criteria_count: 1 },
    };
    const issues = issuesFor(phase);
    expect(issues.some((i) => i.code === "EVAL_NO_FAIL_PATH")).toBe(true);
  });

  it("required_criteria présent → pas d'erreur no-fail-path", () => {
    const phase = {
      phase_id: "p1",
      evaluation: {
        observed_criteria: [{ id: "a", description: "", severity: "bonus" }, { id: "b", description: "", severity: "required" }],
      },
      completion_rules: { required_criteria: ["b"] },
    };
    expect(issuesFor(phase).filter((i) => i.code === "EVAL_NO_FAIL_PATH")).toEqual([]);
  });

  it("severity=critical sur au moins 1 critère → pas d'erreur no-fail-path", () => {
    const phase = {
      phase_id: "p1",
      evaluation: {
        observed_criteria: [
          { id: "bonus1", description: "", severity: "bonus" },
          { id: "insulte", description: "", severity: "critical" },
        ],
      },
      completion_rules: { min_criteria_count: 1 },
    };
    expect(issuesFor(phase).filter((i) => i.code === "EVAL_NO_FAIL_PATH")).toEqual([]);
  });
});

describe("checkEvaluationCoverage — robustesse", () => {
  it("null phase → aucune erreur (pas de crash)", () => {
    expect(issuesFor(null)).toEqual([]);
  });

  it("observed_criteria pas un array → ignoré", () => {
    const phase = { phase_id: "p1", evaluation: { observed_criteria: "nope" } };
    expect(issuesFor(phase)).toEqual([]);
  });

  it("critère sans id string → ignoré (pas de crash)", () => {
    const phase = {
      phase_id: "p1",
      evaluation: {
        observed_criteria: [
          { description: "no id" },
          { id: 42, description: "num id" },
          { id: "good", description: "" },
        ],
      },
      completion_rules: { required_criteria: ["good"] },
    };
    expect(issuesFor(phase)).toEqual([]);
  });
});
