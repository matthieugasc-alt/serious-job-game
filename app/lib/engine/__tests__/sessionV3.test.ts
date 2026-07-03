/**
 * Session v3 — initialisation, sérialisation, restauration, clone.
 */

import { describe, it, expect } from "vitest";
import {
  initializeSessionV3,
  cloneSessionV3,
  serializeSessionV3,
  restoreSessionV3,
  getCurrentStepV3,
  computeEndingV3,
} from "../sessionV3";
import { makeScenario, makeStep } from "./v3.fixtures";

const T0 = 1_000_000;

function scenario() {
  return makeScenario([
    makeStep({
      step_id: "s1",
      threads: [{ thread_id: "th_alex", participants: ["alex"], title: "Alexandre" }],
      tools: [{ tool: "notes" }],
    }),
    makeStep({
      step_id: "s2",
      threads: [{ thread_id: "th_thomas", participants: ["thomas"] }],
    }),
  ]);
}

describe("initializeSessionV3", () => {
  it("construit le WorkspaceState initial du step 1", () => {
    const session = initializeSessionV3(scenario(), T0);

    expect(session.format).toBe("session_v3");
    expect(session.scenarioId).toBe("test_v3");
    expect(session.currentStepIndex).toBe(0);
    expect(getCurrentStepV3(session)?.step_id).toBe("s1");

    // Threads du step 1 uniquement — pas ceux des steps suivants.
    expect(Object.keys(session.workspace.threads)).toEqual(["th_alex"]);
    expect(session.workspace.threads.th_alex.participants).toEqual(["alex"]);
    expect(session.workspace.threads.th_alex.messages).toEqual([]);
    expect(session.workspace.threads.th_alex.unread).toBe(0);

    // TOUS les documents du scénario, non ouverts.
    expect(session.workspace.documents).toEqual({
      doc_pack: { opened: false, annotations: [] },
    });

    // Tools du step 1 : placeholder null (initialState vit côté UI).
    expect(session.workspace.toolStates).toEqual({ notes: null });

    // Horloges.
    expect(session.workspace.scenarioStartedAt).toBe(T0);
    expect(session.workspace.stepStartedAt).toBe(T0);
    expect(session.realStartTime).toBe(T0);

    // Journal et suivi vierges.
    expect(session.actionLog).toEqual([]);
    expect(session.firedEvents).toEqual([]);
    expect(session.lastObservation).toBeNull();
    expect(session.attemptStartedIndex).toBe(0);
    expect(session.isFinished).toBe(false);
    expect(session.ending).toBeNull();
    expect(session.workspace.mailbox).toEqual({ inbox: [], sent: [], drafts: {} });
    expect(session.workspace.notifications).toEqual([]);
  });
});

describe("serialize / restore / clone", () => {
  it("deep-save symétrique", () => {
    const session = initializeSessionV3(scenario(), T0);
    session.actionLog.push({
      at: T0 + 1,
      step_id: "s1",
      action: { type: "document_opened", document_id: "doc_pack" },
    });
    const restored = restoreSessionV3(serializeSessionV3(session));
    expect(restored).toEqual(session);
  });

  it("restore refuse un snapshot d'un autre format", () => {
    expect(() => restoreSessionV3(JSON.stringify({ format: "session_v2" }))).toThrow(
      /session_v3/,
    );
  });

  it("clone profond : muter le clone ne touche pas l'original", () => {
    const session = initializeSessionV3(scenario(), T0);
    const clone = cloneSessionV3(session);
    clone.workspace.threads.th_alex.messages.push({
      at: T0,
      from: "player",
      content: "x",
    });
    clone.firedEvents.push("s1:e1");
    expect(session.workspace.threads.th_alex.messages).toEqual([]);
    expect(session.firedEvents).toEqual([]);
  });
});

describe("computeEndingV3", () => {
  it("première règle qui matche, sinon default", () => {
    const session = initializeSessionV3(scenario(), T0);
    expect(computeEndingV3(session)?.id).toBe("failure"); // rien passé → default

    for (const id of ["s1", "s2"]) {
      session.stepResults[id] = {
        stepId: id,
        mechanic: "m_analyse",
        evaluation: {} as never,
        output: {},
        attempts: 1,
        passed: true,
      };
    }
    expect(computeEndingV3(session)?.id).toBe("success");
  });
});
