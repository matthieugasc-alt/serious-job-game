"use client";

/**
 * TimelineBoard — moteur Timeline/Process : étapes séquentielles + jalons
 * (roadmap, waterfall, cycle en V). Étapes = items ordonnés (fields.order),
 * statut, jalon, livrable. Ajout, réordonnancement, édition inline. Rendu
 * en frise horizontale, jamais un tableur.
 */

import type { WorkspaceAction } from "@/app/lib/engine/workspace";
import type { JsonObject } from "@/app/lib/engine/mechanics";
import { addItem, boardItemsOf, moveItem, removeItem, updateItem } from "../api";
import type { Board, DecisionItem } from "../spec";

type Dispatch = (action: WorkspaceAction) => void;
type Status = { value: string; label: string; color?: string };

function statusesOf(board: Board): Status[] {
  const s = (board.config as JsonObject).statuses;
  return Array.isArray(s)
    ? s
        .filter((x): x is JsonObject => Boolean(x) && typeof x === "object" && !Array.isArray(x))
        .map((x) => ({ value: String(x.value ?? ""), label: String(x.label ?? ""), color: typeof x.color === "string" ? x.color : undefined }))
        .filter((s) => s.value.length > 0)
    : [];
}
const orderOf = (i: DecisionItem): number => (typeof i.fields.order === "number" ? i.fields.order : 0);

export function TimelineBoard({ board, dispatch }: { board: Board; dispatch: Dispatch }) {
  const statuses = statusesOf(board);
  const steps = [...boardItemsOf(board)].sort((a, b) => orderOf(a) - orderOf(b) || a.id.localeCompare(b.id));

  const addStep = () => {
    const nextOrder = steps.reduce((m, s) => Math.max(m, orderOf(s)), 0) + 1;
    dispatch(addItem(board.id, { label: "Nouvelle étape", fields: { order: nextOrder }, status: statuses[0]?.value }));
  };
  const swap = (i: number, j: number) => {
    if (j < 0 || j >= steps.length) return;
    const a = steps[i], b = steps[j];
    dispatch(updateItem(board.id, a.id, { fields: { ...a.fields, order: orderOf(b) } }));
    dispatch(updateItem(board.id, b.id, { fields: { ...b.fields, order: orderOf(a) } }));
  };

  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-700">{board.title || "Frise"} · {steps.length} étape(s)</h3>
        <button type="button" className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-indigo-700" onClick={addStep}>+ Étape</button>
      </div>
      <div className="min-h-0 flex-1 overflow-x-auto">
        <div className="flex min-h-full items-stretch gap-0">
          {steps.length === 0 && <p className="text-[11px] text-gray-400">Ajoutez une étape pour construire la frise.</p>}
          {steps.map((s, idx) => {
            const st = statuses.find((x) => x.value === (s.status ?? ""));
            const milestone = s.fields.milestone === true;
            const deliverable = typeof s.fields.deliverable === "string" ? s.fields.deliverable : "";
            return (
              <div key={s.id} className="flex items-center">
                <div className="group relative w-48 shrink-0 rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-400">
                      <button type="button" title={milestone ? "Étape normale" : "Marquer jalon"} onClick={() => dispatch(updateItem(board.id, s.id, { fields: { ...s.fields, milestone: !milestone } }))}>{milestone ? "◆" : "◇"}</button>
                      étape {idx + 1}
                    </span>
                    <span className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                      <button type="button" title="Reculer" className="text-gray-300 hover:text-gray-600" onClick={() => swap(idx, idx - 1)}>←</button>
                      <button type="button" title="Avancer" className="text-gray-300 hover:text-gray-600" onClick={() => swap(idx, idx + 1)}>→</button>
                      <button type="button" title="Retirer" className="text-gray-300 hover:text-red-500" onClick={() => dispatch(removeItem(board.id, s.id))}>✕</button>
                    </span>
                  </div>
                  <input value={s.label} onChange={(e) => dispatch(updateItem(board.id, s.id, { label: e.target.value }))} className="w-full bg-transparent text-xs font-medium text-gray-800 focus:outline-none" placeholder="Étape…" />
                  <input value={deliverable} onChange={(e) => dispatch(updateItem(board.id, s.id, { fields: { ...s.fields, deliverable: e.target.value } }))} className="mt-1 w-full bg-transparent text-[11px] text-gray-500 focus:outline-none" placeholder="Livrable attendu…" />
                  {statuses.length > 0 && (
                    <select value={s.status ?? ""} onChange={(e) => dispatch(moveItem(board.id, s.id, { status: e.target.value }))} className="mt-1.5 w-full rounded border px-1 py-0.5 text-[10px] text-gray-600 focus:outline-none" style={{ backgroundColor: st?.color ? `${st.color}55` : undefined }}>
                      {statuses.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                    </select>
                  )}
                </div>
                {idx < steps.length - 1 && <div className="h-px w-4 shrink-0 bg-gray-300" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
