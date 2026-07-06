"use client";

/**
 * BlocNotesApp — application complète du Bloc-notes Universel (dock).
 * Quatre onglets : Notes (sidebar + éditeur de blocs fluide), Tâches
 * (tableau filtrable), Mind map (carte mentale de la hiérarchie de
 * blocs) et Kanban (3 colonnes DnD). Toutes les mutations passent par les
 * constructeurs d'api.ts → dispatch tool_op ; lectures via les
 * sélecteurs purs. Aucun import de mécaniques ni du moteur hors types
 * (garde-fou testé).
 */

import { useEffect, useRef, useState } from "react";
import type { WorkspaceAppProps } from "../../apps/types";
import { AttachToMailButton } from "../../artifacts/AttachToMailButton";
import { GuidedTour, type TourStep } from "@/app/workspace/primitives/GuidedTour";
import { addTag, createNote, deleteNote, removeTag, renameNote, updateBlocks } from "./api";
import type { Note } from "./spec";
import { BlockEditor } from "./components/BlockEditor";
import { DatabaseView } from "./components/DatabaseView";
import { KanbanView } from "./components/KanbanView";
import { MindMapView } from "./components/MindMapView";
import { NotesSidebar } from "./components/NotesSidebar";
import {
  asAnyBlocks,
  asBlocks,
  fmtShort,
  notebookStateOf,
  opPayloadId,
  regenBlockIds,
  removeBlockById,
  type AnyBlock,
} from "./components/uiHelpers";

const RENAME_DEBOUNCE_MS = 500;

type Tab = "notes" | "base";
type TaskView = "bdd" | "kanban";

const TABS: [Tab, string][] = [
  ["notes", "Notes"],
  ["base", "Tâches"],
];

export function BlocNotesApp({ workspace, dispatch, openApp, context }: WorkspaceAppProps) {
  const state = notebookStateOf(workspace);
  const [tab, setTab] = useState<Tab>("notes");
  const [taskView, setTaskView] = useState<TaskView>("bdd");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tourOpen, setTourOpen] = useState(false);

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

  /** Déplacer un bloc (glissé depuis l'éditeur) vers une AUTRE note. */
  const moveBlock = (sourceId: string, targetId: string, block: AnyBlock) => {
    const src = state.notes[sourceId];
    const tgt = state.notes[targetId];
    if (!src || !tgt || sourceId === targetId) return;
    dispatch(updateBlocks(targetId, asBlocks([...asAnyBlocks(tgt.blocks), regenBlockIds(block)])));
    dispatch(updateBlocks(sourceId, asBlocks(removeBlockById(asAnyBlocks(src.blocks), block.id))));
  };

  /** Déplacer un bloc vers une NOUVELLE note. */
  const moveToNewNote = (sourceId: string, block: AnyBlock) => {
    const src = state.notes[sourceId];
    if (!src) return;
    const action = createNote("");
    dispatch(action);
    const newId = opPayloadId(action, "note_id");
    if (!newId) return;
    dispatch(updateBlocks(newId, asBlocks([regenBlockIds(block)])));
    dispatch(updateBlocks(sourceId, asBlocks(removeBlockById(asAnyBlocks(src.blocks), block.id))));
    setTab("notes");
    setSelectedId(newId);
  };

  // Étape active « Crée une tâche » : on accepte AUTANT la case à cocher
  // (bloc « ☑ Tâche ») que la vraie tâche (« → Tâche »). Les deux transforment
  // une ligne en action et apparaissent dans l'onglet Tâches.
  const hasTodoBlock = (blocks: AnyBlock[]): boolean =>
    blocks.some((b) => b.kind === "todo" || (b.children ? hasTodoBlock(b.children) : false));
  const hasActionItem = () =>
    Object.keys(state.tasks).length > 0 ||
    Object.values(state.notes).some((n) => hasTodoBlock(asAnyBlocks(n.blocks)));

  const tourSteps: TourStep[] = [
    {
      selector: "",
      title: "Bienvenue dans le Bloc-notes",
      body: "Ton carnet universel : écris en blocs riches, transforme une ligne en tâche ou en décision, visualise en mind map, et annote tout le poste de travail sans t'interrompre.",
    },
    {
      selector: "[data-tour='notes-tabs']",
      title: "Deux onglets",
      body: "Notes pour écrire, Tâches pour suivre tes todos.",
      placement: "bottom",
    },
    {
      selector: "[data-tour='note-list']",
      title: "Tes notes",
      body: "Toutes tes notes ici. Crée-en une nouvelle (bouton +, ou la touche Entrée), recherche, filtre par tag.",
      placement: "right",
      beforeShow: () => setTab("notes"),
    },
    {
      selector: "[data-tour='note-blocks']",
      title: "Écriture en blocs",
      body: "Titres, listes, cases à cocher… ⌘B/I/U pour la mise en forme. Le menu d'une ligne la transforme en tâche ou en décision, la déplace ou la duplique — et tu peux glisser un bloc vers une autre note.",
      placement: "left",
      beforeShow: () => {
        setTab("notes");
        if (state.order.length === 0) create();
      },
    },
    {
      selector: "[data-tour='note-mindmap']",
      title: "Mind map",
      body: "Bascule la même note en carte mentale : titres et puces deviennent des nœuds, le reste se rattache et s'affiche au survol.",
      placement: "bottom",
    },
    {
      selector: "[data-tour='note-tags']",
      title: "Tags",
      body: "Tague tes notes pour les regrouper et les retrouver.",
      placement: "bottom",
    },
    {
      selector: "[data-tour='note-attach']",
      title: "Joindre à l'email",
      body: "Attache la note (ou sa mind map) à un mail — son contenu entre alors dans l'analyse de ta partie.",
      placement: "bottom",
    },
    {
      selector: "[data-tour='note-line-menu']",
      accent: "red",
      title: "Crée une tâche",
      body: "Transforme une idée en action : sur une ligne de ta note, clique la poignée ⋮ cerclée de rouge (à gauche de la ligne), puis choisis « ☑ Tâche » ou « → Tâche ». Fais-le une fois pour continuer.",
      placement: "right",
      beforeShow: () => {
        setTab("notes");
        if (state.order.length === 0) create();
      },
      waitFor: hasActionItem,
      todo: "Ouvre le menu ⋮ (rouge) d'une ligne → « ☑ Tâche » ou « → Tâche ».",
    },
    {
      selector: "[data-tour='tasks-views']",
      title: "L'onglet Tâches",
      body: "Voilà ta tâche ! L'onglet Tâches agrège tous tes todos. Bascule entre la vue Base de données (filtrable, triable) et la vue Kanban (3 colonnes : à faire / en cours / fait). Chaque case cochée d'une note apparaît aussi ici.",
      placement: "bottom",
      beforeShow: () => setTab("base"),
    },
    {
      selector: "",
      title: "Astuce : annoter partout",
      body: "Depuis Messages, Mail ou Documents, sélectionne du texte et clique sur le 📓 : l'extrait (et ton commentaire) atterrit ici, groupé par source, avec un lien pour y revenir. Un marqueur 📓 jaune signale ce qui est annoté.",
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-white outline-none">
      {/* Onglets. */}
      <header
        data-tour="notes-tabs"
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
        <button
          type="button"
          data-tour="guide"
          title="Guide interactif du Bloc-notes"
          className="ml-auto rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
          onClick={() => setTourOpen(true)}
        >
          ❓ Guide
        </button>
      </header>

      {tab === "base" && (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Sous-vue : base de données ⟷ kanban. */}
          <div data-tour="tasks-views" className="flex shrink-0 items-center gap-1 border-b border-gray-100 bg-white px-3 py-1.5">
            {(
              [
                ["bdd", "🗂 Base de données"],
                ["kanban", "📋 Kanban"],
              ] as [TaskView, string][]
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={taskView === v}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                  taskView === v
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                }`}
                onClick={() => setTaskView(v)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {taskView === "bdd" ? (
              <DatabaseView state={state} openApp={openApp} onOpenNote={openNote} defaultFilter="tache" />
            ) : (
              <KanbanView state={state} dispatch={dispatch} />
            )}
          </div>
        </div>
      )}

      {tab === "notes" && (
        <div className="flex min-h-0 flex-1">
          <NotesSidebar
            state={state}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
            onCreate={create}
            onMoveBlock={moveBlock}
            onMoveToNewNote={moveToNewNote}
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

      <GuidedTour steps={tourSteps} open={tourOpen} onClose={() => setTourOpen(false)} />
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
  const [view, setView] = useState<"edit" | "mind">("edit");
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
          {/* Bascule éditeur ⟷ mind map (même note, mêmes blocs). */}
          <div data-tour="note-mindmap" className="mt-1 flex shrink-0 items-center gap-0.5 rounded-lg bg-gray-100 p-0.5">
            {(
              [
                ["edit", "✎ Éditer"],
                ["mind", "🧠 Mind map"],
              ] as ["edit" | "mind", string][]
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                className={`rounded-md px-2 py-1 text-[11px] font-semibold transition ${
                  view === v ? "bg-white text-indigo-700 shadow-sm" : "text-gray-500 hover:text-gray-800"
                }`}
                onClick={() => setView(v)}
              >
                {label}
              </button>
            ))}
          </div>
          <div data-tour="note-attach" className="mt-1 shrink-0">
            <AttachToMailButton
              tool="bloc-notes"
              id={note.id}
              kind={view === "mind" ? "mindmap" : "note"}
              title={note.title.trim() || (view === "mind" ? "Mind map" : "Note")}
              dispatch={dispatch}
              compact
            />
          </div>
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
        <div data-tour="note-tags" className="mt-1.5 flex flex-wrap items-center gap-1.5">
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
          <span className="ml-auto text-[11px] text-gray-300" title={`Créée le ${new Date(note.created_at).toLocaleString("fr-FR")}`}>
            {note.source && <span aria-hidden className="mr-1">🔗</span>}
            créée {fmtShort(note.created_at)} · modifiée {fmtShort(note.updated_at)}
          </span>
        </div>
      </div>

      <div data-tour="note-blocks" className="min-h-0 flex-1 px-5">
        {view === "edit" ? (
          <BlockEditor noteId={note.id} blocks={note.blocks} dispatch={dispatch} />
        ) : (
          <MindMapView note={note} dispatch={dispatch} />
        )}
      </div>
    </section>
  );
}
