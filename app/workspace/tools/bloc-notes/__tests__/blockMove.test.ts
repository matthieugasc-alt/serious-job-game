/**
 * Helpers PURS du déplacement d'un bloc vers une autre note :
 *  - removeBlockById : retire un bloc (et son sous-arbre) par id, récursif ;
 *  - regenBlockIds : recopie un bloc avec de nouveaux ids (pas de collision).
 */

import { describe, it, expect } from "vitest";
import { removeBlockById, regenBlockIds, type AnyBlock } from "../components/uiHelpers";

const tree: AnyBlock[] = [
  { id: "a", kind: "paragraph", text: "A" },
  {
    id: "b",
    kind: "bullet",
    text: "B",
    children: [
      { id: "b1", kind: "bullet", text: "B1" },
      { id: "b2", kind: "todo", text: "B2", checked: false },
    ],
  },
  { id: "c", kind: "paragraph", text: "C" },
];

describe("removeBlockById", () => {
  it("retire un bloc racine sans toucher aux autres", () => {
    expect(removeBlockById(tree, "a").map((b) => b.id)).toEqual(["b", "c"]);
  });
  it("retire un bloc enfant (récursif) et laisse le parent", () => {
    const out = removeBlockById(tree, "b1");
    expect(out.map((b) => b.id)).toEqual(["a", "b", "c"]);
    expect(out[1].children?.map((b) => b.id)).toEqual(["b2"]);
  });
  it("retire un sous-arbre entier (parent + enfants)", () => {
    const out = removeBlockById(tree, "b");
    expect(out.map((b) => b.id)).toEqual(["a", "c"]);
  });
});

describe("regenBlockIds", () => {
  it("attribue de nouveaux ids au bloc et à ses enfants, conserve le contenu", () => {
    const copy = regenBlockIds(tree[1]);
    expect(copy.id).not.toBe("b");
    expect(copy.text).toBe("B");
    expect(copy.children?.map((c) => c.text)).toEqual(["B1", "B2"]);
    expect(copy.children?.every((c) => c.id !== "b1" && c.id !== "b2")).toBe(true);
  });
});
