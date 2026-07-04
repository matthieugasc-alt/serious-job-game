/**
 * Tests de l'API PUBLIQUE (api.ts) : constructeurs `tool_op` bien formés
 * (ids/at explicites → replay déterministe), openPreset, sélecteurs purs
 * (rankedOptions, riskLevel, boardItemsOf, listDecisions).
 */

import { describe, it, expect } from "vitest";
import type { Json } from "@/app/lib/engine/mechanics";
import {
  addCriterion,
  addItem,
  addOption,
  applyDecisionOp,
  boardItemsOf,
  createDecision,
  getBoard,
  listDecisions,
  openPreset,
  rankedOptions,
  riskLevel,
  scoreOption,
  selectBoardsForDecision,
} from "../api";
import type { DecisionToolOp } from "../api";

const T = 5_000;
function reduce(ops: (DecisionToolOp | null)[], start: Json = null): Json {
  return ops.reduce<Json>((s, o) => (o ? applyDecisionOp(s, o.op, o.payload) : s), start);
}

describe("constructeurs — forme tool_op", () => {
  it("createDecision porte decision_id/title/at", () => {
    const o = createDecision({ title: "Choix", context: "ctx" }, { id: "d1", at: T });
    expect(o).toEqual({
      type: "tool_op",
      tool_id: "decision-engine",
      op: "decision_created",
      payload: { decision_id: "d1", title: "Choix", context: "ctx", at: T },
    });
  });

  it("openPreset(matrix.impact_effort) crée un board_created avec la config du preset", () => {
    const o = openPreset("matrix.impact_effort", { decision_id: "d1" }, { id: "b1", at: T });
    expect(o).not.toBeNull();
    expect(o!.op).toBe("board_created");
    expect(o!.payload.engine).toBe("matrix");
    expect(o!.payload.preset_id).toBe("matrix.impact_effort");
    expect((o!.payload.config as { scoring: string }).scoring).toBe("axis");
  });

  it("openPreset d'un preset inconnu → null", () => {
    expect(openPreset("does.not.exist")).toBeNull();
  });
});

describe("sélecteurs", () => {
  it("rankedOptions classe par score pondéré décroissant", () => {
    const s = reduce([
      createDecision({ title: "C" }, { id: "d1", at: T }),
      addOption("d1", "A", { id: "oa", at: T }),
      addOption("d1", "B", { id: "ob", at: T }),
      addCriterion("d1", { label: "Impact", weight: 3 }, { id: "c1", at: T }),
      scoreOption("d1", "oa", "c1", 2, undefined, { at: T }),
      scoreOption("d1", "ob", "c1", 5, undefined, { at: T }),
    ]);
    const d = listDecisions(s)[0];
    const ranked = rankedOptions(d);
    expect(ranked.map((r) => r.option.id)).toEqual(["ob", "oa"]);
    expect(ranked[0].score).toBe(15);
  });

  it("riskLevel = proba×impact + bande (5×5 : ≤6 low, ≤14 moderate, >14 high)", () => {
    expect(riskLevel(2, 2)).toEqual({ score: 4, band: "low" });
    expect(riskLevel(3, 4)).toEqual({ score: 12, band: "moderate" });
    expect(riskLevel(5, 5)).toEqual({ score: 25, band: "high" });
  });

  it("boardItemsOf + selectBoardsForDecision lisent les items d'un board rattaché", () => {
    const s = reduce([
      createDecision({ title: "C" }, { id: "d1", at: T }),
      openPreset("matrix.impact_effort", { decision_id: "d1" }, { id: "b1", at: T }),
      addItem("b1", { label: "Init", x: 0.3, y: 0.7 }, { id: "i1", at: T }),
    ]);
    expect(selectBoardsForDecision(s, "d1").map((b) => b.id)).toEqual(["b1"]);
    const board = getBoard(s, "b1")!;
    const items = boardItemsOf(board);
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe("Init");
    expect(items[0].x).toBe(0.3);
  });
});
