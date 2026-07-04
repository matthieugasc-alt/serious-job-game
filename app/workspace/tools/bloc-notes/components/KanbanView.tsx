"use client";

/**
 * KanbanView — onglet Kanban du Bloc-notes.
 * Trois colonnes (À faire / En cours / Terminé), cartes déplaçables en
 * drag-and-drop HTML5 (op move_task), création rapide par colonne
 * (op create_task). Lecture via le sélecteur pur selectTasksByStatus.
 */

import { useState } from "react";
import type { WorkspaceAction } from "@/app/lib/engine/workspace";
import { createTask, moveTask, selectTasksByStatus } from "../api";
import type { NotebookState, Task } from "../spec";
import { fmtShort } from "./uiHelpers";

type Status = Task["status"];

const COLUMNS: { status: Status; title: string; dot: string }[] = [
  { status: "todo", title: "À faire", dot: "bg-gray-400" },
  { status: "doing", title: "En cours", dot: "bg-amber-400" },
  { status: "done", title: "Terminé", dot: "bg-emerald-500" },
];

const PRIORITY_STYLE: Record<string, string> = {
  high: "bg-rose-50 text-rose-700",
  low: "bg-gray-100 text-gray-500",
};
const PRIORITY_LABEL: Record<string, string> = { high: "haute", low: "basse" };

interface Props {
  state: NotebookState;
  dispatch: (action: WorkspaceAction) => void;
}

export function KanbanView({ state, dispatch }: Props) {
  const [drafts, setDrafts] = useState<Record<Status, string>>({ todo: "", doing: "", done: "" });
  const [over, setOver] = useState<Status | null>(null);

  const add = (status: Status) => {
    const title = drafts[status].trim();
    if (!title) return;
    dispatch(createTask({ title, status }));
    setDrafts((d) => ({ ...d, [status]: "" }));
  };

  return (
    <div className="flex h-full min-h-0 gap-3 overflow-x-auto bg-gray-50/60 p-4">
      {COLUMNS.map(({ status, title, dot }) => {
        const tasks = selectTasksByStatus(state, status);
        return (
          <section
            key={status}
            aria-label={title}
            className={`flex h-full min-h-0 w-72 shrink-0 flex-col rounded-2xl border bg-gray-100/80 transition ${
              over === status ? "border-indigo-300 ring-2 ring-indigo-100" : "border-gray-200"
            }`}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes("text/bloc-notes-task")) return;
              e.preventDefault();
              setOver(status);
            }}
            onDragLeave={() => setOver((o) => (o === status ? null : o))}
            onDrop={(e) => {
              const taskId = e.dataTransfer.getData("text/bloc-notes-task");
              setOver(null);
              if (taskId) {
                e.preventDefault();
                dispatch(moveTask(taskId, status));
              }
            }}
          >
            <header className="flex shrink-0 items-center gap-2 px-3 py-2.5">
              <span aria-hidden className={`h-2 w-2 rounded-full ${dot}`} />
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">{title}</h3>
              <span className="ml-auto rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
                {tasks.length}
              </span>
            </header>

            {/* Création rapide. */}
            <div className="shrink-0 px-2 pb-1.5">
              <input
                className="w-full rounded-lg border border-transparent bg-white/70 px-2.5 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                placeholder="+ Nouvelle tâche…"
                value={drafts[status]}
                onChange={(e) => setDrafts((d) => ({ ...d, [status]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") add(status);
                }}
              />
            </div>

            <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2 pb-2">
              {tasks.map((t) => (
                <li key={t.id}>
                  <div
                    draggable
                    role="listitem"
                    className="cursor-grab rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm transition hover:border-indigo-200 hover:shadow active:cursor-grabbing"
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/bloc-notes-task", t.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                  >
                    <p className={`text-sm leading-snug ${status === "done" ? "text-gray-400 line-through" : "text-gray-800"}`}>
                      {t.title}
                    </p>
                    {t.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{t.description}</p>
                    )}
                    {(t.tags.length > 0 || t.priority || t.due || t.source) && (
                      <p className="mt-1.5 flex flex-wrap items-center gap-1">
                        {t.priority && t.priority !== "normal" && (
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_STYLE[t.priority]}`}>
                            {PRIORITY_LABEL[t.priority]}
                          </span>
                        )}
                        {t.due && (
                          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                            ⏰ {t.due}
                          </span>
                        )}
                        {t.tags.map((tag) => (
                          <span key={tag} className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                            #{tag}
                          </span>
                        ))}
                        {t.source && <span className="text-[10px] text-gray-400">🔗 {fmtShort(t.updated_at)}</span>}
                      </p>
                    )}
                  </div>
                </li>
              ))}
              {tasks.length === 0 && (
                <li className="px-2 py-4 text-center text-[11px] text-gray-400">
                  {over === status ? "Déposer ici" : "Aucune tâche."}
                </li>
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
