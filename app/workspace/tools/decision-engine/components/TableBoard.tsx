"use client";

/**
 * TableBoard — moteur Table/Canvas en mode « zones » : cartes/post-it
 * réparties dans des zones configurables (SWOT, BMC, PESTEL…). Ajout,
 * édition inline, déplacement d'une zone à l'autre, retrait. Jamais un
 * tableur : des zones colorées à cartes.
 */

import type { WorkspaceAction } from "@/app/lib/engine/workspace";
import type { JsonObject } from "@/app/lib/engine/mechanics";
import { addItem, boardItemsOf, moveItem, removeItem, updateItem } from "../api";
import type { Board } from "../spec";

type Dispatch = (action: WorkspaceAction) => void;
type Zone = { id: string; label: string; color?: string };

function zonesOf(board: Board): Zone[] {
  const z = (board.config as JsonObject).zones;
  return Array.isArray(z)
    ? z
        .filter((x): x is JsonObject => Boolean(x) && typeof x === "object" && !Array.isArray(x))
        .map((x) => ({ id: String(x.id ?? ""), label: String(x.label ?? ""), color: typeof x.color === "string" ? x.color : undefined }))
        .filter((z) => z.id.length > 0)
    : [];
}

export function TableBoard({ board, dispatch }: { board: Board; dispatch: Dispatch }) {
  const zones = zonesOf(board);
  const items = boardItemsOf(board);

  return (
    <div className={`grid h-full min-h-0 gap-2 p-3 ${zones.length <= 2 ? "grid-cols-1 sm:grid-cols-2" : zones.length <= 4 ? "grid-cols-2" : "grid-cols-3"}`}>
      {zones.map((zone) => {
        const cards = items.filter((i) => i.zone_id === zone.id);
        return (
          <div key={zone.id} className="flex min-h-0 flex-col rounded-xl border border-gray-200" style={{ backgroundColor: zone.color ? `${zone.color}33` : undefined }}>
            <div className="flex shrink-0 items-center justify-between px-2.5 py-1.5">
              <h4 className="text-xs font-semibold text-gray-700">{zone.label}</h4>
              <button
                type="button"
                title="Ajouter une carte"
                className="rounded px-1.5 text-sm text-gray-500 transition hover:bg-white/60 hover:text-indigo-600"
                onClick={() => dispatch(addItem(board.id, { label: "", zone_id: zone.id }))}
              >
                +
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2 pt-0">
              {cards.length === 0 && <p className="px-1 text-[11px] text-gray-400">—</p>}
              {cards.map((c) => (
                <div key={c.id} className="group rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
                  <textarea
                    rows={2}
                    value={c.label}
                    onChange={(e) => dispatch(updateItem(board.id, c.id, { label: e.target.value }))}
                    placeholder="Note…"
                    className="w-full resize-none bg-transparent text-xs text-gray-800 placeholder:text-gray-400 focus:outline-none"
                  />
                  <div className="mt-1 flex items-center justify-between opacity-0 transition group-hover:opacity-100">
                    <select
                      value={c.zone_id ?? zone.id}
                      onChange={(e) => dispatch(moveItem(board.id, c.id, { zone_id: e.target.value }))}
                      className="rounded border border-gray-200 bg-white text-[10px] text-gray-500 focus:outline-none"
                      title="Déplacer vers une zone"
                    >
                      {zones.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
                    </select>
                    <button type="button" title="Retirer" className="text-[11px] text-gray-300 hover:text-red-500" onClick={() => dispatch(removeItem(board.id, c.id))}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
