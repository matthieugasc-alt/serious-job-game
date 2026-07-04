/**
 * api.ts — l'API PUBLIQUE du Bloc-notes Universel, LA seule porte
 * d'entrée (docs/TOOL_BLOC_NOTES.md §4). Consommée par l'UI du module
 * (BlocNotesApp, QuickPanel) ET par les apps hôtes (AnnotateButton) —
 * jamais de mutation directe de l'état.
 *
 *   - Constructeurs d'ops TYPÉS : chaque appel rend une action
 *     `tool_op` prête à être dispatchée au moteur (journalisée, puis
 *     appliquée par applyNotebookOp via le TOOL_REGISTRY). Les ids et
 *     l'horodatage sont générés ICI (le reducer reste déterministe :
 *     tout voyage dans le payload → replay à l'identique). Les tests
 *     passent `opts {id, at}` explicites.
 *   - Sélecteurs PURS de lecture : acceptent le Json brut de
 *     toolStates["bloc-notes"] (null compris) — normalisation défensive.
 *
 * PUR et node-safe : aucun React, aucun import moteur hors types Json.
 */

import type { Json, JsonObject } from "@/app/lib/engine/mechanics";
import type {
  Block,
  Note,
  NoteId,
  NotebookState,
  SourceRef,
  Task,
  TaskId,
  TaskPriority,
  TaskStatus,
} from "./spec";
import { BLOC_NOTES_TOOL_ID } from "./spec";
import type { NotebookOpName } from "./model";
import { normalizeNotebookState } from "./model";

export { NOTEBOOK_OPS, normalizeNotebookState, applyNotebookOp } from "./model";
export type { NotebookOpName } from "./model";

// ─── L'action tool_op du carnet ────────────────────────────────────
// Type LOCAL structurellement identique au membre `tool_op` de
// WorkspaceAction (le module n'importe pas le moteur — garde-fou testé).

export interface NotebookToolOp {
  type: "tool_op";
  tool_id: typeof BLOC_NOTES_TOOL_ID;
  op: NotebookOpName;
  payload: JsonObject;
}

/** Surcharges de test/replay : id et horodatage explicites. */
export interface OpOptions {
  id?: string;
  at?: number;
}

let uidCounter = 0;
function uid(prefix: string): string {
  uidCounter = (uidCounter + 1) % 1_679_616; // 36^4
  return `${prefix}_${Date.now().toString(36)}_${uidCounter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

function op(name: NotebookOpName, payload: JsonObject): NotebookToolOp {
  return { type: "tool_op", tool_id: BLOC_NOTES_TOOL_ID, op: name, payload };
}

// ─── Constructeurs d'ops (contrat §4) ──────────────────────────────

export function createNote(title?: string, opts: OpOptions = {}): NotebookToolOp {
  return op("note_created", {
    note_id: opts.id ?? uid("note"),
    title: title ?? "",
    at: opts.at ?? Date.now(),
  });
}

export function updateBlocks(noteId: NoteId, blocks: Block[], opts: OpOptions = {}): NotebookToolOp {
  return op("blocks_updated", {
    note_id: noteId,
    blocks: blocks as unknown as Json,
    at: opts.at ?? Date.now(),
  });
}

export function renameNote(noteId: NoteId, title: string, opts: OpOptions = {}): NotebookToolOp {
  return op("note_renamed", { note_id: noteId, title, at: opts.at ?? Date.now() });
}

export function deleteNote(noteId: NoteId, opts: OpOptions = {}): NotebookToolOp {
  return op("note_deleted", { note_id: noteId, at: opts.at ?? Date.now() });
}

export function addTag(noteId: NoteId, tag: string, opts: OpOptions = {}): NotebookToolOp {
  return op("tag_added", { note_id: noteId, tag, at: opts.at ?? Date.now() });
}

export function removeTag(noteId: NoteId, tag: string, opts: OpOptions = {}): NotebookToolOp {
  return op("tag_removed", { note_id: noteId, tag, at: opts.at ?? Date.now() });
}

export function toggleTodo(noteId: NoteId, blockId: string, opts: OpOptions = {}): NotebookToolOp {
  return op("todo_toggled", { note_id: noteId, block_id: blockId, at: opts.at ?? Date.now() });
}

/**
 * Annotation depuis une app hôte (Messages, Documents, Mail) : crée une
 * note « quote (extrait) + commentaire + source + heure » (contrat §5).
 */
export function annotate(
  input: { source: SourceRef; excerpt: string; comment?: string; title?: string },
  opts: OpOptions = {},
): NotebookToolOp {
  const payload: JsonObject = {
    note_id: opts.id ?? uid("note"),
    source: input.source as unknown as Json,
    excerpt: input.excerpt,
    comment: input.comment ?? "",
    at: opts.at ?? Date.now(),
  };
  // Titre de la note groupée par source (ex. « Messages de Emma Ricci »).
  if (input.title !== undefined) payload.title = input.title;
  return op("annotation_added", payload);
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  due?: string;
  tags?: string[];
  source?: SourceRef;
  note_id?: NoteId;
}

export function createTask(partial: CreateTaskInput, opts: OpOptions = {}): NotebookToolOp {
  const payload: JsonObject = {
    task_id: opts.id ?? uid("task"),
    title: partial.title,
    at: opts.at ?? Date.now(),
  };
  if (partial.description !== undefined) payload.description = partial.description;
  if (partial.status !== undefined) payload.status = partial.status;
  if (partial.priority !== undefined) payload.priority = partial.priority;
  if (partial.due !== undefined) payload.due = partial.due;
  if (partial.tags !== undefined) payload.tags = partial.tags;
  if (partial.source !== undefined) payload.source = partial.source as unknown as Json;
  if (partial.note_id !== undefined) payload.note_id = partial.note_id;
  return op("task_created", payload);
}

export type UpdateTaskPatch = Partial<{
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority | null;
  due: string | null;
  tags: string[];
  note_id: NoteId | null;
}>;

export function updateTask(
  taskId: TaskId,
  patch: UpdateTaskPatch,
  opts: OpOptions = {},
): NotebookToolOp {
  return op("task_updated", {
    task_id: taskId,
    patch: patch as unknown as Json,
    at: opts.at ?? Date.now(),
  });
}

export function moveTask(taskId: TaskId, status: TaskStatus, opts: OpOptions = {}): NotebookToolOp {
  return op("task_moved", { task_id: taskId, status, at: opts.at ?? Date.now() });
}

/** Tâche née d'une sélection de texte (note active et/ou source hôte). */
export function taskFromSelection(
  text: string,
  noteId?: NoteId,
  source?: SourceRef,
  opts: OpOptions = {},
): NotebookToolOp {
  const payload: JsonObject = {
    task_id: opts.id ?? uid("task"),
    text,
    at: opts.at ?? Date.now(),
  };
  if (noteId !== undefined) payload.note_id = noteId;
  if (source !== undefined) payload.source = source as unknown as Json;
  return op("task_from_selection", payload);
}

export function reorderNotes(order: NoteId[], opts: OpOptions = {}): NotebookToolOp {
  return op("notes_reordered", { order: [...order], at: opts.at ?? Date.now() });
}

// ─── Sélecteurs PURS (lecture — app, quick panel, replay/débrief) ──

/** Toutes les notes, dans l'ordre MANUEL (state.order). */
export function selectAll(state: Json): Note[] {
  const s = normalizeNotebookState(state);
  return s.order.map((id) => s.notes[id]).filter((n): n is Note => Boolean(n));
}

/** Notes les plus récemment MODIFIÉES d'abord (updated_at desc). */
export function selectRecent(state: Json, limit = 10): Note[] {
  return [...selectAll(state)]
    .sort((a, b) => b.updated_at - a.updated_at || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, limit));
}

/** Notes portant le tag, dans l'ordre manuel (via tagIndex maintenu). */
export function selectByTag(state: Json, tag: string): Note[] {
  const s = normalizeNotebookState(state);
  return (s.tagIndex[tag] ?? [])
    .map((id) => s.notes[id])
    .filter((n): n is Note => Boolean(n));
}

/** Vue chronologique : notes les plus récemment CRÉÉES d'abord. */
export function selectChronological(state: Json): Note[] {
  return [...selectAll(state)].sort(
    (a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id),
  );
}

/** Colonne kanban : tâches d'un statut, plus anciennes d'abord. */
export function selectTasksByStatus(state: Json, status: TaskStatus): Task[] {
  const s = normalizeNotebookState(state);
  return Object.values(s.tasks)
    .filter((t) => t.status === status)
    .sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id));
}

// ─── Sélecteurs complémentaires (UI : détail, tags, base de données) ─

export function selectNote(state: Json, noteId: NoteId): Note | null {
  return normalizeNotebookState(state).notes[noteId] ?? null;
}

export function selectTask(state: Json, taskId: TaskId): Task | null {
  return normalizeNotebookState(state).tasks[taskId] ?? null;
}

/** Tous les tags avec leur nombre de notes, triés alphabétiquement. */
export function selectTags(state: Json): { tag: string; count: number }[] {
  const s = normalizeNotebookState(state);
  return Object.entries(s.tagIndex)
    .filter(([, ids]) => ids.length > 0)
    .map(([tag, ids]) => ({ tag, count: ids.length }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
}

/** Toutes les tâches (vue base de données), plus récentes d'abord. */
export function selectAllTasks(state: Json): Task[] {
  const s = normalizeNotebookState(state);
  return Object.values(s.tasks).sort(
    (a, b) => b.updated_at - a.updated_at || a.id.localeCompare(b.id),
  );
}

/** L'état normalisé complet (vue base de données / debug). */
export function selectNotebook(state: Json): NotebookState {
  return normalizeNotebookState(state);
}
