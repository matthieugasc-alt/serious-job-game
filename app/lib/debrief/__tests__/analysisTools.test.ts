import { describe, it, expect } from "vitest";
import { ANALYSIS_TOOLS, analysisToolsFor, dataNeededFor } from "../analysisTools";
import { MECHANIC_SPECS } from "@/app/mechanics/specs";

const STATUSES = new Set(["V1", "V2", "non-implémenté"]);
const KNOWN_FACETS = new Set([
  "conversation",
  "documents",
  "decisions",
  "deliverable",
  "speech",
  "negotiation",
  "plan",
  "ideas",
  "notes",
  "tasks",
  "contract",
  "whiteboard",
]);

describe("analysisTools — couche de mapping mechanic_id → analysis_tools[]", () => {
  it("(a) chaque clé du registre est une mécanique connue", () => {
    for (const mechanic of Object.keys(ANALYSIS_TOOLS)) {
      expect(MECHANIC_SPECS[mechanic], `mécanique inconnue: ${mechanic}`).toBeDefined();
    }
  });

  it("(b) chaque outil est bien formé (champs, statut, cohérence mécanique)", () => {
    const seen = new Set<string>();
    for (const [mechanic, tools] of Object.entries(ANALYSIS_TOOLS)) {
      expect(tools.length, `${mechanic} sans outil`).toBeGreaterThan(0);
      for (const t of tools) {
        expect(t.id, "id manquant").toBeTruthy();
        expect(seen.has(t.id), `id dupliqué: ${t.id}`).toBe(false);
        seen.add(t.id);
        expect(t.title).toBeTruthy();
        expect(t.description).toBeTruthy();
        expect(t.mechanic, `${t.id}: mechanic ≠ clé`).toBe(mechanic);
        expect(t.debriefDisplay).toBeTruthy();
        expect(t.replayDisplay).toBeTruthy();
        expect(STATUSES.has(t.status), `${t.id}: statut invalide ${t.status}`).toBe(true);
        expect(Array.isArray(t.dataNeeded) && t.dataNeeded.length > 0, `${t.id}: dataNeeded vide`).toBe(true);
        for (const facet of t.dataNeeded) {
          expect(KNOWN_FACETS.has(facet), `${t.id}: facette inconnue ${facet}`).toBe(true);
        }
      }
    }
  });

  it("(c) les deux mécaniques réintégrées ont bien un catalogue", () => {
    expect(analysisToolsFor("planification").length).toBeGreaterThan(0);
    expect(analysisToolsFor("facilitation").length).toBeGreaterThan(0);
  });

  it("(d) helpers : dataNeededFor déduplique, mécanique inconnue → []", () => {
    expect(analysisToolsFor("inconnue")).toEqual([]);
    const facets = dataNeededFor("facilitation");
    expect(facets.length).toBe(new Set(facets).size);
  });
});
