"use client";

/**
 * KanbanBoard — moteur Kanban/Backlog : colonnes configurables + cartes
 * déplaçables (statut = colonne). Priorité, tags, édition inline. Les
 * cartes sont des items génériques (item.status = colonne). Jamais un
 * tableur : des colonnes à cartes.
 */

import type { WorkspaceAction } from "@/app/lib/engine/workspace";
import type { JsonObject } from "@/app/lib/engine/mechanics";
import { addItem, boardItemsOf, moveItem, removeItem, updateItem } from "../api";
import type { Board } from "../spec";

type Dispatch = (action: WorkspaceAction) => void;
type Column = { id: string; label: string };

const PRIORITY = [
  { value: "", label: "—" },
  { value: "low", label: "Basse" },
  { value: "normal", label: "Normale" },
  { value: "high", label: "Haute" },
];
const PRIORITY_COLOR: Record<string, string> = { low: "#e5e7eb", normal: "#bfdbfe", high: "#fecaca" };

function columnsOf(board: Board): Column[] {
  const c = (board.config as JsonObject).columns;
  return Array.isArray(c)
    ? c
        .filter((x): x is JsonObject => Boolean(x) && typeof x === "object" && !Array.isArray(x))
        .map((x) => ({ id: String(x.id ?? ""), label: String(x.label ?? "") }))
        .filter((c) => c.id.length > 0)
    : [];
}

export function KanbanBoard({ board, dispatch }: { board: Board; dispatch: Dispatch }) {
  const columns = columnsOf(board);
  const items = boardItemsOf(board);

  return (
    <div className="flex h-full min-h-0 gap-2 overflow-x-auto p-3">
      {columns.map((col) => {
        const cards = items.filter((i) => (i.status ?? columns[0]?.id) === col.id);
        return (
          <div key={col.id} className="flex w-56 shrink-0 flex-col rounded-xl bg-gray-100/70">
            <div className="flex shrink-0 items-center justify-between px-2.5 py-1.5">
              <h4 className="text-xs font-semibold text-gray-700">{col.label} <span className="text-gray-400">· {cards.length}</span></h4>
              <button type="button" title="Ajouter une carte" className="rounded px-1.5 text-sm text-gray-500 transition hover:bg-white hover:text-indigo-600" onClick={() => dispatch(addItem(board.id, { label: "", status: col.id }))}>+</button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2 pt-0">
              {cards.map((c) => {
                const priority = typeof c.fields.priority === "string" ? c.fields.priority : "";
                return (
                  <div key={c.id} className="group rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
                    {priority && <span className="mb-1 inline-block h-1.5 w-8 rounded-full" style={{ backgroundColor: PRIORITY_COLOR[priority] }} />}
                    <textarea
                      rows={2}
                      value={c.label}
                      onChange={(e) => dispatch(updateItem(board.id, c.id, { label: e.target.value }))}
                      placeholder="Carte…"
                      className="w-full resize-none bg-transparent text-xs text-gray-800 placeholder:text-gray-400 focus:outline-none"
                    />
                    <div className="mt-1 flex items-center justify-between gap-1 opacity-0 transition group-hover:opacity-100">
                      <select value={priority} onChange={(e) => dispatch(updateItem(board.id, c.id, { fields: { ...c.fields, priority: e.target.value } }))} className="rounded border border-gray-200 bg-white text-[10px] text-gray-500 focus:outline-none" title="Priorité">
                        {PRIORITY.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                      </select>
                      <div className="flex items-center gap-1">
                        <select value={c.status ?? col.id} onChange={(e) => dispatch(moveItem(board.id, c.id, { status: e.target.value }))} className="rounded border border-gray-200 bg-white text-[10px] text-gray-500 focus:outline-none" title="Déplacer">
                          {columns.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                        </select>
                        <button type="button" title="Retirer" className="text-[11px] text-gray-300 hover:text-red-500" onClick={() => dispatch(removeItem(board.id, c.id))}>✕</button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {cards.length === 0 && <p className="px-1 text-[11px] text-gray-400">—</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
