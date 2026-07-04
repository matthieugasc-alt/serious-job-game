/**
 * Extension moteur générique `tool_op` (TOOL_BLOC_NOTES.md §2) :
 *   - journalisation AVANT application, payload intact (audit fin) ;
 *   - délégation au reducer PUR enregistré (opts.toolAppliers) — le
 *     moteur reste 100 % ignorant des ops ;
 *   - no-op journalisé défensif : tool sans applier, applier qui throw ;
 *   - persistance de toolStates à travers les steps (jamais reset par
 *     enterStep) et à travers un goto qui reset d'AUTRES tools ;
 *   - validation composer : bloc-notes interdit dans exits.reset.tools
 *     (TOOL_RESET_FORBIDDEN).
 * Le moteur se teste avec des appliers FACTICES — aucun tool réel ici.
 */

import { describe, it, expect } from "vitest";
import type { Json, JsonObject } from "../mechanics";
import type { ToolOpApplier, WorkspaceAction } from "../workspace";
import { initializeSessionV3, getCurrentStepV3 } from "../sessionV3";
import type { SessionV3State } from "../sessionV3";
import { applyWorkspaceAction, completeStepV3, enterStep } from "../workspaceReducer";
import { validateScenarioV3 } from "../composerV3";
import { FAKE_DIRECTIVES, FAKE_SPECS, FAKE_TOOLS, makeScenario, makeStep } from "./v3.fixtures";

const T0 = 1_000_000;

/** Applier factice : compteur — op "inc" {by}, toute autre op = no-op. */
const counterApplier: ToolOpApplier = (state, op, payload) => {
  if (op !== "inc") return state;
  const count =
    state && typeof state === "object" && !Array.isArray(state)
      ? Number((state as JsonObject).count ?? 0)
      : 0;
  const by = typeof payload.by === "number" ? payload.by : 1;
  return { count: count + by };
};

const brokenApplier: ToolOpApplier = () => {
  throw new Error("applier cassé");
};

const APPLIERS: Record<string, ToolOpApplier> = {
  compteur: counterApplier,
  casse: brokenApplier,
};

const OPTS = { specs: FAKE_DIRECTIVES, toolAppliers: APPLIERS };

function boot(stepPartial: Parameters<typeof makeStep>[0] = { step_id: "s1" }): SessionV3State {
  const scenario = makeScenario([
    makeStep({
      threads: [{ thread_id: "th_alex", participants: ["alex"] }],
      tools: [{ tool: "notes" }],
      ...stepPartial,
    }),
    makeStep({ step_id: "s2" }),
  ]);
  const session = initializeSessionV3(scenario, T0);
  enterStep(session, { now: T0, ...OPTS });
  return session;
}

const toolOp = (tool_id: string, op: string, payload: JsonObject = {}): WorkspaceAction => ({
  type: "tool_op",
  tool_id,
  op,
  payload,
});

describe("tool_op — journalisation puis application", () => {
  it("journalise l'op (tool_id, op, payload intacts) PUIS applique le reducer enregistré", () => {
    const session = boot();
    const r = applyWorkspaceAction(session, toolOp("compteur", "inc", { by: 3 }), {
      now: T0 + 5,
      ...OPTS,
    });
    expect(session.actionLog).toHaveLength(1);
    expect(session.actionLog[0]).toEqual({
      at: T0 + 5,
      step_id: "s1",
      action: { type: "tool_op", tool_id: "compteur", op: "inc", payload: { by: 3 } },
    });
    expect(session.workspace.toolStates.compteur).toEqual({ count: 3 });
    // Pas une action « significative » : aucune observation demandée.
    expect(r.effects).toEqual([]);
    expect(r.completionFired).toBe(false);
  });

  it("les ops s'enchaînent sur l'état courant du tool", () => {
    const session = boot();
    applyWorkspaceAction(session, toolOp("compteur", "inc"), { now: T0 + 1, ...OPTS });
    applyWorkspaceAction(session, toolOp("compteur", "inc", { by: 10 }), { now: T0 + 2, ...OPTS });
    expect(session.workspace.toolStates.compteur).toEqual({ count: 11 });
  });

  it("op inconnue de l'applier : état inchangé, op quand même journalisée", () => {
    const session = boot();
    applyWorkspaceAction(session, toolOp("compteur", "inc"), { now: T0 + 1, ...OPTS });
    applyWorkspaceAction(session, toolOp("compteur", "explose", { x: 1 }), { now: T0 + 2, ...OPTS });
    expect(session.workspace.toolStates.compteur).toEqual({ count: 1 });
    expect(session.actionLog).toHaveLength(2);
    expect(session.actionLog[1].action).toMatchObject({ op: "explose" });
  });

  it("tool sans applier enregistré : no-op journalisé défensif", () => {
    const session = boot();
    applyWorkspaceAction(session, toolOp("inconnu", "inc"), { now: T0 + 1, ...OPTS });
    expect(session.workspace.toolStates.inconnu).toBeUndefined();
    expect(session.actionLog).toHaveLength(1);
  });

  it("aucun toolAppliers passé (opts nus) : no-op journalisé, jamais de crash", () => {
    const session = boot();
    applyWorkspaceAction(session, toolOp("compteur", "inc"), { now: T0 + 1 });
    expect(session.workspace.toolStates.compteur).toBeUndefined();
    expect(session.actionLog).toHaveLength(1);
  });

  it("applier qui throw : no-op défensif, le dispatch ne casse jamais", () => {
    const session = boot();
    expect(() =>
      applyWorkspaceAction(session, toolOp("casse", "boom"), { now: T0 + 1, ...OPTS }),
    ).not.toThrow();
    expect(session.workspace.toolStates.casse).toBeUndefined();
    expect(session.actionLog).toHaveLength(1);
  });

  it("le tool n'a pas besoin d'être déclaré dans step.tools (carnet universel)", () => {
    const session = boot();
    expect("compteur" in session.workspace.toolStates).toBe(false);
    applyWorkspaceAction(session, toolOp("compteur", "inc"), { now: T0 + 1, ...OPTS });
    expect(session.workspace.toolStates.compteur).toEqual({ count: 1 });
  });

  it("event after_action: tool_op tire (mise en scène possible)", () => {
    const session = boot({
      step_id: "s1",
      events: [
        {
          event_id: "ev_note",
          when: { type: "after_action", action: "tool_op" },
          effect: { type: "notification", title: "Bien noté" },
        },
      ],
    });
    applyWorkspaceAction(session, toolOp("compteur", "inc"), { now: T0 + 1, ...OPTS });
    expect(session.workspace.notifications.map((n) => n.title)).toContain("Bien noté");
  });
});

describe("tool_op — persistance à travers les steps (jamais reset)", () => {
  it("l'état du tool SURVIT à l'avance de step (enterStep n'écrase jamais)", () => {
    const session = boot();
    applyWorkspaceAction(session, toolOp("compteur", "inc", { by: 7 }), { now: T0 + 1, ...OPTS });
    applyWorkspaceAction(session, { type: "manual_trigger", label: "Terminer" }, { now: T0 + 2, ...OPTS });
    completeStepV3(session, { criteria: { c1: true } }, {}, { now: T0 + 3, ...OPTS });
    expect(getCurrentStepV3(session)?.step_id).toBe("s2");
    expect(session.workspace.toolStates.compteur).toEqual({ count: 7 });
  });

  it("un goto qui reset d'AUTRES tools ne touche pas le tool persistant", () => {
    const scenario = makeScenario([
      makeStep({
        step_id: "s1",
        threads: [{ thread_id: "th_alex", participants: ["alex"] }],
        tools: [{ tool: "notes" }],
        completion: {
          exits: [
            {
              id: "rejoue",
              trigger: { type: "manual", label: "rejouer" },
              evaluate: false,
              route: { goto: "s1" },
              reset: { threads: ["th_alex"], tools: ["notes"] },
            },
          ],
          on_goto_exhausted: { end: "failure" },
        },
      }),
      makeStep({ step_id: "s2" }),
    ]);
    const session = initializeSessionV3(scenario, T0);
    enterStep(session, { now: T0, ...OPTS });

    applyWorkspaceAction(
      session,
      { type: "tool_state_changed", tool_id: "notes", state: { content: "brouillon" } },
      { now: T0 + 1, ...OPTS },
    );
    applyWorkspaceAction(session, toolOp("compteur", "inc", { by: 4 }), { now: T0 + 2, ...OPTS });
    applyWorkspaceAction(session, { type: "manual_trigger", label: "rejouer" }, { now: T0 + 3, ...OPTS });

    expect(getCurrentStepV3(session)?.step_id).toBe("s1"); // goto exécuté
    expect(session.workspace.toolStates.notes).toBeNull(); // reset déclaré
    expect(session.workspace.toolStates.compteur).toEqual({ count: 4 }); // persistant
  });
});

describe("tool_op — interdiction de reset validée (composerV3)", () => {
  function scenarioWithReset(tools: string[]): ReturnType<typeof makeScenario> {
    return makeScenario([
      makeStep({
        step_id: "s1",
        threads: [{ thread_id: "th_alex", participants: ["alex"] }],
        completion: {
          exits: [
            {
              id: "rejoue",
              trigger: { type: "manual", label: "re" },
              evaluate: false,
              route: { goto: "s1" },
              reset: { tools },
            },
          ],
          on_goto_exhausted: { end: "failure" },
        },
      }),
      makeStep({ step_id: "s2" }),
    ]);
  }

  it("bloc-notes dans exits.reset.tools → TOOL_RESET_FORBIDDEN", () => {
    const issues = validateScenarioV3(scenarioWithReset(["bloc-notes"]), FAKE_SPECS, FAKE_TOOLS);
    expect(issues.map((i) => i.code)).toEqual(["TOOL_RESET_FORBIDDEN"]);
    expect(issues[0].stepId).toBe("s1");
    expect(issues[0].message).toContain("bloc-notes");
  });

  it("les tools ordinaires restent réinitialisables", () => {
    expect(validateScenarioV3(scenarioWithReset(["notes"]), FAKE_SPECS, FAKE_TOOLS)).toEqual([]);
  });

  it("after_action accepte le type d'action tool_op (union fermée à jour)", () => {
    const scenario = makeScenario([
      makeStep({
        step_id: "s1",
        threads: [{ thread_id: "th_alex", participants: ["alex"] }],
        events: [
          {
            event_id: "ev",
            when: { type: "after_action", action: "tool_op" },
            effect: { type: "notification", title: "ok" },
          },
        ],
      }),
    ]);
    expect(validateScenarioV3(scenario, FAKE_SPECS, FAKE_TOOLS)).toEqual([]);
  });
});

describe("tool_op — sérialisation deep-save", () => {
  it("l'état produit par un applier voyage en JSON (round-trip session)", () => {
    const session = boot();
    applyWorkspaceAction(session, toolOp("compteur", "inc", { by: 2 }), { now: T0 + 1, ...OPTS });
    const restored = JSON.parse(JSON.stringify(session)) as SessionV3State;
    expect(restored.workspace.toolStates.compteur).toEqual({ count: 2 });
    // Et le journal permet de rejouer la même op sur le clone.
    applyWorkspaceAction(restored, toolOp("compteur", "inc", { by: 1 }), { now: T0 + 2, ...OPTS });
    expect(restored.workspace.toolStates.compteur).toEqual({ count: 3 });
    expect((session.workspace.toolStates.compteur as JsonObject).count).toBe(2); // l'original n'a pas bougé
  });
});

// Type-check helper : ToolOpApplier accepte bien un state Json null.
const _typecheck: Json = counterApplier(null, "inc", {});
void _typecheck;
