import { describe, it, expect } from "vitest";
import { analyzeNegotiation, mergeNegotiationAi, type NegotiationInput } from "../negotiation";

const input: NegotiationInput = {
  terms: [
    { id: "prix", label: "Prix", opening: 45000, final: 38000, suffix: "€" },
    { id: "delai", label: "Délai", opening: 6, final: 6, suffix: "semaines" },
    { id: "clause", label: "Exclusivité", opening: "non", final: "oui" },
  ],
  proposals: [
    { at: 1, values: { prix: 42000 } },
    { at: 2, values: { prix: 38000, clause: "oui" } },
  ],
  status: "signed",
  objections: { received: 3, answered: 2 },
};

describe("analyzeNegotiation — déterministe", () => {
  it("calcule concessions par terme, issue et chronologie", () => {
    const o = analyzeNegotiation(input);
    const prix = o.terms.find((t) => t.label === "Prix")!;
    expect(prix.delta).toBe(-7000);
    expect(prix.direction).toBe("baisse");
    const delai = o.terms.find((t) => t.label === "Délai")!;
    expect(delai.direction).toBe("inchangé");
    const clause = o.terms.find((t) => t.label === "Exclusivité")!;
    expect(clause.direction).toBe("—"); // non numérique, changé
    expect(o.outcome.status).toBe("signed");
    expect(o.outcome.proposalsCount).toBe(2);
    // prix + clause ont bougé, pas délai.
    expect(o.outcome.concessionCount).toBe(2);
    expect(o.chronology).toHaveLength(2);
    expect(o.chronology[0].label).toContain("Prix");
    expect(o.aiEnriched).toBe(false);
  });

  it("fusionne les parties IA", () => {
    const merged = mergeNegotiationAi(analyzeNegotiation(input), {
      qualitative: { balance: "accord équilibré", powerBalance: "bonne gestion", interests: "", objections: "", valueCreation: "", coherence: "", robustness: "" },
      synthesis: { strengths: ["ancrage"], improvements: [], techniquesUnderused: ["MESORE"], recurringErrors: [], recommendations: [] },
    });
    expect(merged.aiEnriched).toBe(true);
    expect(merged.qualitative.balance).toContain("équilibré");
    expect(merged.synthesis.techniquesUnderused).toContain("MESORE");
    expect(merged.terms).toHaveLength(3); // déterministe intact
  });
});
