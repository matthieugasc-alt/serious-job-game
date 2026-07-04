/**
 * Tests des presets V2 (Kanban/Timeline/Table-grille/Matrix) : chaque
 * preset cible un moteur connu, openPreset produit un board_created
 * correctement configuré, et les items/seed/grille se manipulent.
 */

import { describe, it, expect } from "vitest";
import type { Json } from "@/app/lib/engine/mechanics";
import { applyDecisionOp, addItem, boardItemsOf, getBoard, listPresets, openPreset, setCell } from "../api";
import { ENGINE_KINDS } from "../spec";
import type { DecisionToolOp } from "../api";

const T = 9_000;
function reduce(ops: (DecisionToolOp | null)[], start: Json = null): Json {
  return ops.reduce<Json>((s, o) => (o ? applyDecisionOp(s, o.op, o.payload) : s), start);
}

describe("presets — cohérence", () => {
  it("tous les presets ciblent un moteur connu", () => {
    const kinds = new Set<string>(ENGINE_KINDS);
    for (const p of listPresets()) expect(kinds.has(p.engine), `preset ${p.id} → engine ${p.engine}`).toBe(true);
  });

  it("couvre bien les nouveaux moteurs Kanban et Timeline", () => {
    expect(listPresets("kanban").map((p) => p.id)).toContain("kanban.board");
    expect(listPresets("timeline").map((p) => p.id)).toContain("timeline.roadmap");
  });
});

describe("Kanban", () => {
  it("openPreset crée un board kanban à colonnes ; une carte tombe dans sa colonne", () => {
    const s = reduce([
      openPreset("kanban.board", {}, { id: "b1", at: T }),
      addItem("b1", { label: "Tâche", status: "doing" }, { id: "i1", at: T }),
    ]);
    const board = getBoard(s, "b1")!;
    expect(board.engine).toBe("kanban");
    expect((board.config as { columns: unknown[] }).columns).toHaveLength(3);
    expect(boardItemsOf(board)[0].status).toBe("doing");
  });
});

describe("Timeline", () => {
  it("openPreset(waterfall) amorce les phases (seed) triables par order", () => {
    const s = reduce([openPreset("timeline.waterfall", {}, { id: "b1", at: T })]);
    const board = getBoard(s, "b1")!;
    expect(board.engine).toBe("timeline");
    const steps = boardItemsOf(board);
    expect(steps).toHaveLength(5);
    expect(steps.find((x) => x.fields.milestone === true)?.label).toBe("Déploiement");
  });
});

describe("Table grille (RACI)", () => {
  it("openPreset(raci) est en mode grille avec cell_options, et setCell écrit une cellule", () => {
    const s = reduce([
      openPreset("raci", {}, { id: "b1", at: T }),
      setCell("b1", "task_1:role_1", "A", { at: T }),
    ]);
    const board = getBoard(s, "b1")!;
    expect((board.config as { mode: string }).mode).toBe("grid");
    expect((board.config as { cell_options: string[] }).cell_options).toEqual(["R", "A", "C", "I"]);
    expect((board.data as { cells: Record<string, string> }).cells["task_1:role_1"]).toBe("A");
  });
});
