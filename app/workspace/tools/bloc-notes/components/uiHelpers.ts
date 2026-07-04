/**
 * Helpers UI internes du Bloc-notes — AUCUNE logique moteur.
 * La vérité du modèle vit dans spec.ts/model.ts ; ici uniquement :
 * lecture défensive de l'état, fabrique d'identifiants de blocs côté
 * éditeur, extraction d'ids depuis les ops, petits formats d'affichage.
 */

import type { JsonObject } from "@/app/lib/engine/mechanics";
import type { WorkspaceAction, WorkspaceState } from "@/app/lib/engine/workspace";
import { normalizeNotebookState } from "../api";
import { BLOC_NOTES_TOOL_ID } from "../spec";
import type { Block, Note, NotebookState } from "../spec";

/** État normalisé du carnet lu dans le workspace (défensif, jamais null). */
export function notebookStateOf(ws: WorkspaceState): NotebookState {
  return normalizeNotebookState(ws.toolStates[BLOC_NOTES_TOOL_ID] ?? null);
}

// ─── Identifiants ─────────────────────────────────────────────────

let seq = 0;
export function uid(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

/**
 * Extrait l'id (note_id / task_id) du payload d'une op construite par
 * api.ts — point UNIQUE d'accès pour rester résilient au format exact
 * du payload (clé directe, "id", ou objet imbriqué note/task).
 */
export function opPayloadId(action: WorkspaceAction, key: "note_id" | "task_id"): string | null {
  const a = action as unknown as { type?: string; payload?: JsonObject };
  const p = a.payload;
  if (!p || typeof p !== "object") return null;
  const direct = p[key];
  if (typeof direct === "string") return direct;
  const nested = p[key === "note_id" ? "note" : "task"];
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const id = (nested as JsonObject).id;
    if (typeof id === "string") return id;
  }
  const id = p.id;
  return typeof id === "string" ? id : null;
}

// ─── Blocs — forme souple côté éditeur ────────────────────────────

export type BlockKind =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "separator"
  | "bullet"
  | "numbered"
  | "todo"
  | "quote";

export interface BlockMarks {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  highlight?: string;
}

/** Vue unifiée des variantes de Block (contrat §3) pour l'éditeur. */
export interface AnyBlock {
  id: string;
  kind: BlockKind;
  text: string;
  checked?: boolean;
  marks?: BlockMarks;
  children?: AnyBlock[];
}

export const asBlocks = (blocks: AnyBlock[]): Block[] => blocks as unknown as Block[];
export const asAnyBlocks = (blocks: Block[] | undefined): AnyBlock[] =>
  (blocks ?? []) as unknown as AnyBlock[];

export function newBlock(kind: BlockKind = "paragraph", text = ""): AnyBlock {
  const b: AnyBlock = { id: uid("blk"), kind, text };
  if (kind === "todo") b.checked = false;
  return b;
}

/** Type MIME du glisser-déposer d'un bloc VERS UNE AUTRE NOTE (payload
 *  JSON { sourceNoteId, block }). Distinct du réordonnancement intra-note. */
export const BLOCK_MOVE_MIME = "application/bloc-notes-move";

/** Retire un bloc (et son sous-arbre) par id — récursif, immuable. */
export function removeBlockById(blocks: AnyBlock[], id: string): AnyBlock[] {
  const out: AnyBlock[] = [];
  for (const b of blocks) {
    if (b.id === id) continue;
    out.push(b.children ? { ...b, children: removeBlockById(b.children, id) } : b);
  }
  return out;
}

/** Régénère les ids d'un bloc et de ses enfants (copie sans collision). */
export function regenBlockIds(b: AnyBlock): AnyBlock {
  return { ...b, id: uid("blk"), ...(b.children ? { children: b.children.map(regenBlockIds) } : {}) };
}

// ─── Lectures d'affichage ─────────────────────────────────────────

/** Premier texte non vide d'une note — aperçu des listes. */
export function noteExcerpt(note: Note): string {
  const walk = (blocks: AnyBlock[]): string => {
    for (const b of blocks) {
      if (b.kind !== "separator" && b.text?.trim()) return b.text.trim();
      if (b.children?.length) {
        const c = walk(b.children);
        if (c) return c;
      }
    }
    return "";
  };
  return walk(asAnyBlocks(note.blocks));
}

/** Recherche plein texte (titre + tags + blocs), insensible à la casse. */
export function noteMatches(note: Note, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  if (note.title.toLowerCase().includes(needle)) return true;
  if (note.tags.some((t) => t.toLowerCase().includes(needle))) return true;
  const walk = (blocks: AnyBlock[]): boolean =>
    blocks.some(
      (b) =>
        (b.text ?? "").toLowerCase().includes(needle) ||
        (b.children ? walk(b.children) : false),
    );
  return walk(asAnyBlocks(note.blocks));
}

export function allTags(state: NotebookState): string[] {
  return Object.keys(state.tagIndex).sort((a, b) => a.localeCompare(b, "fr"));
}

export function fmtDay(at: number): string {
  return new Date(at).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function fmtShort(at: number): string {
  const d = new Date(at);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}
