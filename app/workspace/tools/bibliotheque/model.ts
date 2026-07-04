/**
 * model.ts — le reducer PUR du Gestionnaire Documentaire Universel.
 * Réf : docs/TOOL_GESTIONNAIRE_DOC.md §3/§4 ; pattern docs/TOOL_BLOC_NOTES.md §2.
 *
 * `applyLibraryOp(state, op, payload) → state` :
 *   - PUR et node-safe : aucun React, aucun import moteur hors types Json,
 *     aucune horloge (l'horodatage `at` voyage dans le payload — le
 *     journal rejoue les ops à l'identique) ;
 *   - IMMUTABLE : ne mute jamais l'état reçu — rend un nouvel objet
 *     (partage structurel), ou l'état d'origine tel quel si l'op est
 *     inconnue / invalide (no-op défensif, l'op reste journalisée) ;
 *   - DÉFENSIF : payload invalide, entrée/dossier introuvable → no-op ;
 *   - INVARIANTS : l'entrée en bibliothèque est un CHOIX (contrat §2) —
 *     indexer un scenario_doc déjà présent, ou ré-archiver un mail/fil
 *     déjà archivé, est un no-op (dédup par source → zéro bruit) ;
 *     folder_id/links/desk toujours cohérents (normalisation défensive).
 *
 * N'importe que des types depuis spec.ts (import type, effacé au build :
 * pas de cycle runtime — spec.ts importe les fonctions d'ici).
 */

import type { Json, JsonObject } from "@/app/lib/engine/mechanics";
import type {
  Annotation,
  ArchivedMailSnapshot,
  ArchivedThreadSnapshot,
  Bookmark,
  DeskLayout,
  DeskState,
  DocEntry,
  EntryId,
  EntryLink,
  EntrySource,
  Folder,
  FolderId,
  LibraryState,
  SavedDesk,
} from "./spec";

// ─── Ops (union FERMÉE côté dossier — le moteur ne la connaît pas) ──

export const LIBRARY_OPS = [
  "scenario_doc_indexed",
  "mail_archived",
  "thread_archived",
  "entry_removed",
  "entry_opened",
  "entry_closed",
  "layout_set",
  "compare_set",
  "entry_moved_to_folder",
  "folder_created",
  "folder_renamed",
  "folder_deleted",
  "tag_added",
  "tag_removed",
  "pin_toggled",
  "favorite_toggled",
  "highlight_added",
  "comment_added",
  "bookmark_added",
  "annotation_removed",
  "entries_linked",
  "entries_unlinked",
  "windows_reordered",
  "desk_created",
  "desk_renamed",
  "desk_deleted",
  "desk_entry_added",
  "desk_entry_removed",
] as const;
export type LibraryOpName = (typeof LIBRARY_OPS)[number];

// ─── État vide et normalisation défensive ─────────────────────────

export function emptyLibraryState(): LibraryState {
  return { entries: {}, folders: {}, desk: { windows: [], layout: "single" }, desks: {} };
}

const DESK_LAYOUT_SET = new Set<string>(["single", "split-v", "split-h", "grid"]);

function isObject(v: Json | undefined): v is JsonObject {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function asString(v: Json | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asNumber(v: Json | undefined): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function asBool(v: Json | undefined): boolean {
  return v === true;
}

function asStringArray(v: Json | undefined): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x): x is string => typeof x === "string" && x.trim().length > 0))];
}

// ─── Parsers défensifs (§3, mot pour mot) ─────────────────────────

function parseMailSnapshot(v: Json | undefined): ArchivedMailSnapshot | undefined {
  if (!isObject(v)) return undefined;
  const from = asString(v.from);
  const subject = asString(v.subject);
  const body = asString(v.body);
  const at = asNumber(v.at);
  if (from === undefined || subject === undefined || body === undefined || at === undefined) {
    return undefined;
  }
  return { from, to: asStringArray(v.to), subject, body, at };
}

function parseThreadSnapshot(v: Json | undefined): ArchivedThreadSnapshot | undefined {
  if (!isObject(v)) return undefined;
  const title = asString(v.title);
  if (title === undefined || !Array.isArray(v.messages)) return undefined;
  const messages: ArchivedThreadSnapshot["messages"] = [];
  for (const m of v.messages) {
    if (!isObject(m)) continue;
    const from = asString(m.from);
    const at = asNumber(m.at);
    const content = asString(m.content);
    if (from === undefined || at === undefined || content === undefined) continue;
    messages.push({ from, at, content });
  }
  return { title, messages };
}

export function parseEntrySource(v: Json | undefined): EntrySource | undefined {
  if (!isObject(v)) return undefined;
  switch (v.kind) {
    case "scenario_doc": {
      const documentId = asString(v.document_id);
      if (documentId === undefined) return undefined;
      return { kind: "scenario_doc", document_id: documentId };
    }
    case "archived_mail": {
      const mailId = asString(v.mail_id);
      const snapshot = parseMailSnapshot(v.snapshot);
      if (mailId === undefined || !snapshot) return undefined;
      return { kind: "archived_mail", mail_id: mailId, snapshot };
    }
    case "archived_messages": {
      const threadId = asString(v.thread_id);
      const snapshot = parseThreadSnapshot(v.snapshot);
      if (threadId === undefined || !snapshot) return undefined;
      return { kind: "archived_messages", thread_id: threadId, snapshot };
    }
    default:
      return undefined;
  }
}

function parseAnnotation(v: Json | undefined): Annotation | undefined {
  if (!isObject(v)) return undefined;
  const id = asString(v.id);
  const at = asNumber(v.at);
  if (id === undefined || at === undefined) return undefined;
  if (v.kind === "highlight") {
    const anchor = asString(v.anchor);
    const excerpt = asString(v.excerpt);
    if (anchor === undefined || excerpt === undefined) return undefined;
    const color = asString(v.color);
    return { id, kind: "highlight", anchor, excerpt, ...(color !== undefined ? { color } : {}), at };
  }
  if (v.kind === "comment") {
    const text = asString(v.text);
    if (text === undefined) return undefined;
    const anchor = asString(v.anchor);
    const excerpt = asString(v.excerpt);
    return {
      id,
      kind: "comment",
      ...(anchor !== undefined ? { anchor } : {}),
      ...(excerpt !== undefined ? { excerpt } : {}),
      text,
      at,
    };
  }
  return undefined;
}

function parseBookmark(v: Json | undefined): Bookmark | undefined {
  if (!isObject(v)) return undefined;
  const id = asString(v.id);
  const label = asString(v.label);
  const anchor = asString(v.anchor);
  if (id === undefined || label === undefined || anchor === undefined) return undefined;
  return { id, label, anchor };
}

function parseLinks(v: Json | undefined): EntryLink[] {
  if (!Array.isArray(v)) return [];
  const out: EntryLink[] = [];
  const seen = new Set<string>();
  for (const item of v) {
    if (!isObject(item)) continue;
    const entryId = asString(item.entry_id);
    if (entryId === undefined || seen.has(entryId)) continue;
    seen.add(entryId);
    const label = asString(item.label);
    out.push({ entry_id: entryId, ...(label !== undefined ? { label } : {}) });
  }
  return out;
}

function parseEntry(v: Json | undefined): DocEntry | null {
  if (!isObject(v)) return null;
  const id = asString(v.id);
  const source = parseEntrySource(v.source);
  if (id === undefined || !source) return null; // sans source valide, pas d'entrée
  const folderId = asString(v.folder_id);
  const lastOpened = asNumber(v.last_opened_at);
  const annotations = Array.isArray(v.annotations)
    ? v.annotations.map(parseAnnotation).filter((a): a is Annotation => Boolean(a))
    : [];
  const bookmarks = Array.isArray(v.bookmarks)
    ? v.bookmarks.map(parseBookmark).filter((b): b is Bookmark => Boolean(b))
    : [];
  return {
    id,
    title: asString(v.title) ?? "",
    source,
    ...(folderId !== undefined ? { folder_id: folderId } : {}),
    tags: asStringArray(v.tags),
    pinned: asBool(v.pinned),
    favorite: asBool(v.favorite),
    added_at: asNumber(v.added_at) ?? 0,
    ...(lastOpened !== undefined ? { last_opened_at: lastOpened } : {}),
    annotations,
    bookmarks,
    links: parseLinks(v.links),
  };
}

function parseFolder(v: Json | undefined): Folder | null {
  if (!isObject(v)) return null;
  const id = asString(v.id);
  const name = asString(v.name);
  if (id === undefined || name === undefined) return null;
  return { id, name, order: asNumber(v.order) ?? 0 };
}

function parseDesk(v: Json | undefined, entries: Record<EntryId, DocEntry>): DeskState {
  const layoutRaw = isObject(v) ? asString(v.layout) : undefined;
  const layout: DeskLayout =
    layoutRaw !== undefined && DESK_LAYOUT_SET.has(layoutRaw) ? (layoutRaw as DeskLayout) : "single";

  const windows: DeskState["windows"] = [];
  const seen = new Set<EntryId>();
  if (isObject(v) && Array.isArray(v.windows)) {
    for (const w of v.windows) {
      if (!isObject(w)) continue;
      const entryId = asString(w.entry_id);
      if (entryId === undefined || !(entryId in entries) || seen.has(entryId)) continue;
      seen.add(entryId);
      windows.push({ entry_id: entryId, order: asNumber(w.order) ?? windows.length });
    }
  }
  windows.sort((a, b) => a.order - b.order);

  let compare: DeskState["compare"] | undefined;
  if (isObject(v) && Array.isArray(v.compare) && v.compare.length === 2) {
    const a = asString(v.compare[0]);
    const b = asString(v.compare[1]);
    if (a !== undefined && b !== undefined && a in entries && b in entries && a !== b) {
      compare = [a, b];
    }
  }

  return { windows, layout, ...(compare ? { compare } : {}) };
}

/**
 * Relit un état sérialisé (Json, potentiellement null ou corrompu) en
 * LibraryState bien formé : entrées/dossiers invalides écartés, folder_id
 * orphelins nettoyés, liens vers des entrées absentes retirés, desk
 * cohérent (fenêtres/compare filtrés sur les entrées existantes). Pur —
 * n'altère jamais l'entrée.
 */
export function normalizeLibraryState(state: Json): LibraryState {
  if (!isObject(state)) return emptyLibraryState();

  const folders: Record<FolderId, Folder> = {};
  if (isObject(state.folders)) {
    for (const [id, raw] of Object.entries(state.folders)) {
      const folder = parseFolder(raw);
      if (folder && folder.id === id) folders[id] = folder;
    }
  }

  const entries: Record<EntryId, DocEntry> = {};
  if (isObject(state.entries)) {
    for (const [id, raw] of Object.entries(state.entries)) {
      const entry = parseEntry(raw);
      if (entry && entry.id === id) entries[id] = entry;
    }
  }

  // Cohérence dérivée : folder_id orphelin retiré, liens vers entrées
  // absentes / soi-même retirés.
  for (const id of Object.keys(entries)) {
    const e = entries[id];
    const folderOk = e.folder_id !== undefined && e.folder_id in folders;
    const links = e.links.filter((l) => l.entry_id !== id && l.entry_id in entries);
    if (!folderOk && e.folder_id !== undefined) {
      const { folder_id: _drop, ...rest } = e;
      entries[id] = { ...rest, links };
    } else if (links.length !== e.links.length) {
      entries[id] = { ...e, links };
    }
  }

  const desks: Record<string, SavedDesk> = {};
  if (isObject(state.desks)) {
    for (const [id, raw] of Object.entries(state.desks)) {
      const d = parseSavedDesk(raw, entries);
      if (d && d.id === id) desks[id] = d;
    }
  }

  return { entries, folders, desk: parseDesk(state.desk, entries), desks };
}

function parseSavedDesk(v: Json | undefined, entries: Record<EntryId, DocEntry>): SavedDesk | null {
  if (!isObject(v)) return null;
  const id = asString(v.id);
  const name = asString(v.name);
  if (id === undefined || name === undefined) return null;
  const entry_ids = asStringArray(v.entry_ids).filter((eid) => eid in entries);
  return { id, name, entry_ids, created_at: asNumber(v.created_at) ?? 0 };
}

// ─── Le reducer : applyLibraryOp ───────────────────────────────────

/**
 * Applique une op du dossier. Signature = ToolOpApplier du moteur
 * (enregistrée dans le TOOL_REGISTRY via bibliothequeSpec.applyOp).
 * Op inconnue ou payload invalide → l'état d'ORIGINE est rendu tel quel
 * (no-op strict : même référence, journal intact côté moteur).
 */
export function applyLibraryOp(state: Json, op: string, payload: JsonObject): Json {
  const s = normalizeLibraryState(state);
  const p = isObject(payload) ? payload : {};
  const at = asNumber(p.at) ?? 0;

  let next: LibraryState | null;
  switch (op as LibraryOpName) {
    case "scenario_doc_indexed":
      next = scenarioDocIndexed(s, p, at);
      break;
    case "mail_archived":
      next = mailArchived(s, p, at);
      break;
    case "thread_archived":
      next = threadArchived(s, p, at);
      break;
    case "entry_removed":
      next = entryRemoved(s, p);
      break;
    case "entry_opened":
      next = entryOpened(s, p, at);
      break;
    case "entry_closed":
      next = entryClosed(s, p);
      break;
    case "layout_set":
      next = layoutSet(s, p);
      break;
    case "compare_set":
      next = compareSet(s, p);
      break;
    case "entry_moved_to_folder":
      next = entryMovedToFolder(s, p);
      break;
    case "folder_created":
      next = folderCreated(s, p);
      break;
    case "folder_renamed":
      next = folderRenamed(s, p);
      break;
    case "folder_deleted":
      next = folderDeleted(s, p);
      break;
    case "tag_added":
      next = tagAdded(s, p);
      break;
    case "tag_removed":
      next = tagRemoved(s, p);
      break;
    case "pin_toggled":
      next = pinToggled(s, p);
      break;
    case "favorite_toggled":
      next = favoriteToggled(s, p);
      break;
    case "highlight_added":
      next = highlightAdded(s, p, at);
      break;
    case "comment_added":
      next = commentAdded(s, p, at);
      break;
    case "bookmark_added":
      next = bookmarkAdded(s, p);
      break;
    case "annotation_removed":
      next = annotationRemoved(s, p);
      break;
    case "entries_linked":
      next = entriesLinked(s, p);
      break;
    case "entries_unlinked":
      next = entriesUnlinked(s, p);
      break;
    case "windows_reordered":
      next = windowsReordered(s, p);
      break;
    case "desk_created":
      next = deskCreated(s, p, at);
      break;
    case "desk_renamed":
      next = deskRenamed(s, p);
      break;
    case "desk_deleted":
      next = deskDeleted(s, p);
      break;
    case "desk_entry_added":
      next = deskEntryAdded(s, p);
      break;
    case "desk_entry_removed":
      next = deskEntryRemoved(s, p);
      break;
    default:
      next = null; // op inconnue → no-op journalisé défensif
  }

  return (next ?? state) as Json;
}

// ─── Helpers d'immutabilité ────────────────────────────────────────

function withEntry(s: LibraryState, entry: DocEntry): LibraryState {
  return { ...s, entries: { ...s.entries, [entry.id]: entry } };
}

function insertEntry(s: LibraryState, entry: DocEntry): LibraryState {
  return { ...s, entries: { ...s.entries, [entry.id]: entry } };
}

function findBySource(
  s: LibraryState,
  match: (source: EntrySource) => boolean,
): DocEntry | undefined {
  return Object.values(s.entries).find((e) => match(e.source));
}

function baseEntry(
  id: EntryId,
  title: string,
  source: EntrySource,
  at: number,
  p: JsonObject,
): DocEntry {
  const folderId = asString(p.folder_id);
  return {
    id,
    title: title.trim(),
    source,
    ...(folderId !== undefined ? { folder_id: folderId } : {}),
    tags: asStringArray(p.tags),
    pinned: false,
    favorite: false,
    added_at: at,
    annotations: [],
    bookmarks: [],
    links: [],
  };
}

// ─── Handlers (chacun rend un NOUVEL état, ou null = no-op) ────────

function scenarioDocIndexed(s: LibraryState, p: JsonObject, at: number): LibraryState | null {
  const id = asString(p.entry_id);
  const documentId = asString(p.document_id);
  if (id === undefined || id.length === 0 || id in s.entries || documentId === undefined) return null;
  // Idempotence (contrat §2) : un document déjà indexé n'entre pas deux fois.
  if (findBySource(s, (src) => src.kind === "scenario_doc" && src.document_id === documentId)) {
    return null;
  }
  const title = asString(p.title) ?? documentId;
  const folderId = asString(p.folder_id);
  const entry = baseEntry(id, title, { kind: "scenario_doc", document_id: documentId }, at, p);
  // Un dossier inexistant est ignoré (cohérence garantie par normalize).
  if (folderId !== undefined && !(folderId in s.folders)) delete entry.folder_id;
  return insertEntry(s, entry);
}

function mailArchived(s: LibraryState, p: JsonObject, at: number): LibraryState | null {
  const id = asString(p.entry_id);
  const mailId = asString(p.mail_id);
  const snapshot = parseMailSnapshot(p.snapshot);
  if (id === undefined || id.length === 0 || id in s.entries || mailId === undefined || !snapshot) {
    return null;
  }
  // Dédup par mail_id : ré-archiver un mail déjà au dossier est un no-op.
  if (findBySource(s, (src) => src.kind === "archived_mail" && src.mail_id === mailId)) return null;
  const title = asString(p.title) ?? snapshot.subject;
  const folderId = asString(p.folder_id);
  const entry = baseEntry(id, title, { kind: "archived_mail", mail_id: mailId, snapshot }, at, p);
  if (folderId !== undefined && !(folderId in s.folders)) delete entry.folder_id;
  return insertEntry(s, entry);
}

function threadArchived(s: LibraryState, p: JsonObject, at: number): LibraryState | null {
  const id = asString(p.entry_id);
  const threadId = asString(p.thread_id);
  const snapshot = parseThreadSnapshot(p.snapshot);
  if (id === undefined || id.length === 0 || id in s.entries || threadId === undefined || !snapshot) {
    return null;
  }
  if (findBySource(s, (src) => src.kind === "archived_messages" && src.thread_id === threadId)) {
    return null;
  }
  const title = asString(p.title) ?? snapshot.title;
  const folderId = asString(p.folder_id);
  const entry = baseEntry(
    id,
    title,
    { kind: "archived_messages", thread_id: threadId, snapshot },
    at,
    p,
  );
  if (folderId !== undefined && !(folderId in s.folders)) delete entry.folder_id;
  return insertEntry(s, entry);
}

function entryRemoved(s: LibraryState, p: JsonObject): LibraryState | null {
  const id = asString(p.entry_id);
  if (id === undefined || !(id in s.entries)) return null;
  const entries = { ...s.entries };
  delete entries[id];
  // Les liens des AUTRES entrées vers celle-ci sont retirés.
  for (const [otherId, e] of Object.entries(entries)) {
    if (e.links.some((l) => l.entry_id === id)) {
      entries[otherId] = { ...e, links: e.links.filter((l) => l.entry_id !== id) };
    }
  }
  const windows = s.desk.windows.filter((w) => w.entry_id !== id);
  const keep = s.desk.compare && !s.desk.compare.includes(id) ? s.desk.compare : undefined;
  const { compare: _drop, ...deskRest } = s.desk;
  return {
    ...s,
    entries,
    desk: { ...deskRest, windows, ...(keep ? { compare: keep } : {}) },
  };
}

function entryOpened(s: LibraryState, p: JsonObject, at: number): LibraryState | null {
  const id = asString(p.entry_id);
  const entry = id !== undefined ? s.entries[id] : undefined;
  if (!entry) return null;
  const already = s.desk.windows.some((w) => w.entry_id === id);
  const maxOrder = s.desk.windows.reduce((m, w) => Math.max(m, w.order), -1);
  const windows = already
    ? s.desk.windows
    : [...s.desk.windows, { entry_id: id as EntryId, order: maxOrder + 1 }];
  return {
    ...withEntry(s, { ...entry, last_opened_at: at }),
    desk: { ...s.desk, windows },
  };
}

function entryClosed(s: LibraryState, p: JsonObject): LibraryState | null {
  const id = asString(p.entry_id);
  if (id === undefined || !s.desk.windows.some((w) => w.entry_id === id)) return null;
  const windows = s.desk.windows.filter((w) => w.entry_id !== id);
  const keep = s.desk.compare && !s.desk.compare.includes(id) ? s.desk.compare : undefined;
  const { compare: _drop, ...deskRest } = s.desk;
  return { ...s, desk: { ...deskRest, windows, ...(keep ? { compare: keep } : {}) } };
}

function layoutSet(s: LibraryState, p: JsonObject): LibraryState | null {
  const layout = asString(p.layout);
  if (layout === undefined || !DESK_LAYOUT_SET.has(layout) || layout === s.desk.layout) return null;
  return { ...s, desk: { ...s.desk, layout: layout as DeskLayout } };
}

function compareSet(s: LibraryState, p: JsonObject): LibraryState | null {
  const a = asString(p.a);
  const b = asString(p.b);
  // Effacer la comparaison : a/b absents → on retire compare.
  if (a === undefined && b === undefined) {
    if (!s.desk.compare) return null;
    const { compare: _drop, ...desk } = s.desk;
    return { ...s, desk };
  }
  if (a === undefined || b === undefined || a === b || !(a in s.entries) || !(b in s.entries)) {
    return null;
  }
  if (s.desk.compare && s.desk.compare[0] === a && s.desk.compare[1] === b) return null;
  // Les deux entrées sont ouvertes (fenêtres) pour rendre la comparaison.
  let windows = s.desk.windows;
  let maxOrder = windows.reduce((m, w) => Math.max(m, w.order), -1);
  for (const id of [a, b]) {
    if (!windows.some((w) => w.entry_id === id)) {
      maxOrder += 1;
      windows = [...windows, { entry_id: id, order: maxOrder }];
    }
  }
  return { ...s, desk: { ...s.desk, windows, compare: [a, b] } };
}

function entryMovedToFolder(s: LibraryState, p: JsonObject): LibraryState | null {
  const id = asString(p.entry_id);
  const entry = id !== undefined ? s.entries[id] : undefined;
  if (!entry) return null;
  const folderId = asString(p.folder_id); // undefined/null → retirer du dossier
  if (folderId !== undefined && !(folderId in s.folders)) return null;
  if ((entry.folder_id ?? undefined) === (folderId ?? undefined)) return null;
  if (folderId === undefined) {
    const { folder_id: _drop, ...rest } = entry;
    return withEntry(s, rest);
  }
  return withEntry(s, { ...entry, folder_id: folderId });
}

function folderCreated(s: LibraryState, p: JsonObject): LibraryState | null {
  const id = asString(p.folder_id);
  const name = (asString(p.name) ?? "").trim();
  if (id === undefined || id.length === 0 || id in s.folders || name.length === 0) return null;
  const maxOrder = Object.values(s.folders).reduce((m, f) => Math.max(m, f.order), -1);
  const order = asNumber(p.order) ?? maxOrder + 1;
  return { ...s, folders: { ...s.folders, [id]: { id, name, order } } };
}

function folderRenamed(s: LibraryState, p: JsonObject): LibraryState | null {
  const id = asString(p.folder_id);
  const name = (asString(p.name) ?? "").trim();
  const folder = id !== undefined ? s.folders[id] : undefined;
  if (!folder || name.length === 0 || name === folder.name) return null;
  return { ...s, folders: { ...s.folders, [id!]: { ...folder, name } } };
}

function folderDeleted(s: LibraryState, p: JsonObject): LibraryState | null {
  const id = asString(p.folder_id);
  if (id === undefined || !(id in s.folders)) return null;
  const folders = { ...s.folders };
  delete folders[id];
  // Les entrées du dossier SURVIVENT — seul le lien folder_id est retiré.
  let entries = s.entries;
  for (const [entryId, e] of Object.entries(s.entries)) {
    if (e.folder_id === id) {
      if (entries === s.entries) entries = { ...s.entries };
      const { folder_id: _drop, ...rest } = e;
      entries[entryId] = rest;
    }
  }
  return { ...s, folders, entries };
}

function tagAdded(s: LibraryState, p: JsonObject): LibraryState | null {
  const id = asString(p.entry_id);
  const tag = (asString(p.tag) ?? "").trim();
  const entry = id !== undefined ? s.entries[id] : undefined;
  if (!entry || tag.length === 0 || entry.tags.includes(tag)) return null;
  return withEntry(s, { ...entry, tags: [...entry.tags, tag] });
}

function tagRemoved(s: LibraryState, p: JsonObject): LibraryState | null {
  const id = asString(p.entry_id);
  const tag = asString(p.tag);
  const entry = id !== undefined ? s.entries[id] : undefined;
  if (!entry || tag === undefined || !entry.tags.includes(tag)) return null;
  return withEntry(s, { ...entry, tags: entry.tags.filter((t) => t !== tag) });
}

function pinToggled(s: LibraryState, p: JsonObject): LibraryState | null {
  const id = asString(p.entry_id);
  const entry = id !== undefined ? s.entries[id] : undefined;
  if (!entry) return null;
  return withEntry(s, { ...entry, pinned: !entry.pinned });
}

function favoriteToggled(s: LibraryState, p: JsonObject): LibraryState | null {
  const id = asString(p.entry_id);
  const entry = id !== undefined ? s.entries[id] : undefined;
  if (!entry) return null;
  return withEntry(s, { ...entry, favorite: !entry.favorite });
}

function highlightAdded(s: LibraryState, p: JsonObject, at: number): LibraryState | null {
  const id = asString(p.entry_id);
  const annId = asString(p.annotation_id);
  const anchor = asString(p.anchor);
  const excerpt = asString(p.excerpt);
  const entry = id !== undefined ? s.entries[id] : undefined;
  if (!entry || annId === undefined || annId.length === 0) return null;
  if (anchor === undefined || excerpt === undefined || excerpt.trim().length === 0) return null;
  if (entry.annotations.some((a) => a.id === annId)) return null;
  const color = asString(p.color);
  const annotation: Annotation = {
    id: annId,
    kind: "highlight",
    anchor,
    excerpt,
    ...(color !== undefined ? { color } : {}),
    at,
  };
  return withEntry(s, { ...entry, annotations: [...entry.annotations, annotation] });
}

function commentAdded(s: LibraryState, p: JsonObject, at: number): LibraryState | null {
  const id = asString(p.entry_id);
  const annId = asString(p.annotation_id);
  const text = (asString(p.text) ?? "").trim();
  const entry = id !== undefined ? s.entries[id] : undefined;
  if (!entry || annId === undefined || annId.length === 0 || text.length === 0) return null;
  if (entry.annotations.some((a) => a.id === annId)) return null;
  const anchor = asString(p.anchor);
  const excerpt = asString(p.excerpt);
  const annotation: Annotation = {
    id: annId,
    kind: "comment",
    ...(anchor !== undefined ? { anchor } : {}),
    ...(excerpt !== undefined ? { excerpt } : {}),
    text,
    at,
  };
  return withEntry(s, { ...entry, annotations: [...entry.annotations, annotation] });
}

function bookmarkAdded(s: LibraryState, p: JsonObject): LibraryState | null {
  const id = asString(p.entry_id);
  const bmId = asString(p.bookmark_id);
  const label = (asString(p.label) ?? "").trim();
  const anchor = asString(p.anchor);
  const entry = id !== undefined ? s.entries[id] : undefined;
  if (!entry || bmId === undefined || bmId.length === 0 || label.length === 0 || anchor === undefined) {
    return null;
  }
  if (entry.bookmarks.some((b) => b.id === bmId)) return null;
  return withEntry(s, { ...entry, bookmarks: [...entry.bookmarks, { id: bmId, label, anchor }] });
}

function annotationRemoved(s: LibraryState, p: JsonObject): LibraryState | null {
  const id = asString(p.entry_id);
  const annId = asString(p.annotation_id);
  const entry = id !== undefined ? s.entries[id] : undefined;
  if (!entry || annId === undefined || !entry.annotations.some((a) => a.id === annId)) return null;
  return withEntry(s, { ...entry, annotations: entry.annotations.filter((a) => a.id !== annId) });
}

function entriesLinked(s: LibraryState, p: JsonObject): LibraryState | null {
  const a = asString(p.a);
  const b = asString(p.b);
  if (a === undefined || b === undefined || a === b || !(a in s.entries) || !(b in s.entries)) {
    return null;
  }
  const ea = s.entries[a];
  const eb = s.entries[b];
  if (ea.links.some((l) => l.entry_id === b) && eb.links.some((l) => l.entry_id === a)) return null;
  const label = asString(p.label);
  const linkAB: EntryLink = { entry_id: b, ...(label !== undefined ? { label } : {}) };
  const linkBA: EntryLink = { entry_id: a, ...(label !== undefined ? { label } : {}) };
  const nextA = ea.links.some((l) => l.entry_id === b) ? ea : { ...ea, links: [...ea.links, linkAB] };
  const nextB = eb.links.some((l) => l.entry_id === a) ? eb : { ...eb, links: [...eb.links, linkBA] };
  return { ...s, entries: { ...s.entries, [a]: nextA, [b]: nextB } };
}

function entriesUnlinked(s: LibraryState, p: JsonObject): LibraryState | null {
  const a = asString(p.a);
  const b = asString(p.b);
  if (a === undefined || b === undefined || !(a in s.entries) || !(b in s.entries)) return null;
  const ea = s.entries[a];
  const eb = s.entries[b];
  const hasAB = ea.links.some((l) => l.entry_id === b);
  const hasBA = eb.links.some((l) => l.entry_id === a);
  if (!hasAB && !hasBA) return null;
  return {
    ...s,
    entries: {
      ...s.entries,
      [a]: { ...ea, links: ea.links.filter((l) => l.entry_id !== b) },
      [b]: { ...eb, links: eb.links.filter((l) => l.entry_id !== a) },
    },
  };
}

// ─── Bureaux personnalisés ─────────────────────────────────────────
function deskCreated(s: LibraryState, p: JsonObject, at: number): LibraryState | null {
  const id = asString(p.desk_id);
  const name = (asString(p.name) ?? "").trim();
  if (id === undefined || id.length === 0 || id in s.desks || name.length === 0) return null;
  const seed = asStringArray(p.entry_ids).filter((eid) => eid in s.entries);
  return { ...s, desks: { ...s.desks, [id]: { id, name, entry_ids: seed, created_at: at } } };
}

function deskRenamed(s: LibraryState, p: JsonObject): LibraryState | null {
  const id = asString(p.desk_id);
  const name = (asString(p.name) ?? "").trim();
  const d = id !== undefined ? s.desks[id] : undefined;
  if (!d || name.length === 0 || name === d.name) return null;
  return { ...s, desks: { ...s.desks, [id!]: { ...d, name } } };
}

function deskDeleted(s: LibraryState, p: JsonObject): LibraryState | null {
  const id = asString(p.desk_id);
  if (id === undefined || !(id in s.desks)) return null;
  const desks = { ...s.desks };
  delete desks[id];
  return { ...s, desks };
}

function deskEntryAdded(s: LibraryState, p: JsonObject): LibraryState | null {
  const id = asString(p.desk_id);
  const entryId = asString(p.entry_id);
  const d = id !== undefined ? s.desks[id] : undefined;
  if (!d || entryId === undefined || !(entryId in s.entries) || d.entry_ids.includes(entryId)) return null;
  return { ...s, desks: { ...s.desks, [id!]: { ...d, entry_ids: [...d.entry_ids, entryId] } } };
}

function deskEntryRemoved(s: LibraryState, p: JsonObject): LibraryState | null {
  const id = asString(p.desk_id);
  const entryId = asString(p.entry_id);
  const d = id !== undefined ? s.desks[id] : undefined;
  if (!d || entryId === undefined || !d.entry_ids.includes(entryId)) return null;
  return { ...s, desks: { ...s.desks, [id!]: { ...d, entry_ids: d.entry_ids.filter((e) => e !== entryId) } } };
}

function windowsReordered(s: LibraryState, p: JsonObject): LibraryState | null {
  if (!Array.isArray(p.order)) return null;
  const wanted = asStringArray(p.order).filter((id) => s.desk.windows.some((w) => w.entry_id === id));
  if (wanted.length === 0) return null;
  const missing = s.desk.windows.filter((w) => !wanted.includes(w.entry_id)).map((w) => w.entry_id);
  const ordered = [...wanted, ...missing];
  const windows = ordered.map((entry_id, order) => ({ entry_id, order }));
  return { ...s, desk: { ...s.desk, windows } };
}
