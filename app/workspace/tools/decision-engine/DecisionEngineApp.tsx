"use client";

/**
 * DecisionEngineApp — l'app « Decision Engine » du dock (contrat §8).
 * Rail des décisions + éditeur du Decision Object (matrice multicritère,
 * risques, tableaux d'arbitrage). Boîte à outils professionnelle, jamais
 * un formulaire : le joueur structure son arbitrage, le moteur observe.
 * Tout passe par l'API publique — aucune logique décisionnelle ici.
 */

import { useEffect, useState, type ReactNode } from "react";
import type { WorkspaceAppProps } from "../../apps/types";
import { AttachToMailButton } from "../../artifacts/AttachToMailButton";
import { GuidedTour, type TourStep } from "@/app/workspace/primitives/GuidedTour";
import {
  addDependency,
  createDecision,
  getBoard,
  listBoards,
  listDecisions,
  listPresets,
  openPreset,
  removeDependency,
  reparentBoard,
  selectBoardsForDecision,
  selectDependenciesFor,
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
import type { Board, DecisionObject } from "./spec";

const ENGINE_ICON: Record<string, string> = { matrix: "📊", registry: "📋", table: "🗂️", kanban: "🧱", timeline: "📅", graph: "🕸️" };
const BOARD_MIME = "application/decision-board";
const DECISION_MIME = "application/decision-node";

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

/** Bouton « ❓ Guide » — bien visible, placé à côté du trombone. */
function GuideButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      title="Guide interactif du Decision Engine"
      className="shrink-0 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
      onClick={onClick}
    >
      ❓ Guide
    </button>
  );
}

export function DecisionEngineApp({ workspace, dispatch, context }: WorkspaceAppProps) {
  const state = workspace.toolStates[DECISION_ENGINE_TOOL_ID] ?? null;
  const decisions = listDecisions(state);

  const [railFilter, setRailFilter] = useState<"all" | "decisions" | "boards">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openBoardId, setOpenBoardId] = useState<string | null>(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Navigation entrante (lien d'artefact depuis un mail) : ouvrir la
  // décision ou le tableau ciblé.
  const requestedDecision = context?.decision_id;
  const requestedBoard = context?.board_id;
  useEffect(() => {
    // Sélection pilotée par une navigation entrante (lien d'artefact) —
    // même pattern que BlocNotesApp (context?.note_id).
    /* eslint-disable react-hooks/set-state-in-effect */
    if (requestedBoard) {
      setOpenBoardId(requestedBoard);
    } else if (requestedDecision) {
      setSelectedId(requestedDecision);
      setOpenBoardId(null);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [requestedDecision, requestedBoard]);
  const [showNew, setShowNew] = useState(false);
  const [dragBoardId, setDragBoardId] = useState<string | null>(null);
  const [dragDecId, setDragDecId] = useState<string | null>(null);
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

  // Hiérarchie des décisions (lien parent-enfant du graphe de dépendances,
  // limité à UN parent = arbre). Racines = décisions sans parent-décision.
  const decisionParent = new Map<string, string>();
  const childDecisions = new Map<string, DecisionObject[]>();
  for (const d of decisions) {
    const { parents } = selectDependenciesFor(state, { type: "decision", id: d.id });
    const p = parents.find((x) => x.ref.type === "decision" && decisionIds.has(x.ref.id));
    if (p) {
      decisionParent.set(d.id, p.ref.id);
      const arr = childDecisions.get(p.ref.id) ?? [];
      arr.push(d);
      childDecisions.set(p.ref.id, arr);
    }
  }
  const rootDecisions = decisions.filter((d) => !decisionParent.has(d.id));

  /** parentId est-il dans le sous-arbre de childId ? (anti-cycle côté UI). */
  const isDescendantDecision = (ancestorId: string, maybeId: string): boolean => {
    const stack = [...(childDecisions.get(ancestorId) ?? [])];
    while (stack.length) {
      const n = stack.pop()!;
      if (n.id === maybeId) return true;
      stack.push(...(childDecisions.get(n.id) ?? []));
    }
    return false;
  };

  const detachDecisionParent = (childId: string) => {
    const { parents } = selectDependenciesFor(state, { type: "decision", id: childId });
    const cur = parents.find((x) => x.ref.type === "decision");
    if (cur) dispatch(removeDependency(cur.dep.id));
  };

  const reparentDecision = (childId: string, parentId: string) => {
    if (childId === parentId || isDescendantDecision(childId, parentId)) return; // cycle refusé
    detachDecisionParent(childId);
    dispatch(addDependency({ type: "decision", id: parentId }, { type: "decision", id: childId }, "parent-child"));
  };

  const clearDrag = () => { setDragBoardId(null); setDragDecId(null); setDropDecId(null); };

  // Rendu récursif d'une décision + ses tableaux + ses sous-décisions.
  const renderDecision = (d: DecisionObject, depth: number): ReactNode => {
    const dBoards = boardsByDecision.get(d.id) ?? [];
    const kids = childDecisions.get(d.id) ?? [];
    const active = !openBoardId && selected?.id === d.id;
    const hasChildren = dBoards.length > 0 || kids.length > 0;
    const isCollapsed = collapsed.has(d.id);
    return (
      <div key={d.id}>
        <button
          type="button"
          aria-pressed={active}
          draggable
          onDragStart={(e) => { e.dataTransfer.setData(DECISION_MIME, d.id); e.dataTransfer.effectAllowed = "move"; setDragDecId(d.id); }}
          onDragEnd={clearDrag}
          onDragOver={(e) => {
            const okBoard = !!dragBoardId;
            const okDec = !!dragDecId && dragDecId !== d.id && !isDescendantDecision(dragDecId, d.id);
            if (okBoard || okDec) { e.preventDefault(); if (dropDecId !== d.id) setDropDecId(d.id); }
          }}
          onDragLeave={() => setDropDecId((x) => (x === d.id ? null : x))}
          onDrop={(e) => {
            e.preventDefault();
            const boardId = e.dataTransfer.getData(BOARD_MIME);
            if (boardId) dispatch(reparentBoard(boardId, d.id));
            const decId = e.dataTransfer.getData(DECISION_MIME);
            if (decId) reparentDecision(decId, d.id);
            clearDrag();
          }}
          onClick={() => openDecisionNode(d.id)}
          style={{ paddingLeft: 12 + depth * 14 }}
          title="Glisser sur une autre décision pour l'imbriquer"
          className={`block w-full cursor-grab py-2 pr-3 text-left transition active:cursor-grabbing ${dropDecId === d.id ? "bg-indigo-100 ring-2 ring-inset ring-indigo-400" : active ? "bg-indigo-50/70" : "hover:bg-gray-50"}`}
        >
          <span className="flex items-center gap-1.5">
            <span
              className={`w-3 shrink-0 text-center text-[10px] leading-none text-gray-400 ${hasChildren ? "cursor-pointer hover:text-gray-800" : ""}`}
              role={hasChildren ? "button" : undefined}
              aria-label={hasChildren ? (isCollapsed ? "Déplier" : "Replier") : undefined}
              onClick={hasChildren ? (e) => { e.stopPropagation(); toggleCollapsed(d.id); } : undefined}
            >
              {hasChildren ? (isCollapsed ? "▸" : "▾") : ""}
            </span>
            <span aria-hidden>🧭</span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">{d.title || "(sans titre)"}</span>
            {hasChildren && isCollapsed && (
              <span className="shrink-0 rounded-full bg-gray-100 px-1.5 text-[10px] font-medium text-gray-500">{dBoards.length + kids.length}</span>
            )}
          </span>
          <span className="mt-0.5 block pl-8 text-[11px] text-gray-400">{STATUS_LABEL[d.status]} · {d.options.length} opt · {d.risks.length} risq</span>
        </button>
        {!isCollapsed && railFilter === "all" && dBoards.map((b) => (
          <BoardRow key={b.id} board={b} depth={depth + 1} active={openBoardId === b.id} onClick={() => setOpenBoardId(b.id)} onDragStartBoard={() => setDragBoardId(b.id)} onDragEndBoard={clearDrag} />
        ))}
        {!isCollapsed && kids.map((k) => renderDecision(k, depth + 1))}
      </div>
    );
  };

  // Presets groupés par moteur pour le menu « + Nouveau ».
  const presetGroups: [string, ReturnType<typeof listPresets>][] = ["matrix", "table", "registry", "kanban", "timeline", "graph"].map(
    (eng) => [eng, listPresets(eng)],
  );

  const tourSteps: TourStep[] = [
    {
      selector: "",
      title: "Bienvenue dans le Decision Engine",
      body: "Ta boîte à outils pour structurer un arbitrage : poser une décision (options, critères, risques) et l'appuyer sur des tableaux (Kanban, roadmap, matrices, SWOT, arbre des causes…).",
    },
    {
      selector: "[data-tour='de-filter']",
      title: "Filtrer l'arborescence",
      body: "Affiche tout, les décisions seules, ou les tableaux seuls.",
      placement: "bottom",
    },
    {
      selector: "[data-tour='de-new']",
      title: "Crée une décision",
      body: "Clique « + Nouveau » puis « 🧭 Nouvelle décision ». Fais-le pour continuer.",
      placement: "bottom",
      waitFor: () => decisions.length > 0,
      todo: "Clique « + Nouveau » → « Nouvelle décision ».",
    },
    {
      selector: "[data-tour='de-rail']",
      title: "Ton arborescence",
      body: "Ta décision apparaît ici. En dessous se rangeront ses tableaux. Glisse un tableau sur une décision pour le rattacher, ou une décision sur une autre pour l'imbriquer.",
      placement: "right",
    },
    {
      selector: "[data-tour='de-editor']",
      title: "Structurer la décision",
      body: "Contexte, options, critères pondérés, matrice de scores, hypothèses — et surtout les risques : chaque risque a un moyen de PRÉVENIR (↓ probabilité) et de GUÉRIR (↓ impact), avec re-cotation résiduelle brut → après mesures.",
      placement: "left",
      beforeShow: () => {
        setOpenBoardId(null);
        if (decisions.length === 0) newDecision();
      },
    },
    {
      selector: "[data-tour='de-new']",
      title: "Crée une matrice multicritère",
      body: "Appuie une décision sur un tableau : « + Nouveau » → catégorie 📊 matrix → un preset de matrice (ex. Matrice multicritère). Fais-le pour continuer.",
      placement: "bottom",
      waitFor: () => allBoards.some((b) => b.engine === "matrix"),
      todo: "« + Nouveau » → 📊 matrix → « Matrice multicritère ».",
    },
    {
      selector: "[data-tour='de-attach']",
      title: "Joindre à l'email",
      body: "Attache la décision (ou un tableau) à un mail : tout son contenu entre alors dans l'analyse de ta partie.",
      placement: "bottom",
    },
    {
      selector: "",
      title: "Les tableaux",
      body: "Ouvre un tableau pour l'éditer en pleine page : Kanban, Timeline/roadmap, Matrice (Impact/Effort, Prob/Impact, RICE), Registre de risques, Table (RACI, SWOT, comparatif) et Graphe (arbre, 5 pourquoi, Ishikawa, dépendances).",
    },
    {
      selector: "",
      title: "Relier les objets",
      body: "Décisions et tableaux se relient entre eux : glisse pour une relation mère-fille ; le panneau Dépendances gère aussi les relations sœur. Les cycles sont refusés automatiquement.",
    },
    {
      selector: "",
      title: "À toi de jouer",
      body: "Une décision solide, c'est une démarche visible : des options comparées, des critères assumés, des risques anticipés. Le moteur observe tout ça pour ton bilan. Bon arbitrage !",
    },
  ];

  return (
    <div className="flex h-full min-h-0 bg-gray-50/60">
      {/* Rail : arborescence (décisions ⊃ leurs tableaux) + filtre. */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="relative flex shrink-0 items-center gap-1.5 border-b border-gray-100 px-2 py-2">
          <div data-tour="de-filter" className="flex flex-1 gap-0.5 rounded-lg bg-gray-100 p-0.5">
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
          <button type="button" data-tour="de-new" className="shrink-0 rounded-lg bg-indigo-600 px-2 py-1 text-xs font-semibold text-white transition hover:bg-indigo-700" onClick={() => setShowNew((v) => !v)}>
            + Nouveau
          </button>
          <button type="button" data-tour="guide" title="Guide interactif du Decision Engine" className="shrink-0 rounded-lg border border-indigo-200 bg-indigo-50 px-1.5 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100" onClick={() => setTourOpen(true)}>
            ❓
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

        <div data-tour="de-rail" className="min-h-0 flex-1 overflow-y-auto py-1">
          {decisions.length === 0 && allBoards.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-gray-400">Rien encore. « + Nouveau » pour créer une décision ou un tableau.</p>
          )}

          {railFilter === "boards" ? (
            allBoards.length === 0 ? (
              <p className="px-4 py-6 text-center text-[11px] text-gray-400">Aucun tableau.</p>
            ) : (
              allBoards.map((b) => <BoardRow key={b.id} board={b} active={openBoardId === b.id} onClick={() => setOpenBoardId(b.id)} onDragStartBoard={() => setDragBoardId(b.id)} onDragEndBoard={clearDrag} />)
            )
          ) : (
            <>
              {rootDecisions.map((d) => renderDecision(d, 0))}

              {railFilter === "all" && standaloneBoards.length > 0 && (
                <>
                  <p className="px-3 pb-0.5 pt-2 text-[9px] font-semibold uppercase tracking-wide text-gray-400">Tableaux libres</p>
                  {standaloneBoards.map((b) => (
                    <BoardRow key={b.id} board={b} active={openBoardId === b.id} onClick={() => setOpenBoardId(b.id)} onDragStartBoard={() => setDragBoardId(b.id)} onDragEndBoard={clearDrag} />
                  ))}
                </>
              )}
            </>
          )}

          {/* Zone de détachement — visible pendant un glisser. */}
          {(dragBoardId || dragDecId) && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const bId = e.dataTransfer.getData(BOARD_MIME);
                if (bId) dispatch(reparentBoard(bId, null));
                const dId = e.dataTransfer.getData(DECISION_MIME);
                if (dId) detachDecisionParent(dId);
                clearDrag();
              }}
              className="m-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-2 py-2.5 text-center text-[11px] text-gray-500"
            >
              {dragDecId ? "Déposer ici pour remettre la décision à la racine" : "Déposer ici pour détacher (tableau libre)"}
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
              <div className="ml-auto flex items-center gap-1.5">
                <AttachToMailButton
                  tool={DECISION_ENGINE_TOOL_ID}
                  id={openBoard.id}
                  kind="board"
                  title={openBoard.title || `Tableau ${openBoard.engine}`}
                  dispatch={dispatch}
                  compact
                />
                <GuideButton onClick={() => setTourOpen(true)} />
              </div>
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
            <header className="flex shrink-0 items-center gap-2 border-b border-gray-200 px-4 py-2.5">
              <input
                key={selected.id}
                defaultValue={selected.title}
                onBlur={(e) => e.target.value.trim() !== selected.title && dispatch(updateDecision(selected.id, { title: e.target.value.trim() || "Sans titre" }))}
                className="min-w-0 flex-1 bg-transparent text-base font-semibold text-gray-900 focus:outline-none"
                placeholder="Titre de la décision"
              />
              <span data-tour="de-attach">
                <AttachToMailButton
                  tool={DECISION_ENGINE_TOOL_ID}
                  id={selected.id}
                  kind="decision"
                  title={selected.title || "Décision"}
                  dispatch={dispatch}
                  compact
                />
              </span>
              <GuideButton onClick={() => setTourOpen(true)} />
            </header>
            <div data-tour="de-editor" className="min-h-0 flex-1">
              <DecisionEditor key={selected.id} decision={selected} boards={boards} engineState={state} dispatch={dispatch} onOpenBoard={setOpenBoardId} onSelectDecision={setSelectedId} />
            </div>
          </>
        )}
      </section>

      <GuidedTour steps={tourSteps} open={tourOpen} onClose={() => setTourOpen(false)} />
    </div>
  );
}

/** Ligne « tableau » du rail (indentée si rattachée à une décision).
 *  Glissable → déposer sur une décision pour la rattacher. */
function BoardRow({
  board,
  active,
  depth = 0,
  onClick,
  onDragStartBoard,
  onDragEndBoard,
}: {
  board: Board;
  active: boolean;
  depth?: number;
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
      style={{ paddingLeft: 12 + depth * 14 }}
      className={`flex w-full cursor-grab items-center gap-1.5 py-1.5 pr-3 text-left text-xs transition active:cursor-grabbing ${active ? "bg-indigo-50 text-indigo-800" : "text-gray-600 hover:bg-gray-100"}`}
    >
      <span aria-hidden>{ENGINE_ICON[board.engine] ?? "📊"}</span>
      <span className="min-w-0 flex-1 truncate">{board.title || board.engine}</span>
    </button>
  );
}
