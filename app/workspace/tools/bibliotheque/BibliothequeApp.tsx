"use client";

/**
 * BibliothequeApp — le bureau documentaire, HÔTÉ par l'app « Documents »
 * du dock (docs/TOOL_GESTIONNAIRE_DOC.md §1 : le joueur ne voit qu'une
 * seule app). Tranche 1 : auto-indexation des documents du scénario,
 * navigateur (dossiers, tags, tris, recherche plein texte, épingles,
 * favoris, récents) et lecteur d'une entrée. Multi-fenêtres/comparaison
 * (tranche 4) et annotations (tranche 2) viennent par-dessus, sans
 * toucher au modèle.
 *
 * Tout passe par l'API publique (façade) : aucune mutation directe.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkspaceAppProps } from "../../apps/types";
import {
  addTag,
  clearCompare,
  closeEntry,
  createFolder,
  deleteFolder,
  indexScenarioDoc,
  moveToFolder,
  openEntry,
  removeEntry,
  removeTag,
  searchEntries,
  selectAllEntries,
  selectAllTags,
  selectCompare,
  selectFolders,
  selectLibrary,
  selectOpenWindows,
  setCompare,
  setLayout,
  toggleFavorite,
  togglePin,
} from "./api";
import type { SortKey } from "./api";
import { BIBLIOTHEQUE_TOOL_ID } from "./spec";
import type { DeskLayout, DocEntry } from "./spec";
import { DeskView } from "./components/DeskView";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "added", label: "Ajout récent" },
  { key: "opened", label: "Consulté récemment" },
  { key: "alpha", label: "Alphabétique" },
  { key: "type", label: "Type" },
  { key: "favorites", label: "Favoris d'abord" },
];

const KIND_ICON: Record<string, string> = {
  scenario_doc: "📄",
  archived_mail: "📧",
  archived_messages: "💬",
};

const LAYOUT_OPTIONS: { key: DeskLayout; icon: string; label: string }[] = [
  { key: "single", icon: "▭", label: "Une fenêtre" },
  { key: "split-v", icon: "▥", label: "Deux colonnes" },
  { key: "split-h", icon: "▤", label: "Deux lignes" },
  { key: "grid", icon: "▦", label: "Grille" },
];

type Selection =
  | { type: "all" }
  | { type: "recent" }
  | { type: "pinned" }
  | { type: "favorites" }
  | { type: "unfiled" }
  | { type: "folder"; id: string }
  | { type: "tag"; value: string };

function sortEntries(list: DocEntry[], key: SortKey): DocEntry[] {
  const cmp = (a: DocEntry, b: DocEntry): number => {
    switch (key) {
      case "added":
        return b.added_at - a.added_at;
      case "opened":
        return (b.last_opened_at ?? 0) - (a.last_opened_at ?? 0) || b.added_at - a.added_at;
      case "alpha":
        return a.title.localeCompare(b.title, "fr", { sensitivity: "base" });
      case "type":
        return a.source.kind.localeCompare(b.source.kind) || b.added_at - a.added_at;
      case "favorites":
        return Number(b.favorite) - Number(a.favorite) || b.added_at - a.added_at;
      default:
        return 0;
    }
  };
  return [...list].sort((a, b) => cmp(a, b) || a.id.localeCompare(b.id));
}

export function BibliothequeApp({ workspace, actors, documents, dispatch, context }: WorkspaceAppProps) {
  const libState = workspace.toolStates[BIBLIOTHEQUE_TOOL_ID] ?? null;

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("added");
  const [sel, setSel] = useState<Selection>({ type: "all" });
  const [view, setView] = useState<"library" | "desk">("library");
  const [openId, setOpenId] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState("");
  const [tagFor, setTagFor] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const handledContext = useRef<string | null>(null);
  const dispatchedIndex = useRef<Set<string>>(new Set());

  const nameOf = useCallback(
    (id: string) => (id === "player" ? "Vous" : actors.find((a) => a.actor_id === id)?.name ?? id),
    [actors],
  );

  const resolveContent = useCallback(
    (documentId: string) => documents.find((d) => d.id === documentId)?.content ?? "",
    [documents],
  );

  // ── Auto-indexation : les documents du step exposés entrent au dossier
  //    (contrat §2). Gate sur l'état : on ne dispatch QUE les document_id
  //    absents (l'op est idempotente, mais éviter le bruit du journal).
  const indexedDocIds = useMemo(() => {
    const set = new Set<string>();
    for (const e of selectAllEntries(libState)) {
      if (e.source.kind === "scenario_doc") set.add(e.source.document_id);
    }
    return set;
  }, [libState]);

  useEffect(() => {
    for (const d of documents) {
      // Gate état + ref : ni ré-indexation (état), ni double-dispatch avant
      // que la 1re op ne soit appliquée (course entre deux renders).
      if (!indexedDocIds.has(d.id) && !dispatchedIndex.current.has(d.id)) {
        dispatchedIndex.current.add(d.id);
        dispatch(indexScenarioDoc(d.id, d.title));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents, indexedDocIds]);

  // ── Navigation inter-apps : ouvrir la PJ d'un mail → l'entrée du doc.
  const requestedDoc = context?.document_id;
  const entriesByDocId = useMemo(() => {
    const map: Record<string, DocEntry> = {};
    for (const e of selectAllEntries(libState)) {
      if (e.source.kind === "scenario_doc") map[e.source.document_id] = e;
    }
    return map;
  }, [libState]);

  const open = useCallback(
    (entry: DocEntry) => {
      setOpenId(entry.id);
      setView("desk");
      dispatch(openEntry(entry.id));
      // Préserve le suivi moteur (triggers/critères basés sur l'ouverture).
      if (entry.source.kind === "scenario_doc") {
        dispatch({ type: "document_opened", document_id: entry.source.document_id });
      }
    },
    [dispatch],
  );

  useEffect(() => {
    if (!requestedDoc || requestedDoc === handledContext.current) return;
    const entry = entriesByDocId[requestedDoc];
    if (entry) {
      handledContext.current = requestedDoc;
      open(entry);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedDoc, entriesByDocId]);

  const folders = selectFolders(libState);
  const tags = selectAllTags(libState);
  const allEntries = selectAllEntries(libState);

  // ── Pipeline : recherche → filtre de vue → tri.
  const filtered = useMemo(() => {
    const base = searchEntries(libState, query, resolveContent);
    const kept = base.filter((e) => {
      switch (sel.type) {
        case "all":
        case "recent":
          return true;
        case "pinned":
          return e.pinned;
        case "favorites":
          return e.favorite;
        case "unfiled":
          return e.folder_id === undefined;
        case "folder":
          return e.folder_id === sel.id;
        case "tag":
          return e.tags.includes(sel.value);
        default:
          return true;
      }
    });
    return sortEntries(kept, sel.type === "recent" ? "opened" : sort);
  }, [libState, query, resolveContent, sel, sort]);

  const countFor = (predicate: (e: DocEntry) => boolean) => allEntries.filter(predicate).length;

  // ── Bureau multi-fenêtres (piloté par l'état du Tool : desk.windows/compare).
  const openWindows = selectOpenWindows(libState);
  const compareEntries = selectCompare(libState);
  const deskLayout = selectLibrary(libState).desk.layout;
  const showDesk = view === "desk" && (openWindows.length > 0 || compareEntries !== null);
  const focusedId = openWindows.some((w) => w.id === openId) ? openId : openWindows[0]?.id ?? null;
  const otherWindow = openWindows.find((w) => w.id !== focusedId);

  const closeWindow = (id: string) => {
    dispatch(closeEntry(id));
    const rest = openWindows.filter((w) => w.id !== id);
    if (id === focusedId) setOpenId(rest[0]?.id ?? null);
    if (rest.length === 0 && !compareEntries) setView("library");
  };

  if (showDesk) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-gray-100">
        <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-2 py-1.5">
          <button
            type="button"
            className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50"
            onClick={() => setView("library")}
          >
            ← Bibliothèque
          </button>

          {/* Onglets des fenêtres ouvertes. */}
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {openWindows.map((w) => (
              <span
                key={w.id}
                className={`inline-flex max-w-[180px] shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-xs transition ${
                  w.id === focusedId && !compareEntries
                    ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                }`}
              >
                <button type="button" className="min-w-0 truncate" onClick={() => setOpenId(w.id)}>
                  {w.title || "(sans titre)"}
                </button>
                <button
                  type="button"
                  title="Fermer la fenêtre"
                  className="shrink-0 text-gray-400 hover:text-red-500"
                  onClick={() => closeWindow(w.id)}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>

          {/* Comparaison. */}
          {compareEntries ? (
            <button
              type="button"
              className="shrink-0 rounded-lg bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800 transition hover:bg-amber-200"
              onClick={() => dispatch(clearCompare())}
            >
              Fin de comparaison
            </button>
          ) : (
            <button
              type="button"
              disabled={!otherWindow}
              title={otherWindow ? "Comparer deux fenêtres" : "Ouvrez au moins deux documents"}
              className="shrink-0 rounded-lg border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 transition hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-40"
              onClick={() => focusedId && otherWindow && dispatch(setCompare(focusedId, otherWindow.id))}
            >
              ⇄ Comparer
            </button>
          )}

          {/* Dispositions (masquées en comparaison). */}
          {!compareEntries && (
            <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-gray-200 p-0.5">
              {LAYOUT_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  title={o.label}
                  aria-pressed={deskLayout === o.key}
                  className={`rounded px-1.5 py-0.5 text-sm transition ${
                    deskLayout === o.key ? "bg-indigo-100 text-indigo-700" : "text-gray-500 hover:bg-gray-100"
                  }`}
                  onClick={() => dispatch(setLayout(o.key))}
                >
                  {o.icon}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1">
          <DeskView
            windows={openWindows}
            layout={deskLayout}
            compareEntries={compareEntries}
            focusedId={focusedId}
            documents={documents}
            dispatch={dispatch}
            nameOf={nameOf}
            onFocus={setOpenId}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 bg-gray-50/60">
      {/* Panneau latéral : vues, dossiers, tags. */}
      <aside className="flex w-56 shrink-0 flex-col gap-3 overflow-y-auto border-r border-gray-200 bg-white px-2.5 py-3">
        <nav className="flex flex-col gap-0.5">
          <SideItem label="Tous les documents" icon="🗂️" count={allEntries.length} active={sel.type === "all"} onClick={() => setSel({ type: "all" })} />
          <SideItem label="Récemment consultés" icon="🕘" active={sel.type === "recent"} onClick={() => setSel({ type: "recent" })} />
          <SideItem label="Épinglés" icon="📌" count={countFor((e) => e.pinned)} active={sel.type === "pinned"} onClick={() => setSel({ type: "pinned" })} />
          <SideItem label="Favoris" icon="★" count={countFor((e) => e.favorite)} active={sel.type === "favorites"} onClick={() => setSel({ type: "favorites" })} />
          <SideItem label="Non classés" icon="📥" count={countFor((e) => e.folder_id === undefined)} active={sel.type === "unfiled"} onClick={() => setSel({ type: "unfiled" })} />
        </nav>

        <div>
          <p className="px-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Dossiers</p>
          <div className="flex flex-col gap-0.5">
            {folders.map((f) => (
              <div key={f.id} className="group flex items-center">
                <SideItem
                  label={f.name}
                  icon="📁"
                  count={countFor((e) => e.folder_id === f.id)}
                  active={sel.type === "folder" && sel.id === f.id}
                  onClick={() => setSel({ type: "folder", id: f.id })}
                />
                <button
                  type="button"
                  title="Supprimer le dossier"
                  className="ml-1 rounded px-1 text-xs text-gray-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                  onClick={() => {
                    if (sel.type === "folder" && sel.id === f.id) setSel({ type: "all" });
                    dispatch(deleteFolder(f.id));
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            <form
              className="mt-1 flex items-center gap-1 px-1"
              onSubmit={(e) => {
                e.preventDefault();
                const name = newFolder.trim();
                if (name) dispatch(createFolder(name));
                setNewFolder("");
              }}
            >
              <input
                value={newFolder}
                onChange={(e) => setNewFolder(e.target.value)}
                placeholder="+ dossier"
                className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-800 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none"
              />
            </form>
          </div>
        </div>

        {tags.length > 0 && (
          <div>
            <p className="px-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Tags</p>
            <div className="flex flex-wrap gap-1 px-1">
              {tags.map((t) => (
                <button
                  key={t.tag}
                  type="button"
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition ${
                    sel.type === "tag" && sel.value === t.tag
                      ? "bg-indigo-600 text-white"
                      : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                  }`}
                  onClick={() => setSel({ type: "tag", value: t.tag })}
                >
                  #{t.tag} · {t.count}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* Zone principale : recherche, tri, grille. */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-4 py-2.5">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher dans le dossier (titre, contenu, tags, annotations…)"
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            disabled={sel.type === "recent"}
            className="shrink-0 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 focus:border-indigo-400 focus:outline-none disabled:opacity-50"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          {(openWindows.length > 0 || compareEntries) && (
            <button
              type="button"
              className="shrink-0 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700"
              onClick={() => setView("desk")}
            >
              Bureau · {openWindows.length || 2}
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <p className="mt-8 text-center text-sm text-gray-400">
              {query ? "Aucun document ne correspond à cette recherche." : "Aucun document dans cette vue."}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {filtered.map((e) => (
                <EntryCard
                  key={e.id}
                  entry={e}
                  folderName={e.folder_id ? folders.find((f) => f.id === e.folder_id)?.name : undefined}
                  folders={folders}
                  onOpen={() => open(e)}
                  onTogglePin={() => dispatch(togglePin(e.id))}
                  onToggleFav={() => dispatch(toggleFavorite(e.id))}
                  onMove={(fid) => dispatch(moveToFolder(e.id, fid))}
                  onRemove={() => dispatch(removeEntry(e.id))}
                  onRemoveTag={(t) => dispatch(removeTag(e.id, t))}
                  tagOpen={tagFor === e.id}
                  tagDraft={tagFor === e.id ? tagDraft : ""}
                  onTagOpen={() => {
                    setTagFor(e.id);
                    setTagDraft("");
                  }}
                  onTagChange={setTagDraft}
                  onTagSubmit={() => {
                    const t = tagDraft.trim();
                    if (t) dispatch(addTag(e.id, t));
                    setTagFor(null);
                    setTagDraft("");
                  }}
                  onTagCancel={() => setTagFor(null)}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function SideItem({
  label,
  icon,
  count,
  active,
  onClick,
}: {
  label: string;
  icon: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
        active ? "bg-indigo-50 font-semibold text-indigo-800" : "text-gray-700 hover:bg-gray-100"
      }`}
      onClick={onClick}
    >
      <span aria-hidden className="shrink-0 text-sm">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="shrink-0 text-[11px] text-gray-400">{count}</span>
      )}
    </button>
  );
}

interface EntryCardProps {
  entry: DocEntry;
  folderName?: string;
  folders: { id: string; name: string }[];
  onOpen: () => void;
  onTogglePin: () => void;
  onToggleFav: () => void;
  onMove: (folderId: string | null) => void;
  onRemove: () => void;
  onRemoveTag: (tag: string) => void;
  tagOpen: boolean;
  tagDraft: string;
  onTagOpen: () => void;
  onTagChange: (v: string) => void;
  onTagSubmit: () => void;
  onTagCancel: () => void;
}

function EntryCard(props: EntryCardProps) {
  const { entry: e, folderName, folders } = props;
  const [menu, setMenu] = useState(false);

  return (
    <div className="group relative flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white p-3 text-left shadow-sm transition hover:border-indigo-300 hover:shadow">
      <div className="flex items-start justify-between gap-1">
        <button type="button" className="flex min-w-0 flex-1 items-start gap-2 text-left" onClick={props.onOpen}>
          <span aria-hidden className="text-2xl leading-none">
            {KIND_ICON[e.source.kind] ?? "📄"}
          </span>
          <span className="line-clamp-2 min-w-0 text-sm font-medium text-gray-900">
            {e.title || "(sans titre)"}
          </span>
        </button>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            title={e.favorite ? "Retirer des favoris" : "Favori"}
            className={`rounded px-1 text-sm transition hover:bg-gray-100 ${e.favorite ? "text-amber-500" : "text-gray-300"}`}
            onClick={props.onToggleFav}
          >
            {e.favorite ? "★" : "☆"}
          </button>
          <button
            type="button"
            title={e.pinned ? "Désépingler" : "Épingler"}
            className={`rounded px-1 text-sm transition hover:bg-gray-100 ${e.pinned ? "opacity-100" : "opacity-40"}`}
            onClick={props.onTogglePin}
          >
            📌
          </button>
          <button
            type="button"
            title="Actions"
            className="rounded px-1 text-sm text-gray-400 transition hover:bg-gray-100"
            onClick={() => setMenu((v) => !v)}
          >
            ⋯
          </button>
        </div>
      </div>

      {(folderName || e.tags.length > 0) && (
        <div className="flex flex-wrap items-center gap-1">
          {folderName && (
            <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
              📁 {folderName}
            </span>
          )}
          {e.tags.map((t) => (
            <button
              key={t}
              type="button"
              title="Retirer ce tag"
              className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 transition hover:bg-red-50 hover:text-red-600"
              onClick={() => props.onRemoveTag(t)}
            >
              #{t} ✕
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        {props.tagOpen ? (
          <form
            className="flex flex-1 items-center gap-1"
            onSubmit={(ev) => {
              ev.preventDefault();
              props.onTagSubmit();
            }}
          >
            <input
              autoFocus
              value={props.tagDraft}
              onChange={(ev) => props.onTagChange(ev.target.value)}
              onBlur={props.onTagCancel}
              placeholder="tag…"
              className="w-full rounded-md border border-gray-300 px-2 py-0.5 text-xs focus:border-indigo-400 focus:outline-none"
            />
          </form>
        ) : (
          <button
            type="button"
            className="text-[11px] font-medium text-gray-400 transition hover:text-indigo-600"
            onClick={props.onTagOpen}
          >
            + tag
          </button>
        )}
      </div>

      {menu && (
        <div
          className="absolute right-2 top-9 z-20 w-44 rounded-xl border border-gray-200 bg-white p-1 shadow-xl"
          onMouseLeave={() => setMenu(false)}
        >
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Classer dans</p>
          <button
            type="button"
            className="block w-full rounded-lg px-2 py-1 text-left text-xs text-gray-700 hover:bg-gray-100"
            onClick={() => {
              props.onMove(null);
              setMenu(false);
            }}
          >
            Aucun dossier
          </button>
          {folders.map((f) => (
            <button
              key={f.id}
              type="button"
              className="block w-full truncate rounded-lg px-2 py-1 text-left text-xs text-gray-700 hover:bg-gray-100"
              onClick={() => {
                props.onMove(f.id);
                setMenu(false);
              }}
            >
              📁 {f.name}
            </button>
          ))}
          <div className="my-1 h-px bg-gray-100" />
          <button
            type="button"
            className="block w-full rounded-lg px-2 py-1 text-left text-xs text-red-600 hover:bg-red-50"
            onClick={() => {
              props.onRemove();
              setMenu(false);
            }}
          >
            Retirer du dossier
          </button>
        </div>
      )}
    </div>
  );
}
