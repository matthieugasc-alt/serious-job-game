import { describe, it, expect } from "vitest";
import type { ActorDef, TranscriptEvent } from "@/app/lib/engine/mechanics";
import {
  DEFAULT_MIN_ROUNDS,
  resolveMinRounds,
  countPlayerMessages,
  buildDialogue,
  validateCommitments,
  buildOutput,
  restoreCommitments,
  validateParams,
} from "../Runtime";

const actors: ActorDef[] = [
  { actor_id: "a1", name: "Sam", role: "collaborateur", prompt: "p" },
];

function ev(partial: Partial<TranscriptEvent>): TranscriptEvent {
  return { at: 0, channel: "chat", role: "player", content: "", ...partial };
}

describe("feedback — resolveMinRounds", () => {
  it("retourne le défaut (2) sans param", () => {
    expect(resolveMinRounds({})).toBe(DEFAULT_MIN_ROUNDS);
    expect(DEFAULT_MIN_ROUNDS).toBe(2);
  });
  it("respecte un entier valide, retombe sur le défaut sinon", () => {
    expect(resolveMinRounds({ min_rounds: 4 })).toBe(4);
    expect(resolveMinRounds({ min_rounds: 0 })).toBe(2);
    expect(resolveMinRounds({ min_rounds: 2.5 })).toBe(2);
    expect(resolveMinRounds({ min_rounds: "3" })).toBe(2);
  });
});

describe("feedback — countPlayerMessages / buildDialogue", () => {
  it("ne compte que les messages chat du joueur", () => {
    const t = [
      ev({ role: "player", content: "feedback 1" }),
      ev({ role: "actor", actor_id: "a1", content: "réaction" }),
      ev({ role: "player", channel: "editor", content: "engagements" }),
      ev({ role: "player", content: "feedback 2" }),
    ];
    expect(countPlayerMessages(t)).toBe(2);
  });
  it("formate le dialogue, exclut system et editor", () => {
    const t = [
      ev({ role: "player", content: "Voici les faits." }),
      ev({ role: "actor", actor_id: "a1", content: "Je conteste." }),
      ev({ role: "player", channel: "editor", content: "engagements" }),
    ];
    expect(buildDialogue(t, actors)).toBe(
      "Vous: Voici les faits.\nSam: Je conteste.",
    );
  });
  it("retombe sur 'Acteur' si l'acteur est inconnu", () => {
    const t = [ev({ role: "actor", actor_id: "ghost", content: "hello" })];
    expect(buildDialogue(t, actors)).toBe("Acteur: hello");
  });
});

describe("feedback — validateCommitments", () => {
  it("accepte des engagements non vides", () => {
    expect(validateCommitments("Point hebdo chaque lundi.")).toEqual([]);
  });
  it("refuse un champ vide ou blanc", () => {
    expect(validateCommitments("")).toHaveLength(1);
    expect(validateCommitments("   ")).toHaveLength(1);
  });
});

describe("feedback — buildOutput", () => {
  it("produit exactement les clés du manifest, JSON-sérialisables", () => {
    const t = [
      ev({ role: "player", content: "f1" }),
      ev({ role: "actor", actor_id: "a1", content: "r1" }),
    ];
    const out = buildOutput(t, actors, "  Alerte à J-2 en cas de retard.  ");
    expect(Object.keys(out).sort()).toEqual(["commitments", "dialogue"]);
    expect(out.commitments).toBe("Alerte à J-2 en cas de retard.");
    expect(out.dialogue).toContain("Vous: f1");
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});

describe("feedback — restoreCommitments (scratch)", () => {
  it("restaure un brouillon persisté", () => {
    expect(restoreCommitments({ commitments: "brouillon" })).toBe("brouillon");
  });
  it("scratch vide ou mal typé → chaîne vide", () => {
    expect(restoreCommitments({})).toBe("");
    expect(restoreCommitments({ commitments: 3 })).toBe("");
  });
});

describe("feedback — validateParams", () => {
  const valid = { actor_id: "a1", context_brief: "Trois retards ce mois-ci." };

  it("accepte des params valides avec optionnels", () => {
    expect(validateParams(valid)).toEqual([]);
    expect(
      validateParams({
        ...valid,
        directive: "Commence sur la défensive.",
        min_rounds: 3,
        framework_hint: "faits → impact → attente",
        opening_message: "Vous vouliez me voir ?",
      }),
    ).toEqual([]);
  });
  it("refuse actor_id / context_brief manquants ou vides", () => {
    expect(validateParams({}).length).toBe(2);
    expect(validateParams({ actor_id: " ", context_brief: "" }).length).toBe(2);
  });
  it("refuse les optionnels mal typés", () => {
    const errs = validateParams({
      ...valid,
      min_rounds: 0,
      directive: 3,
      framework_hint: [],
      opening_message: false,
    });
    expect(errs.length).toBe(4);
  });
});
