"use client";

/**
 * NotebookQuickContent — contenu partagé de la vue rapide du Bloc-notes,
 * monté par le QuickPanel (panneau latéral du shell) ET par le Tool
 * épinglable. Note rapide immédiate (focus auto), notes récentes
 * cliquables, filtre par tag, vue chrono. Aucune logique moteur.
 */

import { useState } from "react";
import type { WorkspaceAction } from "@/app/lib/engine/workspace";
import { createNote, selectByTag, selectChronological, selectRecent, updateBlocks } from "../api";
import type { Note, NotebookState } from "../spec";
import { allTags, asBlocks, fmtDay, fmtShort, newBlock, noteExcerpt, opPayloadId } from "./uiHelpers";

type QuickView = "recent" | "tags" | "chrono";

interface Props {
  state: NotebookState;
  dispatch: (action: WorkspaceAction) => void;
  /** Fourni par le QuickPanel : ouvrir la note dans l'app complète. */
  onOpenNote?: (noteId: string) => void;
  /** Focus auto du champ de note rapide (panneau latéral). */
  autoFocus?: boolean;
}

export function NotebookQuickContent({ state, dispatch, onOpenNote, autoFocus }: Props) {
  const [draft, setDraft] = useState("");
  const [view, setView] = useState<QuickView>("recent");
  const [tag, setTag] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const capture = () => {
    const text = draft.trim();
    if (!text) return;
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    const title = lines[0].slice(0, 80);
    const rest = lines.slice(1);
    const action = createNote(title);
    dispatch(action);
    const noteId = opPayloadId(action, "note_id");
    if (noteId && rest.length > 0) {
      dispatch(updateBlocks(noteId, asBlocks(rest.map((l) => newBlock("paragraph", l)))));
    }
    setDraft("");
  };

  const tags = allTags(state);
  const notes: Note[] =
    view === "tags"
      ? tag
        ? selectByTag(state, tag)
        : []
      : view === "chrono"
        ? selectChronological(state)
        : selectRecent(state, 12);

  const noteRow = (n: Note) => {
    const expanded = expandedId === n.id;
    return (
      <li key={n.id}>
        <button
          type="button"
          className="block w-full rounded-lg px-2 py-1.5 text-left transition hover:bg-gray-50"
          onClick={() => (onOpenNote ? onOpenNote(n.id) : setExpandedId(expanded ? null : n.id))}
        >
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-xs font-medium text-gray-800">
              {n.title.trim() || "Sans titre"}
            </span>
            <span className="shrink-0 text-[10px] text-gray-400">{fmtShort(n.updated_at)}</span>
          </span>
          {!expanded && noteExcerpt(n) && (
            <span className="mt-0.5 block truncate text-[11px] text-gray-500">{noteExcerpt(n)}</span>
          )}
        </button>
        {expanded && (
          <div className="mx-2 mb-1 rounded-lg border border-gray-100 bg-gray-50/70 px-2.5 py-2">
            {n.blocks.slice(0, 8).map((b, i) => {
              const t = (b as { text?: string }).text ?? "";
              return t.trim() ? (
                <p key={i} className="text-[11px] leading-relaxed text-gray-600">
                  {t}
                </p>
              ) : null;
            })}
          </div>
        )}
      </li>
    );
  };

  // Vue chrono : groupes par jour de création.
  const chronoGroups: [string, Note[]][] = [];
  if (view === "chrono") {
    for (const n of notes) {
      const day = fmtDay(n.created_at);
      const last = chronoGroups[chronoGroups.length - 1];
      if (last && last[0] === day) last[1].push(n);
      else chronoGroups.push([day, [n]]);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Note rapide — champ immédiat. */}
      <div className="shrink-0 border-b border-gray-100 p-3">
        <textarea
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={autoFocus}
          rows={2}
          className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
          placeholder="Note rapide… (Entrée pour capturer)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              capture();
            }
          }}
        />
      </div>

      {/* Vues : récentes / par tag / chrono. */}
      <div className="flex shrink-0 items-center gap-1 px-3 pt-2" role="tablist">
        {(
          [
            ["recent", "Récentes"],
            ["tags", "Tags"],
            ["chrono", "Chrono"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
              view === v ? "bg-indigo-50 text-indigo-700" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
            }`}
            onClick={() => setView(v)}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "tags" && (
        <div className="flex shrink-0 flex-wrap gap-1 px-3 pt-2">
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

      <ul className="min-h-0 flex-1 overflow-y-auto p-2">
        {notes.length === 0 && (
          <li className="px-2 py-6 text-center text-[11px] text-gray-400">
            {view === "tags" && !tag ? "Choisissez un tag." : "Aucune note pour l'instant."}
          </li>
        )}
        {view === "chrono"
          ? chronoGroups.map(([day, group]) => (
              <li key={day}>
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{day}</p>
                <ul>{group.map(noteRow)}</ul>
              </li>
            ))
          : notes.map(noteRow)}
      </ul>
    </div>
  );
}
