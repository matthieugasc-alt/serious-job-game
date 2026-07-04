/**
 * Intégration moteur ↔ bibliotheque : le reducer moteur journalise chaque
 * tool_op PUIS délègue à applyLibraryOp (enregistré via toolAppliers,
 * comme le fait WorkspacePlayer depuis le TOOL_REGISTRY). Le dossier vit
 * dans toolStates["bibliotheque"], persiste à travers les steps (jamais
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
import { BIBLIOTHEQUE_TOOL_ID } from "../spec";
import { applyLibraryOp } from "../model";
import {
  addHighlight,
  archiveMail,
  indexScenarioDoc,
  openEntry,
  selectEntry,
  selectOpenWindows,
  selectRecent,
} from "../api";

const T0 = 2_000_000;
const OPTS = { toolAppliers: { [BIBLIOTHEQUE_TOOL_ID]: applyLibraryOp } };

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
    scenario_id: "test_bibliotheque",
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

describe("tool_op bibliotheque bout-en-bout (moteur pur)", () => {
  it("journalise l'op fine puis l'applique ; sélecteurs lisibles sur toolStates", () => {
    const session = boot();
    const actions: WorkspaceAction[] = [
      indexScenarioDoc("doc_pack", "Data pack", { id: "e1", at: T0 + 1 }),
      archiveMail(
        { mail_id: "mail_3", snapshot: { from: "cfo", to: ["player"], subject: "Budget", body: "runway", at: T0 } },
        { id: "e2", at: T0 + 2 },
      ),
      openEntry("e1", { at: T0 + 3 }),
      addHighlight("e1", { anchor: "0:9", excerpt: "les équins partent" }, { id: "a1", at: T0 + 4 }),
    ];
    actions.forEach((a, i) => applyWorkspaceAction(session, a, { now: T0 + 1 + i, ...OPTS }));

    // Journal : audit fin, ops lisibles.
    const ops = session.actionLog.map((e) =>
      e.action.type === "tool_op" ? e.action.op : e.action.type,
    );
    expect(ops).toEqual(["scenario_doc_indexed", "mail_archived", "entry_opened", "highlight_added"]);

    const state = session.workspace.toolStates[BIBLIOTHEQUE_TOOL_ID];
    expect(selectRecent(state).map((e) => e.id)).toEqual(["e1", "e2"]); // e1 ouvert le plus récemment
    expect(selectOpenWindows(state).map((e) => e.id)).toEqual(["e1"]);
    expect(selectEntry(state, "e1")?.annotations.map((a) => a.id)).toEqual(["a1"]);
  });

  it("persiste à travers l'avance de step ET le deep-save (jamais reset)", () => {
    const session = boot();
    applyWorkspaceAction(session, indexScenarioDoc("d1", "Persistant", { id: "e1", at: T0 + 1 }), {
      now: T0 + 1,
      ...OPTS,
    });
    applyWorkspaceAction(session, { type: "manual_trigger", label: "Terminer" }, { now: T0 + 2, ...OPTS });
    completeStepV3(session, { criteria: { c1: true } }, {}, { now: T0 + 3, ...OPTS });
    expect(getCurrentStepV3(session)?.step_id).toBe("s2");
    expect(selectEntry(session.workspace.toolStates[BIBLIOTHEQUE_TOOL_ID], "e1")?.title).toBe("Persistant");

    // Deep-save : JSON.stringify → restore → le dossier continue de vivre.
    const restored = restoreSessionV3(serializeSessionV3(session));
    applyWorkspaceAction(restored, addHighlight("e1", { anchor: "1:2", excerpt: "clause" }, { id: "a9", at: T0 + 10 }), {
      now: T0 + 10,
      ...OPTS,
    });
    expect(
      selectEntry(restored.workspace.toolStates[BIBLIOTHEQUE_TOOL_ID], "e1")?.annotations.map((a) => a.id),
    ).toEqual(["a9"]);
  });

  it("op inconnue → no-op journalisé (le dossier ne bouge pas, le journal si)", () => {
    const session = boot();
    applyWorkspaceAction(session, indexScenarioDoc("d1", "N", { id: "e1", at: T0 + 1 }), { now: T0 + 1, ...OPTS });
    const before = JSON.stringify(session.workspace.toolStates[BIBLIOTHEQUE_TOOL_ID]);
    applyWorkspaceAction(
      session,
      { type: "tool_op", tool_id: BIBLIOTHEQUE_TOOL_ID, op: "entry_vaporized", payload: { entry_id: "e1" } },
      { now: T0 + 2, ...OPTS },
    );
    expect(JSON.stringify(session.workspace.toolStates[BIBLIOTHEQUE_TOOL_ID])).toBe(before);
    expect(session.actionLog).toHaveLength(2);
  });
});
