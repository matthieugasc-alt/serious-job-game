/**
 * model.ts — le reducer PUR du Bloc-notes Universel.
 * Réf : docs/TOOL_BLOC_NOTES.md §2 (tool_op) et §4 (API publique).
 *
 * `applyNotebookOp(state, op, payload) → state` :
 *   - PUR et node-safe : aucun React, aucun import moteur hors types Json,
 *     aucune horloge (l'horodatage `at` voyage dans le payload — le
 *     journal rejoue les ops à l'identique) ;
 *   - IMMUTABLE : ne mute jamais l'état reçu — rend un nouvel objet
 *     (partage structurel), ou l'état d'origine tel quel si l'op est
 *     inconnue / invalide (no-op défensif, l'op reste journalisée) ;
 *   - DÉFENSIF : payload invalide, note/tâche/bloc introuvable → no-op ;
 *   - INVARIANTS : tagIndex (dérivé) et updated_at maintenus à chaque op.
 *
 * N'importe que des types depuis spec.ts (import type, effacé au build :
 * pas de cycle runtime — spec.ts importe les fonctions d'ici).
 */

import type { Json, JsonObject } from "@/app/lib/engine/mechanics";
import type {
  Block,
  BlockKind,
  Note,
  NoteId,
  NotebookState,
  SourceRef,
  Task,
  TaskId,
  TaskPriority,
  TaskStatus,
} from "./spec";

// ─── Ops (union FERMÉE côté carnet — le moteur ne la connaît pas) ──

export const NOTEBOOK_OPS = [
  "note_created",
  "note_renamed",
  "note_deleted",
  "blocks_updated",
  "tag_added",
  "tag_removed",
  "todo_toggled",
  "annotation_added",
  "task_created",
  "task_updated",
  "task_moved",
  "task_from_selection",
  "notes_reordered",
] as const;
export type NotebookOpName = (typeof NOTEBOOK_OPS)[number];

// ─── État vide et normalisation défensive ─────────────────────────

export function emptyNotebookState(): NotebookState {
  return { notes: {}, tasks: {}, tagIndex: {}, order: [] };
}

const BLOCK_KIND_SET = new Set<string>([
  "paragraph",
  "heading1",
  "heading2",
  "separator",
  "bullet",
  "numbered",
  "todo",
  "quote",
]);

const TASK_STATUS_SET = new Set<string>(["todo", "doing", "done"]);
const TASK_PRIORITY_SET = new Set<string>(["low", "normal", "high"]);

function isObject(v: Json | undefined): v is JsonObject {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function asString(v: Json | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asNumber(v: Json | undefined): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function asStringArray(v: Json | undefined): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x): x is string => typeof x === "string" && x.trim().length > 0))];
}

/** Un SourceRef bien formé (les 3 kinds du contrat §3), sinon undefined. */
export function parseSourceRef(v: Json | undefined): SourceRef | undefined {
  if (!isObject(v)) return undefined;
  const excerpt = asString(v.excerpt) ?? "";
  switch (v.kind) {
    case "message": {
      const threadId = asString(v.thread_id);
      const at = asNumber(v.at);
      if (threadId === undefined || at === undefined) return undefined;
      const actorId = asString(v.actor_id);
      return {
        kind: "message",
        thread_id: threadId,
        ...(actorId !== undefined ? { actor_id: actorId } : {}),
        at,
        excerpt,
      };
    }
    case "mail": {
      const mailId = asString(v.mail_id);
      const subject = asString(v.subject);
      const from = asString(v.from);
      const at = asNumber(v.at);
      if (mailId === undefined || subject === undefined || from === undefined || at === undefined) {
        return undefined;
      }
      return { kind: "mail", mail_id: mailId, subject, from, at, excerpt };
    }
    case "document": {
      const documentId = asString(v.document_id);
      if (documentId === undefined) return undefined;
      return { kind: "document", document_id: documentId, excerpt };
    }
    default:
      return undefined;
  }
}

/** Blocs valides uniquement — récursif (children), invalides écartés. */
export function sanitizeBlocks(raw: Json | undefined): Block[] {
  if (!Array.isArray(raw)) return [];
  const out: Block[] = [];
  for (const item of raw) {
    if (!isObject(item)) continue;
    const id = asString(item.id);
    const kind = asString(item.kind);
    const text = asString(item.text) ?? "";
    if (id === undefined || kind === undefined || !BLOCK_KIND_SET.has(kind)) continue;
    if (kind === "quote") {
      out.push({ id, kind: "quote", text });
      continue;
    }
    const children = Array.isArray(item.children) ? sanitizeBlocks(item.children) : undefined;
    const base = { id, text, ...(children && children.length > 0 ? { children } : {}) };
    if (kind === "todo") {
      out.push({ ...base, kind: "todo", checked: item.checked === true });
      continue;
    }
    const marks = isObject(item.marks)
      ? {
          ...(item.marks.bold === true ? { bold: true } : {}),
          ...(item.marks.italic === true ? { italic: true } : {}),
          ...(item.marks.underline === true ? { underline: true } : {}),
          ...(item.marks.strikethrough === true ? { strikethrough: true } : {}),
          ...(typeof item.marks.highlight === "string" ? { highlight: item.marks.highlight } : {}),
        }
      : undefined;
    out.push({
      ...base,
      kind: kind as Exclude<BlockKind, "todo" | "quote">,
      ...(marks && Object.keys(marks).length > 0 ? { marks } : {}),
    });
  }
  return out;
}

function parseNote(v: Json | undefined): Note | null {
  if (!isObject(v)) return null;
  const id = asString(v.id);
  if (id === undefined) return null;
  const source = parseSourceRef(v.source);
  return {
    id,
    title: asString(v.title) ?? "",
    blocks: sanitizeBlocks(v.blocks),
    tags: asStringArray(v.tags),
    ...(source ? { source } : {}),
    created_at: asNumber(v.created_at) ?? 0,
    updated_at: asNumber(v.updated_at) ?? 0,
  };
}

function parseTask(v: Json | undefined): Task | null {
  if (!isObject(v)) return null;
  const id = asString(v.id);
  const title = asString(v.title);
  if (id === undefined || title === undefined) return null;
  const status = asString(v.status);
  const priority = asString(v.priority);
  const description = asString(v.description);
  const due = asString(v.due);
  const noteId = asString(v.note_id);
  const source = parseSourceRef(v.source);
  return {
    id,
    title,
    ...(description !== undefined ? { description } : {}),
    status: status !== undefined && TASK_STATUS_SET.has(status) ? (status as TaskStatus) : "todo",
    ...(priority !== undefined && TASK_PRIORITY_SET.has(priority)
      ? { priority: priority as TaskPriority }
      : {}),
    ...(due !== undefined ? { due } : {}),
    tags: asStringArray(v.tags),
    ...(source ? { source } : {}),
    ...(noteId !== undefined ? { note_id: noteId } : {}),
    created_at: asNumber(v.created_at) ?? 0,
    updated_at: asNumber(v.updated_at) ?? 0,
  };
}

/** tagIndex est un DÉRIVÉ : reconstruit depuis notes[].tags (ordre = order). */
function rebuildTagIndex(notes: Record<NoteId, Note>, order: NoteId[]): Record<string, NoteId[]> {
  const index: Record<string, NoteId[]> = {};
  for (const id of order) {
    const note = notes[id];
    if (!note) continue;
    for (const tag of note.tags) {
      (index[tag] ??= []).push(id);
    }
  }
  return index;
}

/**
 * Relit un état sérialisé (Json, potentiellement null ou corrompu) en
 * NotebookState bien formé : entrées invalides écartées, `order` filtré
 * et complété (aucune note perdue), tagIndex RECONSTRUIT (cohérence
 * garantie). Pur — n'altère jamais l'entrée.
 */
export function normalizeNotebookState(state: Json): NotebookState {
  if (!isObject(state)) return emptyNotebookState();

  const notes: Record<NoteId, Note> = {};
  if (isObject(state.notes)) {
    for (const [id, raw] of Object.entries(state.notes)) {
      const note = parseNote(raw);
      if (note && note.id === id) notes[id] = note;
    }
  }

  const tasks: Record<TaskId, Task> = {};
  if (isObject(state.tasks)) {
    for (const [id, raw] of Object.entries(state.tasks)) {
      const task = parseTask(raw);
      if (task && task.id === id) tasks[id] = task;
    }
  }

  const declared = asStringArray(state.order).filter((id) => id in notes);
  const missing = Object.keys(notes).filter((id) => !declared.includes(id));
  const order = [...declared, ...missing];

  return { notes, tasks, order, tagIndex: rebuildTagIndex(notes, order) };
}

// ─── Le reducer : applyNotebookOp ──────────────────────────────────

/**
 * Applique une op du carnet. Signature = ToolOpApplier du moteur
 * (enregistrée dans le TOOL_REGISTRY via blocNotesSpec.applyOp).
 * Op inconnue ou payload invalide → l'état d'ORIGINE est rendu tel quel
 * (no-op strict : même référence, journal intact côté moteur).
 */
export function applyNotebookOp(state: Json, op: string, payload: JsonObject): Json {
  const s = normalizeNotebookState(state);
  const p = isObject(payload) ? payload : {};
  const at = asNumber(p.at) ?? 0;

  let next: NotebookState | null;
  switch (op as NotebookOpName) {
    case "note_created":
      next = noteCreated(s, p, at);
      break;
    case "note_renamed":
      next = noteRenamed(s, p, at);
      break;
    case "note_deleted":
      next = noteDeleted(s, p);
      break;
    case "blocks_updated":
      next = blocksUpdated(s, p, at);
      break;
    case "tag_added":
      next = tagAdded(s, p, at);
      break;
    case "tag_removed":
      next = tagRemoved(s, p, at);
      break;
    case "todo_toggled":
      next = todoToggled(s, p, at);
      break;
    case "annotation_added":
      next = annotationAdded(s, p, at);
      break;
    case "task_created":
      next = taskCreated(s, p, at);
      break;
    case "task_updated":
      next = taskUpdated(s, p, at);
      break;
    case "task_moved":
      next = taskMoved(s, p, at);
      break;
    case "task_from_selection":
      next = taskFromSelection(s, p, at);
      break;
    case "notes_reordered":
      next = notesReordered(s, p);
      break;
    default:
      next = null; // op inconnue → no-op journalisé défensif
  }

  return (next ?? state) as Json;
}

// ─── Handlers (chacun rend un NOUVEL état, ou null = no-op) ────────

function withNote(s: NotebookState, note: Note): NotebookState {
  const notes = { ...s.notes, [note.id]: note };
  return { ...s, notes, tagIndex: rebuildTagIndex(notes, s.order) };
}

function insertNote(s: NotebookState, note: Note): NotebookState {
  // Les nouvelles notes arrivent EN TÊTE de l'ordre manuel (récentes d'abord).
  const notes = { ...s.notes, [note.id]: note };
  const order = [note.id, ...s.order];
  return { ...s, notes, order, tagIndex: rebuildTagIndex(notes, order) };
}

function noteCreated(s: NotebookState, p: JsonObject, at: number): NotebookState | null {
  const id = asString(p.note_id);
  if (id === undefined || id.length === 0 || id in s.notes) return null;
  return insertNote(s, {
    id,
    title: (asString(p.title) ?? "").trim(),
    blocks: sanitizeBlocks(p.blocks),
    tags: asStringArray(p.tags),
    created_at: at,
    updated_at: at,
  });
}

function noteRenamed(s: NotebookState, p: JsonObject, at: number): NotebookState | null {
  const id = asString(p.note_id);
  const title = asString(p.title);
  const note = id !== undefined ? s.notes[id] : undefined;
  if (!note || title === undefined) return null;
  return withNote(s, { ...note, title: title.trim(), updated_at: at });
}

function noteDeleted(s: NotebookState, p: JsonObject): NotebookState | null {
  const id = asString(p.note_id);
  if (id === undefined || !(id in s.notes)) return null;
  const notes = { ...s.notes };
  delete notes[id];
  const order = s.order.filter((n) => n !== id);
  // Les tâches liées survivent (le carnet ne perd jamais de travail) —
  // seul le lien note_id devenu orphelin est retiré, sans bump updated_at.
  let tasks = s.tasks;
  for (const [taskId, task] of Object.entries(s.tasks)) {
    if (task.note_id === id) {
      if (tasks === s.tasks) tasks = { ...s.tasks };
      const unlinked = { ...task };
      delete unlinked.note_id;
      tasks[taskId] = unlinked;
    }
  }
  return { ...s, notes, tasks, order, tagIndex: rebuildTagIndex(notes, order) };
}

function blocksUpdated(s: NotebookState, p: JsonObject, at: number): NotebookState | null {
  const id = asString(p.note_id);
  const note = id !== undefined ? s.notes[id] : undefined;
  if (!note || !Array.isArray(p.blocks)) return null;
  return withNote(s, { ...note, blocks: sanitizeBlocks(p.blocks), updated_at: at });
}

function tagAdded(s: NotebookState, p: JsonObject, at: number): NotebookState | null {
  const id = asString(p.note_id);
  const tag = (asString(p.tag) ?? "").trim();
  const note = id !== undefined ? s.notes[id] : undefined;
  if (!note || tag.length === 0 || note.tags.includes(tag)) return null;
  return withNote(s, { ...note, tags: [...note.tags, tag], updated_at: at });
}

function tagRemoved(s: NotebookState, p: JsonObject, at: number): NotebookState | null {
  const id = asString(p.note_id);
  const tag = asString(p.tag);
  const note = id !== undefined ? s.notes[id] : undefined;
  if (!note || tag === undefined || !note.tags.includes(tag)) return null;
  return withNote(s, { ...note, tags: note.tags.filter((t) => t !== tag), updated_at: at });
}

/** Bascule récursive d'un todo dans la hiérarchie ; null si introuvable. */
function toggleTodoInBlocks(blocks: Block[], blockId: string): Block[] | null {
  let found = false;
  const mapped = blocks.map((b): Block => {
    if (found) return b;
    if (b.id === blockId && b.kind === "todo") {
      found = true;
      return { ...b, checked: !b.checked };
    }
    if (b.kind !== "quote" && Array.isArray(b.children)) {
      const children = toggleTodoInBlocks(b.children, blockId);
      if (children) {
        found = true;
        return { ...b, children } as Block;
      }
    }
    return b;
  });
  return found ? mapped : null;
}

function todoToggled(s: NotebookState, p: JsonObject, at: number): NotebookState | null {
  const id = asString(p.note_id);
  const blockId = asString(p.block_id);
  const note = id !== undefined ? s.notes[id] : undefined;
  if (!note || blockId === undefined) return null;
  const blocks = toggleTodoInBlocks(note.blocks, blockId);
  if (!blocks) return null;
  return withNote(s, { ...note, blocks, updated_at: at });
}

function annotationAdded(s: NotebookState, p: JsonObject, at: number): NotebookState | null {
  const id = asString(p.note_id);
  const excerpt = asString(p.excerpt);
  const source = parseSourceRef(p.source);
  if (id === undefined || id.length === 0 || id in s.notes) return null;
  if (excerpt === undefined || excerpt.trim().length === 0 || !source) return null;
  const comment = (asString(p.comment) ?? "").trim();
  const compact = excerpt.replace(/\s+/g, " ").trim();
  const title = compact.length > 60 ? `${compact.slice(0, 59)}…` : compact;
  const blocks: Block[] = [{ id: `${id}_quote`, kind: "quote", text: excerpt }];
  if (comment.length > 0) {
    blocks.push({ id: `${id}_comment`, kind: "paragraph", text: comment });
  }
  return insertNote(s, {
    id,
    title,
    blocks,
    tags: asStringArray(p.tags),
    source,
    created_at: at,
    updated_at: at,
  });
}

function taskCreated(s: NotebookState, p: JsonObject, at: number): NotebookState | null {
  const id = asString(p.task_id);
  const title = (asString(p.title) ?? "").trim();
  if (id === undefined || id.length === 0 || id in s.tasks || title.length === 0) return null;
  const status = asString(p.status);
  const priority = asString(p.priority);
  const description = asString(p.description);
  const due = asString(p.due);
  const noteId = asString(p.note_id);
  const source = parseSourceRef(p.source);
  const task: Task = {
    id,
    title,
    ...(description !== undefined ? { description } : {}),
    status: status !== undefined && TASK_STATUS_SET.has(status) ? (status as TaskStatus) : "todo",
    ...(priority !== undefined && TASK_PRIORITY_SET.has(priority)
      ? { priority: priority as TaskPriority }
      : {}),
    ...(due !== undefined ? { due } : {}),
    tags: asStringArray(p.tags),
    ...(source ? { source } : {}),
    ...(noteId !== undefined && noteId in s.notes ? { note_id: noteId } : {}),
    created_at: at,
    updated_at: at,
  };
  return { ...s, tasks: { ...s.tasks, [id]: task } };
}

function taskUpdated(s: NotebookState, p: JsonObject, at: number): NotebookState | null {
  const id = asString(p.task_id);
  const task = id !== undefined ? s.tasks[id] : undefined;
  if (!task || !isObject(p.patch)) return null;
  const patch = p.patch;
  const next: Task = { ...task };
  let changed = false;

  const title = asString(patch.title);
  if (title !== undefined && title.trim().length > 0) {
    next.title = title.trim();
    changed = true;
  }
  if ("description" in patch) {
    const d = asString(patch.description);
    if (d !== undefined) next.description = d;
    else delete next.description;
    changed = true;
  }
  const status = asString(patch.status);
  if (status !== undefined && TASK_STATUS_SET.has(status)) {
    next.status = status as TaskStatus;
    changed = true;
  }
  if ("priority" in patch) {
    const pr = asString(patch.priority);
    if (pr !== undefined && TASK_PRIORITY_SET.has(pr)) next.priority = pr as TaskPriority;
    else delete next.priority;
    changed = true;
  }
  if ("due" in patch) {
    const due = asString(patch.due);
    if (due !== undefined) next.due = due;
    else delete next.due;
    changed = true;
  }
  if (Array.isArray(patch.tags)) {
    next.tags = asStringArray(patch.tags);
    changed = true;
  }
  if ("note_id" in patch) {
    const noteId = asString(patch.note_id);
    if (noteId !== undefined && noteId in s.notes) next.note_id = noteId;
    else delete next.note_id;
    changed = true;
  }

  if (!changed) return null;
  next.updated_at = at;
  return { ...s, tasks: { ...s.tasks, [task.id]: next } };
}

function taskMoved(s: NotebookState, p: JsonObject, at: number): NotebookState | null {
  const id = asString(p.task_id);
  const status = asString(p.status);
  const task = id !== undefined ? s.tasks[id] : undefined;
  if (!task || status === undefined || !TASK_STATUS_SET.has(status)) return null;
  if (task.status === status) return null;
  return {
    ...s,
    tasks: { ...s.tasks, [task.id]: { ...task, status: status as TaskStatus, updated_at: at } },
  };
}

function taskFromSelection(s: NotebookState, p: JsonObject, at: number): NotebookState | null {
  const id = asString(p.task_id);
  const text = (asString(p.text) ?? "").trim();
  if (id === undefined || id.length === 0 || id in s.tasks || text.length === 0) return null;
  const compact = text.replace(/\s+/g, " ");
  const noteId = asString(p.note_id);
  const source = parseSourceRef(p.source);
  const task: Task = {
    id,
    title: compact.length > 120 ? `${compact.slice(0, 119)}…` : compact,
    status: "todo",
    tags: [],
    ...(source ? { source } : {}),
    ...(noteId !== undefined && noteId in s.notes ? { note_id: noteId } : {}),
    created_at: at,
    updated_at: at,
  };
  return { ...s, tasks: { ...s.tasks, [id]: task } };
}

function notesReordered(s: NotebookState, p: JsonObject): NotebookState | null {
  if (!Array.isArray(p.order)) return null;
  const wanted = asStringArray(p.order).filter((id) => id in s.notes);
  // Défensif : aucune note ne disparaît de l'ordre manuel.
  const missing = s.order.filter((id) => !wanted.includes(id));
  const order = [...wanted, ...missing];
  return { ...s, order, tagIndex: rebuildTagIndex(s.notes, order) };
}
