/**
 * Intégration moteur ↔ whiteboard : le reducer moteur journalise chaque
 * tool_op puis délègue à applyWhiteboardOp (toolAppliers). Les post-it du
 * joueur ET des coéquipiers IA (author = actor_id) coexistent ; l'état
 * survit au deep-save.
 */

import { describe, it, expect } from "vitest";
import type { ScenarioV3, StepInvocationV3, WorkspaceAction } from "@/app/lib/engine/workspace";
import {
  initializeSessionV3,
  restoreSessionV3,
  serializeSessionV3,
  type SessionV3State,
} from "@/app/lib/engine/sessionV3";
import { applyWorkspaceAction, enterStep } from "@/app/lib/engine/workspaceReducer";
import { WHITEBOARD_TOOL_ID } from "../spec";
import { applyWhiteboardOp } from "../model";
import { addNote, countNotes, selectNotesByAuthor } from "../api";

const T0 = 500_000;
const OPTS = { toolAppliers: { [WHITEBOARD_TOOL_ID]: applyWhiteboardOp } };

function boot(): SessionV3State {
  const step: StepInvocationV3 = {
    step_id: "s1",
    mechanic: "m_test",
    params: {},
    completion: { trigger: { type: "manual", label: "Terminer" } },
    evaluation: { observed_criteria: [{ id: "c1", description: "c1", severity: "required" }] },
    completion_rules: { required_criteria: ["c1"] },
  };
  const scenario: ScenarioV3 = {
    format: "v3",
    scenario_id: "test_wb",
    version: "1.0.0",
    locale: "fr-FR",
    meta: { title: "t", description: "d" },
    actors: [{ actor_id: "ines_berrada", name: "Inès", role: "PM", prompt: "p" }],
    documents: [],
    sequence: [step],
    endings: [{ id: "fin", label: "Fin", content: "…", default: true }],
  };
  const session = initializeSessionV3(scenario, T0);
  enterStep(session, { now: T0, ...OPTS });
  return session;
}

describe("tool_op whiteboard bout-en-bout", () => {
  it("journalise les post-it joueur + coéquipier IA, sélecteurs par auteur", () => {
    const session = boot();
    const actions: WorkspaceAction[] = [
      addNote({ text: "réduire l'onboarding à 3 étapes", author: "player" }, { id: "n1", at: T0 + 1 }),
      addNote({ text: "tutoriel vidéo interactif", author: "ines_berrada" }, { id: "n2", at: T0 + 2 }),
      addNote({ text: "checklist de première connexion", author: "player" }, { id: "n3", at: T0 + 3 }),
    ];
    actions.forEach((a, i) => applyWorkspaceAction(session, a, { now: T0 + 1 + i, ...OPTS }));

    const ops = session.actionLog.map((e) => (e.action.type === "tool_op" ? e.action.op : e.action.type));
    expect(ops).toEqual(["note_added", "note_added", "note_added"]);

    const state = session.workspace.toolStates[WHITEBOARD_TOOL_ID];
    expect(countNotes(state)).toBe(3);
    expect(selectNotesByAuthor(state, "player").map((n) => n.id)).toEqual(["n1", "n3"]);
    expect(selectNotesByAuthor(state, "ines_berrada").map((n) => n.id)).toEqual(["n2"]);
  });

  it("survit au deep-save", () => {
    const session = boot();
    applyWorkspaceAction(session, addNote({ text: "idée", author: "player" }, { id: "n1", at: T0 + 1 }), { now: T0 + 1, ...OPTS });
    const restored = restoreSessionV3(serializeSessionV3(session));
    expect(countNotes(restored.workspace.toolStates[WHITEBOARD_TOOL_ID])).toBe(1);
  });
});
