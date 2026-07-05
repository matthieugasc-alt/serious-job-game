import { describe, it, expect } from "vitest";
import { analyzePlanning, completionRate, mergePlanningAi, type PlanningInput } from "../planning";

const input: PlanningInput = {
  steps: 12,
  milestones: 3,
  tasksByStatus: { todo: 4, doing: 2, done: 6 },
  dependencies: [
    { fromLabel: "Cadrage", toLabel: "Développement" },
    { fromLabel: "Développement", toLabel: "Recette" },
  ],
  risks: [{ label: "Retard fournisseur", probability: 4, impact: 5 }],
  toolUsage: [
    { label: "Timeline", count: 1 },
    { label: "Kanban", count: 1 },
  ],
};

describe("analyzePlanning — déterministe", () => {
  it("agrège volume, tâches, dépendances, risques, outils", () => {
    const o = analyzePlanning(input);
    expect(o.planning.steps).toBe(12);
    expect(o.planning.milestones).toBe(3);
    expect(o.planning.dependencies).toBe(2);
    expect(o.planning.risks).toBe(1);
    expect(o.planning.tasksByStatus.done).toBe(6);
    expect(o.toolUsage).toHaveLength(2);
    expect(o.dependencyList).toHaveLength(2);
    expect(o.aiEnriched).toBe(false);
    expect(completionRate(o.planning.tasksByStatus)).toBe(0.5);
  });

  it("completionRate = 0 si aucune tâche", () => {
    expect(completionRate({ todo: 0, doing: 0, done: 0 })).toBe(0);
  });

  it("fusionne les parties IA", () => {
    const merged = mergePlanningAi(analyzePlanning(input), {
      coherence: "séquencement logique",
      robustness: "fragile si retard fournisseur",
      synthesis: { strengths: ["jalons clairs"], improvements: [], recurringErrors: ["dépendances implicites"], recommendations: [] },
    });
    expect(merged.aiEnriched).toBe(true);
    expect(merged.coherence).toContain("séquencement");
    expect(merged.synthesis.recurringErrors).toContain("dépendances implicites");
    expect(merged.planning.steps).toBe(12); // déterministe intact
  });
});
