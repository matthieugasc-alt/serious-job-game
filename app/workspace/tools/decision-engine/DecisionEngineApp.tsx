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
  reparentBoard,
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
const BOARD_MIME = "application/decision-board";

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

  const [railFilter, setRailFilter] = useState<"all" | "decisions" | "boards">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openBoardId, setOpenBoardId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [dragBoardId, setDragBoardId] = useState<string | null>(null);
  const [dropDecId, setDropDecId] = useState<string | null>(null);

  // Sélection par défaut : la décision la plus récente.
  const selected = decisions.find((d) => d.id === selectedId) ?? decisions[0] ?? null;

  const newDecision = () => {
    const id = localId("dec");
    dispatch(createDecision({ title: "Nouvelle décision" }, { id }));
    setSelectedId(id);
    setOpenBoardId(null);
    setShowNew(false);
  };

  const createFromPreset = (presetId: string) => {
    const id = localId("board");
    const opAction = openPreset(presetId, {}, { id });
    if (opAction) dispatch(opAction);
    setOpenBoardId(id);
    setShowNew(false);
  };

  const openDecisionNode = (id: string) => { setSelectedId(id); setOpenBoardId(null); };

  const boards = selected ? selectBoardsForDecision(state, selected.id) : [];
  const allBoards = listBoards(state);
  const openBoard = openBoardId ? getBoard(state, openBoardId) : null;

  // Arborescence : une décision « possède » ses tableaux (board.decision_id) ;
  // les tableaux sans décision valide sont « libres » (relation asymétrique).
  const decisionIds = new Set(decisions.map((d) => d.id));
  const boardsByDecision = new Map<string, typeof allBoards>();
  const standaloneBoards: typeof allBoards = [];
  for (const b of allBoards) {
    if (b.decision_id && decisionIds.has(b.decision_id)) {
      const arr = boardsByDecision.get(b.decision_id) ?? [];
      arr.push(b);
      boardsByDecision.set(b.decision_id, arr);
    } else {
      standaloneBoards.push(b);
    }
  }

  // Presets groupés par moteur pour le menu « + Nouveau ».
  const presetGroups: [string, ReturnType<typeof listPresets>][] = ["matrix", "table", "registry", "kanban", "timeline", "graph"].map(
    (eng) => [eng, listPresets(eng)],
  );

  return (
    <div className="flex h-full min-h-0 bg-gray-50/60">
      {/* Rail : arborescence (décisions ⊃ leurs tableaux) + filtre. */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="relative flex shrink-0 items-center gap-1.5 border-b border-gray-100 px-2 py-2">
          <div className="flex flex-1 gap-0.5 rounded-lg bg-gray-100 p-0.5">
            {([["all", "Tout"], ["decisions", "🧭"], ["boards", "📊"]] as ["all" | "decisions" | "boards", string][]).map(([f, label]) => (
              <button
                key={f}
                type="button"
                aria-pressed={railFilter === f}
                title={f === "decisions" ? "Décisions seules" : f === "boards" ? "Tableaux seuls" : "Tout (arborescence)"}
                className={`flex-1 rounded-md px-1.5 py-1 text-[11px] font-semibold transition ${railFilter === f ? "bg-white text-indigo-700 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
                onClick={() => setRailFilter(f)}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" className="shrink-0 rounded-lg bg-indigo-600 px-2 py-1 text-xs font-semibold text-white transition hover:bg-indigo-700" onClick={() => setShowNew((v) => !v)}>
            + Nouveau
          </button>
          {showNew && (
            <div className="absolute right-2 top-full z-30 mt-1 max-h-80 w-52 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl">
              <button type="button" className="block w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-indigo-700 hover:bg-indigo-50" onClick={newDecision}>🧭 Nouvelle décision</button>
              <div className="my-1 h-px bg-gray-100" />
              <p className="px-1.5 pb-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-400">Nouveau tableau</p>
              {presetGroups.map(([eng, presets]) => (
                <div key={eng} className="mb-1">
                  <p className="px-1.5 py-0.5 text-[9px] text-gray-400">{ENGINE_ICON[eng]} {eng}</p>
                  {presets.map((p) => (
                    <button key={p.id} type="button" className="block w-full truncate rounded-lg px-2 py-1 text-left text-xs text-gray-700 hover:bg-gray-100" title={p.description} onClick={() => createFromPreset(p.id)}>{p.title}</button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {decisions.length === 0 && allBoards.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-gray-400">Rien encore. « + Nouveau » pour créer une décision ou un tableau.</p>
          )}

          {railFilter === "boards" ? (
            allBoards.length === 0 ? (
              <p className="px-4 py-6 text-center text-[11px] text-gray-400">Aucun tableau.</p>
            ) : (
              allBoards.map((b) => <BoardRow key={b.id} board={b} active={openBoardId === b.id} onClick={() => setOpenBoardId(b.id)} onDragStartBoard={() => setDragBoardId(b.id)} onDragEndBoard={() => { setDragBoardId(null); setDropDecId(null); }} />)
            )
          ) : (
            <>
              {decisions.map((d) => {
                const dBoards = boardsByDecision.get(d.id) ?? [];
                const active = !openBoardId && selected?.id === d.id;
                return (
                  <div key={d.id}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onDragOver={(e) => { if (dragBoardId) { e.preventDefault(); if (dropDecId !== d.id) setDropDecId(d.id); } }}
                      onDragLeave={() => setDropDecId((x) => (x === d.id ? null : x))}
                      onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData(BOARD_MIME); if (id) dispatch(reparentBoard(id, d.id)); setDropDecId(null); setDragBoardId(null); }}
                      className={`block w-full px-3 py-2 text-left transition ${dropDecId === d.id ? "bg-indigo-100 ring-2 ring-inset ring-indigo-400" : active ? "bg-indigo-50/70" : "hover:bg-gray-50"}`}
                      onClick={() => openDecisionNode(d.id)}
                    >
                      <span className="flex items-center gap-1.5">
                        <span aria-hidden>🧭</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">{d.title || "(sans titre)"}</span>
                      </span>
                      <span className="mt-0.5 block pl-5 text-[11px] text-gray-400">{STATUS_LABEL[d.status]} · {d.options.length} opt · {d.risks.length} risq</span>
                    </button>
                    {railFilter === "all" && dBoards.map((b) => (
                      <BoardRow key={b.id} board={b} indented active={openBoardId === b.id} onClick={() => setOpenBoardId(b.id)} onDragStartBoard={() => setDragBoardId(b.id)} onDragEndBoard={() => { setDragBoardId(null); setDropDecId(null); }} />
                    ))}
                  </div>
                );
              })}

              {railFilter === "all" && standaloneBoards.length > 0 && (
                <>
                  <p className="px-3 pb-0.5 pt-2 text-[9px] font-semibold uppercase tracking-wide text-gray-400">Tableaux libres</p>
                  {standaloneBoards.map((b) => (
                    <BoardRow key={b.id} board={b} active={openBoardId === b.id} onClick={() => setOpenBoardId(b.id)} onDragStartBoard={() => setDragBoardId(b.id)} onDragEndBoard={() => { setDragBoardId(null); setDropDecId(null); }} />
                  ))}
                </>
              )}
            </>
          )}

          {/* Zone de détachement — visible pendant un glisser de tableau. */}
          {dragBoardId && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData(BOARD_MIME); if (id) dispatch(reparentBoard(id, null)); setDropDecId(null); setDragBoardId(null); }}
              className="m-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-2 py-2.5 text-center text-[11px] text-gray-500"
            >
              Déposer ici pour détacher (tableau libre)
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
              <DecisionEditor key={selected.id} decision={selected} boards={boards} engineState={state} dispatch={dispatch} onOpenBoard={setOpenBoardId} onSelectDecision={setSelectedId} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/** Ligne « tableau » du rail (indentée si rattachée à une décision).
 *  Glissable → déposer sur une décision pour la rattacher. */
function BoardRow({
  board,
  active,
  indented,
  onClick,
  onDragStartBoard,
  onDragEndBoard,
}: {
  board: Board;
  active: boolean;
  indented?: boolean;
  onClick: () => void;
  onDragStartBoard?: () => void;
  onDragEndBoard?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      draggable
      onDragStart={(e) => { e.dataTransfer.setData(BOARD_MIME, board.id); e.dataTransfer.effectAllowed = "move"; onDragStartBoard?.(); }}
      onDragEnd={() => onDragEndBoard?.()}
      onClick={onClick}
      title="Glisser vers une décision pour rattacher"
      className={`flex w-full cursor-grab items-center gap-1.5 py-1.5 pr-3 text-left text-xs transition active:cursor-grabbing ${indented ? "pl-8" : "pl-3"} ${active ? "bg-indigo-50 text-indigo-800" : "text-gray-600 hover:bg-gray-100"}`}
    >
      <span aria-hidden>{ENGINE_ICON[board.engine] ?? "📊"}</span>
      <span className="min-w-0 flex-1 truncate">{board.title || board.engine}</span>
    </button>
  );
}
