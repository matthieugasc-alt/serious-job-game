import { describe, it, expect } from "vitest";
import {
  analyzeDocSynthesis,
  deepReadRate,
  mergeDocSynthAi,
  readDepthOf,
  type DocSynthInput,
} from "../docSynthesis";

const emptyCounts = {
  notes: 0,
  annotations: 0,
  tags: 0,
  collections: 0,
  decisions: 0,
  comparateur: 0,
  blocNotesOps: 0,
  bibliothequeOps: 0,
  decisionOps: 0,
};

describe("readDepthOf", () => {
  it("classe la profondeur de lecture", () => {
    expect(readDepthOf({ id: "a", title: "A", opened: false, annotationCount: 0 })).toBe("ignoré");
    expect(readDepthOf({ id: "b", title: "B", opened: true, annotationCount: 0 })).toBe("parcouru");
    expect(readDepthOf({ id: "c", title: "C", opened: true, annotationCount: 3 })).toBe("profond");
  });
});

describe("analyzeDocSynthesis — déterministe", () => {
  const input: DocSynthInput = {
    documents: [
      { id: "d1", title: "Rapport A", opened: true, annotationCount: 4 },
      { id: "d2", title: "Note B", opened: true, annotationCount: 0 },
      { id: "d3", title: "Annexe C", opened: false, annotationCount: 0 },
    ],
    events: [
      { at: 300, category: "note", label: "Note de synthèse" },
      { at: 100, category: "lecture", label: "Rapport A" },
      { at: 200, category: "annotation", label: "Surlignage" },
    ],
    counts: { ...emptyCounts, notes: 2, annotations: 4, tags: 3, collections: 1, decisions: 1 },
  };

  it("carte des sources + entonnoir + chronologie triée", () => {
    const o = analyzeDocSynthesis(input);
    expect(o.sources.map((s) => s.readDepth)).toEqual(["profond", "parcouru", "ignoré"]);
    expect(o.transformation).toEqual({ documentsOpened: 2, annotations: 4, notes: 2, decisions: 1 });
    // Chronologie triée par temps.
    expect(o.chronology.map((e) => e.at)).toEqual([100, 200, 300]);
    expect(o.aiEnriched).toBe(false);
    expect(deepReadRate(o.sources)).toBeCloseTo(1 / 3);
  });

  it("fusionne le résultat IA (preuves, raisonnement, synthèse)", () => {
    const base = analyzeDocSynthesis(input);
    const merged = mergeDocSynthAi(base, {
      evidence: [{ conclusion: "Migration risquée", sources: ["Rapport A"], confidence: "forte" }],
      reasoning: "Le joueur part du rapport A puis recoupe.",
      synthesis: { strengths: ["bon recoupement"], improvements: [], recommendations: [], underusedTools: ["comparateur"] },
    });
    expect(merged.aiEnriched).toBe(true);
    expect(merged.evidence[0].confidence).toBe("forte");
    expect(merged.reasoning).toContain("rapport A");
    expect(merged.synthesis.underusedTools).toContain("comparateur");
    // Le déterministe est préservé.
    expect(merged.transformation.documentsOpened).toBe(2);
  });
});
