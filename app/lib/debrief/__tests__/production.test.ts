import { describe, it, expect } from "vitest";
import { analyzeProduction, mergeProductionAi, structureRate, type ProductionInput } from "../production";

const base: ProductionInput = {
  deliverable: {
    type: "mail",
    title: "Note de recommandation",
    body:
      "Contexte : la migration est bloquée. Analyse : trois causes identifiées. " +
      "Recommandations : prioriser le socle. Plan d'action : lancer la phase 1 la semaine prochaine.",
  },
  instructions: "Rédige une note de reco avec un plan d'action",
  documentsOpened: 3,
  documentsTotal: 5,
  supporting: { notes: 4, decisions: 1 },
};

describe("analyzeProduction — déterministe", () => {
  it("détecte les sections présentes/absentes et calcule les métriques", () => {
    const o = analyzeProduction(base);
    const present = (label: string) => o.structure.find((s) => s.label === label)?.present;
    expect(present("Contexte")).toBe(true);
    expect(present("Analyse")).toBe(true);
    expect(present("Recommandations")).toBe(true);
    expect(present("Plan d'action")).toBe(true);
    expect(present("Introduction")).toBe(false);
    expect(present("Conclusion")).toBe(false);
    expect(o.deliverable.wordCount).toBeGreaterThan(10);
    expect(o.deliverable.sentenceCount).toBeGreaterThanOrEqual(4);
    expect(o.sources).toEqual({ opened: 3, total: 5 });
    expect(o.aiEnriched).toBe(false);
    expect(structureRate(o.structure)).toBeCloseTo(4 / 6);
  });

  it("gère un livrable vide", () => {
    const o = analyzeProduction({ ...base, deliverable: { type: "note", title: "", body: "" } });
    expect(o.deliverable.wordCount).toBe(0);
    expect(o.deliverable.sentenceCount).toBe(0);
    expect(o.structure.every((s) => !s.present)).toBe(true);
  });

  it("fusionne les parties IA", () => {
    const merged = mergeProductionAi(analyzeProduction(base), {
      completeness: { present: ["reco"], missing: ["risques"], superfluous: [] },
      traceability: [{ claim: "3 causes", basis: ["Rapport A"] }],
      qualitative: { clarity: "clair", argumentation: "solide", coherence: "bonne", adequacy: "répond à la demande" },
      synthesis: { strengths: ["structuré"], improvements: [], recommendations: [], skillsToWork: ["synthèse"] },
    });
    expect(merged.aiEnriched).toBe(true);
    expect(merged.completeness.missing).toContain("risques");
    expect(merged.traceability[0].basis).toContain("Rapport A");
    expect(merged.qualitative.adequacy).toContain("demande");
    expect(merged.synthesis.skillsToWork).toContain("synthèse");
    // Déterministe intact.
    expect(merged.deliverable.wordCount).toBeGreaterThan(10);
  });
});
