import { describe, it, expect } from "vitest";
import type { ActorDef, TranscriptEvent } from "@/app/lib/engine/mechanics";
import {
  DEFAULT_MIN_EXCHANGES,
  MEDIATION_DIRECTIVE,
  resolveMinExchanges,
  buildDirective,
  recipientsFor,
  formatAddressedMessage,
  countPlayerMessages,
  buildDialogue,
  validateResolution,
  buildResolution,
  buildOutput,
  restoreResolution,
  validateParams,
} from "../Runtime";

const actors: ActorDef[] = [
  { actor_id: "pa", name: "Ana", role: "partie A", prompt: "p" },
  { actor_id: "pb", name: "Bob", role: "partie B", prompt: "p" },
];

function ev(partial: Partial<TranscriptEvent>): TranscriptEvent {
  return { at: 0, channel: "chat", role: "player", content: "", ...partial };
}

describe("mediation — resolveMinExchanges", () => {
  it("retourne le défaut (3) sans param", () => {
    expect(resolveMinExchanges({})).toBe(DEFAULT_MIN_EXCHANGES);
    expect(DEFAULT_MIN_EXCHANGES).toBe(3);
  });
  it("respecte un entier valide, retombe sur le défaut sinon", () => {
    expect(resolveMinExchanges({ min_exchanges: 5 })).toBe(5);
    expect(resolveMinExchanges({ min_exchanges: -1 })).toBe(3);
    expect(resolveMinExchanges({ min_exchanges: "2" })).toBe(3);
  });
});

describe("mediation — buildDirective / recipientsFor / formatAddressedMessage", () => {
  it("sans directive scénario : consigne médiation seule", () => {
    expect(buildDirective({})).toBe(MEDIATION_DIRECTIVE);
  });
  it("avec directive scénario : consigne universelle PUIS cadrage scénario", () => {
    const d = buildDirective({ directive: "Reste campé sur tes positions." });
    expect(d.startsWith(MEDIATION_DIRECTIVE)).toBe(true);
    expect(d).toContain("Reste campé sur tes positions.");
  });
  it("recipientsFor couvre a, b et les deux (ordre a → b)", () => {
    expect(recipientsFor("a")).toEqual(["a"]);
    expect(recipientsFor("b")).toEqual(["b"]);
    expect(recipientsFor("both")).toEqual(["a", "b"]);
  });
  it("le message joueur porte son adressage", () => {
    expect(formatAddressedMessage("Calmons-nous.", ["Ana", "Bob"])).toBe(
      "(À Ana et Bob) Calmons-nous.",
    );
    expect(formatAddressedMessage("Ton point de vue ?", ["Ana"])).toBe(
      "(À Ana) Ton point de vue ?",
    );
  });
});

describe("mediation — countPlayerMessages / buildDialogue (trois voix)", () => {
  it("compte les messages joueur et formate les trois voix", () => {
    const t = [
      ev({ role: "actor", actor_id: "pa", content: "C'est sa faute." }),
      ev({ role: "actor", actor_id: "pb", content: "Non, la sienne." }),
      ev({ role: "player", content: "(À Ana et Bob) On reprend calmement." }),
      ev({ role: "actor", actor_id: "pa", content: "D'accord." }),
      ev({ role: "player", channel: "editor", content: "conclusion" }),
    ];
    expect(countPlayerMessages(t)).toBe(1);
    expect(buildDialogue(t, actors)).toBe(
      "Ana: C'est sa faute.\nBob: Non, la sienne.\nVous: (À Ana et Bob) On reprend calmement.\nAna: D'accord.",
    );
  });
});

describe("mediation — validateResolution / buildResolution", () => {
  it("accepte des termes non vides, accord ou constat", () => {
    expect(validateResolution(buildResolution(true, "Accord sur X."))).toEqual([]);
    expect(validateResolution(buildResolution(false, "Constat de désaccord."))).toEqual([]);
  });
  it("refuse des termes vides", () => {
    expect(validateResolution(buildResolution(true, "  "))).toHaveLength(1);
  });
  it("buildResolution trimme les termes", () => {
    expect(buildResolution(false, "  constat  ")).toEqual({
      reached: false,
      terms: "constat",
    });
  });
});

describe("mediation — buildOutput", () => {
  it("produit exactement les clés du manifest, JSON-sérialisables", () => {
    const t = [
      ev({ role: "player", content: "(À Ana) m1" }),
      ev({ role: "actor", actor_id: "pa", content: "r1" }),
    ];
    const out = buildOutput(t, actors, buildResolution(true, "Accord sur X."));
    expect(Object.keys(out).sort()).toEqual(["dialogue", "resolution"]);
    expect(out.resolution).toEqual({ reached: true, terms: "Accord sur X." });
    expect(out.dialogue).toContain("Vous: (À Ana) m1");
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});

describe("mediation — restoreResolution (scratch)", () => {
  it("restaure un brouillon persisté", () => {
    expect(
      restoreResolution({ resolution: { reached: false, terms: "constat" } }),
    ).toEqual({ reached: false, terms: "constat" });
  });
  it("scratch vide ou mal formé → défauts (reached: true, terms vide)", () => {
    expect(restoreResolution({})).toEqual({ reached: true, terms: "" });
    expect(restoreResolution({ resolution: "x" })).toEqual({ reached: true, terms: "" });
    expect(restoreResolution({ resolution: { reached: "oui", terms: 3 } })).toEqual({
      reached: true,
      terms: "",
    });
  });
});

describe("mediation — validateParams", () => {
  const valid = {
    party_a_actor: "pa",
    party_b_actor: "pb",
    conflict_brief: "Ils se bloquent mutuellement.",
  };

  it("accepte des params valides avec optionnels", () => {
    expect(validateParams(valid)).toEqual([]);
    expect(
      validateParams({
        ...valid,
        directive: "Tension palpable.",
        opening_message_a: "C'est inacceptable.",
        opening_message_b: "Je confirme que non.",
        min_exchanges: 4,
      }),
    ).toEqual([]);
  });
  it("refuse parties / conflict_brief manquants ou vides", () => {
    expect(validateParams({}).length).toBe(3);
    expect(
      validateParams({ party_a_actor: " ", party_b_actor: "", conflict_brief: "" })
        .length,
    ).toBe(3);
  });
  it("refuse deux parties identiques", () => {
    expect(
      validateParams({ ...valid, party_b_actor: "pa" }),
    ).toContain("params.party_a_actor et params.party_b_actor doivent être distincts");
  });
  it("refuse les optionnels mal typés", () => {
    const errs = validateParams({
      ...valid,
      min_exchanges: 0,
      directive: 3,
      opening_message_a: [],
      opening_message_b: false,
    });
    expect(errs.length).toBe(4);
  });
});
