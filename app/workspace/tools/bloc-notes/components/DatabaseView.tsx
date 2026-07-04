"use client";

/**
 * DatabaseView — onglet Base de données du Bloc-notes.
 * Tableau filtrable/triable de TOUT le carnet (notes + tâches) :
 * titre, type, tags, statut, date, source cliquable → navigation vers
 * l'app d'origine via openApp (le carnet ne connaît pas les apps : il
 * n'utilise que le callback de navigation du shell).
 */

import { useState } from "react";
import type { Block, Note, NotebookState, SourceRef, Task } from "../spec";
import { fmtShort } from "./uiHelpers";

/** Todos (cases à cocher) contenus dans les blocs d'une note, à plat. */
function collectTodos(note: Note): { blockId: string; text: string; checked: boolean }[] {
  const out: { blockId: string; text: string; checked: boolean }[] = [];
  const walk = (blocks: Block[]) => {
    for (const b of blocks) {
      if (b.kind === "todo") out.push({ blockId: b.id, text: b.text, checked: Boolean(b.checked) });
      const children = "children" in b ? b.children : undefined;
      if (Array.isArray(children)) walk(children);
    }
  };
  walk(note.blocks);
  return out;
}

/** Signature structurelle du openApp du shell (AppNavContext étendu). */
type OpenApp = (
  appId: string,
  context?: { document_id?: string; thread_id?: string; mail_id?: string; note_id?: string },
) => void;

type RowKind = "note" | "tache";
type SortKey = "title" | "type" | "date";

interface RowItem {
  key: string;
  kind: RowKind;
  title: string;
  tags: string[];
  status?: Task["status"];
  date: number;
  source?: SourceRef;
  noteId?: string;
}

const STATUS_LABEL: Record<Task["status"], string> = {
  todo: "À faire",
  doing: "En cours",
  done: "Terminé",
};
const STATUS_STYLE: Record<Task["status"], string> = {
  todo: "bg-gray-100 text-gray-600",
  doing: "bg-amber-50 text-amber-700",
  done: "bg-emerald-50 text-emerald-700",
};

function sourceLabel(s: SourceRef): string {
  if (s.kind === "message") return "💬 Message";
  if (s.kind === "mail") return `📧 ${s.subject}`;
  return "📄 Document";
}

interface Props {
  state: NotebookState;
  openApp: OpenApp;
  onOpenNote: (noteId: string) => void;
  /** Filtre initial : l'onglet « Tâches » ouvre sur les tâches seules. */
  defaultFilter?: "all" | RowKind;
}

export function DatabaseView({ state, openApp, onOpenNote, defaultFilter = "all" }: Props) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | RowKind>(defaultFilter);
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "date", asc: false });

  // Les todos (cases à cocher) des notes deviennent des TÂCHES à part
  // entière — une ligne = une tâche, pas la conversation entière.
  const noteTodoRows: RowItem[] = Object.values(state.notes).flatMap((n) =>
    collectTodos(n).map((td): RowItem => ({
      key: `todo:${n.id}:${td.blockId}`,
      kind: "tache",
      title: td.text.trim() || "(tâche sans texte)",
      tags: n.tags,
      status: td.checked ? "done" : "todo",
      date: n.updated_at,
      source: n.source,
      noteId: n.id,
    })),
  );

  const rows: RowItem[] = [
    ...Object.values(state.notes).map((n): RowItem => ({
      key: `note:${n.id}`,
      kind: "note",
      title: n.title.trim() || "Sans titre",
      tags: n.tags,
      date: n.updated_at,
      source: n.source,
      noteId: n.id,
    })),
    ...Object.values(state.tasks).map((t): RowItem => ({
      key: `tache:${t.id}`,
      kind: "tache",
      title: t.title,
      tags: t.tags,
      status: t.status,
      date: t.updated_at,
      source: t.source,
      noteId: t.note_id,
    })),
    ...noteTodoRows,
  ]
    .filter((r) => typeFilter === "all" || r.kind === typeFilter)
    .filter((r) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return r.title.toLowerCase().includes(q) || r.tags.some((t) => t.toLowerCase().includes(q));
    })
    .sort((a, b) => {
      const dir = sort.asc ? 1 : -1;
      if (sort.key === "title") return a.title.localeCompare(b.title, "fr") * dir;
      if (sort.key === "type") return a.kind.localeCompare(b.kind) * dir;
      return (a.date - b.date) * dir;
    });

  const openSource = (s: SourceRef) => {
    if (s.kind === "message") openApp("messages", { thread_id: s.thread_id });
    else if (s.kind === "mail") openApp("mail", { mail_id: s.mail_id });
    else openApp("documents", { document_id: s.document_id });
  };

  const header = (key: SortKey, label: string) => (
    <th className="px-3 py-2 text-left">
      <button
        type="button"
        className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 transition hover:text-gray-800"
        onClick={() => setSort((s) => ({ key, asc: s.key === key ? !s.asc : key === "title" }))}
      >
        {label}
        {sort.key === key && <span aria-hidden>{sort.asc ? "↑" : "↓"}</span>}
      </button>
    </th>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-50/60">
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-4 py-2.5">
        <input
          type="search"
          className="w-56 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
          placeholder="Filtrer par titre ou tag…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex gap-1" role="tablist">
          {(
            [
              ["all", "Tout"],
              ["note", "Notes"],
              ["tache", "Tâches"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={typeFilter === v}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                typeFilter === v ? "bg-indigo-50 text-indigo-700" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
              }`}
              onClick={() => setTypeFilter(v)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="ml-auto text-[11px] text-gray-400">
          {rows.length} élément{rows.length > 1 ? "s" : ""}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-gray-50">
              <tr>
                {header("title", "Titre")}
                {header("type", "Type")}
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Tags</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Statut</th>
                {header("date", "Date")}
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-xs text-gray-400">
                    Rien dans le carnet pour ces filtres.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-gray-100 transition hover:bg-gray-50/70">
                  <td className="max-w-[280px] px-3 py-2">
                    {r.kind === "note" || r.noteId ? (
                      <button
                        type="button"
                        className="block max-w-full truncate text-left font-medium text-gray-800 transition hover:text-indigo-700"
                        title="Ouvrir la note"
                        onClick={() => r.noteId && onOpenNote(r.noteId)}
                      >
                        {r.title}
                      </button>
                    ) : (
                      <span className="block truncate text-gray-800">{r.title}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                      {r.kind === "note" ? "Note" : "Tâche"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap gap-1">
                      {r.tags.map((t) => (
                        <span key={t} className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                          #{t}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {r.status ? (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[r.status]}`}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500">{fmtShort(r.date)}</td>
                  <td className="max-w-[220px] px-3 py-2">
                    {r.source ? (
                      <button
                        type="button"
                        title="Ouvrir la source"
                        className="block max-w-full truncate text-left text-xs font-medium text-indigo-600 transition hover:text-indigo-800 hover:underline"
                        onClick={() => openSource(r.source!)}
                      >
                        {sourceLabel(r.source)}
                      </button>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
