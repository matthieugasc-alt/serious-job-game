import { describe, it, expect } from "vitest";
import type { ActorDef, TranscriptEvent } from "@/app/lib/engine/mechanics";
import {
  buildDialogue,
  buildOutput,
  buildQaDirective,
  countActorMessages,
  countPlayerAnswers,
  resolveQuestionCount,
  validateParams,
} from "../Runtime";

const actors: ActorDef[] = [
  { actor_id: "jury", name: "Camille", role: "interrogateur", prompt: "p" },
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

describe("qa/Runtime — buildQaDirective", () => {
  it("construit la directive universelle n/total", () => {
    expect(buildQaDirective(2, 5)).toBe(
      "Tu poses des questions au joueur, une à la fois. Pose maintenant la question 2/5.",
    );
  });
  it("concatène le cadrage scénario optionnel", () => {
    expect(buildQaDirective(1, 3, "Reste bienveillant.")).toBe(
      "Tu poses des questions au joueur, une à la fois. Pose maintenant la question 1/3. Reste bienveillant.",
    );
  });
  it("ignore un extra vide ou blanc", () => {
    expect(buildQaDirective(1, 3, "   ")).toBe(
      "Tu poses des questions au joueur, une à la fois. Pose maintenant la question 1/3.",
    );
  });
});

describe("qa/Runtime — resolveQuestionCount", () => {
  it("accepte un entier >= 1", () => {
    expect(resolveQuestionCount({ question_count: 4 })).toBe(4);
  });
  it("retourne 0 pour toute valeur invalide", () => {
    expect(resolveQuestionCount({})).toBe(0);
    expect(resolveQuestionCount({ question_count: 0 })).toBe(0);
    expect(resolveQuestionCount({ question_count: 2.5 })).toBe(0);
    expect(resolveQuestionCount({ question_count: "3" })).toBe(0);
  });
});

describe("qa/Runtime — compteurs", () => {
  const t = [
    ev({ role: "actor", actor_id: "jury", content: "Q1 ?" }),
    ev({ role: "player", content: "R1" }),
    ev({ role: "actor", actor_id: "jury", content: "Q2 ?" }),
    ev({ role: "system", channel: "system", content: "bruit" }),
  ];
  it("countPlayerAnswers ne compte que le chat joueur", () => {
    expect(countPlayerAnswers(t)).toBe(1);
  });
  it("countActorMessages ne compte que le chat acteur", () => {
    expect(countActorMessages(t)).toBe(2);
  });
});

describe("qa/Runtime — buildDialogue / buildOutput", () => {
  const t = [
    ev({ role: "actor", actor_id: "jury", content: "Q1 ?" }),
    ev({ role: "player", content: "R1" }),
    ev({ role: "actor", actor_id: "jury", content: "Q2 ?" }),
    ev({ role: "player", content: "R2" }),
  ];
  it("formate le dialogue compact", () => {
    expect(buildDialogue(t, actors)).toBe(
      "Camille: Q1 ?\nVous: R1\nCamille: Q2 ?\nVous: R2",
    );
  });
  it("produit exactement les clés du manifest, JSON-sérialisables", () => {
    const out = buildOutput(t, actors);
    expect(Object.keys(out).sort()).toEqual(["answers_count", "dialogue"]);
    expect(out.answers_count).toBe(2);
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});

describe("qa/Runtime — validateParams", () => {
  it("accepte des params valides", () => {
    expect(
      validateParams({
        actor_id: "jury",
        question_count: 3,
        directive: "sois direct",
        context_hint: "On va vous poser 3 questions.",
      }),
    ).toEqual([]);
  });
  it("refuse actor_id / question_count manquants ou invalides", () => {
    expect(validateParams({}).length).toBe(2);
    expect(
      validateParams({ actor_id: "", question_count: 0 }).length,
    ).toBe(2);
  });
  it("refuse les optionnels mal typés", () => {
    const errs = validateParams({
      actor_id: "jury",
      question_count: 2,
      directive: 1,
      context_hint: [],
    });
    expect(errs.length).toBe(2);
  });
});
