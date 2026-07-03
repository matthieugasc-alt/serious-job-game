/**
 * Triggers v3 — les 11 primitives + all/any, EXACTEMENT comme le
 * contrat (CONTRAT_WORKSPACE.md §4). Rien d'autre ne fait avancer.
 */

import { describe, it, expect } from "vitest";
import type {
  CompletionTrigger,
  LoggedAction,
  WorkspaceAction,
  WorkspaceState,
} from "../workspace";
import {
  evaluateTrigger,
  triggerMentions,
  actorValidationCriterion,
  ACTOR_VALIDATION_PREFIX,
} from "../triggers";
import type { TriggerContext } from "../triggers";

function ws(partial: Partial<WorkspaceState> = {}): WorkspaceState {
  return {
    threads: {},
    mailbox: { inbox: [], sent: [], drafts: {} },
    documents: {},
    toolStates: {},
    notifications: [],
    stepStartedAt: 0,
    scenarioStartedAt: 0,
    ...partial,
  };
}

function ctx(partial: Partial<TriggerContext> = {}): TriggerContext {
  return {
    log: [],
    workspace: ws(),
    lastObservation: null,
    now: 0,
    stepStartedAt: 0,
    scenarioStartedAt: 0,
    ...partial,
  };
}

function entry(action: WorkspaceAction, at = 1): LoggedAction {
  return { at, step_id: "s1", action };
}

const mail = (to: string[]): WorkspaceAction => ({
  type: "mail_sent",
  to,
  subject: "s",
  body: "b",
});

describe("mail_sent", () => {
  it("sans `to` : n'importe quel mail envoyé", () => {
    expect(evaluateTrigger({ type: "mail_sent" }, ctx())).toBe(false);
    expect(
      evaluateTrigger({ type: "mail_sent" }, ctx({ log: [entry(mail(["x"]))] })),
    ).toBe(true);
  });

  it("résolution to → actor_id parmi les destinataires", () => {
    const c = ctx({ log: [entry(mail(["thomas", "alex"]))] });
    expect(evaluateTrigger({ type: "mail_sent", to: "thomas" }, c)).toBe(true);
    expect(evaluateTrigger({ type: "mail_sent", to: "marie" }, c)).toBe(false);
  });

  it("min_count", () => {
    const one = ctx({ log: [entry(mail(["thomas"]))] });
    const two = ctx({ log: [entry(mail(["thomas"])), entry(mail(["thomas"]), 2)] });
    expect(evaluateTrigger({ type: "mail_sent", to: "thomas", min_count: 2 }, one)).toBe(false);
    expect(evaluateTrigger({ type: "mail_sent", to: "thomas", min_count: 2 }, two)).toBe(true);
  });
});

describe("message_sent", () => {
  const workspace = ws({
    threads: {
      th_alex: { thread_id: "th_alex", participants: ["alex"], messages: [], unread: 0 },
    },
  });
  const msg: WorkspaceAction = { type: "message_sent", thread_id: "th_alex", content: "x" };

  it("sans to_actor : n'importe quel message", () => {
    expect(evaluateTrigger({ type: "message_sent" }, ctx({ log: [entry(msg)] }))).toBe(true);
    expect(evaluateTrigger({ type: "message_sent" }, ctx())).toBe(false);
  });

  it("to_actor résolu via les participants du fil", () => {
    const c = ctx({ log: [entry(msg)], workspace });
    expect(evaluateTrigger({ type: "message_sent", to_actor: "alex" }, c)).toBe(true);
    expect(evaluateTrigger({ type: "message_sent", to_actor: "thomas" }, c)).toBe(false);
  });

  it("min_count", () => {
    const c = ctx({ log: [entry(msg), entry(msg, 2)], workspace });
    expect(evaluateTrigger({ type: "message_sent", to_actor: "alex", min_count: 2 }, c)).toBe(true);
    expect(evaluateTrigger({ type: "message_sent", to_actor: "alex", min_count: 3 }, c)).toBe(false);
  });
});

describe("message_received", () => {
  it("un acteur a écrit dans un fil depuis le début du step", () => {
    const workspace = ws({
      threads: {
        th: {
          thread_id: "th",
          participants: ["alex"],
          unread: 1,
          messages: [
            { at: 5, from: "player", content: "salut" },
            { at: 10, from: "actor", actor_id: "alex", content: "re" },
          ],
        },
      },
    });
    const c = ctx({ workspace, stepStartedAt: 8 });
    expect(evaluateTrigger({ type: "message_received", from_actor: "alex" }, c)).toBe(true);
    expect(evaluateTrigger({ type: "message_received", from_actor: "thomas" }, c)).toBe(false);
    // Message antérieur au step : ne compte pas.
    expect(
      evaluateTrigger(
        { type: "message_received", from_actor: "alex" },
        ctx({ workspace, stepStartedAt: 11 }),
      ),
    ).toBe(false);
  });
});

describe("contract / deliverable / document / manual", () => {
  it("contract_signed et contract_rejected lisent le journal", () => {
    const signed = ctx({
      log: [entry({ type: "contract_signed", tool_id: "contrat", terms: { prix: 1 } })],
    });
    expect(evaluateTrigger({ type: "contract_signed" }, signed)).toBe(true);
    expect(evaluateTrigger({ type: "contract_rejected" }, signed)).toBe(false);
    const rejected = ctx({ log: [entry({ type: "contract_rejected", tool_id: "contrat" })] });
    expect(evaluateTrigger({ type: "contract_rejected" }, rejected)).toBe(true);
  });

  it("deliverable_submitted, filtre tool optionnel", () => {
    const c = ctx({
      log: [entry({ type: "deliverable_submitted", tool_id: "notes", payload: {} })],
    });
    expect(evaluateTrigger({ type: "deliverable_submitted" }, c)).toBe(true);
    expect(evaluateTrigger({ type: "deliverable_submitted", tool: "notes" }, c)).toBe(true);
    expect(evaluateTrigger({ type: "deliverable_submitted", tool: "contrat" }, c)).toBe(false);
  });

  it("document_opened lit l'état persistant du workspace", () => {
    const c = ctx({
      workspace: ws({ documents: { doc1: { opened: true, annotations: [] } } }),
    });
    expect(evaluateTrigger({ type: "document_opened", document_id: "doc1" }, c)).toBe(true);
    expect(evaluateTrigger({ type: "document_opened", document_id: "doc2" }, c)).toBe(false);
  });

  it("manual exige le label EXACT", () => {
    const c = ctx({ log: [entry({ type: "manual_trigger", label: "Envoyer le bilan" })] });
    expect(evaluateTrigger({ type: "manual", label: "Envoyer le bilan" }, c)).toBe(true);
    expect(evaluateTrigger({ type: "manual", label: "envoyer le bilan" }, c)).toBe(false);
  });
});

describe("timer_elapsed", () => {
  it("from step_start (défaut)", () => {
    const t = { type: "timer_elapsed", seconds: 60 } as const;
    expect(evaluateTrigger(t, ctx({ now: 59_999, stepStartedAt: 0 }))).toBe(false);
    expect(evaluateTrigger(t, ctx({ now: 60_000, stepStartedAt: 0 }))).toBe(true);
  });

  it("from scenario_start", () => {
    const t = { type: "timer_elapsed", seconds: 60, from: "scenario_start" } as const;
    const c = ctx({ now: 70_000, stepStartedAt: 65_000, scenarioStartedAt: 0 });
    expect(evaluateTrigger(t, c)).toBe(true);
    expect(evaluateTrigger({ ...t, from: "step_start" }, c)).toBe(false);
  });
});

describe("criterion_observed / actor_validation (lastObservation)", () => {
  it("criterion_observed === true uniquement", () => {
    const t = { type: "criterion_observed", criterion: "scope_justifie" } as const;
    expect(evaluateTrigger(t, ctx())).toBe(false); // pas d'observation
    expect(
      evaluateTrigger(t, ctx({ lastObservation: { criteria: { scope_justifie: false } } })),
    ).toBe(false);
    expect(
      evaluateTrigger(t, ctx({ lastObservation: { criteria: { scope_justifie: true } } })),
    ).toBe(true);
  });

  it("actor_validation lit le pseudo-critère __actor_validation_<actor>", () => {
    const t = { type: "actor_validation", actor: "alex" } as const;
    expect(actorValidationCriterion("alex")).toBe(`${ACTOR_VALIDATION_PREFIX}alex`);
    expect(evaluateTrigger(t, ctx())).toBe(false);
    expect(
      evaluateTrigger(
        t,
        ctx({ lastObservation: { criteria: { __actor_validation_alex: true } } }),
      ),
    ).toBe(true);
    expect(
      evaluateTrigger(
        t,
        ctx({ lastObservation: { criteria: { __actor_validation_thomas: true } } }),
      ),
    ).toBe(false);
  });
});

describe("all / any / défensif", () => {
  const yes: CompletionTrigger = { type: "manual", label: "ok" };
  const no: CompletionTrigger = { type: "manual", label: "non" };
  const c = ctx({ log: [entry({ type: "manual_trigger", label: "ok" })] });

  it("all : tous vrais", () => {
    expect(evaluateTrigger({ type: "all", of: [yes, yes] }, c)).toBe(true);
    expect(evaluateTrigger({ type: "all", of: [yes, no] }, c)).toBe(false);
  });

  it("any : au moins un vrai", () => {
    expect(evaluateTrigger({ type: "any", of: [no, yes] }, c)).toBe(true);
    expect(evaluateTrigger({ type: "any", of: [no, no] }, c)).toBe(false);
  });

  it("all/any vides ne valident JAMAIS (défensif)", () => {
    expect(evaluateTrigger({ type: "all", of: [] }, c)).toBe(false);
    expect(evaluateTrigger({ type: "any", of: [] }, c)).toBe(false);
  });

  it("combinaison imbriquée (le pilote founder_02 s1)", () => {
    const trigger: CompletionTrigger = {
      type: "all",
      of: [
        { type: "message_sent", to_actor: "alex" },
        { type: "criterion_observed", criterion: "pattern_identifie" },
      ],
    };
    const workspace = ws({
      threads: { th: { thread_id: "th", participants: ["alex"], messages: [], unread: 0 } },
    });
    const base = {
      log: [entry({ type: "message_sent", thread_id: "th", content: "x" } as WorkspaceAction)],
      workspace,
    };
    expect(evaluateTrigger(trigger, ctx(base))).toBe(false); // critère pas observé
    expect(
      evaluateTrigger(
        trigger,
        ctx({ ...base, lastObservation: { criteria: { pattern_identifie: true } } }),
      ),
    ).toBe(true);
  });

  it("type inconnu → false, jamais de throw", () => {
    expect(
      evaluateTrigger({ type: "vibes_good" } as unknown as CompletionTrigger, c),
    ).toBe(false);
    expect(evaluateTrigger(null as unknown as CompletionTrigger, c)).toBe(false);
  });
});

describe("triggerMentions", () => {
  it("détecte un type en profondeur dans all/any", () => {
    const t: CompletionTrigger = {
      type: "all",
      of: [
        { type: "mail_sent" },
        { type: "any", of: [{ type: "criterion_observed", criterion: "c" }] },
      ],
    };
    expect(triggerMentions(t, ["criterion_observed", "actor_validation"])).toBe(true);
    expect(triggerMentions(t, ["actor_validation"])).toBe(false);
    expect(triggerMentions({ type: "mail_sent" }, ["criterion_observed"])).toBe(false);
  });
});
