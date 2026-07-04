/**
 * Spec PURE du Tool bloc-notes (Bloc-notes Universel) — node-safe,
 * importable par le moteur et les tests. Réf : docs/TOOL_BLOC_NOTES.md
 * (contrat FIGÉ, §3 pour le modèle de données).
 *
 * Règles de pureté (garde-fous testés) :
 *   - AUCUN React, AUCUN import moteur hors types Json ;
 *   - ne connaît NI le scénario, NI les mécaniques, NI le moteur ;
 *   - types = contrat §3, mot pour mot (state sérialisable, stocké dans
 *     workspace.toolStates["bloc-notes"], jamais réinitialisé).
 */

import type { Json, JsonObject } from "@/app/lib/engine/mechanics";
import { applyNotebookOp, emptyNotebookState, normalizeNotebookState } from "./model";

export const BLOC_NOTES_TOOL_ID = "bloc-notes";

// ─── Modèle de données (contrat §3) ───────────────────────────────
// Type aliases (pas d'interfaces) : l'index signature implicite les rend
// assignables à Json — l'état vit tel quel dans toolStates (sérialisable).

export type NoteId = string;
export type TaskId = string;
export type BlockId = string;

export type BlockMarks = { bold?: boolean; italic?: boolean; highlight?: string };

export type Block =
  | {
      id: BlockId;
      kind: "paragraph" | "heading1" | "heading2" | "separator";
      text: string;
      marks?: BlockMarks;
      children?: Block[];
    }
  | { id: BlockId; kind: "bullet" | "numbered"; text: string; marks?: BlockMarks; children?: Block[] }
  | { id: BlockId; kind: "todo"; text: string; checked: boolean; children?: Block[] }
  /** Extrait copié par une annotation. */
  | { id: BlockId; kind: "quote"; text: string };

export const BLOCK_KINDS = [
  "paragraph",
  "heading1",
  "heading2",
  "separator",
  "bullet",
  "numbered",
  "todo",
  "quote",
] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

/** Lien vers l'origine d'une note/tâche née d'une annotation — navigable. */
export type SourceRef =
  | { kind: "message"; thread_id: string; actor_id?: string; at: number; excerpt: string }
  | { kind: "mail"; mail_id: string; subject: string; from: string; at: number; excerpt: string }
  | { kind: "document"; document_id: string; excerpt: string };

export type Note = {
  id: NoteId;
  title: string;
  /** Hiérarchie : children imbriqués. */
  blocks: Block[];
  tags: string[];
  /** Note née d'une annotation. */
  source?: SourceRef;
  created_at: number;
  updated_at: number;
};

export const TASK_STATUSES = ["todo", "doing", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "normal", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export type Task = {
  id: TaskId;
  title: string;
  description?: string;
  status: TaskStatus;
  priority?: TaskPriority;
  due?: string;
  tags: string[];
  source?: SourceRef;
  note_id?: NoteId;
  created_at: number;
  updated_at: number;
};

export type NotebookState = {
  notes: Record<NoteId, Note>;
  tasks: Record<TaskId, Task>;
  /** Dérivé MAINTENU par le reducer (model.ts) : tag → notes portant le tag. */
  tagIndex: Record<string, NoteId[]>;
  /** Ordre manuel des notes. */
  order: NoteId[];
};

// ─── Contrat Tool (initialState / describeForObservation / applyOp) ─

export function initialNotebookState(_config: JsonObject): NotebookState {
  return emptyNotebookState();
}

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "à faire",
  doing: "en cours",
  done: "terminées",
};

function truncate(text: string, max: number): string {
  const single = text.replace(/\s+/g, " ").trim();
  return single.length > max ? `${single.slice(0, max - 1)}…` : single;
}

/**
 * Résumé LISIBLE du carnet pour l'observateur IA : titres, tags, tâches
 * par statut. Jamais de logique d'évaluation ici — l'IA observe, le
 * moteur décide. Pur : n'altère jamais l'état, déterministe.
 */
export function describeNotebookForObservation(state: Json): string {
  const s = normalizeNotebookState(state);
  const notes = s.order.map((id) => s.notes[id]).filter((n): n is Note => Boolean(n));
  const tasks = Object.values(s.tasks);
  if (notes.length === 0 && tasks.length === 0) {
    return "Bloc-notes universel vide : aucune note, aucune tâche.";
  }

  const lines: string[] = [
    `Bloc-notes universel : ${notes.length} note(s), ${tasks.length} tâche(s).`,
  ];

  if (notes.length > 0) {
    lines.push("Notes :");
    for (const note of notes.slice(0, 20)) {
      const tags = note.tags.length > 0 ? ` [tags : ${note.tags.join(", ")}]` : "";
      const origin = note.source ? ` (annotation depuis ${note.source.kind})` : "";
      const body = flattenBlocksText(note.blocks);
      const excerpt = body ? ` — ${truncate(body, 120)}` : "";
      lines.push(`- « ${truncate(note.title, 80) || "(sans titre)"} »${tags}${origin}${excerpt}`);
    }
    if (notes.length > 20) lines.push(`… et ${notes.length - 20} autre(s) note(s).`);
  }

  const tags = Object.entries(s.tagIndex)
    .filter(([, ids]) => ids.length > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  if (tags.length > 0) {
    lines.push(`Tags : ${tags.map(([tag, ids]) => `${tag} (${ids.length})`).join(", ")}.`);
  }

  if (tasks.length > 0) {
    const parts: string[] = [];
    for (const status of TASK_STATUSES) {
      const of = tasks.filter((t) => t.status === status);
      if (of.length === 0) continue;
      parts.push(
        `${TASK_STATUS_LABELS[status]} (${of.length}) : ${of
          .slice(0, 10)
          .map((t) => `« ${truncate(t.title, 60)} »`)
          .join(", ")}`,
      );
    }
    lines.push(`Tâches — ${parts.join(" ; ")}.`);
  }

  return lines.join("\n");
}

/** Texte à plat d'une hiérarchie de blocs (children compris). */
function flattenBlocksText(blocks: Block[]): string {
  const parts: string[] = [];
  const walk = (list: Block[]): void => {
    for (const b of list) {
      if (b.kind !== "separator" && b.text.trim().length > 0) parts.push(b.text.trim());
      if (b.kind !== "quote" && Array.isArray(b.children)) walk(b.children);
    }
  };
  walk(blocks);
  return parts.join(" · ");
}

/**
 * La spec enregistrée dans le TOOL_REGISTRY. `applyOp` est LE reducer
 * pur du carnet (model.ts), câblé au moteur par le WorkspacePlayer via
 * ReducerOptions.toolAppliers — le moteur reste ignorant des ops.
 */
export const blocNotesSpec = {
  id: BLOC_NOTES_TOOL_ID,
  title: "Bloc-notes universel",
  icon: "📓",
  initialState: initialNotebookState,
  describeForObservation: describeNotebookForObservation,
  applyOp: applyNotebookOp,
} as const;
