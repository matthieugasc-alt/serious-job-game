import { describe, it, expect } from "vitest";
import type { ActorDef, TranscriptEvent } from "@/app/lib/engine/mechanics";
import {
  DEFAULT_MIN_EXCHANGES,
  buildDialogue,
  buildOutput,
  countPlayerMessages,
  resolveMinExchanges,
  validateParams,
} from "../Runtime";

const actors: ActorDef[] = [
  { actor_id: "a1", name: "Alex", role: "interlocuteur", prompt: "p" },
];

function ev(partial: Partial<TranscriptEvent>): TranscriptEvent {
  return {
    at: 0,
    channel: "chat",
    role: "player",
    content: "",
    ...partial,
  };
}

describe("entretien/Runtime — resolveMinExchanges", () => {
  it("retourne le défaut (3) sans param", () => {
    expect(resolveMinExchanges({})).toBe(DEFAULT_MIN_EXCHANGES);
    expect(DEFAULT_MIN_EXCHANGES).toBe(3);
  });
  it("respecte un entier valide", () => {
    expect(resolveMinExchanges({ min_exchanges: 5 })).toBe(5);
  });
  it("retombe sur le défaut pour des valeurs invalides", () => {
    expect(resolveMinExchanges({ min_exchanges: 0 })).toBe(3);
    expect(resolveMinExchanges({ min_exchanges: 2.5 })).toBe(3);
    expect(resolveMinExchanges({ min_exchanges: "4" })).toBe(3);
  });
});

describe("entretien/Runtime — countPlayerMessages", () => {
  it("ne compte que les messages chat du joueur", () => {
    const t = [
      ev({ role: "player", content: "a" }),
      ev({ role: "actor", actor_id: "a1", content: "b" }),
      ev({ role: "player", content: "c" }),
      ev({ role: "system", channel: "system", content: "note" }),
      ev({ role: "player", channel: "voice", content: "hors chat" }),
    ];
    expect(countPlayerMessages(t)).toBe(2);
  });
});

describe("entretien/Runtime — buildDialogue", () => {
  it("formate 'Vous:' et le nom de l'acteur, ligne par ligne", () => {
    const t = [
      ev({ role: "actor", actor_id: "a1", content: "Bonjour." }),
      ev({ role: "player", content: "Bonjour, parlons." }),
    ];
    expect(buildDialogue(t, actors)).toBe(
      "Alex: Bonjour.\nVous: Bonjour, parlons.",
    );
  });
  it("exclut les événements system et hors chat", () => {
    const t = [
      ev({ role: "system", channel: "system", content: "bruit" }),
      ev({ role: "player", content: "seul message" }),
    ];
    expect(buildDialogue(t, actors)).toBe("Vous: seul message");
  });
  it("retombe sur 'Acteur' si l'acteur est inconnu", () => {
    const t = [ev({ role: "actor", actor_id: "ghost", content: "hello" })];
    expect(buildDialogue(t, actors)).toBe("Acteur: hello");
  });
});

describe("entretien/Runtime — buildOutput", () => {
  it("produit exactement les clés du manifest, JSON-sérialisables", () => {
    const t = [
      ev({ role: "player", content: "q1" }),
      ev({ role: "actor", actor_id: "a1", content: "r1" }),
      ev({ role: "player", content: "q2" }),
    ];
    const out = buildOutput(t, actors);
    expect(Object.keys(out).sort()).toEqual(["dialogue", "exchange_count"]);
    expect(out.exchange_count).toBe(2);
    expect(out.dialogue).toContain("Vous: q1");
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});

describe("entretien/Runtime — validateParams", () => {
  it("accepte des params valides", () => {
    expect(
      validateParams({
        actor_id: "a1",
        objective: "obtenir une info",
        min_exchanges: 2,
        directive: "reste factuel",
        opening_message: "Bonjour",
      }),
    ).toEqual([]);
  });
  it("refuse actor_id / objective manquants ou vides", () => {
    expect(validateParams({}).length).toBe(2);
    expect(validateParams({ actor_id: " ", objective: "" }).length).toBe(2);
  });
  it("refuse les optionnels mal typés", () => {
    const errs = validateParams({
      actor_id: "a1",
      objective: "o",
      min_exchanges: 0,
      directive: 3,
      opening_message: false,
    });
    expect(errs.length).toBe(3);
  });
});
