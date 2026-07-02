import { describe, it, expect } from "vitest";
import {
  parseFindingsPrompts,
  validateFindings,
  buildSummary,
  buildOutput,
  restoreFindings,
  validateParams,
} from "../Runtime";

const prompts = [
  { id: "risque", label: "Risque principal" },
  { id: "reco", label: "Recommandation", placeholder: "Votre reco…" },
];

describe("analyse — parseFindingsPrompts", () => {
  it("parse les prompts valides et conserve placeholder", () => {
    const parsed = parseFindingsPrompts({
      findings_prompts: [
        { id: "a", label: "A" },
        { id: "b", label: "B", placeholder: "ph" },
      ],
    });
    expect(parsed).toEqual([
      { id: "a", label: "A" },
      { id: "b", label: "B", placeholder: "ph" },
    ]);
  });

  it("ignore les entrées invalides (non-objet, id/label manquants ou vides)", () => {
    const parsed = parseFindingsPrompts({
      findings_prompts: [
        "texte",
        null,
        42,
        ["tableau"],
        { id: "ok", label: "OK" },
        { id: "", label: "vide" },
        { id: "sans_label" },
        { label: "sans_id" },
      ],
    });
    expect(parsed).toEqual([{ id: "ok", label: "OK" }]);
  });

  it("retourne [] si findings_prompts absent ou non-tableau", () => {
    expect(parseFindingsPrompts({})).toEqual([]);
    expect(parseFindingsPrompts({ findings_prompts: "x" })).toEqual([]);
  });
});

describe("analyse — validateFindings", () => {
  it("retourne [] quand tous les champs sont remplis", () => {
    expect(
      validateFindings(prompts, { risque: "un risque", reco: "une reco" }),
    ).toEqual([]);
  });

  it("signale les champs manquants ou composés d'espaces", () => {
    const errors = validateFindings(prompts, { risque: "   ", reco: "ok" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Risque principal");
  });

  it("signale tous les champs vides", () => {
    expect(validateFindings(prompts, {})).toHaveLength(2);
  });
});

describe("analyse — buildSummary / buildOutput", () => {
  it("buildSummary associe label et contenu", () => {
    const s = buildSummary(prompts, { risque: " r1 ", reco: "r2" });
    expect(s).toContain("Risque principal :\nr1");
    expect(s).toContain("Recommandation :\nr2");
  });

  it("buildOutput trimme et ne garde que les clés déclarées", () => {
    const out = buildOutput(prompts, {
      risque: "  r1  ",
      reco: "r2",
      intrus: "jamais",
    });
    expect(out).toEqual({ findings: { risque: "r1", reco: "r2" } });
  });

  it("l'output est JSON-sérialisable", () => {
    const out = buildOutput(prompts, { risque: "a", reco: "b" });
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});

describe("analyse — restoreFindings (scratch)", () => {
  it("restaure un brouillon valide", () => {
    expect(restoreFindings({ findings: { a: "x" } })).toEqual({ a: "x" });
  });

  it("ignore scratch vide, mal formé, ou valeurs non-string", () => {
    expect(restoreFindings({})).toEqual({});
    expect(restoreFindings({ findings: "x" })).toEqual({});
    expect(restoreFindings({ findings: [1] })).toEqual({});
    expect(restoreFindings({ findings: { a: "x", b: 3 } })).toEqual({ a: "x" });
  });
});

describe("analyse — validateParams", () => {
  const valid = {
    instructions: "Analysez les documents.",
    findings_prompts: [{ id: "a", label: "A" }],
  };

  it("accepte des params valides (avec document_ids optionnel)", () => {
    expect(validateParams(valid)).toEqual([]);
    expect(validateParams({ ...valid, document_ids: ["d1"] })).toEqual([]);
  });

  it("refuse instructions manquantes ou vides", () => {
    expect(validateParams({ ...valid, instructions: "  " })).not.toEqual([]);
    const { instructions: _omit, ...rest } = valid;
    expect(validateParams(rest)).not.toEqual([]);
  });

  it("refuse findings_prompts vide, mal formé ou avec ids dupliqués", () => {
    expect(validateParams({ ...valid, findings_prompts: [] })).not.toEqual([]);
    expect(
      validateParams({ ...valid, findings_prompts: [{ id: "a" }] }),
    ).not.toEqual([]);
    expect(
      validateParams({
        ...valid,
        findings_prompts: [
          { id: "a", label: "A" },
          { id: "a", label: "A bis" },
        ],
      }),
    ).not.toEqual([]);
  });

  it("refuse document_ids non-tableau-de-strings", () => {
    expect(validateParams({ ...valid, document_ids: [1] })).not.toEqual([]);
    expect(validateParams({ ...valid, document_ids: "d1" })).not.toEqual([]);
  });
});
