/**
 * Tests unit — buildClinicalArticles (data-first).
 *
 * Vérifie que la fonction:
 *   1. Priorise scenario.resources.clinical_contract_templates quand présent
 *   2. Retombe sur les constantes hardcodées quand le scenario est absent
 *      ou n'a pas ce champ (backward-compat)
 *   3. Remplit les defaults manquants (modifiedContent=null, toxic=false, moderate=false)
 */

import { describe, it, expect } from "vitest";
import { buildClinicalArticles } from "../clinicalContractTemplates";

describe("buildClinicalArticles — data-first", () => {
  it("uses scenario JSON templates when present", () => {
    const scenario = {
      resources: {
        clinical_contract_templates: {
          chu: [
            { id: "art_x", title: "Article X — Test", content: "custom clause" },
          ],
        },
      },
    };
    const list = buildClinicalArticles("chu", scenario);
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("Article X — Test");
    expect(list[0].content).toBe("custom clause");
    // Defaults appliqués
    expect(list[0].modifiedContent).toBeNull();
    expect(list[0].toxic).toBe(false);
    expect(list[0].moderate).toBe(false);
  });

  it("preserves toxic/moderate flags from JSON", () => {
    const scenario = {
      resources: {
        clinical_contract_templates: {
          sm: [
            { id: "a", title: "T", content: "c", toxic: true, moderate: false },
            { id: "b", title: "T2", content: "c2", moderate: true },
          ],
        },
      },
    };
    const list = buildClinicalArticles("sm", scenario);
    expect(list[0].toxic).toBe(true);
    expect(list[1].moderate).toBe(true);
  });

  it("falls back to hardcoded constants when scenario is missing", () => {
    const chu = buildClinicalArticles("chu");
    // Les fallback CHU ont 11 articles.
    expect(chu.length).toBe(11);
    expect(chu[0].id).toBe("article_1");
    // Article 5 (IP) et 6 (Intéressement) sont flaggés toxic dans le fallback.
    const art5 = chu.find((a) => a.id === "article_5");
    const art6 = chu.find((a) => a.id === "article_6");
    expect(art5?.toxic).toBe(true);
    expect(art6?.toxic).toBe(true);
  });

  it("falls back to hardcoded when scenario has no clinical_contract_templates", () => {
    const scenario = { resources: {} };
    const list = buildClinicalArticles("clinique", scenario);
    expect(list.length).toBe(8);
  });

  it("returns fresh arrays each call (no mutation leak to templates)", () => {
    const l1 = buildClinicalArticles("chu");
    const l2 = buildClinicalArticles("chu");
    l1[0].content = "MUTATED";
    expect(l2[0].content).not.toBe("MUTATED");
  });
});
