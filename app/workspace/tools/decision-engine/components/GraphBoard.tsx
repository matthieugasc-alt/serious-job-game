"use client";

/**
 * GraphBoard — moteur Graph : nœuds (items positionnés) + arêtes (liens
 * dirigés/labellisés). Arbre de décision, Ishikawa, 5 Pourquoi, graphe de
 * dépendances. Nœuds déplaçables (glisser), création de lien par les
 * poignées 🔗, arêtes rendues en SVG. Jamais un tableur.
 */

import { useRef, useState } from "react";
import type { WorkspaceAction } from "@/app/lib/engine/workspace";
import { addEdge, addItem, boardEdgesOf, boardItemsOf, moveItem, removeEdge, removeItem, updateItem } from "../api";
import type { Board } from "../spec";

type Dispatch = (action: WorkspaceAction) => void;

export function GraphBoard({ board, dispatch }: { board: Board; dispatch: Dispatch }) {
  const nodes = boardItemsOf(board);
  const edges = boardEdgesOf(board);
  const planeRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);

  const posOf = (id: string): { x: number; y: number } => {
    if (drag && drag.id === id) return { x: drag.x, y: drag.y };
    const n = nodes.find((x) => x.id === id);
    return { x: n?.x ?? 0.5, y: n?.y ?? 0.5 };
  };
  const fromEvent = (e: React.PointerEvent): { x: number; y: number } | null => {
    const r = planeRef.current?.getBoundingClientRect();
    if (!r) return null;
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height)) };
  };

  const clickHandle = (id: string) => {
    if (linkFrom === null) { setLinkFrom(id); return; }
    if (linkFrom !== id) dispatch(addEdge(board.id, { from: linkFrom, to: id, directed: true }));
    setLinkFrom(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <div className="mb-2 flex items-center gap-2">
        <button type="button" className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-indigo-700" onClick={() => dispatch(addItem(board.id, { label: "Nœud", x: 0.5, y: 0.5 }))}>+ Nœud</button>
        <p className="text-[11px] text-gray-400">{linkFrom ? "Cliquez la poignée 🔗 d'un autre nœud pour créer le lien (Échap pour annuler)." : "Glissez les nœuds ; 🔗 relie deux nœuds."}</p>
        {linkFrom && <button type="button" className="text-[11px] text-gray-500 underline" onClick={() => setLinkFrom(null)}>annuler</button>}
      </div>
      <div
        ref={planeRef}
        className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-300 bg-white"
        onPointerMove={(e) => { if (!drag) return; const p = fromEvent(e); if (p) setDrag({ id: drag.id, ...p }); }}
        onPointerUp={() => { if (drag) dispatch(moveItem(board.id, drag.id, { x: drag.x, y: drag.y })); setDrag(null); }}
        onPointerLeave={() => { if (drag) dispatch(moveItem(board.id, drag.id, { x: drag.x, y: drag.y })); setDrag(null); }}
      >
        {/* Arêtes. */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <marker id="de_arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8" />
            </marker>
          </defs>
          {edges.map((ed) => {
            const a = posOf(ed.from);
            const b = posOf(ed.to);
            return <line key={ed.id} x1={a.x * 100} y1={(1 - a.y) * 100} x2={b.x * 100} y2={(1 - b.y) * 100} stroke="#94a3b8" strokeWidth={0.5} markerEnd={ed.directed ? "url(#de_arrow)" : undefined} vectorEffect="non-scaling-stroke" />;
          })}
        </svg>
        {/* Labels d'arête (retrait). */}
        {edges.map((ed) => {
          const a = posOf(ed.from);
          const b = posOf(ed.to);
          const mx = ((a.x + b.x) / 2) * 100;
          const my = (1 - (a.y + b.y) / 2) * 100;
          return (
            <button key={ed.id} type="button" title="Retirer le lien" className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-gray-200 bg-white px-1 text-[9px] text-gray-400 shadow-sm hover:text-red-500" style={{ left: `${mx}%`, top: `${my}%` }} onClick={() => dispatch(removeEdge(board.id, ed.id))}>
              {ed.label ? ed.label : "✕"}
            </button>
          );
        })}
        {/* Nœuds. */}
        {nodes.map((n) => {
          const p = posOf(n.id);
          const linking = linkFrom === n.id;
          return (
            <div key={n.id} className={`group absolute flex -translate-x-1/2 translate-y-1/2 items-center gap-1 rounded-lg border-2 bg-white px-2 py-1 shadow ${linking ? "border-amber-400" : "border-indigo-300"}`} style={{ left: `${p.x * 100}%`, bottom: `${p.y * 100}%` }}>
              <button type="button" title="Relier" className={`cursor-pointer text-[11px] ${linking ? "text-amber-500" : "text-gray-300 hover:text-indigo-600"}`} onClick={() => clickHandle(n.id)}>🔗</button>
              <input
                value={n.label}
                onChange={(e) => dispatch(updateItem(board.id, n.id, { label: e.target.value }))}
                onPointerDown={(e) => e.stopPropagation()}
                className="w-24 bg-transparent text-xs font-medium text-gray-800 focus:outline-none"
                placeholder="Nœud…"
              />
              <span
                className="cursor-grab touch-none text-[11px] text-gray-300 active:cursor-grabbing"
                title="Déplacer"
                onPointerDown={() => setDrag({ id: n.id, x: p.x, y: p.y })}
              >
                ✥
              </span>
              <button type="button" title="Retirer" className="text-[11px] text-gray-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100" onClick={() => dispatch(removeItem(board.id, n.id))}>✕</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
