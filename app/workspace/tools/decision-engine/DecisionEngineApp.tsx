"use client";

/**
 * DecisionEngineApp — l'app « Decision Engine » du dock (contrat §8).
 * Rail des décisions + éditeur du Decision Object (matrice multicritère,
 * risques, tableaux d'arbitrage). Boîte à outils professionnelle, jamais
 * un formulaire : le joueur structure son arbitrage, le moteur observe.
 * Tout passe par l'API publique — aucune logique décisionnelle ici.
 */

import { useState } from "react";
import type { WorkspaceAppProps } from "../../apps/types";
import {
  createDecision,
  getBoard,
  listBoards,
  listDecisions,
  listPresets,
  openPreset,
  selectBoardsForDecision,
  updateDecision,
} from "./api";
import { DECISION_ENGINE_TOOL_ID } from "./spec";
import { DecisionEditor } from "./components/DecisionEditor";
import { MatrixBoard } from "./components/MatrixBoard";
import { RegistryBoard } from "./components/RegistryBoard";
import { TableBoard } from "./components/TableBoard";
import { KanbanBoard } from "./components/KanbanBoard";
import { TimelineBoard } from "./components/TimelineBoard";
import { GraphBoard } from "./components/GraphBoard";
import type { Board } from "./spec";

const ENGINE_ICON: Record<string, string> = { matrix: "📊", registry: "📋", table: "🗂️", kanban: "🧱", timeline: "📅", graph: "🕸️" };

function BoardView({ board, dispatch }: { board: Board; dispatch: WorkspaceAppProps["dispatch"] }) {
  if (board.engine === "registry") return <RegistryBoard board={board} dispatch={dispatch} />;
  if (board.engine === "table") return <TableBoard board={board} dispatch={dispatch} />;
  if (board.engine === "kanban") return <KanbanBoard board={board} dispatch={dispatch} />;
  if (board.engine === "timeline") return <TimelineBoard board={board} dispatch={dispatch} />;
  if (board.engine === "graph") return <GraphBoard board={board} dispatch={dispatch} />;
  return <MatrixBoard board={board} dispatch={dispatch} />;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Brouillon",
  in_progress: "En cours",
  finalized: "Actée",
  archived: "Archivée",
};

function localId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function DecisionEngineApp({ workspace, dispatch }: WorkspaceAppProps) {
  const state = workspace.toolStates[DECISION_ENGINE_TOOL_ID] ?? null;
  const decisions = listDecisions(state);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openBoardId, setOpenBoardId] = useState<string | null>(null);
  const [showPresets, setShowPresets] = useState(false);

  // Sélection par défaut : la décision la plus récente.
  const selected = decisions.find((d) => d.id === selectedId) ?? decisions[0] ?? null;

  const newDecision = () => {
    const id = localId("dec");
    dispatch(createDecision({ title: "Nouvelle décision" }, { id }));
    setSelectedId(id);
    setOpenBoardId(null);
  };

  const createFromPreset = (presetId: string) => {
    const id = localId("board");
    const opAction = openPreset(presetId, {}, { id });
    if (opAction) dispatch(opAction);
    setOpenBoardId(id);
    setShowPresets(false);
  };

  const boards = selected ? selectBoardsForDecision(state, selected.id) : [];
  const allBoards = listBoards(state);
  const openBoard = openBoardId ? getBoard(state, openBoardId) : null;

  // Presets groupés par moteur pour le sélecteur.
  const presetGroups: [string, ReturnType<typeof listPresets>][] = ["matrix", "table", "registry", "kanban", "timeline", "graph"].map(
    (eng) => [eng, listPresets(eng)],
  );

  return (
    <div className="flex h-full min-h-0 bg-gray-50/60">
      {/* Rail des décisions. */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-100 px-3 py-2.5">
          <h2 className="text-sm font-semibold text-gray-900">🧭 Décisions</h2>
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-2 py-1 text-xs font-semibold text-white transition hover:bg-indigo-700"
            onClick={newDecision}
          >
            + Nouvelle
          </button>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {decisions.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-gray-400">Aucune décision. Créez-en une pour structurer un arbitrage.</li>
          )}
          {decisions.map((d) => {
            const active = selected?.id === d.id;
            return (
              <li key={d.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  className={`block w-full border-b border-gray-50 px-3 py-2.5 text-left transition ${active ? "bg-indigo-50/70" : "hover:bg-gray-50"}`}
                  onClick={() => { setSelectedId(d.id); setOpenBoardId(null); }}
                >
                  <span className="block truncate text-sm font-medium text-gray-800">{d.title || "(sans titre)"}</span>
                  <span className="mt-0.5 block text-[11px] text-gray-400">
                    {STATUS_LABEL[d.status]} · {d.options.length} option(s) · {d.risks.length} risque(s)
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {/* Tableaux (tous les boards, liés ou autonomes). */}
        <div className="relative shrink-0 border-t border-gray-100">
          <div className="flex items-center justify-between px-3 py-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Tableaux</h3>
            <button type="button" className="rounded-lg border border-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600 transition hover:border-indigo-300 hover:text-indigo-700" onClick={() => setShowPresets((v) => !v)}>
              + Tableau
            </button>
          </div>
          <ul className="max-h-40 overflow-y-auto px-2 pb-2">
            {allBoards.length === 0 && <li className="px-1 text-[11px] text-gray-400">Aucun tableau.</li>}
            {allBoards.map((b) => (
              <li key={b.id}>
                <button type="button" aria-pressed={openBoardId === b.id} className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-xs transition ${openBoardId === b.id ? "bg-indigo-50 text-indigo-800" : "text-gray-700 hover:bg-gray-100"}`} onClick={() => setOpenBoardId(b.id)}>
                  <span aria-hidden>{ENGINE_ICON[b.engine] ?? "📊"}</span>
                  <span className="min-w-0 flex-1 truncate">{b.title || b.engine}</span>
                </button>
              </li>
            ))}
          </ul>
          {showPresets && (
            <div className="absolute bottom-2 left-2 z-30 max-h-72 w-52 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl">
              {presetGroups.map(([eng, presets]) => (
                <div key={eng} className="mb-1">
                  <p className="px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-400">{ENGINE_ICON[eng]} {eng}</p>
                  {presets.map((p) => (
                    <button key={p.id} type="button" className="block w-full truncate rounded-lg px-2 py-1 text-left text-xs text-gray-700 hover:bg-gray-100" title={p.description} onClick={() => createFromPreset(p.id)}>
                      {p.title}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Zone principale. */}
      <section className="flex min-w-0 flex-1 flex-col bg-white">
        {openBoard ? (
          <>
            <header className="flex shrink-0 items-center gap-2 border-b border-gray-200 px-3 py-2">
              <button type="button" className="rounded-lg px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50" onClick={() => setOpenBoardId(null)}>
                ← Fermer
              </button>
              <span aria-hidden>{ENGINE_ICON[openBoard.engine] ?? "📊"}</span>
              <span className="text-sm font-medium text-gray-800">{openBoard.title || openBoard.engine}</span>
            </header>
            <div className="min-h-0 flex-1">
              <BoardView board={openBoard} dispatch={dispatch} />
            </div>
          </>
        ) : !selected ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="max-w-xs text-center text-sm text-gray-400">
              Une boîte à outils pour structurer vos arbitrages : matrice multicritère, risques, Impact/Effort, SWOT, Kanban, roadmap. Créez une décision ou un tableau pour commencer.
            </p>
          </div>
        ) : (
          <>
            <header className="shrink-0 border-b border-gray-200 px-4 py-2.5">
              <input
                key={selected.id}
                defaultValue={selected.title}
                onBlur={(e) => e.target.value.trim() !== selected.title && dispatch(updateDecision(selected.id, { title: e.target.value.trim() || "Sans titre" }))}
                className="w-full bg-transparent text-base font-semibold text-gray-900 focus:outline-none"
                placeholder="Titre de la décision"
              />
            </header>
            <div className="min-h-0 flex-1">
              <DecisionEditor key={selected.id} decision={selected} boards={boards} dispatch={dispatch} onOpenBoard={setOpenBoardId} onSelectDecision={setSelectedId} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
