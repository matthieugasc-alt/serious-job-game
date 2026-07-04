/**
 * Tests des intégrations Tool→Tool (integrations.ts) : synthèse vers le
 * Bloc-notes (façade publique), tâche depuis une décision, et révision
 * append-only qui recopie la structure (options/critères/scores/risques).
 */

import { describe, it, expect } from "vitest";
import type { Json } from "@/app/lib/engine/mechanics";
import { applyDecisionOp } from "../model";
import { addCriterion, addOption, createDecision, createRisk, getDecisionById, listDecisions, scoreOption, weightedScoreOf } from "../api";
import { createTaskFromDecision, exportDecisionToNotebook, reviseDecision } from "../integrations";
import { applyNotebookOp, selectRecent, selectTasksByStatus } from "@/app/workspace/tools/bloc-notes/api";
import type { DecisionToolOp } from "../api";

const T = 1_000;
function reduceDecision(ops: (DecisionToolOp | null)[], start: Json = null): Json {
  return ops.reduce<Json>((s, o) => (o ? applyDecisionOp(s, o.op, o.payload) : s), start);
}

function bootDecision(): Json {
  return reduceDecision([
    createDecision({ title: "Choix CTO", context: "3 profils" }, { id: "d1", at: T }),
    addOption("d1", "Profil A", { id: "oa", at: T }),
    addOption("d1", "Profil B", { id: "ob", at: T }),
    addCriterion("d1", { label: "Impact", weight: 3 }, { id: "c1", at: T }),
    scoreOption("d1", "oa", "c1", 5, undefined, { at: T }),
    scoreOption("d1", "ob", "c1", 2, undefined, { at: T }),
    createRisk("d1", { label: "Départ concurrent", probability: 4, impact: 5 }, { id: "r1", at: T }),
  ]);
}

describe("exportDecisionToNotebook", () => {
  it("rend note_created + blocks_updated ; la note contient titre, contexte et options", () => {
    const decision = getDecisionById(bootDecision(), "d1")!;
    const ops = exportDecisionToNotebook(decision);
    expect(ops.map((o) => (o.type === "tool_op" ? o.op : o.type))).toEqual(["note_created", "blocks_updated"]);
    // Applique dans un carnet vierge.
    let notebook: Json = null;
    for (const o of ops) if (o.type === "tool_op") notebook = applyNotebookOp(notebook, o.op, o.payload);
    const note = selectRecent(notebook)[0];
    const text = JSON.stringify(note.blocks);
    expect(note.title).toBe("Choix CTO");
    expect(text).toContain("Contexte : 3 profils");
    expect(text).toContain("Profil A");
  });
});

describe("createTaskFromDecision", () => {
  it("crée une tâche de suivi dans le Bloc-notes", () => {
    const decision = getDecisionById(bootDecision(), "d1")!;
    const op = createTaskFromDecision(decision);
    expect(op.type).toBe("tool_op");
    const notebook = op.type === "tool_op" ? applyNotebookOp(null, op.op, op.payload) : null;
    const tasks = selectTasksByStatus(notebook, "todo");
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toContain("Choix CTO");
  });
});

describe("reviseDecision (append-only)", () => {
  it("crée une décision superseding qui recopie options/critères/scores/risques", () => {
    const start = bootDecision();
    const decision = getDecisionById(start, "d1")!;
    const { newId, actions } = reviseDecision(decision);
    // Applique les ops sur l'état existant.
    let s: Json = start;
    for (const a of actions) if (a.type === "tool_op") s = applyDecisionOp(s, a.op, a.payload);

    const revised = getDecisionById(s, newId)!;
    expect(revised.supersedes).toBe("d1");
    expect(revised.title).toContain("(révisée)");
    expect(revised.options).toHaveLength(2);
    expect(revised.criteria).toHaveLength(1);
    expect(revised.risks).toHaveLength(1);
    // Les scores sont recopiés : l'option en tête reste identique (5*3=15).
    const topId = revised.options.find((o) => o.label === "Profil A")!.id;
    expect(weightedScoreOf(revised, topId)).toBe(15);
    // Les deux décisions coexistent (append-only).
    expect(listDecisions(s).map((d) => d.id).sort()).toEqual([newId, "d1"].sort());
  });
});
