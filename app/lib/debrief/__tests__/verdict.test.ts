import { describe, it, expect } from "vitest";
import type { EndingRule } from "@/app/lib/engine/mechanics";
import { pickEndingForVerdict } from "../verdict";

const success: EndingRule = { id: "success", label: "Réussi", content: "…", requires_passed: ["s1"] };
const failure: EndingRule = { id: "failure", label: "Raté", content: "…", default: true };
const partial: EndingRule = { id: "partial", label: "Partiel", content: "…", verdict: "victoire_partielle" };

describe("pickEndingForVerdict — verdict IA → ending affiché", () => {
  it("Défaite → ending par défaut", () => {
    expect(pickEndingForVerdict([success, failure], "defaite", null)?.id).toBe("failure");
  });

  it("Victoire complète → ending non-défaut (issue positive)", () => {
    expect(pickEndingForVerdict([success, failure], "victoire_complete", null)?.id).toBe("success");
  });

  it("Victoire partielle sans ending dédié → issue positive", () => {
    expect(pickEndingForVerdict([success, failure], "victoire_partielle", null)?.id).toBe("success");
  });

  it("un ending tagué verdict a la priorité", () => {
    expect(pickEndingForVerdict([success, failure, partial], "victoire_partielle", null)?.id).toBe("partial");
  });

  it("retombe sur le fallback si aucun ending ne convient", () => {
    const fb: EndingRule = { id: "fb", label: "x", content: "x" };
    expect(pickEndingForVerdict([], "defaite", fb)?.id).toBe("fb");
  });
});
