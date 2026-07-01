/**
 * Tests unit — applyPhaseObservation (E3).
 * Le moteur qui décide, avec 100% d'explicabilité.
 */

import { describe, it, expect } from "vitest";
import { applyPhaseObservation, type PhaseObservation } from "../applyPhaseObservation";
import type { PhaseEvaluation, CompletionRules } from "@/app/lib/types";

// ─── Fixtures ───────────────────────────────────────────────────

function mkPhase(evaluation: PhaseEvaluation | null, rules: CompletionRules = {}) {
  return {
    phase_id: "phase_test",
    evaluation: evaluation ?? undefined,
    completion_rules: rules,
  };
}

function obs(criteria: Record<string, boolean>): PhaseObservation {
  return { criteria };
}

const EVAL_3 = {
  observed_criteria: [
    { id: "identified_client_need", description: "…" },
    { id: "handled_objection", description: "…" },
    { id: "verified_budget", description: "…" },
  ],
} as const;

// ─── Guards ─────────────────────────────────────────────────────

describe("applyPhaseObservation — guards", () => {
  it("no_evaluation_declared quand phase.evaluation absent", () => {
    const r = applyPhaseObservation(mkPhase(null), obs({}));
    expect(r.passed).toBe(false);
    expect(r.appliedRule).toBe("no_evaluation_declared");
    expect(r.reason).toContain("ne déclare pas");
  });

  it("no_criteria_observed quand observation vide", () => {
    const r = applyPhaseObservation(
      mkPhase(EVAL_3, { required_criteria: ["identified_client_need"] }),
      obs({}),
    );
    expect(r.passed).toBe(false);
    expect(r.appliedRule).toBe("no_criteria_observed");
    expect(r.missing).toEqual(["identified_client_need", "handled_objection", "verified_budget"]);
  });

  it("phase sans completion_rules E → refuse de deviner (passed=false)", () => {
    const r = applyPhaseObservation(mkPhase(EVAL_3, {}), obs({ identified_client_need: true }));
    expect(r.passed).toBe(false);
    expect(r.reason).toContain("Aucune règle E-chantier");
  });

  it("ne throw jamais sur observation malformée", () => {
    // @ts-expect-error volontairement corrompu
    expect(() => applyPhaseObservation(mkPhase(EVAL_3), { criteria: null })).not.toThrow();
  });

  it("le résultat est frozen (immutable)", () => {
    const r = applyPhaseObservation(mkPhase(EVAL_3, { required_criteria: ["identified_client_need"] }), obs({ identified_client_need: true, handled_objection: true, verified_budget: true }));
    expect(Object.isFrozen(r)).toBe(true);
  });
});

// ─── required_criteria ──────────────────────────────────────────

describe("applyPhaseObservation — required_criteria", () => {
  const rules: CompletionRules = { required_criteria: ["identified_client_need", "handled_objection"] };

  it("tous les required observés=true → passed=true", () => {
    const r = applyPhaseObservation(mkPhase(EVAL_3, rules), obs({
      identified_client_need: true,
      handled_objection: true,
      verified_budget: false,
    }));
    expect(r.passed).toBe(true);
    expect(r.appliedRule).toBe("required_criteria");
    expect(r.matched).toContain("identified_client_need");
    expect(r.matched).toContain("handled_objection");
    expect(r.missing).toEqual([]);
    expect(r.reason).toContain("Phase validée");
  });

  it("un required manquant → passed=false + missing rempli", () => {
    const r = applyPhaseObservation(mkPhase(EVAL_3, rules), obs({
      identified_client_need: true,
      handled_objection: false,
    }));
    expect(r.passed).toBe(false);
    expect(r.missing).toEqual(["handled_objection"]);
    expect(r.reason).toContain("handled_objection");
  });

  it("expected=false: le critère 'ne pas insulter' passe si observed=false", () => {
    const evalWithExpectFalse: PhaseEvaluation = {
      observed_criteria: [
        { id: "insulted_client", description: "…", expected: false },
      ],
    };
    const r = applyPhaseObservation(
      mkPhase(evalWithExpectFalse, { required_criteria: ["insulted_client"] }),
      obs({ insulted_client: false }),
    );
    expect(r.passed).toBe(true);
    expect(r.matched).toEqual(["insulted_client"]);
  });
});

// ─── min_criteria_count ─────────────────────────────────────────

describe("applyPhaseObservation — min_criteria_count", () => {
  it("2 critères observés sur 3, seuil 2 → passed", () => {
    const r = applyPhaseObservation(
      mkPhase(EVAL_3, { min_criteria_count: 2 }),
      obs({ identified_client_need: true, handled_objection: true, verified_budget: false }),
    );
    expect(r.passed).toBe(true);
    expect(r.appliedRule).toBe("min_criteria_count");
    expect(r.weightedScore).toBe(2);
    expect(r.weightedThreshold).toBe(2);
  });

  it("1 critère observé sur 3, seuil 2 → failed", () => {
    const r = applyPhaseObservation(
      mkPhase(EVAL_3, { min_criteria_count: 2 }),
      obs({ identified_client_need: true, handled_objection: false, verified_budget: false }),
    );
    expect(r.passed).toBe(false);
    expect(r.weightedScore).toBe(1);
  });

  it("weight custom: 1 critère à weight=3 → score=3", () => {
    const evalWeighted: PhaseEvaluation = {
      observed_criteria: [
        { id: "critical_win", description: "…", weight: 3 },
        { id: "minor_detail", description: "…", weight: 1 },
      ],
    };
    const r = applyPhaseObservation(
      mkPhase(evalWeighted, { min_criteria_count: 3 }),
      obs({ critical_win: true, minor_detail: false }),
    );
    expect(r.passed).toBe(true);
    expect(r.weightedScore).toBe(3);
  });
});

// ─── combinés required + min ────────────────────────────────────

describe("applyPhaseObservation — required + min combinés", () => {
  it("required observé + seuil atteint sur les autres → passed", () => {
    const r = applyPhaseObservation(
      mkPhase(EVAL_3, {
        required_criteria: ["identified_client_need"],
        min_criteria_count: 1,
      }),
      obs({
        identified_client_need: true,
        handled_objection: true,
        verified_budget: false,
      }),
    );
    expect(r.passed).toBe(true);
    expect(r.appliedRule).toBe("required_and_min");
    expect(r.weightedScore).toBe(1); // 1 non-required matché
  });

  it("required manquant même si seuil atteint → failed", () => {
    const r = applyPhaseObservation(
      mkPhase(EVAL_3, {
        required_criteria: ["identified_client_need"],
        min_criteria_count: 2,
      }),
      obs({
        identified_client_need: false,
        handled_objection: true,
        verified_budget: true,
      }),
    );
    expect(r.passed).toBe(false);
    expect(r.missing).toEqual(["identified_client_need"]);
  });
});

// ─── Drift detection ────────────────────────────────────────────

describe("applyPhaseObservation — drift detection", () => {
  it("critère observé hors schéma → surfacé dans unexpected + warning dans reason", () => {
    const r = applyPhaseObservation(
      mkPhase(EVAL_3, { required_criteria: ["identified_client_need"] }),
      obs({ identified_client_need: true, ghost_criterion: true }),
    );
    expect(r.passed).toBe(true);
    expect(r.unexpected).toEqual(["ghost_criterion"]);
    expect(r.reason).toContain("drift");
  });
});

// ─── Determinism ────────────────────────────────────────────────

describe("applyPhaseObservation — déterminisme", () => {
  it("même (phase, observation) → même verdict (hors timestamp)", () => {
    const phase = mkPhase(EVAL_3, { required_criteria: ["identified_client_need"] });
    const observation = obs({ identified_client_need: true, handled_objection: false });
    const a = applyPhaseObservation(phase, observation);
    const b = applyPhaseObservation(phase, observation);
    expect(a.passed).toBe(b.passed);
    expect(a.appliedRule).toBe(b.appliedRule);
    expect(a.matched).toEqual(b.matched);
    expect(a.missing).toEqual(b.missing);
    expect(a.reason).toBe(b.reason);
    // timestamps peuvent différer, tout le reste doit être identique.
  });
});
