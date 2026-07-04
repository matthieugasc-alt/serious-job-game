"use client";

/**
 * RiskMatrix — la VUE matricielle des risques d'une décision (contrat §7 :
 * conversion registre ↔ matrice sur le MÊME decision.risks). Chaque risque
 * est un point (x = probabilité, y = impact, 1..5) ; le glisser-déposer
 * met à jour proba/impact via updateRisk. Couleur = criticité (5×5).
 */

import { useRef, useState } from "react";
import type { WorkspaceAction } from "@/app/lib/engine/workspace";
import { riskLevel, updateRisk } from "../api";
import type { DecisionObject } from "../spec";

type Dispatch = (action: WorkspaceAction) => void;
const BAND_COLOR: Record<string, string> = { low: "#bbf7d0", moderate: "#fde68a", high: "#fecaca" };

export function RiskMatrix({ decision, dispatch }: { decision: DecisionObject; dispatch: Dispatch }) {
  const planeRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; p: number; i: number } | null>(null);

  const fromEvent = (e: React.PointerEvent): { p: number; i: number } | null => {
    const r = planeRef.current?.getBoundingClientRect();
    if (!r) return null;
    const xf = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const yf = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
    return { p: Math.round(xf * 4) + 1, i: Math.round(yf * 4) + 1 };
  };

  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <p className="pb-1 text-xs font-semibold text-gray-600">↑ Impact</p>
      <div className="flex min-h-0 flex-1">
        <div
          ref={planeRef}
          className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-300 bg-white"
          onPointerMove={(e) => { if (!drag) return; const pos = fromEvent(e); if (pos) setDrag({ id: drag.id, ...pos }); }}
          onPointerUp={() => { if (drag) dispatch(updateRisk(decision.id, drag.id, { probability: drag.p, impact: drag.i })); setDrag(null); }}
          onPointerLeave={() => { if (drag) dispatch(updateRisk(decision.id, drag.id, { probability: drag.p, impact: drag.i })); setDrag(null); }}
        >
          {/* Grille 5×5. */}
          <div className="absolute inset-0 grid grid-cols-5 grid-rows-5">
            {Array.from({ length: 25 }).map((_, k) => <div key={k} className="border border-gray-100" />)}
          </div>
          {decision.risks.map((r) => {
            const pos = drag && drag.id === r.id ? drag : { p: r.probability, i: r.impact };
            const band = riskLevel(pos.p, pos.i).band;
            const x = ((pos.p - 1) / 4) * 100;
            const y = ((pos.i - 1) / 4) * 100;
            return (
              <button
                key={r.id}
                type="button"
                title={`${r.label} — P${pos.p}·I${pos.i}`}
                className="absolute -translate-x-1/2 translate-y-1/2 cursor-grab touch-none rounded-full border-2 border-white px-2 py-1 text-[10px] font-semibold text-gray-800 shadow active:cursor-grabbing"
                style={{ left: `${x}%`, bottom: `${y}%`, backgroundColor: BAND_COLOR[band] }}
                onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDrag({ id: r.id, p: pos.p, i: pos.i }); }}
              >
                {r.label.length > 16 ? `${r.label.slice(0, 15)}…` : r.label || "risque"}
              </button>
            );
          })}
        </div>
      </div>
      <p className="pt-1 text-right text-xs font-semibold text-gray-600">Probabilité →</p>
      {decision.risks.length === 0 && <p className="pt-1 text-center text-[11px] text-gray-400">Ajoutez des risques dans la vue registre pour les cartographier ici.</p>}
    </div>
  );
}
