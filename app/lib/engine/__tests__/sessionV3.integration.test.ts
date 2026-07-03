/**
 * Intégration v3 — un scénario synthétique de 3 steps joué ENTIÈREMENT
 * par dispatch pur, sans aucune mécanique réelle (specs factices) :
 *
 *   s1 : mail de cadrage → trigger mail_sent → evaluate → advance
 *   s2 : livrable → échec → RETRY DIÉGÉTIQUE (event on_retry, pas de
 *        bannière) → nouveau livrable → passe → on_step_passed
 *   s3 : bouton manual → ending
 *
 * C'est la boucle du CONTRAT_WORKSPACE §2 : App → dispatch → moteur,
 * l'orchestrateur n'exécutant ici que des effets simulés.
 */

import { describe, it, expect } from "vitest";
import type { ScenarioV3 } from "../workspace";
import {
  initializeSessionV3,
  restoreSessionV3,
  serializeSessionV3,
  getCurrentStepV3,
} from "../sessionV3";
import {
  applyWorkspaceAction,
  completeStepV3,
  enterStep,
} from "../workspaceReducer";
import { validateScenarioV3 } from "../composerV3";
import { FAKE_DIRECTIVES, FAKE_SPECS, FAKE_TOOLS, makeScenario, makeStep } from "./v3.fixtures";

const T0 = 1_000_000;
const OPTS = { specs: FAKE_DIRECTIVES };

function buildScenario(): ScenarioV3 {
  return makeScenario([
    makeStep({
      step_id: "s1",
      mechanic: "m_analyse",
      threads: [{ thread_id: "th_alex", participants: ["alex"], title: "Alexandre" }],
      tools: [{ tool: "notes" }],
      document_ids: ["doc_pack"],
      events: [
        {
          event_id: "e_ouverture",
          when: { type: "step_start" },
          effect: {
            type: "message_received",
            thread_id: "th_alex",
            actor_id: "alex",
            content: "Salut ! Le data pack est dans Documents, dis-moi ce que tu en tires.",
          },
        },
      ],
      completion: { trigger: { type: "mail_sent", to: "thomas" } },
    }),
    makeStep({
      step_id: "s2",
      mechanic: "m_prod",
      tools: [{ tool: "notes" }],
      inputs: { analyse: "s1.findings" },
      events: [
        {
          event_id: "e_brief_thomas",
          when: { type: "step_start" },
          effect: {
            type: "mail_received",
            from_actor: "thomas",
            subject: "Specs du MVP",
            body: "Voici ce dont j'ai besoin pour chiffrer.",
          },
        },
        {
          event_id: "e_retry_alex",
          when: { type: "on_retry" },
          effect: {
            type: "message_received",
            thread_id: "th_alex",
            actor_id: "alex",
            content: "Il manque le budget — reprends ça avant de l'envoyer.",
          },
        },
        {
          event_id: "e_bravo",
          when: { type: "on_step_passed" },
          effect: { type: "notification", title: "Alexandre a validé le livrable" },
        },
      ],
      completion: { trigger: { type: "deliverable_submitted", tool: "notes" } },
    }),
    makeStep({
      step_id: "s3",
      mechanic: "m_analyse",
      completion: { trigger: { type: "manual", label: "Terminer la journée" } },
    }),
  ]);
}

describe("scénario 3 steps joué par dispatch pur", () => {
  it("le scénario synthétique est valide contre les specs factices", () => {
    expect(validateScenarioV3(buildScenario(), FAKE_SPECS, FAKE_TOOLS)).toEqual([]);
  });

  it("mail_sent → evaluate → advance → retry diégétique → ending", () => {
    const scenario = buildScenario();
    const session = initializeSessionV3(scenario, T0);

    // ── Entrée s1 : Alexandre ouvre la journée dans Messages.
    const entry = enterStep(session, { now: T0, ...OPTS });
    expect(entry.completionFired).toBe(false);
    expect(session.workspace.threads.th_alex.messages).toHaveLength(1);
    expect(session.workspace.threads.th_alex.unread).toBe(1);

    // Le joueur lit, prend des notes, écrit à Alexandre (réponse IA en attente).
    applyWorkspaceAction(session, { type: "document_opened", document_id: "doc_pack" }, { now: T0 + 1_000, ...OPTS });
    applyWorkspaceAction(session, { type: "tool_state_changed", tool_id: "notes", state: { text: "3 patterns" } }, { now: T0 + 2_000, ...OPTS });
    const chat = applyWorkspaceAction(
      session,
      { type: "message_sent", thread_id: "th_alex", content: "Je vois 3 patterns nets." },
      { now: T0 + 3_000, ...OPTS },
    );
    expect(chat.completionFired).toBe(false);
    expect(chat.effects).toEqual([
      { kind: "actor_reply", thread_id: "th_alex", actor_id: "alex", directive: "DIRECTIVE_ANALYSE" },
    ]);

    // ── Trigger s1 : mail de cadrage à Thomas.
    const send = applyWorkspaceAction(
      session,
      { type: "mail_sent", to: ["thomas"], subject: "Cadrage MVP", body: "Scope : …" },
      { now: T0 + 4_000, ...OPTS },
    );
    expect(send.completionFired).toBe(true);
    expect(send.effects).toContainEqual({ kind: "evaluate_step" });

    // L'orchestrateur évalue : observation OK → advance + step_start s2.
    const v1 = completeStepV3(
      session,
      { criteria: { c1: true } },
      { findings: "3 patterns" },
      { now: T0 + 5_000, ...OPTS },
    );
    expect(v1.outcome).toBe("advanced");
    expect(getCurrentStepV3(session)?.step_id).toBe("s2");
    expect(session.stepResults.s1.passed).toBe(true);
    // L'event step_start de s2 a livré le mail de Thomas.
    expect(session.workspace.mailbox.inbox).toHaveLength(1);
    expect(session.workspace.mailbox.inbox[0].subject).toBe("Specs du MVP");
    expect(session.workspace.stepStartedAt).toBe(T0 + 5_000);

    // ── s2 : livrable soumis → trigger.
    const submit1 = applyWorkspaceAction(
      session,
      { type: "deliverable_submitted", tool_id: "notes", payload: { body: "brouillon sans budget" } },
      { now: T0 + 6_000, ...OPTS },
    );
    expect(submit1.completionFired).toBe(true);

    // Verdict : échec → RETRY DIÉGÉTIQUE. Aucune "bannière" : l'échec
    // arrive par le monde — Alexandre écrit dans le fil.
    const beforeRetryMsgs = session.workspace.threads.th_alex.messages.length;
    const v2 = completeStepV3(
      session,
      { criteria: { c1: false } },
      { deliverable: "brouillon" },
      { now: T0 + 7_000, ...OPTS },
    );
    expect(v2.outcome).toBe("retry");
    expect(v2.effects).toEqual([]); // effet authoré : déjà inséré dans l'état
    const msgs = session.workspace.threads.th_alex.messages;
    expect(msgs).toHaveLength(beforeRetryMsgs + 1);
    expect(msgs[msgs.length - 1].content).toMatch(/manque le budget/);
    expect(getCurrentStepV3(session)?.step_id).toBe("s2"); // on ne bouge pas
    expect(session.stepResults.s2.attempts).toBe(1);

    // La tentative est réarmée : l'ancienne soumission ne re-tire pas.
    const tick = applyWorkspaceAction(session, { type: "clock_tick", now: T0 + 8_000 }, OPTS);
    expect(tick.completionFired).toBe(false);

    // Nouveau livrable → trigger → verdict passe → on_step_passed + advance.
    const submit2 = applyWorkspaceAction(
      session,
      { type: "deliverable_submitted", tool_id: "notes", payload: { body: "complet, budget inclus" } },
      { now: T0 + 9_000, ...OPTS },
    );
    expect(submit2.completionFired).toBe(true);
    const v3 = completeStepV3(
      session,
      { criteria: { c1: true } },
      { deliverable: "complet" },
      { now: T0 + 10_000, ...OPTS },
    );
    expect(v3.outcome).toBe("advanced");
    expect(session.stepResults.s2.passed).toBe(true);
    expect(session.stepResults.s2.attempts).toBe(2);
    expect(
      session.workspace.notifications.some((n) => n.title === "Alexandre a validé le livrable"),
    ).toBe(true);
    expect(getCurrentStepV3(session)?.step_id).toBe("s3");

    // ── Deep-save en cours de partie : reprise transparente.
    const restored = restoreSessionV3(serializeSessionV3(session));
    expect(restored.currentStepIndex).toBe(2);
    expect(restored.firedEvents).toEqual(
      expect.arrayContaining(["s1:e_ouverture", "s2:e_brief_thomas", "s2:e_retry_alex", "s2:e_bravo"]),
    );

    // ── s3 : bouton manual → evaluate → ending.
    const manual = applyWorkspaceAction(
      restored,
      { type: "manual_trigger", label: "Terminer la journée" },
      { now: T0 + 11_000, ...OPTS },
    );
    expect(manual.completionFired).toBe(true);
    const v4 = completeStepV3(restored, { criteria: { c1: true } }, {}, { now: T0 + 12_000, ...OPTS });
    expect(v4.outcome).toBe("ended");
    expect(restored.isFinished).toBe(true);
    expect(restored.ending?.id).toBe("success");

    // Le journal est le git blame de la partie : tout y est, dans l'ordre.
    expect(restored.actionLog.map((e) => e.action.type)).toEqual([
      "document_opened",
      "tool_state_changed",
      "message_sent",
      "mail_sent",
      "deliverable_submitted",
      "clock_tick",
      "deliverable_submitted",
      "manual_trigger",
    ]);
    expect(restored.actionLog.every((e, i, log) => i === 0 || log[i - 1].at <= e.at)).toBe(true);

    // Session finie : le dispatch devient inerte.
    const after = applyWorkspaceAction(restored, { type: "clock_tick", now: T0 + 99_000 }, OPTS);
    expect(after).toEqual({ effects: [], completionFired: false });
  });

  it("échec définitif (max_attempts) puis ending default", () => {
    const scenario = buildScenario();
    const session = initializeSessionV3(scenario, T0);
    enterStep(session, { now: T0, ...OPTS });

    applyWorkspaceAction(
      session,
      { type: "mail_sent", to: ["thomas"], subject: "s", body: "b" },
      { now: T0 + 1_000, ...OPTS },
    );
    // Deux verdicts en échec : retry puis avance (échec enregistré).
    expect(
      completeStepV3(session, { criteria: { c1: false } }, {}, { now: T0 + 2_000, ...OPTS }).outcome,
    ).toBe("retry");
    // La tentative est réarmée : il faut RENVOYER un mail pour re-tirer.
    applyWorkspaceAction(
      session,
      { type: "mail_sent", to: ["thomas"], subject: "s2", body: "b2" },
      { now: T0 + 3_000, ...OPTS },
    );
    expect(
      completeStepV3(session, { criteria: { c1: false } }, {}, { now: T0 + 4_000, ...OPTS }).outcome,
    ).toBe("advanced");
    expect(session.stepResults.s1.passed).toBe(false);

    // On termine les deux steps restants proprement.
    applyWorkspaceAction(
      session,
      { type: "deliverable_submitted", tool_id: "notes", payload: {} },
      { now: T0 + 5_000, ...OPTS },
    );
    completeStepV3(session, { criteria: { c1: true } }, {}, { now: T0 + 6_000, ...OPTS });
    applyWorkspaceAction(
      session,
      { type: "manual_trigger", label: "Terminer la journée" },
      { now: T0 + 7_000, ...OPTS },
    );
    completeStepV3(session, { criteria: { c1: true } }, {}, { now: T0 + 8_000, ...OPTS });

    expect(session.isFinished).toBe(true);
    expect(session.ending?.id).toBe("failure"); // s1 non passé → default
  });

  it("on_failure=end_scenario coupe immédiatement", () => {
    const scenario = buildScenario();
    scenario.sequence[0].on_failure = "end_scenario";
    const session = initializeSessionV3(scenario, T0);
    enterStep(session, { now: T0, ...OPTS });
    applyWorkspaceAction(
      session,
      { type: "mail_sent", to: ["thomas"], subject: "s", body: "b" },
      { now: T0 + 1_000, ...OPTS },
    );
    const v = completeStepV3(session, { criteria: { c1: false } }, {}, { now: T0 + 2_000, ...OPTS });
    expect(v.outcome).toBe("ended");
    expect(session.isFinished).toBe(true);
    expect(session.ending?.id).toBe("failure");
  });
});
