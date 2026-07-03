/**
 * Reducer workspace v3 — journalisation d'abord, mutations d'état,
 * effets narratifs (events + réponses d'acteur), complétion.
 */

import { describe, it, expect } from "vitest";
import type { NarrativeEvent, StepInvocationV3, WorkspaceAction } from "../workspace";
import { initializeSessionV3 } from "../sessionV3";
import type { SessionV3State } from "../sessionV3";
import {
  applyWorkspaceAction,
  applyNarrativeEffect,
  enterStep,
  recordActorMessage,
  recordStepObservation,
} from "../workspaceReducer";
import { FAKE_DIRECTIVES, makeScenario, makeStep } from "./v3.fixtures";

const T0 = 1_000_000;

function boot(
  stepPartial: Partial<StepInvocationV3> = {},
  enter = true,
): SessionV3State {
  const scenario = makeScenario([
    makeStep({
      step_id: "s1",
      threads: [{ thread_id: "th_alex", participants: ["alex"] }],
      tools: [{ tool: "notes" }],
      ...stepPartial,
    }),
    makeStep({ step_id: "s2" }),
  ]);
  const session = initializeSessionV3(scenario, T0);
  if (enter) enterStep(session, { now: T0 });
  return session;
}

const dispatch = (
  session: SessionV3State,
  action: WorkspaceAction,
  now = T0 + 1,
) => applyWorkspaceAction(session, action, { now, specs: FAKE_DIRECTIVES });

describe("(a) journalisation AVANT tout effet", () => {
  it("chaque action est journalisée avec horodatage et step actif", () => {
    const session = boot();
    dispatch(session, { type: "document_opened", document_id: "doc_pack" }, T0 + 5);
    dispatch(session, { type: "manual_trigger", label: "x" }, T0 + 6);
    expect(session.actionLog).toHaveLength(2);
    expect(session.actionLog[0]).toEqual({
      at: T0 + 5,
      step_id: "s1",
      action: { type: "document_opened", document_id: "doc_pack" },
    });
    expect(session.actionLog[1].step_id).toBe("s1");
  });

  it("clock_tick est journalisé à SON horodatage (action.now)", () => {
    const session = boot();
    dispatch(session, { type: "clock_tick", now: T0 + 42_000 });
    expect(session.actionLog[0].at).toBe(T0 + 42_000);
  });

  it("session finie : plus rien n'est journalisé ni appliqué", () => {
    const session = boot();
    session.isFinished = true;
    const r = dispatch(session, { type: "document_opened", document_id: "doc_pack" });
    expect(r).toEqual({ effects: [], completionFired: false });
    expect(session.actionLog).toEqual([]);
    expect(session.workspace.documents.doc_pack.opened).toBe(false);
  });
});

describe("(b) application des actions à l'état", () => {
  it("message_sent : message joueur dans le fil, unread remis à 0", () => {
    const session = boot();
    session.workspace.threads.th_alex.unread = 3;
    dispatch(session, { type: "message_sent", thread_id: "th_alex", content: "hello" }, T0 + 2);
    const thread = session.workspace.threads.th_alex;
    expect(thread.messages).toEqual([{ at: T0 + 2, from: "player", content: "hello" }]);
    expect(thread.unread).toBe(0);
  });

  it("mail_sent : rangé dans sent, lu, destinataires copiés", () => {
    const session = boot();
    const to = ["thomas"];
    dispatch(session, { type: "mail_sent", to, subject: "Cadrage", body: "…" }, T0 + 2);
    const sent = session.workspace.mailbox.sent;
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      mail_id: "mail_out_1",
      from: "player",
      to: ["thomas"],
      subject: "Cadrage",
      read: true,
      at: T0 + 2,
    });
    to.push("intrus"); // copie défensive
    expect(sent[0].to).toEqual(["thomas"]);
  });

  it("mail_opened marque le mail entrant comme lu", () => {
    const session = boot();
    applyNarrativeEffect(
      session,
      { type: "mail_received", from_actor: "thomas", subject: "Devis", body: "…" },
      { now: T0 + 1 },
    );
    const mailId = session.workspace.mailbox.inbox[0].mail_id;
    expect(session.workspace.mailbox.inbox[0].read).toBe(false);
    dispatch(session, { type: "mail_opened", mail_id: mailId });
    expect(session.workspace.mailbox.inbox[0].read).toBe(true);
  });

  it("mail_draft_saved / document_opened / document_annotated / tool_state_changed / notification_read", () => {
    const session = boot();
    dispatch(session, {
      type: "mail_draft_saved",
      draft_id: "d1",
      to: ["thomas"],
      subject: "s",
      body: "b",
    });
    expect(session.workspace.mailbox.drafts.d1).toEqual({
      to: ["thomas"],
      subject: "s",
      body: "b",
    });

    dispatch(session, { type: "document_opened", document_id: "doc_pack" });
    expect(session.workspace.documents.doc_pack.opened).toBe(true);

    dispatch(session, {
      type: "document_annotated",
      document_id: "doc_pack",
      annotations: [{ quote: "x" }],
    });
    expect(session.workspace.documents.doc_pack.annotations).toEqual([{ quote: "x" }]);

    dispatch(session, { type: "tool_state_changed", tool_id: "notes", state: { text: "mémo" } });
    expect(session.workspace.toolStates.notes).toEqual({ text: "mémo" });

    applyNarrativeEffect(session, { type: "notification", title: "Ping" }, { now: T0 });
    const notifId = session.workspace.notifications[0].notif_id;
    dispatch(session, { type: "notification_read", notif_id: notifId });
    expect(session.workspace.notifications[0].read).toBe(true);
  });

  it("contract_* / deliverable_submitted / manual_trigger / clock_tick : journal seul, pas de mutation", () => {
    const session = boot();
    const before = JSON.stringify(session.workspace);
    dispatch(session, { type: "contract_signed", tool_id: "contrat", terms: { prix: 40_000 } });
    dispatch(session, { type: "deliverable_submitted", tool_id: "notes", payload: { ok: true } });
    dispatch(session, { type: "clock_tick", now: T0 + 3 });
    expect(JSON.stringify(session.workspace)).toBe(before);
    expect(session.actionLog).toHaveLength(3);
  });
});

describe("(c) réponses d'acteur automatiques", () => {
  it("message_sent dans un fil IA → un actor_reply PAR participant, avec la directive de la mécanique", () => {
    const session = boot({
      threads: [{ thread_id: "th_duo", participants: ["alex", "thomas"] }],
    });
    const r = dispatch(session, { type: "message_sent", thread_id: "th_duo", content: "?" });
    const replies = r.effects.filter((e) => e.kind === "actor_reply");
    expect(replies).toEqual([
      { kind: "actor_reply", thread_id: "th_duo", actor_id: "alex", directive: "DIRECTIVE_ANALYSE" },
      { kind: "actor_reply", thread_id: "th_duo", actor_id: "thomas", directive: "DIRECTIVE_ANALYSE" },
    ]);
  });

  it("sans specs : actor_reply sans directive (le cœur ne casse pas)", () => {
    const session = boot();
    const r = applyWorkspaceAction(
      session,
      { type: "message_sent", thread_id: "th_alex", content: "?" },
      { now: T0 + 1 },
    );
    expect(r.effects).toContainEqual({
      kind: "actor_reply",
      thread_id: "th_alex",
      actor_id: "alex",
    });
  });

  it("event after_action actor_reply sur le même (fil, acteur) : pas de doublon, directives cumulées", () => {
    const session = boot({
      events: [
        {
          event_id: "e_relance",
          when: { type: "after_action", action: "message_sent" },
          effect: {
            type: "actor_reply",
            thread_id: "th_alex",
            actor_id: "alex",
            directive: "DIRECTIVE_EVENT",
          },
        },
      ],
    });
    const r = dispatch(session, { type: "message_sent", thread_id: "th_alex", content: "?" });
    const replies = r.effects.filter((e) => e.kind === "actor_reply");
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({
      thread_id: "th_alex",
      actor_id: "alex",
      directive: "DIRECTIVE_ANALYSE\n\nDIRECTIVE_EVENT",
    });
  });
});

describe("(c) events narratifs after_action / delay / once", () => {
  const notifEvent = (once?: boolean): NarrativeEvent => ({
    event_id: "e_notif",
    when: { type: "after_action", action: "document_opened" },
    effect: { type: "notification", title: "Bien vu" },
    ...(once === undefined ? {} : { once }),
  });

  it("after_action tire quand le type d'action matche, une seule fois (once défaut)", () => {
    const session = boot({ events: [notifEvent()] });
    dispatch(session, { type: "document_opened", document_id: "doc_pack" });
    expect(session.workspace.notifications).toHaveLength(1);
    expect(session.firedEvents).toEqual(["s1:e_notif"]);
    dispatch(session, { type: "document_opened", document_id: "doc_pack" });
    expect(session.workspace.notifications).toHaveLength(1); // pas rejoué
  });

  it("once: false rejoue l'event", () => {
    const session = boot({ events: [notifEvent(false)] });
    dispatch(session, { type: "document_opened", document_id: "doc_pack" });
    dispatch(session, { type: "document_opened", document_id: "doc_pack" });
    expect(session.workspace.notifications).toHaveLength(2);
    expect(session.firedEvents).toEqual([]);
  });

  it("delay tire au clock_tick une fois le délai écoulé depuis stepStartedAt", () => {
    const session = boot({
      events: [
        {
          event_id: "e_relance_thomas",
          when: { type: "delay", seconds: 120 },
          effect: { type: "mail_received", from_actor: "thomas", subject: "Alors ?", body: "…" },
        },
      ],
    });
    dispatch(session, { type: "clock_tick", now: T0 + 119_000 });
    expect(session.workspace.mailbox.inbox).toHaveLength(0);
    dispatch(session, { type: "clock_tick", now: T0 + 120_000 });
    expect(session.workspace.mailbox.inbox).toHaveLength(1);
    expect(session.workspace.mailbox.inbox[0]).toMatchObject({
      from: "thomas",
      subject: "Alors ?",
      read: false,
    });
    // Notification générée pour le mail entrant.
    expect(session.workspace.notifications.some((n) => n.app === "mail")).toBe(true);
    // Once : un tick suivant ne le rejoue pas.
    dispatch(session, { type: "clock_tick", now: T0 + 500_000 });
    expect(session.workspace.mailbox.inbox).toHaveLength(1);
  });

  it("message_received AUTHORÉ (content) est inséré directement ; sans content → actor_reply", () => {
    const session = boot({
      events: [
        {
          event_id: "e_authored",
          when: { type: "after_action", action: "manual_trigger" },
          effect: {
            type: "message_received",
            thread_id: "th_alex",
            actor_id: "alex",
            content: "Tiens, regarde ça.",
          },
        },
        {
          event_id: "e_ia",
          when: { type: "after_action", action: "contract_signed" },
          effect: {
            type: "message_received",
            thread_id: "th_alex",
            actor_id: "alex",
            directive: "Réagis à la signature",
          },
        },
      ],
    });

    const r1 = dispatch(session, { type: "manual_trigger", label: "go" });
    expect(r1.effects.filter((e) => e.kind === "actor_reply")).toHaveLength(0);
    const thread = session.workspace.threads.th_alex;
    expect(thread.messages).toEqual([
      { at: T0 + 1, from: "actor", actor_id: "alex", content: "Tiens, regarde ça." },
    ]);
    expect(thread.unread).toBe(1);

    const r2 = dispatch(session, { type: "contract_signed", tool_id: "contrat", terms: {} });
    expect(r2.effects).toContainEqual({
      kind: "actor_reply",
      thread_id: "th_alex",
      actor_id: "alex",
      directive: "DIRECTIVE_ANALYSE\n\nRéagis à la signature",
    });
  });
});

describe("(d) complétion", () => {
  it("trigger tiré → completionFired + evaluate_step", () => {
    const session = boot({
      completion: { trigger: { type: "mail_sent", to: "thomas" } },
    });
    const miss = dispatch(session, { type: "mail_sent", to: ["alex"], subject: "s", body: "b" });
    expect(miss.completionFired).toBe(false);

    const hit = dispatch(session, { type: "mail_sent", to: ["thomas"], subject: "s", body: "b" });
    expect(hit.completionFired).toBe(true);
    expect(hit.effects).toContainEqual({ kind: "evaluate_step" });
  });

  it("trigger avec criterion_observed : observe_step après action significative, jamais après action anodine", () => {
    const session = boot({
      completion: {
        trigger: {
          type: "all",
          of: [
            { type: "mail_sent", to: "thomas" },
            { type: "criterion_observed", criterion: "c1" },
          ],
        },
      },
    });
    const anodine = dispatch(session, { type: "document_opened", document_id: "doc_pack" });
    expect(anodine.effects).not.toContainEqual({ kind: "observe_step" });

    const significative = dispatch(session, {
      type: "mail_sent",
      to: ["thomas"],
      subject: "s",
      body: "b",
    });
    expect(significative.completionFired).toBe(false);
    expect(significative.effects).toContainEqual({ kind: "observe_step" });

    // L'orchestrateur observe puis rafraîchit → le trigger tire.
    const r = recordStepObservation(session, { criteria: { c1: true } }, { now: T0 + 3 });
    expect(r.completionFired).toBe(true);
    expect(r.effects).toEqual([{ kind: "evaluate_step" }]);
  });

  it("sans criterion_observed/actor_validation dans le trigger : pas d'observe_step", () => {
    const session = boot({
      completion: { trigger: { type: "mail_sent", to: "thomas" } },
    });
    const r = dispatch(session, { type: "mail_sent", to: ["alex"], subject: "s", body: "b" });
    expect(r.effects).not.toContainEqual({ kind: "observe_step" });
  });

  it("actor_validation : recordActorMessage déclenche l'observe_step, l'observation valide", () => {
    const session = boot({
      completion: { trigger: { type: "actor_validation", actor: "alex" } },
    });
    const r1 = recordActorMessage(session, "th_alex", "alex", "OK pour moi, on part là-dessus.", {
      now: T0 + 2,
    });
    expect(r1.completionFired).toBe(false);
    expect(r1.effects).toContainEqual({ kind: "observe_step" });

    const r2 = recordStepObservation(
      session,
      { criteria: { __actor_validation_alex: true } },
      { now: T0 + 3 },
    );
    expect(r2.completionFired).toBe(true);
  });

  it("message_received en trigger : tire à l'insertion du message d'acteur", () => {
    const session = boot({
      completion: { trigger: { type: "message_received", from_actor: "alex" } },
    });
    const r = recordActorMessage(session, "th_alex", "alex", "je t'écris", { now: T0 + 2 });
    expect(r.completionFired).toBe(true);
    // Et l'état reflète l'insertion + notification.
    expect(session.workspace.threads.th_alex.messages).toHaveLength(1);
    expect(session.workspace.threads.th_alex.unread).toBe(1);
    expect(session.workspace.notifications.some((n) => n.app === "messages")).toBe(true);
  });

  it("timer_elapsed tire sur clock_tick", () => {
    const session = boot({
      completion: { trigger: { type: "timer_elapsed", seconds: 300 } },
    });
    expect(dispatch(session, { type: "clock_tick", now: T0 + 299_000 }).completionFired).toBe(false);
    expect(dispatch(session, { type: "clock_tick", now: T0 + 300_000 }).completionFired).toBe(true);
  });
});

describe("enterStep", () => {
  it("initialise threads/tools/documents du step, horloge, observation ; tire les events step_start", () => {
    const scenario = makeScenario([
      makeStep({ step_id: "s1" }),
      makeStep({
        step_id: "s2",
        threads: [{ thread_id: "th_thomas", participants: ["thomas"] }],
        tools: [{ tool: "contrat" }],
        document_ids: ["doc_pack"],
        events: [
          {
            event_id: "e_kickoff",
            when: { type: "step_start" },
            effect: {
              type: "message_received",
              thread_id: "th_thomas",
              actor_id: "thomas",
              content: "On démarre ?",
            },
          },
        ],
      }),
    ]);
    const session = initializeSessionV3(scenario, T0);
    session.currentStepIndex = 1;
    session.lastObservation = { criteria: { c1: true } };

    const r = enterStep(session, { now: T0 + 10_000 });
    expect(session.workspace.stepStartedAt).toBe(T0 + 10_000);
    expect(session.lastObservation).toBeNull();
    expect(session.workspace.threads.th_thomas.participants).toEqual(["thomas"]);
    expect(session.workspace.toolStates).toHaveProperty("contrat", null);
    expect(session.workspace.threads.th_thomas.messages[0]).toMatchObject({
      from: "actor",
      actor_id: "thomas",
      content: "On démarre ?",
    });
    expect(session.firedEvents).toEqual(["s2:e_kickoff"]);
    expect(r.completionFired).toBe(false);
  });

  it("idempotent sur les structures : un fil existant garde ses messages", () => {
    const session = boot();
    session.workspace.threads.th_alex.messages.push({ at: T0, from: "player", content: "x" });
    enterStep(session, { now: T0 + 1 });
    expect(session.workspace.threads.th_alex.messages).toHaveLength(1);
  });

  it("un trigger déjà satisfait à l'entrée tire immédiatement (document déjà lu)", () => {
    const scenario = makeScenario([
      makeStep({ step_id: "s1" }),
      makeStep({
        step_id: "s2",
        completion: { trigger: { type: "document_opened", document_id: "doc_pack" } },
      }),
    ]);
    const session = initializeSessionV3(scenario, T0);
    enterStep(session, { now: T0 });
    applyWorkspaceAction(session, { type: "document_opened", document_id: "doc_pack" }, { now: T0 + 1 });
    session.currentStepIndex = 1;
    const r = enterStep(session, { now: T0 + 2 });
    expect(r.completionFired).toBe(true);
    expect(r.effects).toContainEqual({ kind: "evaluate_step" });
  });
});
