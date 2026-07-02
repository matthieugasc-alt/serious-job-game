import { describe, it, expect } from "vitest";
import type { ActorDef, TranscriptEvent } from "@/app/lib/engine/mechanics";
import {
  DEFAULT_MIN_EXCHANGES,
  parseHypotheses,
  resolveMinExchanges,
  countPlayerMessages,
  buildDialogue,
  validateDiagnosis,
  buildDiagnosis,
  buildSummary,
  buildOutput,
  restoreDiagnosis,
  validateParams,
} from "../Runtime";
import type { HypothesisDef } from "../Runtime";

const actors: ActorDef[] = [
  { actor_id: "a1", name: "Alex", role: "témoin", prompt: "p" },
];

const hypotheses: HypothesisDef[] = [
  { id: "h1", label: "Cause A" },
  { id: "h2", label: "Cause B" },
];

function ev(partial: Partial<TranscriptEvent>): TranscriptEvent {
  return { at: 0, channel: "chat", role: "player", content: "", ...partial };
}

describe("diagnostic — resolveMinExchanges", () => {
  it("retourne le défaut (2) sans param", () => {
    expect(resolveMinExchanges({})).toBe(DEFAULT_MIN_EXCHANGES);
    expect(DEFAULT_MIN_EXCHANGES).toBe(2);
  });
  it("respecte un entier valide, retombe sur le défaut sinon", () => {
    expect(resolveMinExchanges({ min_exchanges: 4 })).toBe(4);
    expect(resolveMinExchanges({ min_exchanges: 0 })).toBe(2);
    expect(resolveMinExchanges({ min_exchanges: 1.5 })).toBe(2);
    expect(resolveMinExchanges({ min_exchanges: "3" })).toBe(2);
  });
});

describe("diagnostic — parseHypotheses", () => {
  it("parse les hypothèses valides", () => {
    expect(
      parseHypotheses({ hypotheses: [{ id: "h1", label: "Cause A" }] }),
    ).toEqual([{ id: "h1", label: "Cause A" }]);
  });
  it("ignore les entrées invalides", () => {
    expect(
      parseHypotheses({
        hypotheses: [
          { id: "ok", label: "OK" },
          { id: "", label: "X" },
          { id: "y" },
          "texte",
          null,
        ],
      }).map((h) => h.id),
    ).toEqual(["ok"]);
  });
  it("retourne [] si absent ou non-tableau", () => {
    expect(parseHypotheses({})).toEqual([]);
    expect(parseHypotheses({ hypotheses: "x" })).toEqual([]);
  });
});

describe("diagnostic — countPlayerMessages / buildDialogue", () => {
  it("ne compte que les messages chat du joueur", () => {
    const t = [
      ev({ role: "player", content: "q1" }),
      ev({ role: "actor", actor_id: "a1", content: "r1" }),
      ev({ role: "player", channel: "editor", content: "diagnostic" }),
    ];
    expect(countPlayerMessages(t)).toBe(1);
  });
  it("formate le dialogue et exclut system/editor", () => {
    const t = [
      ev({ role: "actor", actor_id: "a1", content: "Bonjour." }),
      ev({ role: "player", content: "Que s'est-il passé ?" }),
      ev({ role: "player", channel: "editor", content: "résumé" }),
    ];
    expect(buildDialogue(t, actors)).toBe(
      "Alex: Bonjour.\nVous: Que s'est-il passé ?",
    );
  });
});

describe("diagnostic — validateDiagnosis", () => {
  it("accepte cause (hypothèse déclarée) + evidence, eliminated optionnel", () => {
    expect(
      validateDiagnosis(hypotheses, buildDiagnosis("h1", "des faits", "")),
    ).toEqual([]);
  });
  it("refuse une cause vide ou hors hypothèses déclarées", () => {
    expect(validateDiagnosis(hypotheses, buildDiagnosis("", "x", ""))).toHaveLength(1);
    expect(
      validateDiagnosis(hypotheses, buildDiagnosis("autre", "x", "")),
    ).toHaveLength(1);
  });
  it("accepte une cause libre si aucune hypothèse déclarée", () => {
    expect(validateDiagnosis([], buildDiagnosis("cause libre", "faits", ""))).toEqual([]);
  });
  it("refuse une evidence vide", () => {
    expect(validateDiagnosis([], buildDiagnosis("cause", "  ", "x"))).toHaveLength(1);
  });
});

describe("diagnostic — buildSummary / buildOutput", () => {
  it("le résumé résout le label de l'hypothèse retenue", () => {
    const s = buildSummary(buildDiagnosis("h2", "faits", "h1 écartée"), hypotheses);
    expect(s).toContain("Cause retenue : Cause B");
    expect(s).toContain("Causes écartées : h1 écartée");
  });
  it("le résumé omet la section écartées si vide", () => {
    expect(buildSummary(buildDiagnosis("libre", "faits", ""), [])).not.toContain(
      "écartées",
    );
  });
  it("produit exactement les clés du manifest, JSON-sérialisables", () => {
    const t = [
      ev({ role: "player", content: "q1" }),
      ev({ role: "actor", actor_id: "a1", content: "r1" }),
    ];
    const out = buildOutput(t, actors, buildDiagnosis("h1", "faits", "h2 : non"));
    expect(Object.keys(out).sort()).toEqual(["diagnosis", "dialogue"]);
    expect(out.diagnosis).toEqual({
      cause: "h1",
      evidence: "faits",
      eliminated: "h2 : non",
    });
    expect(out.dialogue).toContain("Vous: q1");
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});

describe("diagnostic — restoreDiagnosis (scratch)", () => {
  it("restaure un brouillon persisté", () => {
    expect(
      restoreDiagnosis({ diagnosis: { cause: "h1", evidence: "e", eliminated: "x" } }),
    ).toEqual({ cause: "h1", evidence: "e", eliminated: "x" });
  });
  it("scratch vide ou mal formé → diagnostic vierge", () => {
    expect(restoreDiagnosis({})).toEqual({ cause: "", evidence: "", eliminated: "" });
    expect(restoreDiagnosis({ diagnosis: "x" })).toEqual({
      cause: "",
      evidence: "",
      eliminated: "",
    });
    expect(restoreDiagnosis({ diagnosis: { cause: 3 } })).toEqual({
      cause: "",
      evidence: "",
      eliminated: "",
    });
  });
});

describe("diagnostic — validateParams", () => {
  const valid = { situation: "Un problème.", actor_id: "a1" };

  it("accepte des params valides avec optionnels", () => {
    expect(validateParams(valid)).toEqual([]);
    expect(
      validateParams({
        ...valid,
        hypotheses: [{ id: "h1", label: "Cause A" }],
        document_ids: ["d1"],
        opening_message: "Bonjour",
        min_exchanges: 3,
      }),
    ).toEqual([]);
  });
  it("refuse situation / actor_id manquants ou vides", () => {
    expect(validateParams({}).length).toBe(2);
    expect(validateParams({ situation: " ", actor_id: "" }).length).toBe(2);
  });
  it("refuse hypotheses vide, mal formé ou avec ids dupliqués", () => {
    expect(validateParams({ ...valid, hypotheses: [] })).not.toEqual([]);
    expect(
      validateParams({ ...valid, hypotheses: [{ id: "h1" }] }),
    ).not.toEqual([]);
    expect(
      validateParams({
        ...valid,
        hypotheses: [
          { id: "h1", label: "A" },
          { id: "h1", label: "B" },
        ],
      }),
    ).not.toEqual([]);
  });
  it("refuse les optionnels mal typés", () => {
    expect(validateParams({ ...valid, document_ids: [1] })).not.toEqual([]);
    expect(validateParams({ ...valid, min_exchanges: 0 })).not.toEqual([]);
    expect(validateParams({ ...valid, opening_message: false })).not.toEqual([]);
  });
});
