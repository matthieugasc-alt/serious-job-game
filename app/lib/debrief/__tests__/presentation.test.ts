import { describe, it, expect } from "vitest";
import { analyzePresentation, mergePresentationAi, paceLabel, type PresentationInput } from "../presentation";

const input: PresentationInput = {
  speech:
    "Bonjour à tous. Contexte : nous avons perdu 12 comptes ce trimestre. " +
    "Démonstration : les chiffres montrent trois causes. " +
    "Je propose donc de prioriser le socle. En conclusion, merci de votre attention.",
  durationS: 90,
  qa: { received: 4, answered: 3 },
  supporting: { documents: 2, notes: 3, decisions: 1 },
};

describe("analyzePresentation — déterministe", () => {
  it("métriques + débit + structure + Q/R", () => {
    const o = analyzePresentation(input);
    expect(o.speech.wordCount).toBeGreaterThan(15);
    expect(o.speech.durationS).toBe(90);
    expect(o.speech.wordsPerMinute).toBeGreaterThan(0);
    const present = (l: string) => o.structure.find((s) => s.label === l)?.present;
    expect(present("Introduction")).toBe(true);
    expect(present("Contexte")).toBe(true);
    expect(present("Démonstration")).toBe(true);
    expect(present("Recommandations")).toBe(true);
    expect(present("Conclusion")).toBe(true);
    expect(o.qa).toEqual({ received: 4, answered: 3 });
    expect(o.aiEnriched).toBe(false);
  });

  it("débit inconnu si durée nulle", () => {
    const o = analyzePresentation({ ...input, durationS: 0 });
    expect(o.speech.wordsPerMinute).toBe(0);
    expect(paceLabel(o.speech.wordsPerMinute)).toBe("—");
  });

  it("fusionne l'IA (impact + qualitatif + synthèse)", () => {
    const merged = mergePresentationAi(analyzePresentation(input), {
      clarity: "claire",
      impact: [{ reaction: "adhésion", note: "après la démonstration" }],
      synthesis: { strengths: ["accroche"], improvements: [], recommendations: [], skillsToWork: ["gestion des objections"] },
    });
    expect(merged.aiEnriched).toBe(true);
    expect(merged.clarity).toBe("claire");
    expect(merged.impact[0].reaction).toBe("adhésion");
    expect(merged.synthesis.skillsToWork).toContain("gestion des objections");
    expect(merged.speech.wordCount).toBeGreaterThan(15); // déterministe intact
  });
});

describe("paceLabel", () => {
  it("classe le débit", () => {
    expect(paceLabel(80)).toBe("lent");
    expect(paceLabel(130)).toBe("posé");
    expect(paceLabel(170)).toBe("soutenu");
    expect(paceLabel(210)).toBe("rapide");
  });
});
