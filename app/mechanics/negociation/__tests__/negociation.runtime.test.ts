import { describe, it, expect } from "vitest";
import {
  parseTerms,
  initialTermValues,
  validateTermValues,
  formatProposal,
  coerceTermValue,
  buildAgreement,
  buildOutput,
  restoreNegotiation,
  validateParams,
} from "../Runtime";
import type { TermDef } from "../Runtime";

const terms: TermDef[] = [
  { id: "prix", label: "Prix", type: "number", opening: "100" },
  { id: "delai", label: "Délai", type: "text" },
];

describe("negociation — parseTerms", () => {
  it("parse les termes valides, coerce l'opening numérique en string", () => {
    const parsed = parseTerms({
      terms: [
        { id: "prix", label: "Prix", type: "number", opening: 100 },
        { id: "delai", label: "Délai", type: "text", opening: "2 semaines" },
        { id: "sans_opening", label: "X", type: "text" },
      ],
    });
    expect(parsed).toEqual([
      { id: "prix", label: "Prix", type: "number", opening: "100" },
      { id: "delai", label: "Délai", type: "text", opening: "2 semaines" },
      { id: "sans_opening", label: "X", type: "text" },
    ]);
  });

  it("ignore les entrées invalides (type inconnu, id/label manquants)", () => {
    const parsed = parseTerms({
      terms: [
        { id: "ok", label: "OK", type: "text" },
        { id: "x", label: "X", type: "date" },
        { id: "", label: "Y", type: "text" },
        "texte",
        null,
      ],
    });
    expect(parsed.map((t) => t.id)).toEqual(["ok"]);
  });

  it("retourne [] si terms absent ou non-tableau", () => {
    expect(parseTerms({})).toEqual([]);
    expect(parseTerms({ terms: "x" })).toEqual([]);
  });
});

describe("negociation — initialTermValues / validateTermValues", () => {
  it("préremplit avec opening, vide sinon", () => {
    expect(initialTermValues(terms)).toEqual({ prix: "100", delai: "" });
  });

  it("valide des termes remplis et typés", () => {
    expect(validateTermValues(terms, { prix: "120", delai: "3 semaines" })).toEqual([]);
  });

  it("refuse un terme vide ou un number non parseable", () => {
    expect(validateTermValues(terms, { prix: "120", delai: " " })).toHaveLength(1);
    expect(validateTermValues(terms, { prix: "abc", delai: "ok" })).toHaveLength(1);
    expect(validateTermValues(terms, {})).toHaveLength(2);
  });
});

describe("negociation — formatProposal", () => {
  it('formate "Je propose : <label> : <valeur> ; …"', () => {
    expect(formatProposal(terms, { prix: " 120 ", delai: "3 semaines" })).toBe(
      "Je propose : Prix : 120 ; Délai : 3 semaines",
    );
  });
});

describe("negociation — coerceTermValue / buildAgreement", () => {
  it("number → nombre JSON, text → string trimmée", () => {
    expect(coerceTermValue(terms[0], " 120.5 ")).toBe(120.5);
    expect(coerceTermValue(terms[1], " 3 semaines ")).toBe("3 semaines");
  });

  it("number non parseable → saisie brute conservée (auditable)", () => {
    expect(coerceTermValue(terms[0], "cent")).toBe("cent");
    expect(coerceTermValue(terms[0], "")).toBe("");
  });

  it("buildAgreement construit {concluded, terms} coercés", () => {
    expect(buildAgreement(true, terms, { prix: "120", delai: "3 semaines" })).toEqual({
      concluded: true,
      terms: { prix: 120, delai: "3 semaines" },
    });
    expect(buildAgreement(false, terms, {}).concluded).toBe(false);
  });

  it("l'accord est JSON-sérialisable", () => {
    const a = buildAgreement(true, terms, { prix: "1", delai: "x" });
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });
});

describe("negociation — buildOutput", () => {
  it("expose agreement et proposals_count (clés du manifest)", () => {
    const agreement = buildAgreement(true, terms, { prix: "90", delai: "1 mois" });
    expect(buildOutput(agreement, 3)).toEqual({
      agreement: { concluded: true, terms: { prix: 90, delai: "1 mois" } },
      proposals_count: 3,
    });
  });
});

describe("negociation — restoreNegotiation (scratch)", () => {
  it("restaure valeurs et propositions persistées", () => {
    const r = restoreNegotiation(
      { terms: { prix: "80" }, proposals: [{ at: 1, terms: { prix: "80" } }] },
      terms,
    );
    expect(r.values).toEqual({ prix: "80", delai: "" });
    expect(r.proposals).toHaveLength(1);
  });

  it("ignore les clés inconnues, valeurs non-string, propositions mal formées", () => {
    const r = restoreNegotiation(
      { terms: { intrus: "x", prix: 5 }, proposals: ["texte", null, 3] },
      terms,
    );
    expect(r.values).toEqual({ prix: "100", delai: "" });
    expect(r.proposals).toEqual([]);
  });

  it("scratch vide → openings", () => {
    expect(restoreNegotiation({}, terms).values).toEqual({ prix: "100", delai: "" });
  });
});

describe("negociation — validateParams", () => {
  const valid = {
    actor_id: "a1",
    instructions: "Négociez l'accord.",
    terms: [{ id: "prix", label: "Prix", type: "number", opening: 100 }],
  };

  it("accepte des params valides avec optionnels", () => {
    expect(validateParams(valid)).toEqual([]);
    expect(
      validateParams({ ...valid, directive: "Sois ferme.", opening_message: "Bonjour." }),
    ).toEqual([]);
  });

  it("refuse actor_id/instructions manquants ou vides", () => {
    expect(validateParams({ ...valid, actor_id: " " })).not.toEqual([]);
    expect(validateParams({ ...valid, instructions: "" })).not.toEqual([]);
  });

  it("refuse terms vide, mal formé ou avec ids dupliqués", () => {
    expect(validateParams({ ...valid, terms: [] })).not.toEqual([]);
    expect(
      validateParams({ ...valid, terms: [{ id: "x", label: "X", type: "date" }] }),
    ).not.toEqual([]);
    expect(
      validateParams({
        ...valid,
        terms: [
          { id: "prix", label: "A", type: "text" },
          { id: "prix", label: "B", type: "text" },
        ],
      }),
    ).not.toEqual([]);
  });

  it("refuse directive/opening_message mal typés", () => {
    expect(validateParams({ ...valid, directive: 3 })).not.toEqual([]);
    expect(validateParams({ ...valid, opening_message: [] })).not.toEqual([]);
  });
});
