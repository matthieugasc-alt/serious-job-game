/**
 * Chantiers A/B/C — sorties multiples et routage (rollback), acteurs
 * dynamiques (bind_actor), scoring IA à seuil (mail_scored, score
 * mocké via recordMailScore). Moteur pur, specs factices.
 */

import { describe, it, expect } from "vitest";
import type {
  ScenarioV3,
  StepExit,
  StepInvocationV3,
  WorkspaceAction,
} from "../workspace";
import { initializeSessionV3, getCurrentStepV3 } from "../sessionV3";
import type { SessionV3State } from "../sessionV3";
import {
  applyWorkspaceAction,
  completeStepV3,
  enterStep,
  recordMailScore,
  resolveStepParamsV3,
} from "../workspaceReducer";
import { FAKE_DIRECTIVES, makeScenario, makeStep } from "./v3.fixtures";

const T0 = 1_000_000;
const OPTS = { specs: FAKE_DIRECTIVES };
const opts = (now: number) => ({ now, ...OPTS });

function boot(scenario: ScenarioV3, now = T0): SessionV3State {
  const session = initializeSessionV3(scenario, now);
  enterStep(session, opts(now));
  return session;
}

const dispatch = (session: SessionV3State, action: WorkspaceAction, now: number) =>
  applyWorkspaceAction(session, action, opts(now));

const manual = (label: string): WorkspaceAction => ({ type: "manual_trigger", label });

function withExits(
  exits: StepExit[],
  completionExtra: Partial<StepInvocationV3["completion"]> = {},
  stepExtra: Partial<StepInvocationV3> = {},
): ScenarioV3 {
  return makeScenario([
    makeStep({
      step_id: "s1",
      threads: [{ thread_id: "th_alex", participants: ["alex"] }],
      tools: [{ tool: "notes" }],
      completion: { exits, ...completionExtra },
      ...stepExtra,
    }),
    makeStep({ step_id: "s2" }),
  ]);
}

// ═══ Chantier A — sorties multiples ═══════════════════════════════

describe("exits — premier qui tire gagne, routes", () => {
  it("le PREMIER exit dont le trigger tire gagne (ordre de déclaration)", () => {
    const session = boot(
      withExits([
        { id: "e_next", trigger: { type: "manual", label: "go" }, evaluate: false, route: "next" },
        { id: "e_end", trigger: { type: "manual", label: "go" }, evaluate: false, route: { end: "failure" } },
      ]),
    );
    const r = dispatch(session, manual("go"), T0 + 1_000);
    expect(r.completionFired).toBe(true);
    expect(session.isFinished).toBe(false); // e_end n'a PAS tiré
    expect(getCurrentStepV3(session)?.step_id).toBe("s2");
    expect(session.exitLog).toEqual([
      { at: T0 + 1_000, step_id: "s1", exit_id: "e_next", route: "next" },
    ]);
  });

  it("evaluate:false → route synchrone, aucune observation IA demandée", () => {
    const session = boot(
      withExits([
        { id: "e1", trigger: { type: "manual", label: "go" }, evaluate: false, route: "next" },
      ]),
    );
    const r = dispatch(session, manual("go"), T0 + 1_000);
    expect(r.completionFired).toBe(true);
    expect(r.effects.some((e) => e.kind === "evaluate_step")).toBe(false);
    expect(r.effects.some((e) => e.kind === "observe_step")).toBe(false);
    expect(getCurrentStepV3(session)?.step_id).toBe("s2");
    // Route directe : pas de verdict enregistré (choix du rédacteur).
    expect(session.stepResults.s1).toBeUndefined();
  });

  it("evaluate (défaut) → evaluate_step avec exit_id, anti double tir, verdict puis route", () => {
    const session = boot(
      withExits([{ id: "e1", trigger: { type: "manual", label: "go" }, route: "next" }]),
    );
    const r1 = dispatch(session, manual("go"), T0 + 1_000);
    expect(r1.completionFired).toBe(true);
    expect(r1.effects).toContainEqual({ kind: "evaluate_step", exit_id: "e1" });
    expect(session.pendingExitId).toBe("e1");
    expect(getCurrentStepV3(session)?.step_id).toBe("s1"); // rien ne bouge avant verdict

    // Sortie en attente de verdict : rien ne re-tire.
    const r2 = dispatch(session, manual("go"), T0 + 2_000);
    expect(r2.completionFired).toBe(false);
    expect(r2.effects.filter((e) => e.kind === "evaluate_step")).toHaveLength(0);

    // Verdict (même en ÉCHEC, la route déclarée s'applique — pas de on_failure).
    const v = completeStepV3(session, { criteria: { c1: false } }, { out: 1 }, opts(T0 + 3_000), "e1");
    expect(v.outcome).toBe("advanced");
    expect(session.pendingExitId).toBeNull();
    expect(session.stepResults.s1.passed).toBe(false); // verdict enregistré (audit/endings)
    expect(getCurrentStepV3(session)?.step_id).toBe("s2");
  });

  it("route end nommée : court-circuite computeEnding", () => {
    const session = boot(
      withExits([
        { id: "e_win", trigger: { type: "manual", label: "fin" }, evaluate: false, route: { end: "success" } },
      ]),
    );
    dispatch(session, manual("fin"), T0 + 1_000);
    expect(session.isFinished).toBe(true);
    // computeEndingV3 aurait rendu "failure" (aucun step passé) : l'ending
    // NOMMÉ gagne.
    expect(session.ending?.id).toBe("success");
  });

  it("events d'exit : tirés quand CETTE sortie tire, sémantique once", () => {
    const session = boot(
      withExits([
        {
          id: "e1",
          trigger: { type: "manual", label: "go" },
          route: "next",
          events: [
            { event_id: "ev_notif", effect: { type: "notification", title: "Sortie tirée" } },
            { event_id: "ev_reply", effect: { type: "actor_reply", thread_id: "th_alex", actor_id: "alex" } },
          ],
        },
      ]),
    );
    const r = dispatch(session, manual("go"), T0 + 1_000);
    expect(session.workspace.notifications.some((n) => n.title === "Sortie tirée")).toBe(true);
    expect(r.effects).toContainEqual(
      expect.objectContaining({ kind: "actor_reply", thread_id: "th_alex", actor_id: "alex" }),
    );
    expect(session.firedEvents).toContain("s1:e1:ev_notif");
  });
});

describe("exits — goto (rollback déclaratif)", () => {
  function gotoScenario(maxGotos = 2): ScenarioV3 {
    return makeScenario([
      makeStep({
        step_id: "s1",
        threads: [{ thread_id: "th_alex", participants: ["alex"] }],
        tools: [{ tool: "notes" }],
        events: [
          {
            event_id: "e_ouverture",
            when: { type: "step_start" },
            effect: { type: "message_received", thread_id: "th_alex", actor_id: "alex", content: "On démarre." },
          },
          {
            event_id: "e_ping",
            when: { type: "step_start" },
            effect: { type: "notification", title: "Nouvelle journée" },
            once: false,
          },
        ],
      }),
      makeStep({
        step_id: "s2",
        completion: {
          exits: [
            {
              id: "retour",
              trigger: { type: "manual", label: "retour" },
              evaluate: false,
              route: { goto: "s1" },
              reset: { threads: ["th_alex"], tools: ["notes"] },
            },
            { id: "fin", trigger: { type: "manual", label: "fin" }, evaluate: false, route: "next" },
          ],
          max_gotos: maxGotos,
          on_goto_exhausted: { end: "failure" },
        },
      }),
      makeStep({ step_id: "s3" }),
    ]);
  }

  function passS1(session: SessionV3State, now: number): void {
    dispatch(session, manual("Terminer"), now); // trigger legacy de makeStep
    const v = completeStepV3(session, { criteria: { c1: true } }, {}, opts(now + 100));
    expect(v.outcome).toBe("advanced");
    expect(getCurrentStepV3(session)?.step_id).toBe("s2");
  }

  it("goto : reset déclaratif, events step_start non rejoués (sauf once:false), compteurs réarmés", () => {
    const session = boot(gotoScenario());
    expect(session.workspace.threads.th_alex.messages).toHaveLength(1); // e_ouverture
    expect(session.workspace.notifications.filter((n) => n.title === "Nouvelle journée")).toHaveLength(1);

    passS1(session, T0 + 1_000);
    // Le joueur salit l'état pendant s2.
    dispatch(session, { type: "message_sent", thread_id: "th_alex", content: "brouillon" }, T0 + 2_000);
    dispatch(session, { type: "tool_state_changed", tool_id: "notes", state: { text: "x" } }, T0 + 3_000);

    const r = dispatch(session, manual("retour"), T0 + 4_000);
    expect(r.completionFired).toBe(true);
    expect(getCurrentStepV3(session)?.step_id).toBe("s1");
    // Reset : fil vidé, tool réinitialisé.
    expect(session.workspace.threads.th_alex.messages).toEqual([]);
    expect(session.workspace.toolStates.notes).toBeNull();
    // step_start `once` (défaut) NE se rejoue PAS ; once:false se rejoue.
    expect(session.workspace.notifications.filter((n) => n.title === "Nouvelle journée")).toHaveLength(2);
    // Compteurs réarmés (pattern attemptStartedIndex) + horloge du step.
    expect(session.attemptStartedIndex).toBe(session.actionLog.length);
    expect(session.workspace.stepStartedAt).toBe(T0 + 4_000);
    // Audit : goto journalisé + compteur.
    expect(session.gotoCounts.s2).toBe(1);
    expect(session.exitLog).toContainEqual({
      at: T0 + 4_000,
      step_id: "s2",
      exit_id: "retour",
      route: "goto:s1",
    });
    // L'ancien manual "Terminer" (s1, tentative précédente) ne re-tire pas.
    expect(dispatch(session, { type: "clock_tick", now: T0 + 5_000 }, T0 + 5_000).completionFired).toBe(false);
  });

  it("max_gotos dépassé → on_goto_exhausted (end obligatoire)", () => {
    const session = boot(gotoScenario(1));
    passS1(session, T0 + 1_000);
    dispatch(session, manual("retour"), T0 + 2_000); // goto n°1 : ok
    expect(session.gotoCounts.s2).toBe(1);
    expect(session.isFinished).toBe(false);

    passS1(session, T0 + 3_000);
    dispatch(session, manual("retour"), T0 + 4_000); // goto n°2 : plafond dépassé
    expect(session.gotoCounts.s2).toBe(2);
    expect(session.isFinished).toBe(true);
    expect(session.ending?.id).toBe("failure");
    expect(session.exitLog[session.exitLog.length - 1].route).toMatch(/max_gotos 1 dépassé/);
  });
});

// ═══ Chantier B — acteurs dynamiques (bind_actor) ═════════════════

describe("bindings — bout-en-bout", () => {
  function bindingScenario(): ScenarioV3 {
    return makeScenario([
      makeStep({
        step_id: "s1",
        completion: {
          exits: [
            {
              id: "choix",
              trigger: {
                type: "any",
                of: [
                  { type: "mail_sent", to: "alex" },
                  { type: "mail_sent", to: "thomas" },
                ],
                bind_actor: "partenaire",
              },
              evaluate: false,
              route: "next",
              events: [
                {
                  event_id: "ev_reponse",
                  effect: { type: "mail_received", from_actor: "partenaire", subject: "Re", body: "Bien reçu." },
                },
              ],
            },
          ],
        },
      }),
      makeStep({
        step_id: "s2",
        threads: [{ thread_id: "th_p", participants: ["partenaire"] }],
        completion: { trigger: { type: "message_sent", to_actor: "partenaire" } },
      }),
    ]);
  }

  it("any + bind_actor : le destinataire effectif est lié, résolu partout ensuite", () => {
    const session = boot(bindingScenario());
    const r = dispatch(
      session,
      { type: "mail_sent", to: ["thomas"], subject: "Prospection", body: "…" },
      T0 + 1_000,
    );
    expect(r.completionFired).toBe(true);
    expect(session.actorBindings).toEqual({ partenaire: "thomas" });
    // Event d'exit : from_actor résolu AVANT insertion (jamais d'alias dans l'état).
    expect(session.workspace.mailbox.inbox[0].from).toBe("thomas");
    // s2 : le fil est créé avec l'acteur RÉEL.
    expect(getCurrentStepV3(session)?.step_id).toBe("s2");
    expect(session.workspace.threads.th_p.participants).toEqual(["thomas"]);
    // Trigger de s2 : l'alias se résout au runtime.
    const done = dispatch(session, { type: "message_sent", thread_id: "th_p", content: "hello" }, T0 + 2_000);
    expect(done.completionFired).toBe(true);
    // Réponse d'acteur automatique : id réel, jamais l'alias.
    expect(done.effects).toContainEqual(
      expect.objectContaining({ kind: "actor_reply", actor_id: "thomas" }),
    );
  });

  it("resolveStepParamsV3 : params actor_id / *_actor résolus via bindings", () => {
    const session = boot(bindingScenario());
    dispatch(session, { type: "mail_sent", to: ["alex"], subject: "s", body: "b" }, T0 + 1_000);
    expect(session.actorBindings.partenaire).toBe("alex");
    expect(
      resolveStepParamsV3(session, { actor_id: "partenaire", coach_actor: "partenaire", autre: "x" }),
    ).toEqual({ actor_id: "alex", coach_actor: "alex", autre: "x" });
    // Sans binding : params rendus tels quels (même référence).
    const params = { instructions: "y" };
    expect(resolveStepParamsV3(session, params)).toBe(params);
  });

  it("trigger legacy avec bind_actor : le binding est posé au tir", () => {
    const scenario = makeScenario([
      makeStep({
        step_id: "s1",
        completion: { trigger: { type: "mail_sent", bind_actor: "dest" } },
      }),
      makeStep({ step_id: "s2" }),
    ]);
    const session = boot(scenario);
    const r = dispatch(session, { type: "mail_sent", to: ["thomas"], subject: "s", body: "b" }, T0 + 1_000);
    expect(r.completionFired).toBe(true);
    expect(session.actorBindings.dest).toBe("thomas");
  });

  it("alias non résolu au runtime : throw explicite à la création du fil", () => {
    const scenario = makeScenario([
      makeStep({ step_id: "s1" }),
      makeStep({
        step_id: "s2",
        threads: [{ thread_id: "th_g", participants: ["ghost_alias"] }],
      }),
    ]);
    const session = boot(scenario);
    dispatch(session, manual("Terminer"), T0 + 1_000);
    expect(() =>
      completeStepV3(session, { criteria: { c1: true } }, {}, opts(T0 + 2_000)),
    ).toThrow(/ghost_alias/);
  });
});

// ═══ Chantier C — scoring IA à seuil (score mocké) ════════════════

describe("mail_scored / mail_scored_below — mécanique prospection", () => {
  function scoringScenario(): ScenarioV3 {
    return makeScenario([
      makeStep({
        step_id: "s1",
        scoring: { brief: "Qualité du mail de prospection : accroche, personnalisation, appel à l'action.", scale: 10 },
        completion: {
          exits: [
            {
              id: "garde",
              trigger: { type: "mail_sent", min_count: 3 },
              evaluate: false,
              route: { end: "failure" },
            },
            {
              id: "gagne",
              trigger: { type: "mail_scored", to: "thomas", min_score: 7 },
              evaluate: false,
              route: "next",
              events: [
                { event_id: "ev_ok", effect: { type: "notification", title: "Réponse enthousiaste" } },
              ],
            },
            {
              id: "perd",
              trigger: { type: "mail_scored_below", to: "thomas", min_score: 7 },
              evaluate: false,
              route: { goto: "s1" },
              events: [
                { event_id: "ev_ko", effect: { type: "notification", title: "Réponse négative" }, once: false },
              ],
            },
          ],
          max_gotos: 3,
          on_goto_exhausted: { end: "failure" },
        },
      }),
      makeStep({ step_id: "s2" }),
    ]);
  }

  it("mail envoyé → effet score_mail ; score sous le seuil → exit négatif (goto) ; au-dessus → exit positif", () => {
    const session = boot(scoringScenario());

    // 1er mail : la notation est demandée, rien ne tire encore.
    const send1 = dispatch(session, { type: "mail_sent", to: ["thomas"], subject: "Essai", body: "…" }, T0 + 1_000);
    expect(send1.completionFired).toBe(false);
    expect(send1.effects).toContainEqual({ kind: "score_mail", mail_id: "mail_out_1" });

    // Score mocké 5/10 (< 7) → mail_scored_below tire → goto s1 (rejouer).
    const low = recordMailScore(session, "mail_out_1", 5, 10, "Accroche faible.", opts(T0 + 2_000));
    expect(low.completionFired).toBe(true);
    expect(getCurrentStepV3(session)?.step_id).toBe("s1");
    expect(session.gotoCounts.s1).toBe(1);
    expect(session.workspace.notifications.some((n) => n.title === "Réponse négative")).toBe(true);
    // Journalisé pour l'audit — jamais montré au joueur.
    expect(session.mailScores).toHaveLength(1);
    expect(session.mailScores[0]).toMatchObject({ mail_id: "mail_out_1", score: 5, scale: 10 });

    // Nouvelle tentative : l'ancien score ne compte plus (pas de re-tir).
    const tick = dispatch(session, { type: "clock_tick", now: T0 + 3_000 }, T0 + 3_000);
    expect(tick.completionFired).toBe(false);

    // 2e mail, score 9/10 → mail_scored tire → route next.
    const send2 = dispatch(session, { type: "mail_sent", to: ["thomas"], subject: "V2", body: "…" }, T0 + 4_000);
    expect(send2.effects).toContainEqual({ kind: "score_mail", mail_id: "mail_out_2" });
    const high = recordMailScore(session, "mail_out_2", 9, 10, "Excellent ciblage.", opts(T0 + 5_000));
    expect(high.completionFired).toBe(true);
    expect(getCurrentStepV3(session)?.step_id).toBe("s2");
    expect(session.workspace.notifications.some((n) => n.title === "Réponse enthousiaste")).toBe(true);
  });

  it("exit de garde déterministe : mail_sent{min_count} court-circuite le scoring", () => {
    const session = boot(scoringScenario());
    dispatch(session, { type: "mail_sent", to: ["thomas"], subject: "1", body: "…" }, T0 + 1_000);
    dispatch(session, { type: "mail_sent", to: ["thomas"], subject: "2", body: "…" }, T0 + 2_000);
    const r3 = dispatch(session, { type: "mail_sent", to: ["thomas"], subject: "3", body: "…" }, T0 + 3_000);
    expect(r3.completionFired).toBe(true); // garde (3 mails) tire AVANT tout score
    expect(session.isFinished).toBe(true);
    expect(session.ending?.id).toBe("failure");
  });

  it("recordMailScore est idempotent par mail_id et inerte hors step scoré", () => {
    const session = boot(scoringScenario());
    dispatch(session, { type: "mail_sent", to: ["thomas"], subject: "1", body: "…" }, T0 + 1_000);
    recordMailScore(session, "mail_out_1", 9, 10, undefined, opts(T0 + 2_000));
    recordMailScore(session, "mail_out_1", 2, 10, undefined, opts(T0 + 3_000)); // rejoué : ignoré
    expect(session.mailScores).toHaveLength(1);
    expect(session.mailScores[0].score).toBe(9);
  });
});
