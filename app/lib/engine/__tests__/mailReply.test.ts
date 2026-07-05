/**
 * Débat par mail (Lot B) — le moteur produit un effet mail_reply quand le
 * joueur écrit à un acteur déclaré dans step.mail_actors, et rien sinon.
 */

import { describe, it, expect } from "vitest";
import type { StepInvocationV3, WorkspaceAction } from "../workspace";
import { initializeSessionV3 } from "../sessionV3";
import type { SessionV3State } from "../sessionV3";
import { applyWorkspaceAction, enterStep } from "../workspaceReducer";
import { FAKE_DIRECTIVES, makeScenario, makeStep } from "./v3.fixtures";

const T0 = 1_000_000;

function boot(mailActors: string[]): SessionV3State {
  const scenario = makeScenario([
    makeStep({ step_id: "s1", mail_actors: mailActors } as Partial<StepInvocationV3>),
    makeStep({ step_id: "s2" }),
  ]);
  const session = initializeSessionV3(scenario, T0);
  enterStep(session, { now: T0 });
  return session;
}

const dispatch = (s: SessionV3State, a: WorkspaceAction, now = T0 + 1) =>
  applyWorkspaceAction(s, a, { now, specs: FAKE_DIRECTIVES });

const sendMail = (to: string[]): WorkspaceAction => ({
  type: "mail_sent",
  to,
  subject: "Ma réponse",
  body: "Voici mes arguments.",
});

describe("mail_reply — débat par mail", () => {
  it("un mail vers un acteur de mail_actors produit un effet mail_reply", () => {
    const s = boot(["alex"]);
    const r = dispatch(s, sendMail(["alex"]));
    const replies = r.effects.filter((e) => e.kind === "mail_reply");
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({ kind: "mail_reply", actor_id: "alex", in_reply_to_subject: "Ma réponse" });
  });

  it("un mail vers un acteur NON déclaré ne produit aucune réponse", () => {
    const s = boot(["alex"]);
    const r = dispatch(s, sendMail(["someone_else"]));
    expect(r.effects.some((e) => e.kind === "mail_reply")).toBe(false);
  });

  it("sans mail_actors, aucun débat par mail", () => {
    const s = boot([]);
    const r = dispatch(s, sendMail(["alex"]));
    expect(r.effects.some((e) => e.kind === "mail_reply")).toBe(false);
  });

  it("un seul mail_reply par acteur destinataire (pas de doublon)", () => {
    const s = boot(["alex"]);
    const r = dispatch(s, sendMail(["alex", "alex"]));
    expect(r.effects.filter((e) => e.kind === "mail_reply")).toHaveLength(1);
  });
});
