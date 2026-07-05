"use client";

/**
 * WhiteboardTool — le tableau blanc à post-it (ToolComponentProps).
 * Post-it de couleur qu'on écrit et qu'on colle par glisser-déposer.
 * Aucun classement, aucune évaluation : on produit des idées. Les
 * coéquipiers IA ajoutent leurs post-it via le moteur (author = actor_id).
 */

import { useRef, useState, type FC } from "react";
import type { ToolComponentProps } from "../types";
import { AttachToMailButton } from "../../artifacts/AttachToMailButton";
import { addNote, editNote, moveNote, recolorNote, removeNote, selectNotes } from "./api";
import { STICKY_COLORS, WHITEBOARD_TOOL_ID, type StickyColor } from "./spec";

const BG: Record<StickyColor, string> = {
  yellow: "bg-yellow-200",
  pink: "bg-pink-200",
  blue: "bg-blue-200",
  green: "bg-green-200",
  orange: "bg-orange-200",
};

export const WhiteboardTool: FC<ToolComponentProps> = ({ state, dispatch }) => {
  const notes = selectNotes(state);
  const boardRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [color, setColor] = useState<StickyColor>("yellow");

  const posFromEvent = (e: React.PointerEvent): { x: number; y: number } | null => {
    const r = boardRef.current?.getBoundingClientRect();
    if (!r) return null;
    return {
      x: Math.min(0.94, Math.max(0, (e.clientX - r.left) / r.width - 0.04)),
      y: Math.min(0.9, Math.max(0, (e.clientY - r.top) / r.height - 0.03)),
    };
  };

  const add = () => {
    // Léger décalage en cascade pour ne pas empiler les nouveaux post-it.
    const n = notes.filter((x) => (x.author ?? "player") === "player").length;
    dispatch(addNote({ color, x: 0.06 + (n % 6) * 0.03, y: 0.08 + (n % 6) * 0.04, author: "player" }));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 py-2">
        <button type="button" className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-indigo-700" onClick={add}>
          + Post-it
        </button>
        <div className="flex items-center gap-1">
          {STICKY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={color === c}
              title={c}
              className={`h-5 w-5 rounded-full border transition ${BG[c]} ${color === c ? "border-gray-800 ring-1 ring-gray-400" : "border-black/10 hover:scale-110"}`}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <span className="ml-auto text-[11px] text-gray-400">{notes.length} idée(s)</span>
        <AttachToMailButton
          tool={WHITEBOARD_TOOL_ID}
          id={WHITEBOARD_TOOL_ID}
          kind="whiteboard"
          title="Tableau blanc"
          dispatch={dispatch}
          compact
        />
      </div>

      <div
        ref={boardRef}
        className="relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(circle,#e5e7eb_1px,transparent_1px)] [background-size:22px_22px]"
        onPointerMove={(e) => { if (!drag) return; const p = posFromEvent(e); if (p) setDrag({ id: drag.id, ...p }); }}
        onPointerUp={() => { if (drag) dispatch(moveNote(drag.id, drag.x, drag.y)); setDrag(null); }}
        onPointerLeave={() => { if (drag) dispatch(moveNote(drag.id, drag.x, drag.y)); setDrag(null); }}
      >
        {notes.length === 0 && (
          <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm text-gray-400">
            Tableau vide — cliquez « + Post-it » et lancez les idées.
          </p>
        )}
        {notes.map((n) => {
          const pos = drag && drag.id === n.id ? drag : { x: n.x, y: n.y };
          const mine = (n.author ?? "player") === "player";
          return (
            <div
              key={n.id}
              className={`group absolute flex w-36 flex-col rounded-md shadow-md ${BG[n.color]} ${mine ? "" : "ring-1 ring-black/10"}`}
              style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, transform: "rotate(-1deg)" }}
            >
              <div
                className="flex cursor-grab touch-none items-center justify-between px-1.5 py-0.5 active:cursor-grabbing"
                onPointerDown={() => setDrag({ id: n.id, x: pos.x, y: pos.y })}
              >
                <span className="truncate text-[9px] font-semibold text-black/40" title={n.author}>
                  {mine ? "moi" : n.author}
                </span>
                <button type="button" title="Retirer" className="text-[11px] text-black/30 opacity-0 transition hover:text-red-600 group-hover:opacity-100" onPointerDown={(e) => e.stopPropagation()} onClick={() => dispatch(removeNote(n.id))}>✕</button>
              </div>
              <textarea
                key={`${n.id}_${n.updated_at}`}
                defaultValue={n.text}
                onPointerDown={(e) => e.stopPropagation()}
                onBlur={(e) => e.target.value !== n.text && dispatch(editNote(n.id, e.target.value))}
                placeholder="idée…"
                rows={3}
                className="w-full resize-none bg-transparent px-2 pb-2 text-xs text-gray-900 placeholder:text-black/30 focus:outline-none"
              />
              <div className="flex items-center gap-0.5 px-1.5 pb-1 opacity-0 transition group-hover:opacity-100">
                {STICKY_COLORS.map((c) => (
                  <button key={c} type="button" title={c} className={`h-3 w-3 rounded-full border border-black/10 ${BG[c]}`} onPointerDown={(e) => e.stopPropagation()} onClick={() => dispatch(recolorNote(n.id, c))} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
