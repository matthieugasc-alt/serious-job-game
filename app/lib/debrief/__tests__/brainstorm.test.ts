import { describe, it, expect } from "vitest";
import { analyzeBrainstorm, mergeBrainstormAi, type BrainstormInput } from "../brainstorm";

const input: BrainstormInput = {
  ideas: [
    { text: "Onboarding guidé", author: "player", color: "yellow", at: 1000 },
    { text: "Programme de parrainage", author: "player", color: "pink", at: 2000 },
    { text: "Intégration Slack", author: "lea", color: "yellow", at: 3000 },
    { text: "Freemium", author: "player", color: "blue", at: 5000 },
  ],
  convergence: { tasks: 2, decisions: 1, options: 3 },
  toolUsage: [
    { label: "Whiteboard", used: true },
    { label: "Mind map", used: false },
  ],
};

describe("analyzeBrainstorm — déterministe", () => {
  it("volume, familles de couleurs, temps de génération, convergence", () => {
    const o = analyzeBrainstorm(input);
    expect(o.volume.total).toBe(4);
    expect(o.volume.byPlayer).toBe(3);
    expect(o.volume.byOthers).toBe(1);
    expect(o.families.find((f) => f.color === "yellow")?.count).toBe(2);
    expect(o.generationSpanMs).toBe(4000);
    expect(o.convergence.converted).toBe(true);
    expect(o.convergence.options).toBe(3);
    expect(o.aiEnriched).toBe(false);
  });

  it("converted=false si aucune idée transformée", () => {
    const o = analyzeBrainstorm({ ...input, convergence: { tasks: 0, decisions: 0, options: 0 } });
    expect(o.convergence.converted).toBe(false);
  });

  it("fusionne l'IA", () => {
    const merged = mergeBrainstormAi(analyzeBrainstorm(input), {
      qualitative: { diversity: "3 familles", exploration: "bonne divergence", originality: "", relevance: "", grouping: "", convergenceQuality: "" },
      synthesis: { strengths: ["a ouvert le champ"], improvements: [], methodsToTry: ["SCAMPER"], underusedTools: ["affinity mapping"] },
    });
    expect(merged.aiEnriched).toBe(true);
    expect(merged.qualitative.diversity).toContain("familles");
    expect(merged.synthesis.methodsToTry).toContain("SCAMPER");
    expect(merged.volume.total).toBe(4);
  });
});
