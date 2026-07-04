/**
 * api.ts — l'API PUBLIQUE du Tableau blanc : constructeurs d'ops `tool_op`
 * (UI + coéquipiers IA via le moteur) + sélecteurs purs. PUR/node-safe.
 */

import type { Json, JsonObject } from "@/app/lib/engine/mechanics";
import type { StickyColor, StickyNote, WhiteboardState } from "./spec";
import { WHITEBOARD_TOOL_ID } from "./spec";
import type { WhiteboardOpName } from "./model";
import { normalizeWhiteboardState } from "./model";

export { WHITEBOARD_OPS, normalizeWhiteboardState, applyWhiteboardOp } from "./model";
export type { WhiteboardOpName } from "./model";

export interface WhiteboardToolOp {
  type: "tool_op";
  tool_id: typeof WHITEBOARD_TOOL_ID;
  op: WhiteboardOpName;
  payload: JsonObject;
}
export interface OpOptions {
  id?: string;
  at?: number;
}

let uidCounter = 0;
function uid(prefix: string): string {
  uidCounter = (uidCounter + 1) % 1_679_616;
  return `${prefix}_${Date.now().toString(36)}_${uidCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
function op(name: WhiteboardOpName, payload: JsonObject): WhiteboardToolOp {
  return { type: "tool_op", tool_id: WHITEBOARD_TOOL_ID, op: name, payload };
}

export interface AddNoteInput {
  text?: string;
  color?: StickyColor;
  x?: number;
  y?: number;
  /** "player" (défaut) ou un actor_id pour un post-it de coéquipier IA. */
  author?: string;
}
export function addNote(input: AddNoteInput = {}, opts: OpOptions = {}): WhiteboardToolOp {
  const payload: JsonObject = {
    note_id: opts.id ?? uid("sticky"),
    text: input.text ?? "",
    color: input.color ?? "yellow",
    x: input.x ?? 0.5,
    y: input.y ?? 0.5,
    at: opts.at ?? Date.now(),
  };
  if (input.author !== undefined) payload.author = input.author;
  return op("note_added", payload);
}
export function moveNote(noteId: string, x: number, y: number, opts: OpOptions = {}): WhiteboardToolOp {
  return op("note_moved", { note_id: noteId, x, y, at: opts.at ?? Date.now() });
}
export function editNote(noteId: string, text: string, opts: OpOptions = {}): WhiteboardToolOp {
  return op("note_edited", { note_id: noteId, text, at: opts.at ?? Date.now() });
}
export function recolorNote(noteId: string, color: StickyColor, opts: OpOptions = {}): WhiteboardToolOp {
  return op("note_recolored", { note_id: noteId, color, at: opts.at ?? Date.now() });
}
export function removeNote(noteId: string): WhiteboardToolOp {
  return op("note_removed", { note_id: noteId });
}

// ─── Sélecteurs purs ───────────────────────────────────────────────
export function selectNotes(state: Json): StickyNote[] {
  return Object.values(normalizeWhiteboardState(state).notes).sort(
    (a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id),
  );
}
export function selectNotesByAuthor(state: Json, author: string): StickyNote[] {
  return selectNotes(state).filter((n) => (n.author ?? "player") === author);
}
export function countNotes(state: Json): number {
  return Object.keys(normalizeWhiteboardState(state).notes).length;
}
export function selectWhiteboard(state: Json): WhiteboardState {
  return normalizeWhiteboardState(state);
}
