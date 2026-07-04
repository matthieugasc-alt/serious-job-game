/**
 * ComposerV3 — chaque code d'erreur est couvert (règles v2 héritées +
 * règles v3 : trigger obligatoire, refs, tools, threads, events).
 */

import { describe, it, expect } from "vitest";
import type { CompletionTrigger, ScenarioV3, StepCompletion } from "../workspace";
import { validateScenarioV3, resolveStepInputsV3 } from "../composerV3";
import { initializeSessionV3 } from "../sessionV3";
import { FAKE_SPECS, FAKE_TOOLS, makeScenario, makeStep, evalBlock } from "./v3.fixtures";

function base(): ScenarioV3 {
  return makeScenario([
    makeStep({
      step_id: "s1",
      threads: [{ thread_id: "th_alex", participants: ["alex"] }],
      tools: [{ tool: "notes" }],
      document_ids: ["doc_pack"],
      events: [
        {
          event_id: "e1",
          when: { type: "step_start" },
          effect: { type: "message_received", thread_id: "th_alex", actor_id: "alex", content: "go" },
        },
      ],
      completion: { trigger: { type: "mail_sent", to: "thomas" } },
    }),
    makeStep({
      step_id: "s2",
      mechanic: "m_prod",
      inputs: { brief: "s1.findings", tout: "s1" },
      completion: {
        trigger: {
          type: "all",
          of: [
            { type: "deliverable_submitted", tool: "notes" },
            { type: "criterion_observed", criterion: "c1" },
          ],
        },
      },
    }),
  ]);
}

const codes = (s: ScenarioV3) =>
  validateScenarioV3(s, FAKE_SPECS, FAKE_TOOLS).map((i) => i.code);

const withTrigger = (s: ScenarioV3, trigger: CompletionTrigger) => {
  s.sequence[0].completion = { trigger };
  return s;
};

describe("validateScenarioV3 — règles héritées du v2", () => {
  it("scénario de base valide → aucun issue", () => {
    expect(validateScenarioV3(base(), FAKE_SPECS, FAKE_TOOLS)).toEqual([]);
  });

  it("UNKNOWN_MECHANIC", () => {
    const s = base();
    s.sequence[0].mechanic = "inexistante";
    expect(codes(s)).toContain("UNKNOWN_MECHANIC");
  });

  it("DUPLICATE_STEP_ID", () => {
    const s = base();
    s.sequence.push(makeStep({ step_id: "s1" }));
    expect(codes(s)).toContain("DUPLICATE_STEP_ID");
  });

  it("MISSING_PARAM", () => {
    const s = base();
    s.sequence[0].params = {};
    expect(codes(s)).toContain("MISSING_PARAM");
  });

  it("UNKNOWN_ACTOR_REF via params actor_id / *_actor", () => {
    const s = base();
    s.sequence[0].params.actor_id = "fantome";
    expect(codes(s)).toContain("UNKNOWN_ACTOR_REF");
  });

  it("BAD_INPUT_REF (format et source inconnue)", () => {
    const s = base();
    s.sequence[1].inputs = { a: "s1.findings.trop.profond", b: "s_inconnu.x" };
    expect(codes(s).filter((c) => c === "BAD_INPUT_REF")).toHaveLength(2);
  });

  it("INPUT_REF_FORWARD", () => {
    const s = base();
    s.sequence[0].inputs = { future: "s2.deliverable" };
    expect(codes(s)).toContain("INPUT_REF_FORWARD");
  });

  it("UNKNOWN_OUTPUT_KEY", () => {
    const s = base();
    s.sequence[1].inputs = { x: "s1.pas_une_cle" };
    expect(codes(s)).toContain("UNKNOWN_OUTPUT_KEY");
  });

  it("NO_CRITERIA", () => {
    const s = base();
    s.sequence[0].evaluation = { observed_criteria: [] };
    expect(codes(s)).toContain("NO_CRITERIA");
  });

  it("NO_COMPLETION_RULE", () => {
    const s = base();
    s.sequence[0].completion_rules = {};
    expect(codes(s)).toContain("NO_COMPLETION_RULE");
  });

  it("UNKNOWN_REQUIRED_CRITERION", () => {
    const s = base();
    s.sequence[0].completion_rules = { required_criteria: ["c_absent"] };
    expect(codes(s)).toContain("UNKNOWN_REQUIRED_CRITERION");
  });

  it("BAD_ENDINGS (pas de default, ref step inconnu)", () => {
    const s = base();
    s.endings = [
      { id: "e", label: "l", content: "c", requires_passed: ["s_inconnu"] },
    ];
    expect(codes(s).filter((c) => c === "BAD_ENDINGS")).toHaveLength(2);
  });
});

describe("validateScenarioV3 — règles v3", () => {
  it("MISSING_TRIGGER : completion.trigger obligatoire", () => {
    const s = base();
    s.sequence[0].completion = {} as StepCompletion;
    expect(codes(s)).toContain("MISSING_TRIGGER");
    const s2 = base();
    (s2.sequence[0] as { completion?: StepCompletion }).completion = undefined;
    expect(codes(s2)).toContain("MISSING_TRIGGER");
  });

  it("BAD_TRIGGER : type inconnu", () => {
    expect(
      codes(withTrigger(base(), { type: "vibes" } as unknown as CompletionTrigger)),
    ).toContain("BAD_TRIGGER");
  });

  it("BAD_TRIGGER : all/any vides (y compris imbriqués)", () => {
    expect(codes(withTrigger(base(), { type: "all", of: [] }))).toContain("BAD_TRIGGER");
    expect(
      codes(withTrigger(base(), { type: "any", of: [{ type: "all", of: [] }] })),
    ).toContain("BAD_TRIGGER");
  });

  it("BAD_TRIGGER : min_count, timer, manual mal formés", () => {
    expect(
      codes(withTrigger(base(), { type: "mail_sent", min_count: 0 })),
    ).toContain("BAD_TRIGGER");
    expect(
      codes(withTrigger(base(), { type: "timer_elapsed", seconds: 0 })),
    ).toContain("BAD_TRIGGER");
    expect(
      codes(
        withTrigger(base(), {
          type: "timer_elapsed",
          seconds: 10,
          from: "big_bang",
        } as unknown as CompletionTrigger),
      ),
    ).toContain("BAD_TRIGGER");
    expect(codes(withTrigger(base(), { type: "manual", label: "" }))).toContain("BAD_TRIGGER");
  });

  it("UNKNOWN_TRIGGER_REF : critère non déclaré", () => {
    expect(
      codes(withTrigger(base(), { type: "criterion_observed", criterion: "c_absent" })),
    ).toContain("UNKNOWN_TRIGGER_REF");
  });

  it("UNKNOWN_TRIGGER_REF : acteurs (mail_sent.to, message_sent.to_actor, message_received, actor_validation)", () => {
    for (const trigger of [
      { type: "mail_sent", to: "fantome" },
      { type: "message_sent", to_actor: "fantome" },
      { type: "message_received", from_actor: "fantome" },
      { type: "actor_validation", actor: "fantome" },
    ] as CompletionTrigger[]) {
      expect(codes(withTrigger(base(), trigger))).toContain("UNKNOWN_TRIGGER_REF");
    }
  });

  it("UNKNOWN_TRIGGER_REF : document inconnu", () => {
    expect(
      codes(withTrigger(base(), { type: "document_opened", document_id: "doc_absent" })),
    ).toContain("UNKNOWN_TRIGGER_REF");
  });

  it("UNKNOWN_TOOL : trigger deliverable_submitted et tools du step", () => {
    expect(
      codes(withTrigger(base(), { type: "deliverable_submitted", tool: "tableur" })),
    ).toContain("UNKNOWN_TOOL");
    const s = base();
    s.sequence[0].tools = [{ tool: "tableur" }];
    expect(codes(s)).toContain("UNKNOWN_TOOL");
  });

  it("BAD_THREAD : doublon, participants vides, participant inconnu", () => {
    const s = base();
    s.sequence[0].threads = [
      { thread_id: "th", participants: ["alex"] },
      { thread_id: "th", participants: [] },
      { thread_id: "th2", participants: ["fantome"] },
    ];
    expect(codes(s).filter((c) => c === "BAD_THREAD")).toHaveLength(3);
  });

  it("UNKNOWN_DOCUMENT_REF : document_ids et pièce jointe d'event", () => {
    const s = base();
    s.sequence[0].document_ids = ["doc_absent"];
    s.sequence[0].events!.push({
      event_id: "e_pj",
      when: { type: "step_start" },
      effect: {
        type: "mail_received",
        from_actor: "thomas",
        subject: "s",
        body: "b",
        attachment_document_ids: ["pj_absente"],
      },
    });
    expect(codes(s).filter((c) => c === "UNKNOWN_DOCUMENT_REF")).toHaveLength(2);
  });

  it("BAD_EVENT : event_id dupliqué, when/effect inconnus, delay <= 0, refs invalides", () => {
    const s = base();
    s.sequence[0].events = [
      {
        event_id: "e1",
        when: { type: "step_start" },
        effect: { type: "notification", title: "t" },
      },
      {
        event_id: "e1", // dupliqué
        when: { type: "quand_tu_veux" } as never,
        effect: { type: "explosion" } as never,
      },
      {
        event_id: "e2",
        when: { type: "delay", seconds: 0 },
        effect: { type: "notification", title: "t" },
      },
      {
        event_id: "e3",
        when: { type: "after_action", action: "danse" } as never,
        effect: { type: "notification", title: "t" },
      },
      {
        event_id: "e4",
        when: { type: "on_retry" },
        effect: {
          type: "message_received",
          thread_id: "th_jamais_declare",
          actor_id: "fantome",
          content: "x",
        },
      },
    ];
    const badEvents = codes(s).filter((c) => c === "BAD_EVENT");
    // e1bis : dup + when inconnu + effect inconnu ; e2 : delay ; e3 : action ;
    // e4 : acteur inconnu + fil inconnu.
    expect(badEvents).toHaveLength(7);
  });

  it("un event peut viser un fil déclaré à un step ANTÉRIEUR", () => {
    const s = base();
    s.sequence[1].events = [
      {
        event_id: "e_retour",
        when: { type: "on_retry" },
        effect: { type: "message_received", thread_id: "th_alex", actor_id: "alex", content: "x" },
      },
    ];
    expect(validateScenarioV3(s, FAKE_SPECS, FAKE_TOOLS)).toEqual([]);
  });
});

describe("validateScenarioV3 — chantier A (exits)", () => {
  function withStepExits(exits: unknown, completionExtra: object = {}): ScenarioV3 {
    const s = base();
    s.sequence[0].completion = { exits, ...completionExtra } as StepCompletion;
    return s;
  }
  const okExit = { id: "e1", trigger: { type: "manual", label: "go" }, route: "next" };

  it("scénario avec exits valides → aucun issue", () => {
    const s = withStepExits(
      [
        okExit,
        {
          id: "e2",
          trigger: { type: "mail_sent", to: "thomas" },
          evaluate: false,
          route: { goto: "s2" },
          reset: { threads: ["th_alex"], tools: ["notes"] },
          events: [
            { event_id: "ev", effect: { type: "message_received", thread_id: "th_alex", actor_id: "alex", content: "x" } },
          ],
        },
        { id: "e3", trigger: { type: "contract_rejected" }, route: { end: "failure" } },
      ],
      { max_gotos: 2, on_goto_exhausted: { end: "failure" } },
    );
    expect(validateScenarioV3(s, FAKE_SPECS, FAKE_TOOLS)).toEqual([]);
  });

  it("BAD_EXIT : trigger ET exits déclarés (exclusifs)", () => {
    const s = base();
    s.sequence[0].completion = {
      trigger: { type: "manual", label: "x" },
      exits: [okExit],
    } as StepCompletion;
    expect(codes(s)).toContain("BAD_EXIT");
  });

  it("MISSING_TRIGGER + BAD_EXIT : ni trigger ni exits / exits vide", () => {
    expect(codes(withStepExits(undefined))).toContain("MISSING_TRIGGER");
    const empty = codes(withStepExits([]));
    expect(empty).toContain("MISSING_TRIGGER");
    expect(empty).toContain("BAD_EXIT");
  });

  it("BAD_EXIT : id manquant/dupliqué, trigger manquant, route invalide, evaluate non booléen", () => {
    const issues = codes(
      withStepExits([
        { trigger: { type: "manual", label: "a" }, route: "next" }, // id manquant
        { id: "dup", trigger: { type: "manual", label: "b" }, route: "next" },
        { id: "dup", trigger: { type: "manual", label: "c" }, route: "next" }, // dupliqué
        { id: "e_no_trigger", route: "next" },
        { id: "e_bad_route", trigger: { type: "manual", label: "d" }, route: "ailleurs" },
        { id: "e_bad_eval", trigger: { type: "manual", label: "e" }, route: "next", evaluate: "oui" },
      ]),
    );
    expect(issues.filter((c) => c === "BAD_EXIT")).toHaveLength(5);
  });

  it("BAD_EXIT : goto vers step inconnu + on_goto_exhausted manquant ; max_gotos invalide", () => {
    const s = withStepExits([
      { id: "e1", trigger: { type: "manual", label: "a" }, route: { goto: "s_absent" } },
    ]);
    const issues = codes(s);
    expect(issues.filter((c) => c === "BAD_EXIT")).toHaveLength(2); // step inconnu + fallback manquant

    const s2 = withStepExits([okExit], { max_gotos: 0 });
    expect(codes(s2)).toContain("BAD_EXIT");
  });

  it("UNKNOWN_ENDING_REF : route end / on_goto_exhausted vers un ending inconnu", () => {
    const s = withStepExits(
      [
        { id: "e1", trigger: { type: "manual", label: "a" }, route: { end: "ending_fantome" } },
        { id: "e2", trigger: { type: "manual", label: "b" }, route: { goto: "s2" } },
      ],
      { on_goto_exhausted: { end: "autre_fantome" } },
    );
    expect(codes(s).filter((c) => c === "UNKNOWN_ENDING_REF")).toHaveLength(2);
  });

  it("BAD_EXIT : reset vers fil/tool inconnus ; events d'exit invalides", () => {
    const issues = codes(
      withStepExits([
        {
          id: "e1",
          trigger: { type: "manual", label: "a" },
          route: "next",
          reset: { threads: ["th_fantome"], tools: ["tableur"] },
          events: [
            { event_id: "ev", effect: { type: "explosion" } },
            { event_id: "ev", effect: { type: "notification", title: "t" } }, // event_id dupliqué
            { effect: { type: "notification", title: "t" } }, // event_id manquant
          ],
        },
      ]),
    );
    expect(issues.filter((c) => c === "BAD_EXIT")).toHaveLength(5);
  });
});

describe("validateScenarioV3 — chantier B (bind_actor / alias)", () => {
  it("alias lié par un step antérieur : utilisable partout ensuite (threads, params, triggers, events)", () => {
    const s = base();
    s.sequence[0].completion = {
      exits: [
        {
          id: "choix",
          trigger: {
            type: "any",
            of: [{ type: "mail_sent", to: "alex" }, { type: "mail_sent", to: "thomas" }],
            bind_actor: "partenaire",
          },
          route: "next",
          // L'alias lié par CE trigger est utilisable dans les events de CET exit.
          events: [
            { event_id: "ev", effect: { type: "mail_received", from_actor: "partenaire", subject: "s", body: "b" } },
          ],
        },
      ],
    } as StepCompletion;
    s.sequence[1] = makeStep({
      step_id: "s2",
      mechanic: "m_prod",
      params: { instructions: "x", cible_actor: "partenaire" },
      threads: [{ thread_id: "th_p", participants: ["partenaire"] }],
      events: [
        {
          event_id: "e_hello",
          when: { type: "step_start" },
          effect: { type: "message_received", thread_id: "th_p", actor_id: "partenaire", content: "…" },
        },
      ],
      completion: { trigger: { type: "message_sent", to_actor: "partenaire" } },
    });
    expect(validateScenarioV3(s, FAKE_SPECS, FAKE_TOOLS)).toEqual([]);
  });

  it("alias utilisé AVANT d'être lié : refusé (thread, trigger, param)", () => {
    const s = base();
    s.sequence[0].threads!.push({ thread_id: "th_p", participants: ["partenaire"] });
    s.sequence[0].params.cible_actor = "partenaire";
    s.sequence[0].completion = {
      trigger: { type: "message_sent", to_actor: "partenaire" },
    };
    const issues = codes(s);
    expect(issues).toContain("BAD_THREAD");
    expect(issues).toContain("UNKNOWN_ACTOR_REF");
    expect(issues).toContain("UNKNOWN_TRIGGER_REF");
  });

  it("BAD_TRIGGER : bind_actor mal placé, vide, ou en collision avec un actor_id", () => {
    for (const trigger of [
      { type: "manual", label: "x", bind_actor: "a" }, // mauvais nœud
      { type: "mail_sent", bind_actor: "" }, // vide
      { type: "mail_sent", bind_actor: "alex" }, // collision
    ]) {
      expect(codes(withTrigger(base(), trigger as CompletionTrigger))).toContain("BAD_TRIGGER");
    }
  });
});

describe("validateScenarioV3 — chantier C (scoring)", () => {
  const scoredExits: StepCompletion = {
    exits: [
      { id: "haut", trigger: { type: "mail_scored", to: "thomas", min_score: 7, scale: 10 }, route: "next" },
      { id: "bas", trigger: { type: "mail_scored_below", to: "thomas", min_score: 7 }, route: { end: "failure" } },
    ],
  };

  it("mail_scored + scoring.brief déclaré → valide", () => {
    const s = base();
    s.sequence[0].scoring = { brief: "Qualité du mail.", scale: 10 };
    s.sequence[0].completion = scoredExits;
    expect(validateScenarioV3(s, FAKE_SPECS, FAKE_TOOLS)).toEqual([]);
  });

  it("BAD_SCORING : mail_scored sans bloc scoring ; brief vide ; scale invalide", () => {
    const s = base();
    s.sequence[0].completion = scoredExits;
    expect(codes(s)).toContain("BAD_SCORING");

    const s2 = base();
    s2.sequence[0].scoring = { brief: "" };
    expect(codes(s2)).toContain("BAD_SCORING");

    const s3 = base();
    s3.sequence[0].scoring = { brief: "ok", scale: 0 };
    expect(codes(s3)).toContain("BAD_SCORING");
  });

  it("BAD_TRIGGER : min_score absent/négatif, scale ≤ 0, min_score > scale ; UNKNOWN_TRIGGER_REF : destinataire inconnu", () => {
    const s = base();
    s.sequence[0].scoring = { brief: "ok" };
    for (const [trigger, code] of [
      [{ type: "mail_scored", min_score: -1 }, "BAD_TRIGGER"],
      [{ type: "mail_scored", min_score: 7, scale: 0 }, "BAD_TRIGGER"],
      [{ type: "mail_scored", min_score: 12, scale: 10 }, "BAD_TRIGGER"],
      [{ type: "mail_scored_below", min_score: 7, to: "fantome" }, "UNKNOWN_TRIGGER_REF"],
    ] as [CompletionTrigger, string][]) {
      const sc = base();
      sc.sequence[0].scoring = { brief: "ok" };
      expect(codes(withTrigger(sc, trigger))).toContain(code);
    }
  });
});

describe("resolveStepInputsV3 (réutilise le composer v2)", () => {
  it("résout stepId et stepId.cle depuis stepResults", () => {
    const s = base();
    const session = initializeSessionV3(s, 0);
    session.stepResults.s1 = {
      stepId: "s1",
      mechanic: "m_analyse",
      evaluation: {} as never,
      output: { findings: "trois patterns" },
      attempts: 1,
      passed: true,
    };
    expect(resolveStepInputsV3(session, s.sequence[1])).toEqual({
      brief: "trois patterns",
      tout: { findings: "trois patterns" },
    });
  });

  it("throw sur référence irrésoluble (bug de scénario)", () => {
    const s = base();
    const session = initializeSessionV3(s, 0);
    expect(() =>
      resolveStepInputsV3(session, {
        ...s.sequence[1],
        inputs: { x: "s_absent.y" },
      }),
    ).toThrow(/s_absent/);
  });
});

describe("evalBlock (fixture sanity)", () => {
  it("déclare critères + completion_rules cohérents", () => {
    const block = evalBlock("a", "b");
    expect(block.evaluation.observed_criteria.map((c) => c.id)).toEqual(["a", "b"]);
    expect(block.completion_rules.required_criteria).toEqual(["a", "b"]);
  });
});
