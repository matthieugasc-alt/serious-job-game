"use client";

/**
 * NotesSidebar — liste des notes de l'app Bloc-notes.
 * Trois lectures (sélecteurs purs d'api.ts) : récentes, par tag, chrono.
 * Recherche plein texte locale, création rapide. Aucune mutation ici
 * hormis « nouvelle note » (déléguée au parent).
 */

import { useState } from "react";
import { selectByTag, selectChronological, selectRecent } from "../api";
import type { Note, NotebookState } from "../spec";
import { allTags, BLOCK_MOVE_MIME, fmtDay, fmtShort, noteExcerpt, noteMatches, type AnyBlock } from "./uiHelpers";

type ViewMode = "recent" | "tags" | "chrono";

interface Props {
  state: NotebookState;
  selectedId: string | null;
  onSelect: (noteId: string) => void;
  onCreate: () => void;
  /** Déplacer un bloc glissé depuis une autre note VERS cette note. */
  onMoveBlock: (sourceNoteId: string, targetNoteId: string, block: AnyBlock) => void;
  /** Déplacer un bloc glissé vers une NOUVELLE note. */
  onMoveToNewNote: (sourceNoteId: string, block: AnyBlock) => void;
}

/** Lit le payload de déplacement inter-notes depuis le dataTransfer. */
function parseMove(e: React.DragEvent): { sourceNoteId: string; block: AnyBlock } | null {
  const raw = e.dataTransfer.getData(BLOCK_MOVE_MIME);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as { sourceNoteId?: unknown; block?: unknown };
    if (typeof p.sourceNoteId === "string" && p.block && typeof p.block === "object") {
      return { sourceNoteId: p.sourceNoteId, block: p.block as AnyBlock };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function NotesSidebar({ state, selectedId, onSelect, onCreate, onMoveBlock, onMoveToNewNote }: Props) {
  const [mode, setMode] = useState<ViewMode>("recent");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [dropNoteId, setDropNoteId] = useState<string | null>(null);
  const [dropNew, setDropNew] = useState(false);

  const tags = allTags(state);
  const base: Note[] =
    mode === "tags"
      ? tag
        ? selectByTag(state, tag)
        : []
      : mode === "chrono"
        ? selectChronological(state)
        : selectRecent(state, 100);
  const notes = base.filter((n) => noteMatches(n, query));

  const item = (n: Note) => {
    const active = n.id === selectedId;
    const excerpt = noteExcerpt(n);
    return (
      <li key={n.id}>
        <button
          type="button"
          aria-pressed={active}
          className={`block w-full border-b border-gray-50 px-3 py-2.5 text-left transition ${
            dropNoteId === n.id ? "bg-indigo-100 ring-1 ring-inset ring-indigo-300" : active ? "bg-indigo-50/70" : "hover:bg-gray-50"
          }`}
          onClick={() => onSelect(n.id)}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(BLOCK_MOVE_MIME)) {
              e.preventDefault();
              setDropNoteId(n.id);
            }
          }}
          onDragLeave={() => setDropNoteId((v) => (v === n.id ? null : v))}
          onDrop={(e) => {
            const move = parseMove(e);
            setDropNoteId(null);
            if (move && move.sourceNoteId !== n.id) {
              e.preventDefault();
              onMoveBlock(move.sourceNoteId, n.id, move.block);
            }
          }}
        >
          <span className="flex items-baseline justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              {n.source && <span aria-hidden className="shrink-0 text-[11px]">🔗</span>}
              <span className={`truncate text-sm ${active ? "font-semibold text-gray-900" : "font-medium text-gray-800"}`}>
                {n.title.trim() || "Sans titre"}
              </span>
            </span>
            <span className="shrink-0 text-[10px] text-gray-400">{fmtShort(n.updated_at)}</span>
          </span>
          {excerpt && <span className="mt-0.5 block truncate text-xs text-gray-500">{excerpt}</span>}
          {n.tags.length > 0 && (
            <span className="mt-1 flex flex-wrap gap-1">
              {n.tags.slice(0, 3).map((t) => (
                <span key={t} className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                  #{t}
                </span>
              ))}
            </span>
          )}
        </button>
      </li>
    );
  };

  // Vue chrono : groupes par jour de création.
  const chronoGroups: [string, Note[]][] = [];
  if (mode === "chrono") {
    for (const n of notes) {
      const day = fmtDay(n.created_at);
      const last = chronoGroups[chronoGroups.length - 1];
      if (last && last[0] === day) last[1].push(n);
      else chronoGroups.push([day, [n]]);
    }
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="shrink-0 space-y-2 border-b border-gray-100 px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <input
            type="search"
            className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
            placeholder="Rechercher…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            title="Nouvelle note (ou déposez-y un bloc pour le déplacer)"
            className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition ${
              dropNew ? "bg-indigo-800 ring-2 ring-indigo-300" : "bg-indigo-600 hover:bg-indigo-700"
            }`}
            onClick={onCreate}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes(BLOCK_MOVE_MIME)) {
                e.preventDefault();
                setDropNew(true);
              }
            }}
            onDragLeave={() => setDropNew(false)}
            onDrop={(e) => {
              const move = parseMove(e);
              setDropNew(false);
              if (move) {
                e.preventDefault();
                onMoveToNewNote(move.sourceNoteId, move.block);
              }
            }}
          >
            + Note
          </button>
        </div>
        <div className="flex gap-1" role="tablist">
          {(
            [
              ["recent", "Récentes"],
              ["tags", "Par tag"],
              ["chrono", "Chrono"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                mode === m ? "bg-indigo-50 text-indigo-700" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
              }`}
              onClick={() => setMode(m)}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === "tags" && (
          <div className="flex flex-wrap gap-1">
            {tags.length === 0 && <p className="text-[11px] text-gray-400">Aucun tag pour l&apos;instant.</p>}
            {tags.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tag === t}
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${
                  tag === t
                    ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                }`}
                onClick={() => setTag(tag === t ? null : t)}
              >
                #{t}
              </button>
            ))}
          </div>
        )}
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {notes.length === 0 && (
          <li className="px-4 py-6 text-center text-xs text-gray-400">
            {mode === "tags" && !tag ? "Choisissez un tag." : "Aucune note."}
          </li>
        )}
        {mode === "chrono"
          ? chronoGroups.map(([day, group]) => (
              <li key={day}>
                <p className="sticky top-0 border-b border-gray-100 bg-gray-50/95 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                  {day}
                </p>
                <ul>{group.map(item)}</ul>
              </li>
            ))
          : notes.map(item)}
      </ul>
    </aside>
  );
}
