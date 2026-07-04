"use client";

/**
 * MatrixBoard — moteur Matrix en mode « axis » : nuage de points en 4
 * quadrants (Impact/Effort, Probabilité/Impact…). Placement visuel par
 * glisser-déposer (position sérialisée x,y ∈ [0,1]), ajout/retrait
 * d'items, édition inline du libellé. Jamais un tableur.
 */

import { useRef, useState } from "react";
import type { WorkspaceAction } from "@/app/lib/engine/workspace";
import type { JsonObject } from "@/app/lib/engine/mechanics";
import { addItem, boardItemsOf, moveItem, removeItem, updateItem } from "../api";
import type { Board } from "../spec";

type Dispatch = (action: WorkspaceAction) => void;

function axisLabels(board: Board) {
  const axes = (board.config as JsonObject).axes as JsonObject | undefined;
  const x = (axes?.x ?? {}) as JsonObject;
  const y = (axes?.y ?? {}) as JsonObject;
  return {
    xLabel: typeof x.label === "string" ? x.label : "X",
    xMin: typeof x.min_label === "string" ? x.min_label : "",
    xMax: typeof x.max_label === "string" ? x.max_label : "",
    yLabel: typeof y.label === "string" ? y.label : "Y",
    yMin: typeof y.min_label === "string" ? y.min_label : "",
    yMax: typeof y.max_label === "string" ? y.max_label : "",
  };
}

function quadrantsOf(board: Board): { id: string; label: string; color?: string }[] {
  const q = (board.config as JsonObject).quadrants;
  return Array.isArray(q)
    ? q
        .filter((x): x is JsonObject => Boolean(x) && typeof x === "object" && !Array.isArray(x))
        .map((x) => ({ id: String(x.id ?? ""), label: String(x.label ?? ""), color: typeof x.color === "string" ? x.color : undefined }))
    : [];
}

export function MatrixBoard({ board, dispatch }: { board: Board; dispatch: Dispatch }) {
  const items = boardItemsOf(board);
  const { xLabel, xMin, xMax, yLabel, yMin, yMax } = axisLabels(board);
  const quads = quadrantsOf(board);
  const planeRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);

  const posFromEvent = (e: React.PointerEvent): { x: number; y: number } | null => {
    const r = planeRef.current?.getBoundingClientRect();
    if (!r) return null;
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const yTop = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    return { x, y: 1 - yTop }; // y=1 en haut
  };

  return (
    <div className="flex h-full min-h-0 gap-3 p-3">
      {/* Plan. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between pb-1">
          <p className="text-xs font-semibold text-gray-600">↑ {yLabel}</p>
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-indigo-700"
            onClick={() => dispatch(addItem(board.id, { label: "Nouvel élément", x: 0.5, y: 0.5 }))}
          >
            + Élément
          </button>
        </div>
        <div className="flex min-h-0 flex-1 gap-1">
          <div className="flex flex-col justify-between py-1 text-[10px] text-gray-400">
            <span>{yMax}</span>
            <span>{yMin}</span>
          </div>
          <div
            ref={planeRef}
            className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-300 bg-white"
            onPointerMove={(e) => {
              if (!drag) return;
              const pos = posFromEvent(e);
              if (pos) setDrag({ id: drag.id, ...pos });
            }}
            onPointerUp={() => {
              if (drag) dispatch(moveItem(board.id, drag.id, { x: drag.x, y: drag.y }));
              setDrag(null);
            }}
            onPointerLeave={() => {
              if (drag) dispatch(moveItem(board.id, drag.id, { x: drag.x, y: drag.y }));
              setDrag(null);
            }}
          >
            {/* Quadrants. */}
            <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
              {[quads[1], quads[0], quads[2], quads[3]].map((q, i) => (
                <div key={q?.id ?? i} className="flex items-start justify-center border border-gray-100 p-1" style={{ backgroundColor: q?.color ? `${q.color}55` : undefined }}>
                  <span className="text-[10px] font-medium text-gray-500">{q?.label ?? ""}</span>
                </div>
              ))}
            </div>
            {/* Axes médians. */}
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-gray-300" />
            <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-gray-300" />
            {/* Points. */}
            {items.map((it) => {
              const pos = drag && drag.id === it.id ? drag : { x: it.x ?? 0.5, y: it.y ?? 0.5 };
              return (
                <button
                  key={it.id}
                  type="button"
                  className="absolute -translate-x-1/2 translate-y-1/2 cursor-grab touch-none rounded-full border-2 border-white bg-indigo-600 px-2 py-1 text-[10px] font-semibold text-white shadow active:cursor-grabbing"
                  style={{ left: `${pos.x * 100}%`, bottom: `${pos.y * 100}%` }}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setDrag({ id: it.id, x: pos.x, y: pos.y });
                  }}
                  title={it.label}
                >
                  {it.label.length > 18 ? `${it.label.slice(0, 17)}…` : it.label}
                </button>
              );
            })}
          </div>
        </div>
        <p className="pt-1 text-right text-xs font-semibold text-gray-600">{xLabel} →</p>
        <div className="flex justify-between pl-6 text-[10px] text-gray-400">
          <span>{xMin}</span>
          <span>{xMax}</span>
        </div>
      </div>

      {/* Liste d'items éditable. */}
      <aside className="flex w-56 shrink-0 flex-col gap-1 overflow-y-auto border-l border-gray-200 pl-3">
        <p className="pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Éléments · {items.length}</p>
        {items.length === 0 && <p className="text-[11px] text-gray-400">Ajoutez un élément et glissez-le dans le plan.</p>}
        {items.map((it) => (
          <div key={it.id} className="group flex items-center gap-1 rounded-lg bg-gray-50 px-2 py-1">
            <input
              value={it.label}
              onChange={(e) => dispatch(updateItem(board.id, it.id, { label: e.target.value }))}
              className="min-w-0 flex-1 bg-transparent text-xs text-gray-800 focus:outline-none"
            />
            <button
              type="button"
              title="Retirer"
              className="shrink-0 text-xs text-gray-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100"
              onClick={() => dispatch(removeItem(board.id, it.id))}
            >
              ✕
            </button>
          </div>
        ))}
      </aside>
    </div>
  );
}
