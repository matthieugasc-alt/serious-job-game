/**
 * Tests du moteur Graph (Lot E) : ops arêtes (edge_added/updated/removed),
 * purge des arêtes à la suppression d'un nœud, presets Graph (Ishikawa
 * seed nœuds + arêtes), garde-fous défensifs.
 */

import { describe, it, expect } from "vitest";
import type { Json } from "@/app/lib/engine/mechanics";
import { applyDecisionOp } from "../model";
import { addEdge, addItem, boardEdgesOf, boardItemsOf, createBoard, getBoard, openPreset, removeEdge, removeItem, updateEdge } from "../api";
import type { DecisionToolOp } from "../api";

const T = 7_000;
function reduce(ops: (DecisionToolOp | null)[], start: Json = null): Json {
  return ops.reduce<Json>((s, o) => (o ? applyDecisionOp(s, o.op, o.payload) : s), start);
}
function graph(): Json {
  return reduce([
    createBoard({ engine: "graph", title: "G", data: { items: [], edges: [] } }, { id: "b1", at: T }),
    addItem("b1", { label: "A", x: 0.2, y: 0.5 }, { id: "na", at: T }),
    addItem("b1", { label: "B", x: 0.8, y: 0.5 }, { id: "nb", at: T }),
  ]);
}

describe("arêtes Graph", () => {
  it("ajoute une arête entre deux nœuds existants (refuse boucle et nœud absent)", () => {
    let s = reduce([addEdge("b1", { from: "na", to: "nb", directed: true }, { id: "e1", at: T })], graph());
    expect(boardEdgesOf(getBoard(s, "b1")!).map((e) => e.id)).toEqual(["e1"]);

    // boucle (from === to) → no-op
    s = reduce([addEdge("b1", { from: "na", to: "na" }, { id: "e2", at: T })], s);
    // nœud absent → no-op
    s = reduce([addEdge("b1", { from: "na", to: "ghost" }, { id: "e3", at: T })], s);
    expect(boardEdgesOf(getBoard(s, "b1")!)).toHaveLength(1);
  });

  it("met à jour puis retire une arête", () => {
    let s = reduce([
      addEdge("b1", { from: "na", to: "nb", directed: true }, { id: "e1", at: T }),
      updateEdge("b1", "e1", { label: "cause" }, { at: T }),
    ], graph());
    expect(boardEdgesOf(getBoard(s, "b1")!)[0].label).toBe("cause");
    s = reduce([removeEdge("b1", "e1", { at: T })], s);
    expect(boardEdgesOf(getBoard(s, "b1")!)).toHaveLength(0);
  });

  it("supprimer un nœud purge ses arêtes (entrantes et sortantes)", () => {
    let s = reduce([
      addItem("b1", { label: "C", x: 0.5, y: 0.9 }, { id: "nc", at: T }),
      addEdge("b1", { from: "na", to: "nb" }, { id: "e1", at: T }),
      addEdge("b1", { from: "nc", to: "na" }, { id: "e2", at: T }),
    ], graph());
    expect(boardEdgesOf(getBoard(s, "b1")!)).toHaveLength(2);
    s = reduce([removeItem("b1", "na", { at: T })], s);
    // e1 (na→nb) et e2 (nc→na) référencent na → purgées
    expect(boardEdgesOf(getBoard(s, "b1")!)).toHaveLength(0);
    expect(boardItemsOf(getBoard(s, "b1")!).map((n) => n.id).sort()).toEqual(["nb", "nc"]);
  });
});

describe("presets Graph", () => {
  it("openPreset(ishikawa) amorce le problème + 6 catégories reliées", () => {
    const s = reduce([openPreset("graph.ishikawa", {}, { id: "b1", at: T })]);
    const board = getBoard(s, "b1")!;
    expect(board.engine).toBe("graph");
    expect(boardItemsOf(board)).toHaveLength(7);
    const edges = boardEdgesOf(board);
    expect(edges).toHaveLength(6);
    expect(edges.every((e) => e.to === "effet")).toBe(true);
  });
});
