"use client";

/**
 * DeskView — le bureau multi-fenêtres du dossier documentaire (contrat §5).
 * Rend les entrées OUVERTES (desk.windows) selon la disposition courante
 * (single / split-v / split-h / grid), ou la COMPARAISON côte à côte
 * (desk.compare) quand elle est active — scroll indépendant, quel que
 * soit le type d'entrée (document ↔ mail archivé ↔ fil archivé).
 *
 * Piloté par l'état du Tool : ouvrir/fermer/réordonner/comparer passent
 * par l'API publique depuis la barre d'outils de BibliothequeApp.
 */

import type { DocumentDef, Json } from "@/app/lib/engine/mechanics";
import type { WorkspaceAction } from "@/app/lib/engine/workspace";
import { ReaderAugmente } from "./ReaderAugmente";
import type { DeskLayout, DocEntry } from "../spec";

type Dispatch = (action: WorkspaceAction) => void;

function Pane({
  entry,
  documents,
  dispatch,
  nameOf,
  focused,
  onFocus,
  showPanel = false,
  decisionState,
}: {
  entry: DocEntry;
  documents: DocumentDef[];
  dispatch: Dispatch;
  nameOf?: (id: string) => string;
  focused?: boolean;
  onFocus?: () => void;
  showPanel?: boolean;
  decisionState?: Json;
}) {
  return (
    <div
      className={`min-h-0 min-w-0 overflow-hidden rounded-lg border bg-white transition ${
        focused ? "border-indigo-300 ring-1 ring-indigo-200" : "border-gray-200"
      }`}
      onMouseDown={onFocus}
    >
      <ReaderAugmente
        entry={entry}
        documents={documents}
        dispatch={dispatch}
        nameOf={nameOf}
        defaultShowPanel={showPanel}
        decisionState={decisionState}
      />
    </div>
  );
}

export function DeskView({
  windows,
  layout,
  compareEntries,
  focusedId,
  documents,
  dispatch,
  nameOf,
  onFocus,
  decisionState,
}: {
  windows: DocEntry[];
  layout: DeskLayout;
  compareEntries: [DocEntry, DocEntry] | null;
  focusedId: string | null;
  documents: DocumentDef[];
  dispatch: Dispatch;
  nameOf?: (id: string) => string;
  onFocus: (id: string) => void;
  decisionState?: Json;
}) {
  // ── Comparaison : deux entrées côte à côte, scroll indépendant.
  if (compareEntries) {
    return (
      <div className="grid h-full min-h-0 grid-cols-2 gap-2 p-2">
        {compareEntries.map((e, i) => (
          <Pane key={`cmp_${e.id}_${i}`} entry={e} documents={documents} dispatch={dispatch} nameOf={nameOf} decisionState={decisionState} />
        ))}
      </div>
    );
  }

  if (windows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-gray-400">Aucune fenêtre ouverte.</p>
      </div>
    );
  }

  const focused = windows.find((w) => w.id === focusedId) ?? windows[0];

  // ── Sélection des panes affichés selon la disposition.
  const paneFor = (): DocEntry[] => {
    if (layout === "single") return [focused];
    if (layout === "grid") return windows.slice(0, 4);
    // split-v / split-h : la fenêtre focalisée + la suivante distincte.
    const other = windows.find((w) => w.id !== focused.id);
    return other ? [focused, other] : [focused];
  };
  const panes = paneFor();

  const gridClass =
    layout === "grid"
      ? "grid-cols-2 auto-rows-fr"
      : layout === "split-h"
        ? "grid-rows-2 auto-cols-fr"
        : layout === "split-v"
          ? "grid-cols-2"
          : "grid-cols-1";

  const multi = panes.length > 1;

  return (
    <div className={`grid h-full min-h-0 gap-2 p-2 ${gridClass}`}>
      {panes.map((e) => (
        <Pane
          key={e.id}
          entry={e}
          documents={documents}
          dispatch={dispatch}
          nameOf={nameOf}
          focused={multi && e.id === focused.id}
          onFocus={() => onFocus(e.id)}
          showPanel={!multi}
          decisionState={decisionState}
        />
      ))}
    </div>
  );
}
