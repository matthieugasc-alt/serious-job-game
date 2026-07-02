import { describe, it, expect } from "vitest";
import type { ActorDef, TranscriptEvent } from "@/app/lib/engine/mechanics";
import {
  DEFAULT_MIN_EXCHANGES,
  LEARNER_DIRECTIVE,
  resolveMinExchanges,
  parseObjectives,
  buildDirective,
  countPlayerMessages,
  buildDialogue,
  normalizeCovered,
  buildSummary,
  buildOutput,
  restoreCovered,
  validateParams,
} from "../Runtime";
import type { ObjectiveDef } from "../Runtime";

const actors: ActorDef[] = [
  { actor_id: "a1", name: "Lou", role: "apprenant", prompt: "p" },
];

const objectives: ObjectiveDef[] = [
  { id: "o1", label: "Objectif 1" },
  { id: "o2", label: "Objectif 2" },
];

function ev(partial: Partial<TranscriptEvent>): TranscriptEvent {
  return { at: 0, channel: "chat", role: "player", content: "", ...partial };
}

describe("formation — resolveMinExchanges", () => {
  it("retourne le défaut (3) sans param", () => {
    expect(resolveMinExchanges({})).toBe(DEFAULT_MIN_EXCHANGES);
    expect(DEFAULT_MIN_EXCHANGES).toBe(3);
  });
  it("respecte un entier valide, retombe sur le défaut sinon", () => {
    expect(resolveMinExchanges({ min_exchanges: 5 })).toBe(5);
    expect(resolveMinExchanges({ min_exchanges: 0 })).toBe(3);
    expect(resolveMinExchanges({ min_exchanges: "4" })).toBe(3);
  });
});

describe("formation — parseObjectives", () => {
  it("parse les objectifs valides", () => {
    expect(parseObjectives({ objectives: [{ id: "o1", label: "L1" }] })).toEqual([
      { id: "o1", label: "L1" },
    ]);
  });
  it("ignore les entrées invalides", () => {
    expect(
      parseObjectives({
        objectives: [{ id: "ok", label: "OK" }, { id: "" }, "x", null],
      }).map((o) => o.id),
    ).toEqual(["ok"]);
  });
  it("retourne [] si absent ou non-tableau", () => {
    expect(parseObjectives({})).toEqual([]);
    expect(parseObjectives({ objectives: "x" })).toEqual([]);
  });
});

describe("formation — buildDirective", () => {
  it("sans directive scénario : consigne apprenant seule", () => {
    expect(buildDirective({})).toBe(LEARNER_DIRECTIVE);
  });
  it("avec directive scénario : consigne universelle PUIS cadrage scénario", () => {
    const d = buildDirective({ directive: "Tu es pressé." });
    expect(d.startsWith(LEARNER_DIRECTIVE)).toBe(true);
    expect(d).toContain("Tu es pressé.");
  });
  it("directive scénario vide/blanche ignorée", () => {
    expect(buildDirective({ directive: "  " })).toBe(LEARNER_DIRECTIVE);
  });
});

describe("formation — countPlayerMessages / buildDialogue", () => {
  it("ne compte que les messages chat du joueur", () => {
    const t = [
      ev({ role: "player", content: "explication" }),
      ev({ role: "actor", actor_id: "a1", content: "question" }),
      ev({ role: "player", channel: "editor", content: "objectifs" }),
    ];
    expect(countPlayerMessages(t)).toBe(1);
  });
  it("formate le dialogue joueur/apprenant", () => {
    const t = [
      ev({ role: "player", content: "Voici le principe." }),
      ev({ role: "actor", actor_id: "a1", content: "Donc si je comprends bien…" }),
    ];
    expect(buildDialogue(t, actors)).toBe(
      "Vous: Voici le principe.\nLou: Donc si je comprends bien…",
    );
  });
});

describe("formation — normalizeCovered / buildSummary", () => {
  it("filtre les ids inconnus, déduplique, ordonne comme le scénario", () => {
    expect(normalizeCovered(objectives, ["o2", "ghost", "o1", "o2"])).toEqual([
      "o1",
      "o2",
    ]);
  });
  it("couverture vide autorisée", () => {
    expect(normalizeCovered(objectives, [])).toEqual([]);
  });
  it("le résumé coche les objectifs couverts", () => {
    expect(buildSummary(objectives, ["o2"])).toBe(
      "[ ] Objectif 1\n[x] Objectif 2",
    );
  });
});

describe("formation — buildOutput", () => {
  it("produit exactement les clés du manifest, JSON-sérialisables", () => {
    const t = [
      ev({ role: "player", content: "e1" }),
      ev({ role: "actor", actor_id: "a1", content: "q1" }),
    ];
    const out = buildOutput(t, actors, objectives, ["ghost", "o1"]);
    expect(Object.keys(out).sort()).toEqual(["dialogue", "objectives_covered"]);
    expect(out.objectives_covered).toEqual(["o1"]);
    expect(out.dialogue).toContain("Vous: e1");
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});

describe("formation — restoreCovered (scratch)", () => {
  it("restaure les ids persistés (strings uniquement)", () => {
    expect(restoreCovered({ objectives_covered: ["o1", 3, "o2"] })).toEqual([
      "o1",
      "o2",
    ]);
  });
  it("scratch vide ou mal formé → []", () => {
    expect(restoreCovered({})).toEqual([]);
    expect(restoreCovered({ objectives_covered: "o1" })).toEqual([]);
  });
});

describe("formation — validateParams", () => {
  const valid = {
    actor_id: "a1",
    topic: "Un sujet",
    objectives: [{ id: "o1", label: "L1" }],
  };

  it("accepte des params valides avec optionnels", () => {
    expect(validateParams(valid)).toEqual([]);
    expect(
      validateParams({
        ...valid,
        directive: "Tu es pressé.",
        opening_message: "Bonjour, on commence ?",
        min_exchanges: 4,
      }),
    ).toEqual([]);
  });
  it("refuse actor_id / topic / objectives manquants", () => {
    expect(validateParams({}).length).toBe(3);
  });
  it("refuse objectives vide, mal formé ou avec ids dupliqués", () => {
    expect(validateParams({ ...valid, objectives: [] })).not.toEqual([]);
    expect(validateParams({ ...valid, objectives: [{ id: "o1" }] })).not.toEqual([]);
    expect(
      validateParams({
        ...valid,
        objectives: [
          { id: "o1", label: "A" },
          { id: "o1", label: "B" },
        ],
      }),
    ).not.toEqual([]);
  });
  it("refuse les optionnels mal typés", () => {
    expect(validateParams({ ...valid, min_exchanges: 1.5 })).not.toEqual([]);
    expect(validateParams({ ...valid, directive: 3 })).not.toEqual([]);
    expect(validateParams({ ...valid, opening_message: [] })).not.toEqual([]);
  });
});
