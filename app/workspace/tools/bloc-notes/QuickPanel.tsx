"use client";

/**
 * QuickPanel — vue rapide du Bloc-notes, montée par le WorkspaceShell
 * (pattern ChatDock). Icône 📓 flottante discrète au-dessus du dock de
 * chat ; ouvre un panneau latéral droit étroit (~360 px) PAR-DESSUS
 * l'app active sans la démonter : note rapide (focus auto), notes
 * récentes cliquables, filtre par tag, vue chrono. Fermeture Escape /
 * clic extérieur. Masqué quand l'app Bloc-notes est déjà ouverte.
 */

import { useEffect, useRef, useState } from "react";
import type { WorkspaceAction, WorkspaceState } from "@/app/lib/engine/workspace";
import { NotebookQuickContent } from "./components/QuickContent";
import { notebookStateOf } from "./components/uiHelpers";

interface Props {
  workspace: WorkspaceState;
  /** App actuellement affichée — l'icône se masque sur "bloc-notes". */
  activeApp: string;
  openApp: (appId: string, context?: { note_id?: string }) => void;
  dispatch: (action: WorkspaceAction) => void;
}

export function QuickPanel({ workspace, activeApp, openApp, dispatch }: Props) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const state = notebookStateOf(workspace);

  // Fermeture : Escape ou clic extérieur — l'app active reste interactive.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const noteCount = state.order.length;

  return (
    <>
      {/* Icône flottante — au-dessus des bulles du ChatDock. */}
      {!open && activeApp !== "bloc-notes" && (
        <button
          type="button"
          title="Bloc-notes — note rapide"
          aria-label="Ouvrir le bloc-notes rapide"
          className="fixed bottom-44 right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-lg shadow-lg transition hover:scale-105 hover:border-indigo-300"
          onClick={() => setOpen(true)}
        >
          <span aria-hidden>📓</span>
        </button>
      )}

      {/* Panneau latéral droit — par-dessus l'app active, jamais démontée. */}
      {open && (
        <aside
          ref={panelRef}
          aria-label="Bloc-notes rapide"
          className="fixed inset-y-0 right-0 z-50 flex w-[360px] flex-col border-l border-gray-200 bg-white shadow-2xl"
        >
          <header className="flex shrink-0 items-center justify-between border-b border-gray-200 px-3 py-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <span aria-hidden>📓</span>
              Bloc-notes
              {noteCount > 0 && (
                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
                  {noteCount}
                </span>
              )}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-indigo-600 transition hover:bg-indigo-50"
                onClick={() => {
                  setOpen(false);
                  openApp("bloc-notes");
                }}
              >
                Ouvrir l&apos;app ↗
              </button>
              <button
                type="button"
                aria-label="Fermer le bloc-notes rapide"
                className="rounded-md px-1.5 py-0.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>
          </header>
          <div className="min-h-0 flex-1">
            <NotebookQuickContent
              state={state}
              dispatch={dispatch}
              autoFocus
              onOpenNote={(noteId) => {
                setOpen(false);
                openApp("bloc-notes", { note_id: noteId });
              }}
            />
          </div>
        </aside>
      )}
    </>
  );
}
