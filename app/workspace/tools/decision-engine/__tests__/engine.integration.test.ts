/**
 * Intégration moteur ↔ decision-engine : le reducer moteur journalise
 * chaque tool_op PUIS délègue à applyDecisionOp (toolAppliers). Les
 * décisions vivent dans toolStates["decision-engine"], persistent à
 * travers les steps (jamais reset) et survivent au deep-save.
 */

import { describe, it, expect } from "vitest";
import type { ScenarioV3, StepInvocationV3, WorkspaceAction } from "@/app/lib/engine/workspace";
import {
  initializeSessionV3,
  getCurrentStepV3,
  restoreSessionV3,
  serializeSessionV3,
  type SessionV3State,
} from "@/app/lib/engine/sessionV3";
import { applyWorkspaceAction, completeStepV3, enterStep } from "@/app/lib/engine/workspaceReducer";
import { DECISION_ENGINE_TOOL_ID, weightedScoreOf } from "../spec";
import { applyDecisionOp } from "../model";
import { addCriterion, addOption, createDecision, getDecisionById, scoreOption } from "../api";

const T0 = 3_000_000;
const OPTS = { toolAppliers: { [DECISION_ENGINE_TOOL_ID]: applyDecisionOp } };

function makeStep(partial: Partial<StepInvocationV3> & { step_id: string }): StepInvocationV3 {
  return {
    mechanic: "m_test",
    params: {},
    completion: { trigger: { type: "manual", label: "Terminer" } },
    evaluation: { observed_criteria: [{ id: "c1", description: "c1", severity: "required" }] },
    completion_rules: { required_criteria: ["c1"] },
    ...partial,
  };
}

function boot(): SessionV3State {
  const scenario: ScenarioV3 = {
    format: "v3",
    scenario_id: "test_decision",
    version: "1.0.0",
    locale: "fr-FR",
    meta: { title: "t", description: "d" },
    actors: [{ actor_id: "alex", name: "Alexandre", role: "associé", prompt: "p" }],
    documents: [],
    sequence: [makeStep({ step_id: "s1" }), makeStep({ step_id: "s2" })],
    endings: [{ id: "fin", label: "Fin", content: "…", default: true }],
  };
  const session = initializeSessionV3(scenario, T0);
  enterStep(session, { now: T0, ...OPTS });
  return session;
}

describe("tool_op decision-engine bout-en-bout (moteur pur)", () => {
  it("journalise les ops fines puis les applique ; score dérivé lisible", () => {
    const session = boot();
    const actions: WorkspaceAction[] = [
      createDecision({ title: "Choix CTO" }, { id: "d1", at: T0 + 1 }),
      addOption("d1", "Profil A", { id: "oa", at: T0 + 2 }),
      addOption("d1", "Profil B", { id: "ob", at: T0 + 3 }),
      addCriterion("d1", { label: "Impact", weight: 3 }, { id: "c1", at: T0 + 4 }),
      scoreOption("d1", "oa", "c1", 5, undefined, { at: T0 + 5 }),
      scoreOption("d1", "ob", "c1", 2, undefined, { at: T0 + 6 }),
    ];
    actions.forEach((a, i) => applyWorkspaceAction(session, a, { now: T0 + 1 + i, ...OPTS }));

    const ops = session.actionLog.map((e) => (e.action.type === "tool_op" ? e.action.op : e.action.type));
    expect(ops).toEqual(["decision_created", "option_added", "option_added", "criterion_added", "option_scored", "option_scored"]);

    const d = getDecisionById(session.workspace.toolStates[DECISION_ENGINE_TOOL_ID], "d1")!;
    expect(weightedScoreOf(d, "oa")).toBe(15);
    expect(weightedScoreOf(d, "ob")).toBe(6);
  });

  it("persiste à travers l'avance de step ET le deep-save (jamais reset)", () => {
    const session = boot();
    applyWorkspaceAction(session, createDecision({ title: "Persistante" }, { id: "d1", at: T0 + 1 }), { now: T0 + 1, ...OPTS });
    applyWorkspaceAction(session, { type: "manual_trigger", label: "Terminer" }, { now: T0 + 2, ...OPTS });
    completeStepV3(session, { criteria: { c1: true } }, {}, { now: T0 + 3, ...OPTS });
    expect(getCurrentStepV3(session)?.step_id).toBe("s2");
    expect(getDecisionById(session.workspace.toolStates[DECISION_ENGINE_TOOL_ID], "d1")?.title).toBe("Persistante");

    const restored = restoreSessionV3(serializeSessionV3(session));
    applyWorkspaceAction(restored, addOption("d1", "Option X", { id: "ox", at: T0 + 10 }), { now: T0 + 10, ...OPTS });
    expect(getDecisionById(restored.workspace.toolStates[DECISION_ENGINE_TOOL_ID], "d1")?.options.map((o) => o.id)).toEqual(["ox"]);
  });
});
