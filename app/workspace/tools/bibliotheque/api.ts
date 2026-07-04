/**
 * api.ts — l'API PUBLIQUE du Gestionnaire Documentaire Universel, LA
 * seule porte d'entrée (docs/TOOL_GESTIONNAIRE_DOC.md §4). Consommée par
 * l'UI du module (BibliothequeApp, ReaderAugmente…) ET par les apps hôtes
 * (ArchiveButton dans Mail/Messages) — jamais de mutation directe.
 *
 *   - Constructeurs d'ops TYPÉS : chaque appel rend une action `tool_op`
 *     prête à être dispatchée (journalisée, puis appliquée par
 *     applyLibraryOp via le TOOL_REGISTRY). Les ids et l'horodatage sont
 *     générés ICI (le reducer reste déterministe : tout voyage dans le
 *     payload → replay à l'identique). Les tests passent {id, at} explicites.
 *   - Sélecteurs PURS de lecture : acceptent le Json brut de
 *     toolStates["bibliotheque"] (null compris) — normalisation défensive.
 *
 * PUR et node-safe : aucun React, aucun import moteur hors types Json.
 */

import type { Json, JsonObject } from "@/app/lib/engine/mechanics";
import type {
  Annotation,
  ArchivedMailSnapshot,
  ArchivedThreadSnapshot,
  DeskLayout,
  DocEntry,
  EntryId,
  EntrySourceKind,
  Folder,
  FolderId,
  LibraryState,
  SavedDesk,
} from "./spec";
import { BIBLIOTHEQUE_TOOL_ID } from "./spec";
import type { LibraryOpName } from "./model";
import { normalizeLibraryState } from "./model";

export { LIBRARY_OPS, normalizeLibraryState, applyLibraryOp } from "./model";
export type { LibraryOpName } from "./model";

// ─── L'action tool_op du dossier ───────────────────────────────────
// Type LOCAL structurellement identique au membre `tool_op` de
// WorkspaceAction (le module n'importe pas le moteur — garde-fou testé).

export interface LibraryToolOp {
  type: "tool_op";
  tool_id: typeof BIBLIOTHEQUE_TOOL_ID;
  op: LibraryOpName;
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

function op(name: LibraryOpName, payload: JsonObject): LibraryToolOp {
  return { type: "tool_op", tool_id: BIBLIOTHEQUE_TOOL_ID, op: name, payload };
}

// ─── Constructeurs d'ops (contrat §4) ──────────────────────────────

/** Indexe automatiquement un document du scénario (idempotent par document_id). */
export function indexScenarioDoc(
  documentId: string,
  title?: string,
  opts: OpOptions & { folder_id?: FolderId; tags?: string[] } = {},
): LibraryToolOp {
  const payload: JsonObject = {
    entry_id: opts.id ?? uid("entry"),
    document_id: documentId,
    at: opts.at ?? Date.now(),
  };
  if (title !== undefined) payload.title = title;
  if (opts.folder_id !== undefined) payload.folder_id = opts.folder_id;
  if (opts.tags !== undefined) payload.tags = opts.tags;
  return op("scenario_doc_indexed", payload);
}

export interface ArchiveMailInput {
  mail_id: string;
  snapshot: ArchivedMailSnapshot;
  title?: string;
  folder_id?: FolderId;
  tags?: string[];
}

/** « Ajouter au dossier documentaire » depuis Mail (snapshot horodaté). */
export function archiveMail(input: ArchiveMailInput, opts: OpOptions = {}): LibraryToolOp {
  const payload: JsonObject = {
    entry_id: opts.id ?? uid("entry"),
    mail_id: input.mail_id,
    snapshot: input.snapshot as unknown as Json,
    at: opts.at ?? Date.now(),
  };
  if (input.title !== undefined) payload.title = input.title;
  if (input.folder_id !== undefined) payload.folder_id = input.folder_id;
  if (input.tags !== undefined) payload.tags = input.tags;
  return op("mail_archived", payload);
}

export interface ArchiveThreadInput {
  thread_id: string;
  snapshot: ArchivedThreadSnapshot;
  title?: string;
  folder_id?: FolderId;
  tags?: string[];
}

/** « Ajouter au dossier documentaire » depuis Messages (fil / sélection).
 *  Le snapshot est construit par l'hôte (sélection éventuelle de messages). */
export function archiveThread(input: ArchiveThreadInput, opts: OpOptions = {}): LibraryToolOp {
  const payload: JsonObject = {
    entry_id: opts.id ?? uid("entry"),
    thread_id: input.thread_id,
    snapshot: input.snapshot as unknown as Json,
    at: opts.at ?? Date.now(),
  };
  if (input.title !== undefined) payload.title = input.title;
  if (input.folder_id !== undefined) payload.folder_id = input.folder_id;
  if (input.tags !== undefined) payload.tags = input.tags;
  return op("thread_archived", payload);
}

export function removeEntry(entryId: EntryId): LibraryToolOp {
  return op("entry_removed", { entry_id: entryId });
}

export function openEntry(entryId: EntryId, opts: OpOptions = {}): LibraryToolOp {
  return op("entry_opened", { entry_id: entryId, at: opts.at ?? Date.now() });
}

export function closeEntry(entryId: EntryId): LibraryToolOp {
  return op("entry_closed", { entry_id: entryId });
}

export function setLayout(layout: DeskLayout): LibraryToolOp {
  return op("layout_set", { layout });
}

/** Comparer deux entrées côte à côte ; sans argument → efface la comparaison. */
export function setCompare(a?: EntryId, b?: EntryId): LibraryToolOp {
  const payload: JsonObject = {};
  if (a !== undefined) payload.a = a;
  if (b !== undefined) payload.b = b;
  return op("compare_set", payload);
}

export function clearCompare(): LibraryToolOp {
  return op("compare_set", {});
}

/** Déplacer une entrée dans un dossier ; folderId null → retirer du dossier. */
export function moveToFolder(entryId: EntryId, folderId: FolderId | null): LibraryToolOp {
  const payload: JsonObject = { entry_id: entryId };
  if (folderId !== null) payload.folder_id = folderId;
  return op("entry_moved_to_folder", payload);
}

export function createFolder(name: string, opts: OpOptions = {}): LibraryToolOp {
  return op("folder_created", { folder_id: opts.id ?? uid("folder"), name });
}

export function renameFolder(folderId: FolderId, name: string): LibraryToolOp {
  return op("folder_renamed", { folder_id: folderId, name });
}

export function deleteFolder(folderId: FolderId): LibraryToolOp {
  return op("folder_deleted", { folder_id: folderId });
}

export function addTag(entryId: EntryId, tag: string): LibraryToolOp {
  return op("tag_added", { entry_id: entryId, tag });
}

export function removeTag(entryId: EntryId, tag: string): LibraryToolOp {
  return op("tag_removed", { entry_id: entryId, tag });
}

export function togglePin(entryId: EntryId): LibraryToolOp {
  return op("pin_toggled", { entry_id: entryId });
}

export function toggleFavorite(entryId: EntryId): LibraryToolOp {
  return op("favorite_toggled", { entry_id: entryId });
}

export function addHighlight(
  entryId: EntryId,
  input: { anchor: string; excerpt: string; color?: string },
  opts: OpOptions = {},
): LibraryToolOp {
  const payload: JsonObject = {
    entry_id: entryId,
    annotation_id: opts.id ?? uid("ann"),
    anchor: input.anchor,
    excerpt: input.excerpt,
    at: opts.at ?? Date.now(),
  };
  if (input.color !== undefined) payload.color = input.color;
  return op("highlight_added", payload);
}

export function addComment(
  entryId: EntryId,
  input: { text: string; anchor?: string; excerpt?: string },
  opts: OpOptions = {},
): LibraryToolOp {
  const payload: JsonObject = {
    entry_id: entryId,
    annotation_id: opts.id ?? uid("ann"),
    text: input.text,
    at: opts.at ?? Date.now(),
  };
  if (input.anchor !== undefined) payload.anchor = input.anchor;
  if (input.excerpt !== undefined) payload.excerpt = input.excerpt;
  return op("comment_added", payload);
}

export function addBookmark(
  entryId: EntryId,
  input: { label: string; anchor: string },
  opts: OpOptions = {},
): LibraryToolOp {
  return op("bookmark_added", {
    entry_id: entryId,
    bookmark_id: opts.id ?? uid("bm"),
    label: input.label,
    anchor: input.anchor,
  });
}

export function removeAnnotation(entryId: EntryId, annotationId: string): LibraryToolOp {
  return op("annotation_removed", { entry_id: entryId, annotation_id: annotationId });
}

export function linkEntries(a: EntryId, b: EntryId, label?: string): LibraryToolOp {
  const payload: JsonObject = { a, b };
  if (label !== undefined) payload.label = label;
  return op("entries_linked", payload);
}

export function unlinkEntries(a: EntryId, b: EntryId): LibraryToolOp {
  return op("entries_unlinked", { a, b });
}

export function reorderWindows(order: EntryId[]): LibraryToolOp {
  return op("windows_reordered", { order: [...order] });
}

// ─── Bureaux personnalisés ─────────────────────────────────────────
export function createDesk(name: string, opts: OpOptions & { entry_ids?: EntryId[] } = {}): LibraryToolOp {
  const payload: JsonObject = { desk_id: opts.id ?? uid("bureau"), name, at: opts.at ?? Date.now() };
  if (opts.entry_ids !== undefined) payload.entry_ids = opts.entry_ids;
  return op("desk_created", payload);
}
export function renameDesk(deskId: string, name: string): LibraryToolOp {
  return op("desk_renamed", { desk_id: deskId, name });
}
export function deleteDesk(deskId: string): LibraryToolOp {
  return op("desk_deleted", { desk_id: deskId });
}
export function addToDesk(deskId: string, entryId: EntryId): LibraryToolOp {
  return op("desk_entry_added", { desk_id: deskId, entry_id: entryId });
}
export function removeFromDesk(deskId: string, entryId: EntryId): LibraryToolOp {
  return op("desk_entry_removed", { desk_id: deskId, entry_id: entryId });
}

/** Bureaux personnalisés, triés par création. */
export function selectDesks(state: Json): SavedDesk[] {
  return Object.values(normalizeLibraryState(state).desks).sort(
    (a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id),
  );
}
/** Les documents d'un bureau, dans l'ordre où ils y ont été déposés. */
export function selectDeskEntries(state: Json, deskId: string): DocEntry[] {
  const s = normalizeLibraryState(state);
  const d = s.desks[deskId];
  if (!d) return [];
  return d.entry_ids.map((id) => s.entries[id]).filter((e): e is DocEntry => Boolean(e));
}

// ─── Sélecteurs PURS (lecture — app, lecteur, replay/débrief) ──────

export function selectLibrary(state: Json): LibraryState {
  return normalizeLibraryState(state);
}

export function selectEntry(state: Json, entryId: EntryId): DocEntry | null {
  return normalizeLibraryState(state).entries[entryId] ?? null;
}

export function selectAllEntries(state: Json): DocEntry[] {
  return Object.values(normalizeLibraryState(state).entries);
}

/** Entrées d'un dossier ; folderId null → entrées sans dossier. */
export function selectByFolder(state: Json, folderId: FolderId | null): DocEntry[] {
  return selectAllEntries(state).filter((e) =>
    folderId === null ? e.folder_id === undefined : e.folder_id === folderId,
  );
}

export function selectByTag(state: Json, tag: string): DocEntry[] {
  return selectAllEntries(state).filter((e) => e.tags.includes(tag));
}

export type SortKey = "added" | "opened" | "alpha" | "favorites" | "type" | "tags";

/** Tri stable des entrées selon un critère (contrat §4). */
export function selectSorted(state: Json, by: SortKey): DocEntry[] {
  const entries = selectAllEntries(state);
  const cmp = (a: DocEntry, b: DocEntry): number => {
    switch (by) {
      case "added":
        return b.added_at - a.added_at;
      case "opened":
        return (b.last_opened_at ?? 0) - (a.last_opened_at ?? 0) || b.added_at - a.added_at;
      case "alpha":
        return a.title.localeCompare(b.title, "fr", { sensitivity: "base" });
      case "favorites":
        return Number(b.favorite) - Number(a.favorite) || b.added_at - a.added_at;
      case "type":
        return a.source.kind.localeCompare(b.source.kind) || b.added_at - a.added_at;
      case "tags":
        return (b.tags.length ? 1 : 0) - (a.tags.length ? 1 : 0) ||
          (a.tags[0] ?? "").localeCompare(b.tags[0] ?? "") ||
          b.added_at - a.added_at;
      default:
        return 0;
    }
  };
  return [...entries].sort((a, b) => cmp(a, b) || a.id.localeCompare(b.id));
}

/** Récemment consultées (last_opened_at, à défaut ajout) — plus récent d'abord. */
export function selectRecent(state: Json, limit = 10): DocEntry[] {
  return [...selectAllEntries(state)]
    .sort(
      (a, b) =>
        (b.last_opened_at ?? b.added_at) - (a.last_opened_at ?? a.added_at) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, Math.max(0, limit));
}

export function selectPinned(state: Json): DocEntry[] {
  return selectAllEntries(state)
    .filter((e) => e.pinned)
    .sort((a, b) => b.added_at - a.added_at || a.id.localeCompare(b.id));
}

export function selectFavorites(state: Json): DocEntry[] {
  return selectAllEntries(state)
    .filter((e) => e.favorite)
    .sort((a, b) => b.added_at - a.added_at || a.id.localeCompare(b.id));
}

export function selectFolders(state: Json): Folder[] {
  return Object.values(normalizeLibraryState(state).folders).sort(
    (a, b) => a.order - b.order || a.id.localeCompare(b.id),
  );
}

/** Tous les tags avec leur nombre d'entrées, triés alphabétiquement. */
export function selectAllTags(state: Json): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of selectAllEntries(state)) {
    for (const tag of e.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
}

/** Fenêtres ouvertes du bureau, dans l'ordre de disposition. */
export function selectOpenWindows(state: Json): DocEntry[] {
  const s = normalizeLibraryState(state);
  return [...s.desk.windows]
    .sort((a, b) => a.order - b.order)
    .map((w) => s.entries[w.entry_id])
    .filter((e): e is DocEntry => Boolean(e));
}

/** La paire en comparaison, résolue en entrées (ou null). */
export function selectCompare(state: Json): [DocEntry, DocEntry] | null {
  const s = normalizeLibraryState(state);
  if (!s.desk.compare) return null;
  const [a, b] = s.desk.compare;
  const ea = s.entries[a];
  const eb = s.entries[b];
  return ea && eb ? [ea, eb] : null;
}

/** Entrées liées à une entrée (liens navigables doc↔doc). */
export function selectLinks(state: Json, entryId: EntryId): DocEntry[] {
  const s = normalizeLibraryState(state);
  const entry = s.entries[entryId];
  if (!entry) return [];
  return entry.links
    .map((l) => s.entries[l.entry_id])
    .filter((e): e is DocEntry => Boolean(e));
}

// ─── Recherche plein texte (sélecteur PUR) ─────────────────────────

/** Résout le contenu texte d'un scenario_doc (fourni par l'hôte — le Tool
 *  ne connaît pas le scénario). Les mails/fils sont auto-portés (snapshot). */
export type ResolveContent = (documentId: string) => string;

function annotationText(a: Annotation): string {
  return a.kind === "highlight" ? a.excerpt : `${a.text} ${a.excerpt ?? ""}`;
}

/** Le foin de recherche d'une entrée : titre, tags, annotations, contenu. */
export function entryHaystack(entry: DocEntry, resolveContent?: ResolveContent): string {
  const parts: string[] = [entry.title, entry.tags.join(" ")];
  for (const a of entry.annotations) parts.push(annotationText(a));
  for (const b of entry.bookmarks) parts.push(b.label);
  const src = entry.source;
  if (src.kind === "scenario_doc") {
    parts.push("document");
    if (resolveContent) parts.push(resolveContent(src.document_id));
  } else if (src.kind === "archived_mail") {
    const m = src.snapshot;
    parts.push("mail", m.from, m.to.join(" "), m.subject, m.body);
  } else {
    parts.push("fil", "messages", src.snapshot.title);
    for (const msg of src.snapshot.messages) parts.push(msg.from, msg.content);
  }
  return parts.join(" \n ").toLowerCase();
}

/**
 * Recherche plein texte instantanée (pas d'I/O) : tous les mots de la
 * requête doivent apparaître (AND). Requête vide → toutes les entrées.
 * Résultat trié par ajout décroissant (plus récent d'abord).
 */
export function searchEntries(
  state: Json,
  query: string,
  resolveContent?: ResolveContent,
): DocEntry[] {
  const entries = selectAllEntries(state).sort(
    (a, b) => b.added_at - a.added_at || a.id.localeCompare(b.id),
  );
  const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return entries;
  return entries.filter((e) => {
    const hay = entryHaystack(e, resolveContent);
    return tokens.every((t) => hay.includes(t));
  });
}

export type { EntrySourceKind };
