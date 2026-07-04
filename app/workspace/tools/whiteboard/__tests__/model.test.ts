/**
 * Tests PURS du reducer applyWhiteboardOp : ajout/déplacement/édition/
 * recoloration/retrait, bornage [0,1], couleur validée, no-op défensif,
 * immutabilité, post-it d'auteur (joueur vs coéquipier IA).
 */

import { describe, it, expect } from "vitest";
import type { JsonObject } from "@/app/lib/engine/mechanics";
import { applyWhiteboardOp, emptyWhiteboardState, normalizeWhiteboardState } from "../model";
import type { WhiteboardState } from "../spec";

const T = 100;
function run(start: WhiteboardState, ops: [string, JsonObject][]): WhiteboardState {
  let s = start as unknown as WhiteboardState;
  for (const [op, p] of ops) s = applyWhiteboardOp(s as never, op, p) as unknown as WhiteboardState;
  return normalizeWhiteboardState(s as never);
}

describe("applyWhiteboardOp", () => {
  it("ajoute des post-it (joueur et coéquipier IA), borne la position, valide la couleur", () => {
    const s = run(emptyWhiteboardState(), [
      ["note_added", { note_id: "n1", text: "idée 1", color: "blue", x: 0.2, y: 0.3, author: "player", at: T }],
      ["note_added", { note_id: "n2", text: "idée 2", color: "licorne", x: 5, y: -1, author: "ines_berrada", at: T }],
    ]);
    expect(s.notes.n1.color).toBe("blue");
    expect(s.notes.n2.color).toBe("yellow"); // couleur invalide → défaut
    expect(s.notes.n2.x).toBe(1); // borné
    expect(s.notes.n2.y).toBe(0);
    expect(s.notes.n2.author).toBe("ines_berrada");
  });

  it("déplace, édite, recolore, retire", () => {
    let s = run(emptyWhiteboardState(), [["note_added", { note_id: "n1", text: "a", color: "yellow", x: 0.1, y: 0.1, at: T }]]);
    s = run(s, [
      ["note_moved", { note_id: "n1", x: 0.8, y: 0.6, at: T + 1 }],
      ["note_edited", { note_id: "n1", text: "idée révisée", at: T + 2 }],
      ["note_recolored", { note_id: "n1", color: "pink", at: T + 3 }],
    ]);
    expect(s.notes.n1.x).toBe(0.8);
    expect(s.notes.n1.text).toBe("idée révisée");
    expect(s.notes.n1.color).toBe("pink");
    s = run(s, [["note_removed", { note_id: "n1" }]]);
    expect(s.notes.n1).toBeUndefined();
  });

  it("op inconnue / doublon d'id / cible absente → no-op strict", () => {
    const s0 = run(emptyWhiteboardState(), [["note_added", { note_id: "n1", text: "a", at: T }]]);
    expect(applyWhiteboardOp(s0 as never, "note_exploded", { note_id: "n1" })).toBe(s0);
    // doublon
    const dup = run(s0, [["note_added", { note_id: "n1", text: "b", at: T }]]);
    expect(dup.notes.n1.text).toBe("a");
    // move d'un id inconnu
    expect(applyWhiteboardOp(s0 as never, "note_moved", { note_id: "ghost", x: 0.2, y: 0.2 })).toBe(s0);
  });

  it("immutabilité : l'état d'entrée n'est pas muté", () => {
    const s0 = run(emptyWhiteboardState(), [["note_added", { note_id: "n1", text: "a", at: T }]]);
    const snap = JSON.stringify(s0);
    applyWhiteboardOp(s0 as never, "note_edited", { note_id: "n1", text: "z", at: T });
    expect(JSON.stringify(s0)).toBe(snap);
  });
});
