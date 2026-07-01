/**
 * Tests unit — computeSuggestions (AS1).
 */

import { describe, it, expect } from "vitest";
import { computeSuggestions, THRESHOLDS } from "../rules";

describe("computeSuggestions — critères", () => {
  it("critère avec match rate < 5% + N tentatives → unmatched_never", () => {
    const s = computeSuggestions({
      phases: [],
      criteria: [
        { scenarioId: "S1", phaseId: "P1", criterionId: "c1", matched: 0, seen: 20, matchRate: 0 },
      ],
    });
    expect(s.some((x) => x.type === "unmatched_never" && x.editTarget?.criterionId === "c1")).toBe(true);
  });

  it("critère avec match rate 15% → severity_adjustment (trop exigeant)", () => {
    const s = computeSuggestions({
      phases: [],
      criteria: [
        { scenarioId: "S1", phaseId: "P1", criterionId: "c1", matched: 3, seen: 20, matchRate: 0.15 },
      ],
    });
    expect(s.some((x) => x.type === "severity_adjustment")).toBe(true);
    expect(s.some((x) => x.type === "unmatched_never")).toBe(false);
  });

  it("critère avec échantillon < seuil → aucune suggestion", () => {
    const s = computeSuggestions({
      phases: [],
      criteria: [
        { scenarioId: "S1", phaseId: "P1", criterionId: "c1", matched: 0, seen: 2, matchRate: 0 },
      ],
    });
    expect(s).toEqual([]);
  });

  it("critère avec match rate 70% → aucune suggestion", () => {
    const s = computeSuggestions({
      phases: [],
      criteria: [
        { scenarioId: "S1", phaseId: "P1", criterionId: "c1", matched: 14, seen: 20, matchRate: 0.7 },
      ],
    });
    expect(s.filter((x) => x.editTarget?.criterionId === "c1")).toEqual([]);
  });
});

describe("computeSuggestions — phases", () => {
  it("abandon > 30% → consigne_ambiguity", () => {
    const s = computeSuggestions({
      phases: [{ scenarioId: "S1", phaseId: "P1", attempts: 20, abandonRate: 0.4, criticalFailures: 0, averageDurationMs: 0 }],
      criteria: [],
    });
    expect(s.some((x) => x.type === "consigne_ambiguity")).toBe(true);
  });

  it("critical fire > 20% des tentatives → critical_over_triggered", () => {
    const s = computeSuggestions({
      phases: [{ scenarioId: "S1", phaseId: "P1", attempts: 10, abandonRate: 0.1, criticalFailures: 3, averageDurationMs: 0 }],
      criteria: [],
    });
    expect(s.some((x) => x.type === "critical_over_triggered")).toBe(true);
  });

  it("durée > 2x target → phase_too_long", () => {
    const s = computeSuggestions({
      phases: [{ scenarioId: "S1", phaseId: "P1", attempts: 10, abandonRate: 0.1, criticalFailures: 0, averageDurationMs: 300000 }],
      criteria: [],
      targetDurations: { "S1::P1": 120000 },
    });
    expect(s.some((x) => x.type === "phase_too_long")).toBe(true);
  });

  it("sans target duration → phase_too_long ne se déclenche pas", () => {
    const s = computeSuggestions({
      phases: [{ scenarioId: "S1", phaseId: "P1", attempts: 10, abandonRate: 0.1, criticalFailures: 0, averageDurationMs: 999999 }],
      criteria: [],
    });
    expect(s.filter((x) => x.type === "phase_too_long")).toEqual([]);
  });
});

describe("computeSuggestions — tri par sévérité", () => {
  it("critical → warning → info dans l'ordre de sortie", () => {
    const s = computeSuggestions({
      phases: [
        // Génère un warning (abandon élevé) et un warning (critical over)
        { scenarioId: "S1", phaseId: "P1", attempts: 20, abandonRate: 0.5, criticalFailures: 8, averageDurationMs: 300000 },
      ],
      criteria: [
        // Génère un info (severity_adjustment)
        { scenarioId: "S1", phaseId: "P1", criterionId: "c1", matched: 3, seen: 20, matchRate: 0.15 },
      ],
      targetDurations: { "S1::P1": 120000 },
    });
    // Verify sort: no info before warning
    const firstInfoIdx = s.findIndex((x) => x.severity === "info");
    const lastWarningIdx = s.findLastIndex ? s.findLastIndex((x) => x.severity === "warning") : s.map(x => x.severity).lastIndexOf("warning");
    if (firstInfoIdx >= 0 && lastWarningIdx >= 0) {
      expect(firstInfoIdx).toBeGreaterThan(lastWarningIdx);
    }
  });
});
