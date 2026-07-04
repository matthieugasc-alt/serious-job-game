"use client";

/**
 * BlocNotesApp — application complète du Bloc-notes Universel (dock).
 * Trois onglets : Notes (sidebar + éditeur de blocs fluide), Kanban
 * (3 colonnes DnD), Base de données (tableau filtrable, sources
 * navigables via openApp). Toutes les mutations passent par les
 * constructeurs d'api.ts → dispatch tool_op ; lectures via les
 * sélecteurs purs. Aucun import de mécaniques ni du moteur hors types
 * (garde-fou testé).
 */

import { useEffect, useRef, useState } from "react";
import type { WorkspaceAppProps } from "../../apps/types";
import { addTag, createNote, deleteNote, removeTag, renameNote } from "./api";
import type { Note } from "./spec";
import { BlockEditor } from "./components/BlockEditor";
import { DatabaseView } from "./components/DatabaseView";
import { KanbanView } from "./components/KanbanView";
import { NotesSidebar } from "./components/NotesSidebar";
import { fmtShort, notebookStateOf, opPayloadId } from "./components/uiHelpers";

const RENAME_DEBOUNCE_MS = 500;

type Tab = "notes" | "kanban" | "base";

const TABS: [Tab, string][] = [
  ["notes", "Notes"],
  ["kanban", "Kanban"],
  ["base", "Base de données"],
];

export function BlocNotesApp({ workspace, dispatch, openApp, context }: WorkspaceAppProps) {
  const state = notebookStateOf(workspace);
  const [tab, setTab] = useState<Tab>("notes");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Navigation entrante (QuickPanel, Base de données) : ouvrir une note.
  const requested = context?.note_id;
  useEffect(() => {
    if (requested) {
      setTab("notes");
      setSelectedId(requested);
    }
  }, [requested]);

  const selected: Note | null =
    (selectedId ? state.notes[selectedId] : undefined) ??
    (state.order.length > 0 ? state.notes[state.order[0]] : undefined) ??
    null;

  const create = () => {
    const action = createNote();
    dispatch(action);
    const id = opPayloadId(action, "note_id");
    setTab("notes");
    if (id) setSelectedId(id);
  };

  const openNote = (noteId: string) => {
    setTab("notes");
    setSelectedId(noteId);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {/* Onglets. */}
      <header
        className="flex shrink-0 items-center gap-1 border-b border-gray-200 bg-white px-3 py-2"
        role="tablist"
      >
        <span aria-hidden className="mr-1 text-base leading-none">📓</span>
        {TABS.map(([t, label]) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              tab === t
                ? "bg-indigo-50 text-indigo-700"
                : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
            }`}
            onClick={() => setTab(t)}
          >
            {label}
          </button>
        ))}
      </header>

      {tab === "kanban" && (
        <div className="min-h-0 flex-1">
          <KanbanView state={state} dispatch={dispatch} />
        </div>
      )}

      {tab === "base" && (
        <div className="min-h-0 flex-1">
          <DatabaseView state={state} openApp={openApp} onOpenNote={openNote} />
        </div>
      )}

      {tab === "notes" && (
        <div className="flex min-h-0 flex-1">
          <NotesSidebar
            state={state}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
            onCreate={create}
          />
          {selected ? (
            <NoteEditorPane
              key={selected.id}
              note={selected}
              dispatch={dispatch}
              onDelete={() => {
                dispatch(deleteNote(selected.id));
                setSelectedId(null);
              }}
            />
          ) : (
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 bg-gray-50/60">
              <p className="text-sm text-gray-400">Votre carnet est vide.</p>
              <button
                type="button"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
                onClick={create}
              >
                + Première note
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Volet éditeur (titre + tags + blocs) ─────────────────────────

function NoteEditorPane({
  note,
  dispatch,
  onDelete,
}: {
  note: Note;
  dispatch: WorkspaceAppProps["dispatch"];
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [tagDraft, setTagDraft] = useState("");
  const renameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (renameTimer.current) clearTimeout(renameTimer.current);
    },
    [],
  );

  const editTitle = (value: string) => {
    setTitle(value);
    if (renameTimer.current) clearTimeout(renameTimer.current);
    renameTimer.current = setTimeout(() => {
      dispatch(renameNote(note.id, value.trim()));
    }, RENAME_DEBOUNCE_MS);
  };

  const submitTag = () => {
    const tag = tagDraft.trim().replace(/^#/, "").toLowerCase();
    if (!tag) return;
    if (!note.tags.includes(tag)) dispatch(addTag(note.id, tag));
    setTagDraft("");
  };

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-white">
      <div className="shrink-0 border-b border-gray-100 px-6 pb-2 pt-4">
        <div className="flex items-start gap-2">
          <input
            aria-label="Titre de la note"
            className="min-w-0 flex-1 bg-transparent text-2xl font-bold text-gray-900 outline-none placeholder:text-gray-300"
            placeholder="Sans titre"
            value={title}
            onChange={(e) => editTitle(e.target.value)}
          />
          <button
            type="button"
            title="Supprimer la note"
            aria-label="Supprimer la note"
            className="mt-1 shrink-0 rounded-md px-1.5 py-0.5 text-sm text-gray-300 transition hover:bg-red-50 hover:text-red-500"
            onClick={onDelete}
          >
            🗑
          </button>
        </div>

        {/* Tags + provenance. */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {note.tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700"
            >
              #{t}
              <button
                type="button"
                aria-label={`Retirer le tag ${t}`}
                className="text-indigo-300 transition hover:text-indigo-600"
                onClick={() => dispatch(removeTag(note.id, t))}
              >
                ✕
              </button>
            </span>
          ))}
          <input
            aria-label="Ajouter un tag"
            className="w-24 rounded-full border border-dashed border-gray-200 bg-transparent px-2 py-0.5 text-[11px] text-gray-600 outline-none placeholder:text-gray-300 focus:border-indigo-300"
            placeholder="+ tag"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitTag();
              }
            }}
            onBlur={submitTag}
          />
          <span className="ml-auto text-[11px] text-gray-300">
            {note.source && <span aria-hidden className="mr-1">🔗</span>}
            modifiée {fmtShort(note.updated_at)}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 px-5">
        <BlockEditor noteId={note.id} blocks={note.blocks} dispatch={dispatch} />
      </div>
    </section>
  );
}
