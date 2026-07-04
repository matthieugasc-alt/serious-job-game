"use client";

/**
 * LinkToDecisionButton — « → Décision », EXPORTÉ vers les apps hôtes
 * (Documents/Bibliothèque en V1). L'hôte ne connaît rien du Decision
 * Engine : il fournit un SourceLink (la source à rattacher), l'état brut
 * du Tool (workspace.toolStates["decision-engine"]) et son dispatch. Le
 * bouton liste les décisions et rattache la source, ou crée une décision
 * à partir de la source. Popover local, jamais de re-render de l'hôte.
 */

import { useEffect, useRef, useState } from "react";
import type { Json } from "@/app/lib/engine/mechanics";
import type { WorkspaceAction } from "@/app/lib/engine/workspace";
import { createDecision, linkSource, listDecisions } from "./api";
import type { SourceLink } from "./spec";

type Dispatch = (action: WorkspaceAction) => void;

function localId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function LinkToDecisionButton({
  link,
  decisionState,
  dispatch,
  className = "",
}: {
  link: SourceLink;
  decisionState: Json;
  dispatch: Dispatch;
  className?: string;
}) {
  const [phase, setPhase] = useState<"idle" | "open" | "done">("idle");
  const boxRef = useRef<HTMLDivElement>(null);
  const decisions = listDecisions(decisionState);

  useEffect(() => {
    if (phase !== "done") return;
    const t = setTimeout(() => setPhase("idle"), 1600);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "open") return;
    const onDown = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setPhase("idle"); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPhase("idle"); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [phase]);

  const linkTo = (decisionId: string) => {
    dispatch(linkSource(decisionId, link));
    setPhase("done");
  };
  const createAndLink = () => {
    const id = localId("dec");
    dispatch(createDecision({ title: link.label ?? "Nouvelle décision" }, { id }));
    dispatch(linkSource(id, link));
    setPhase("done");
  };

  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        title="Rattacher à une décision"
        aria-label="Rattacher à une décision"
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 ${className}`}
        onClick={(e) => { e.stopPropagation(); setPhase(phase === "open" ? "idle" : "open"); }}
      >
        <span aria-hidden>🧭</span> Décision
      </button>
      {phase === "open" && (
        <div ref={boxRef} role="dialog" aria-label="Rattacher à une décision" className="absolute right-0 top-full z-50 mt-1.5 w-60 rounded-xl border border-gray-200 bg-white p-2 shadow-xl" onClick={(e) => e.stopPropagation()}>
          <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Rattacher comme source à…</p>
          <div className="max-h-40 overflow-y-auto">
            {decisions.length === 0 ? (
              <p className="px-1 py-1 text-[11px] text-gray-400">Aucune décision existante.</p>
            ) : (
              decisions.map((d) => (
                <button key={d.id} type="button" className="block w-full truncate rounded-lg px-2 py-1 text-left text-xs text-gray-700 hover:bg-gray-100" onClick={() => linkTo(d.id)}>
                  🧭 {d.title || "(sans titre)"}
                </button>
              ))
            )}
          </div>
          <div className="my-1 h-px bg-gray-100" />
          <button type="button" className="block w-full rounded-lg px-2 py-1 text-left text-xs font-medium text-indigo-600 hover:bg-indigo-50" onClick={createAndLink}>
            + Nouvelle décision à partir de cette source
          </button>
        </div>
      )}
      {phase === "done" && (
        <span className="absolute right-0 top-full z-50 mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-gray-900/90 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg">✓ Rattaché à la décision</span>
      )}
    </span>
  );
}
