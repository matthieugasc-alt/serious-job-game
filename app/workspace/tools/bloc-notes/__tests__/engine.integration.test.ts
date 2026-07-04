/**
 * Intégration moteur ↔ bloc-notes : le reducer moteur journalise chaque
 * tool_op PUIS délègue à applyNotebookOp (enregistré via toolAppliers,
 * comme le fait WorkspacePlayer depuis le TOOL_REGISTRY). Le carnet vit
 * dans toolStates["bloc-notes"], persiste à travers les steps (jamais
 * reset) et survit au deep-save.
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
import { BLOC_NOTES_TOOL_ID } from "../spec";
import { applyNotebookOp } from "../model";
import { addTag, annotate, createNote, moveTask, createTask, selectByTag, selectRecent, selectTasksByStatus } from "../api";

const T0 = 1_000_000;
const OPTS = { toolAppliers: { [BLOC_NOTES_TOOL_ID]: applyNotebookOp } };

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
    scenario_id: "test_bloc_notes",
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

describe("tool_op bloc-notes bout-en-bout (moteur pur)", () => {
  it("journalise l'op fine puis l'applique ; sélecteurs lisibles sur toolStates", () => {
    const session = boot();
    const actions: WorkspaceAction[] = [
      createNote("Analyse churn", { id: "n1", at: T0 + 1 }),
      addTag("n1", "mvp", { at: T0 + 2 }),
      annotate(
        { source: { kind: "document", document_id: "doc_pack", excerpt: "les équins partent" }, excerpt: "les équins partent", comment: "creuser" },
        { id: "a1", at: T0 + 3 },
      ),
      createTask({ title: "Recouper" }, { id: "t1", at: T0 + 4 }),
      moveTask("t1", "doing", { at: T0 + 5 }),
    ];
    actions.forEach((a, i) =>
      applyWorkspaceAction(session, a, { now: T0 + 1 + i, ...OPTS }),
    );

    // Journal : audit fin, ops lisibles ("note_created", "task_moved"…).
    const ops = session.actionLog.map((e) =>
      e.action.type === "tool_op" ? e.action.op : e.action.type,
    );
    expect(ops).toEqual(["note_created", "tag_added", "annotation_added", "task_created", "task_moved"]);

    // État appliqué, lisible par l'API publique.
    const state = session.workspace.toolStates[BLOC_NOTES_TOOL_ID];
    expect(selectRecent(state).map((n) => n.id)).toEqual(["a1", "n1"]);
    expect(selectByTag(state, "mvp").map((n) => n.id)).toEqual(["n1"]);
    expect(selectTasksByStatus(state, "doing").map((t) => t.id)).toEqual(["t1"]);
  });

  it("persiste à travers l'avance de step ET le deep-save (jamais reset)", () => {
    const session = boot();
    applyWorkspaceAction(session, createNote("Persistante", { id: "n1", at: T0 + 1 }), { now: T0 + 1, ...OPTS });
    applyWorkspaceAction(session, { type: "manual_trigger", label: "Terminer" }, { now: T0 + 2, ...OPTS });
    completeStepV3(session, { criteria: { c1: true } }, {}, { now: T0 + 3, ...OPTS });
    expect(getCurrentStepV3(session)?.step_id).toBe("s2");
    expect(selectRecent(session.workspace.toolStates[BLOC_NOTES_TOOL_ID])[0]?.title).toBe("Persistante");

    // Deep-save : JSON.stringify → restore → le carnet continue de vivre.
    const restored = restoreSessionV3(serializeSessionV3(session));
    applyWorkspaceAction(restored, addTag("n1", "mvp", { at: T0 + 10 }), { now: T0 + 10, ...OPTS });
    expect(selectByTag(restored.workspace.toolStates[BLOC_NOTES_TOOL_ID], "mvp").map((n) => n.id)).toEqual(["n1"]);
  });

  it("op inconnue → no-op journalisé (le carnet ne bouge pas, le journal si)", () => {
    const session = boot();
    applyWorkspaceAction(session, createNote("N", { id: "n1", at: T0 + 1 }), { now: T0 + 1, ...OPTS });
    const before = JSON.stringify(session.workspace.toolStates[BLOC_NOTES_TOOL_ID]);
    applyWorkspaceAction(
      session,
      { type: "tool_op", tool_id: BLOC_NOTES_TOOL_ID, op: "note_exploded", payload: { note_id: "n1" } },
      { now: T0 + 2, ...OPTS },
    );
    expect(JSON.stringify(session.workspace.toolStates[BLOC_NOTES_TOOL_ID])).toBe(before);
    expect(session.actionLog).toHaveLength(2);
  });
});
