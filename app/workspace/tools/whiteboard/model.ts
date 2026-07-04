/**
 * model.ts — le reducer PUR du Tableau blanc. Pattern TOOL_BLOC_NOTES.md §2.
 *   - PUR/node-safe, aucune horloge (`at` dans le payload) ;
 *   - IMMUTABLE ; op inconnue / payload invalide → no-op défensif ;
 *   - positions bornées [0,1] ; couleur validée sur la palette.
 */

import type { Json, JsonObject } from "@/app/lib/engine/mechanics";
import type { StickyColor, StickyNote, WhiteboardState } from "./spec";

export const WHITEBOARD_OPS = [
  "note_added",
  "note_moved",
  "note_edited",
  "note_recolored",
  "note_removed",
] as const;
export type WhiteboardOpName = (typeof WHITEBOARD_OPS)[number];

const COLOR_SET = new Set<string>(["yellow", "pink", "blue", "green", "orange"]);

export function emptyWhiteboardState(): WhiteboardState {
  return { notes: {} };
}

function isObject(v: Json | undefined): v is JsonObject {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}
function asString(v: Json | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function asNumber(v: Json | undefined): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
function asColor(v: Json | undefined): StickyColor {
  const c = asString(v);
  return c !== undefined && COLOR_SET.has(c) ? (c as StickyColor) : "yellow";
}

function parseNote(v: Json | undefined): StickyNote | null {
  if (!isObject(v)) return null;
  const id = asString(v.id);
  if (id === undefined) return null;
  const author = asString(v.author);
  return {
    id,
    text: asString(v.text) ?? "",
    color: asColor(v.color),
    x: clamp01(asNumber(v.x) ?? 0.5),
    y: clamp01(asNumber(v.y) ?? 0.5),
    ...(author !== undefined ? { author } : {}),
    created_at: asNumber(v.created_at) ?? 0,
    updated_at: asNumber(v.updated_at) ?? 0,
  };
}

export function normalizeWhiteboardState(state: Json): WhiteboardState {
  if (!isObject(state)) return emptyWhiteboardState();
  const notes: Record<string, StickyNote> = {};
  if (isObject(state.notes)) {
    for (const [id, raw] of Object.entries(state.notes)) {
      const note = parseNote(raw);
      if (note && note.id === id) notes[id] = note;
    }
  }
  return { notes };
}

export function applyWhiteboardOp(state: Json, op: string, payload: JsonObject): Json {
  const s = normalizeWhiteboardState(state);
  const p = isObject(payload) ? payload : {};
  const at = asNumber(p.at) ?? 0;

  let next: WhiteboardState | null;
  switch (op as WhiteboardOpName) {
    case "note_added": next = noteAdded(s, p, at); break;
    case "note_moved": next = noteMoved(s, p, at); break;
    case "note_edited": next = noteEdited(s, p, at); break;
    case "note_recolored": next = noteRecolored(s, p, at); break;
    case "note_removed": next = noteRemoved(s, p); break;
    default: next = null;
  }
  return (next ?? state) as Json;
}

function withNote(s: WhiteboardState, note: StickyNote): WhiteboardState {
  return { notes: { ...s.notes, [note.id]: note } };
}

function noteAdded(s: WhiteboardState, p: JsonObject, at: number): WhiteboardState | null {
  const id = asString(p.note_id);
  if (id === undefined || id.length === 0 || id in s.notes) return null;
  const author = asString(p.author);
  return withNote(s, {
    id,
    text: asString(p.text) ?? "",
    color: asColor(p.color),
    x: clamp01(asNumber(p.x) ?? 0.5),
    y: clamp01(asNumber(p.y) ?? 0.5),
    ...(author !== undefined ? { author } : {}),
    created_at: at,
    updated_at: at,
  });
}

function noteMoved(s: WhiteboardState, p: JsonObject, at: number): WhiteboardState | null {
  const id = asString(p.note_id);
  const note = id !== undefined ? s.notes[id] : undefined;
  const x = asNumber(p.x);
  const y = asNumber(p.y);
  if (!note || x === undefined || y === undefined) return null;
  return withNote(s, { ...note, x: clamp01(x), y: clamp01(y), updated_at: at });
}

function noteEdited(s: WhiteboardState, p: JsonObject, at: number): WhiteboardState | null {
  const id = asString(p.note_id);
  const text = asString(p.text);
  const note = id !== undefined ? s.notes[id] : undefined;
  if (!note || text === undefined) return null;
  return withNote(s, { ...note, text, updated_at: at });
}

function noteRecolored(s: WhiteboardState, p: JsonObject, at: number): WhiteboardState | null {
  const id = asString(p.note_id);
  const note = id !== undefined ? s.notes[id] : undefined;
  const color = asString(p.color);
  if (!note || color === undefined || !COLOR_SET.has(color)) return null;
  return withNote(s, { ...note, color: color as StickyColor, updated_at: at });
}

function noteRemoved(s: WhiteboardState, p: JsonObject): WhiteboardState | null {
  const id = asString(p.note_id);
  if (id === undefined || !(id in s.notes)) return null;
  const notes = { ...s.notes };
  delete notes[id];
  return { notes };
}
