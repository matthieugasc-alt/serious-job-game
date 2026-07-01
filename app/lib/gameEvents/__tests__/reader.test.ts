/**
 * Tests unit — computeAnalytics(events).
 *
 * ⚠ GARDE-FOU: le code d'agrégation est complexe (Map imbriquées,
 * rate calcs, filtres par type d'event). Sans tests, bugs silencieux.
 * Ce fichier construit des fixtures synthétiques et vérifie les 4 slices.
 */

import { describe, it, expect } from "vitest";
import { computeAnalytics } from "../reader";
import type { GameEvent } from "../types";

// ─── Fixture factory ────────────────────────────────────────────

function ev(
  type: string,
  scenarioId: string,
  phaseId: string,
  payload: Record<string, unknown> = {},
  userId = "u1",
  sessionId = "s1",
): GameEvent {
  return {
    eventId: `${type}-${Math.random()}`,
    sessionId,
    type: type as GameEvent["type"],
    timestamp: new Date().toISOString(),
    scenarioId,
    userId,
    phaseId,
    payload,
  };
}

// ─── Phases ──────────────────────────────────────────────────────

describe("computeAnalytics — phases", () => {
  it("compte attempts, abandonments, completions par phase", () => {
    const events: GameEvent[] = [
      ev("phase_started", "S1", "P1"),
      ev("phase_started", "S1", "P1", {}, "u2", "s2"),
      ev("phase_started", "S1", "P1", {}, "u3", "s3"),
      ev("phase_completed", "S1", "P1", { durationMs: 60000 }),
      ev("phase_abandoned", "S1", "P1", { reason: "quit" }, "u2", "s2"),
    ];
    const a = computeAnalytics(events);
    const p1 = a.phases.find((p) => p.phaseId === "P1")!;
    expect(p1.attempts).toBe(3);
    expect(p1.completions).toBe(1);
    expect(p1.abandonments).toBe(1);
    expect(p1.abandonRate).toBeCloseTo(1 / 3);
  });

  it("durée moyenne = totalDurationMs / completions", () => {
    const events: GameEvent[] = [
      ev("phase_completed", "S1", "P1", { durationMs: 30000 }),
      ev("phase_completed", "S1", "P1", { durationMs: 60000 }, "u2", "s2"),
      ev("phase_completed", "S1", "P1", { durationMs: 90000 }, "u3", "s3"),
    ];
    const a = computeAnalytics(events);
    const p1 = a.phases.find((p) => p.phaseId === "P1")!;
    expect(p1.averageDurationMs).toBe(60000);
  });

  it("critical failures comptés à partir de phase_evaluated", () => {
    const events: GameEvent[] = [
      ev("phase_evaluated", "S1", "P1", { criticalFailures: ["insulte"] }),
      ev("phase_evaluated", "S1", "P1", { criticalFailures: [] }, "u2", "s2"),
      ev("phase_evaluated", "S1", "P1", { criticalFailures: ["autre"] }, "u3", "s3"),
    ];
    const a = computeAnalytics(events);
    const p1 = a.phases.find((p) => p.phaseId === "P1")!;
    expect(p1.criticalFailures).toBe(2);
  });

  it("phases séparées par (scenarioId, phaseId)", () => {
    const events: GameEvent[] = [
      ev("phase_started", "S1", "P1"),
      ev("phase_started", "S1", "P2"),
      ev("phase_started", "S2", "P1"),
    ];
    const a = computeAnalytics(events);
    expect(a.phases.length).toBe(3);
  });
});

// ─── Criteria ────────────────────────────────────────────────────

describe("computeAnalytics — criteria", () => {
  it("match rate par critère à partir de phase_evaluated", () => {
    const events: GameEvent[] = [
      ev("phase_evaluated", "S1", "P1", {
        matched: ["a"],
        criteriaObserved: { a: true, b: false },
      }),
      ev("phase_evaluated", "S1", "P1", {
        matched: ["a", "b"],
        criteriaObserved: { a: true, b: true },
      }, "u2", "s2"),
      ev("phase_evaluated", "S1", "P1", {
        matched: [],
        criteriaObserved: { a: false, b: false },
      }, "u3", "s3"),
    ];
    const a = computeAnalytics(events);
    const critA = a.criteria.find((c) => c.criterionId === "a")!;
    const critB = a.criteria.find((c) => c.criterionId === "b")!;
    expect(critA.matched).toBe(2);
    expect(critA.seen).toBe(3);
    expect(critA.matchRate).toBeCloseTo(2 / 3);
    expect(critB.matched).toBe(1);
    expect(critB.seen).toBe(3);
  });

  it("ignore events sans criteriaObserved", () => {
    const events: GameEvent[] = [
      ev("phase_evaluated", "S1", "P1", {}), // pas de criteriaObserved
      ev("phase_started", "S1", "P1"),
    ];
    const a = computeAnalytics(events);
    expect(a.criteria).toEqual([]);
  });
});

// ─── Scenarios ───────────────────────────────────────────────────

describe("computeAnalytics — scenarios", () => {
  it("compte sessions, completions, abandonments, completionRate", () => {
    const events: GameEvent[] = [
      ev("session_started", "S1", ""),
      ev("session_started", "S1", "", {}, "u2", "s2"),
      ev("session_started", "S1", "", {}, "u3", "s3"),
      ev("scenario_completed", "S1", ""),
      ev("scenario_abandoned", "S1", "", {}, "u2", "s2"),
    ];
    const a = computeAnalytics(events);
    const s1 = a.scenarios.find((s) => s.scenarioId === "S1")!;
    expect(s1.sessions).toBe(3);
    expect(s1.completions).toBe(1);
    expect(s1.abandonments).toBe(1);
    expect(s1.completionRate).toBeCloseTo(1 / 3);
  });
});

// ─── Help ────────────────────────────────────────────────────────

describe("computeAnalytics — help", () => {
  it("groupe par (scenarioId, phaseId, source)", () => {
    const events: GameEvent[] = [
      ev("help_requested", "S1", "P1", { source: "briefing" }),
      ev("help_requested", "S1", "P1", { source: "briefing" }, "u2", "s2"),
      ev("help_requested", "S1", "P1", { source: "hint" }),
      ev("help_requested", "S1", "P2", { source: "briefing" }),
    ];
    const a = computeAnalytics(events);
    const p1briefing = a.help.find((h) => h.phaseId === "P1" && h.source === "briefing")!;
    expect(p1briefing.count).toBe(2);
    const p1hint = a.help.find((h) => h.phaseId === "P1" && h.source === "hint")!;
    expect(p1hint.count).toBe(1);
    expect(a.help.length).toBe(3);
  });

  it("ignore events non-help", () => {
    const events: GameEvent[] = [
      ev("phase_started", "S1", "P1"),
    ];
    const a = computeAnalytics(events);
    expect(a.help).toEqual([]);
  });
});

// ─── Totaux ──────────────────────────────────────────────────────

describe("computeAnalytics — totaux", () => {
  it("totalEvents correspond au nombre d'events en entrée", () => {
    const events: GameEvent[] = [
      ev("phase_started", "S1", "P1"),
      ev("phase_completed", "S1", "P1"),
    ];
    const a = computeAnalytics(events);
    expect(a.totalEvents).toBe(2);
  });

  it("input vide → tous les slices vides + totalEvents=0", () => {
    const a = computeAnalytics([]);
    expect(a.phases).toEqual([]);
    expect(a.criteria).toEqual([]);
    expect(a.scenarios).toEqual([]);
    expect(a.help).toEqual([]);
    expect(a.totalEvents).toBe(0);
  });
});
