import { describe, it, expect } from "vitest";
import type { ThreadMessage } from "@/app/lib/engine/workspace";
import {
  analyzeQualification,
  coverageRate,
  coverageScore,
  mergeAiClassification,
  QUALIFICATION_RUBRIC,
} from "../qualification";

function msg(from: ThreadMessage["from"], content: string, at: number): ThreadMessage {
  return { from, content, at, ...(from === "actor" ? { actor_id: "a1" } : {}) };
}

describe("analyzeQualification — déterministe", () => {
  it("compte tours, temps de parole, questions et sans-réponse", () => {
    const conv: ThreadMessage[] = [
      msg("player", "Bonjour, qu'est-ce qui motive ce projet ?", 0),
      msg("actor", "On veut migrer notre stack, c'est bloqué depuis des mois.", 1000),
      msg("player", "Vous avez un budget ?", 2000),
      msg("actor", "Oui, environ 45k.", 3000),
      msg("player", "Et quels risques voyez-vous ?", 4000), // sans réponse (pas d'acteur ensuite)
      msg("player", "Vous pouvez préciser ?", 5000), // 2e message joueur d'affilée → interruption
    ];
    const obs = analyzeQualification(conv);
    expect(obs.stats.playerTurns).toBe(4);
    expect(obs.stats.actorTurns).toBe(2);
    expect(obs.stats.questionCount).toBe(4);
    expect(obs.stats.unansweredCount).toBe(2); // les 2 dernières questions n'ont pas de réponse acteur
    expect(obs.stats.interruptions).toBe(1);
    expect(obs.stats.durationMs).toBe(5000);
    expect(obs.stats.talkRatioPlayer).toBeGreaterThan(0);
    expect(obs.stats.talkRatioPlayer).toBeLessThan(1);
    // Déterministe : couverture non renseignée, pas d'IA.
    expect(obs.aiEnriched).toBe(false);
    expect(obs.coverage).toHaveLength(QUALIFICATION_RUBRIC.length);
    expect(obs.coverage.every((c) => c.covered === "non")).toBe(true);
  });

  it("ignore les messages système et gère un transcript vide", () => {
    const obs = analyzeQualification([msg("system", "L'entretien commence.", 0)]);
    expect(obs.stats.playerTurns).toBe(0);
    expect(obs.stats.actorTurns).toBe(0);
    expect(obs.stats.durationMs).toBe(0);
    expect(obs.stats.questionCount).toBe(0);
  });

  it("intègre les hypothèses fournies", () => {
    const obs = analyzeQualification([], { hypotheses: [{ text: "H1", status: "ouverte" }] });
    expect(obs.hypotheses).toEqual([{ text: "H1", status: "ouverte" }]);
  });
});

describe("mergeAiClassification", () => {
  it("fusionne types de questions, couverture et synthèse", () => {
    const base = analyzeQualification([
      { from: "player", content: "Quel est le besoin ?", at: 0 },
      { from: "actor", content: "Migrer.", at: 1000, actor_id: "a1" },
    ]);
    const merged = mergeAiClassification(base, {
      questionTypes: ["ouverte"],
      coverage: [{ dimension: "besoins", covered: "oui", evidence: "exploré" }],
      synthesis: { strengths: ["bonne ouverture"], improvements: [], recommendations: [] },
    });
    expect(merged.aiEnriched).toBe(true);
    expect(merged.questions[0].type).toBe("ouverte");
    expect(merged.coverage.find((c) => c.dimension === "besoins")?.covered).toBe("oui");
    expect(merged.synthesis.strengths).toContain("bonne ouverture");
    // Les dimensions non renvoyées par l'IA restent "non".
    expect(merged.coverage.find((c) => c.dimension === "budget")?.covered).toBe("non");
  });
});

describe("couverture — helpers radar", () => {
  it("mappe les niveaux et calcule le taux global", () => {
    expect(coverageScore("oui")).toBe(1);
    expect(coverageScore("partiel")).toBe(0.5);
    expect(coverageScore("non")).toBe(0);
    const rate = coverageRate([
      { dimension: "a", label: "A", covered: "oui" },
      { dimension: "b", label: "B", covered: "non" },
    ]);
    expect(rate).toBe(0.5);
  });
});
