"use client";

/**
 * DecisionEngineToolPanel — adaptateur ToolComponentProps pour le
 * TOOL_REGISTRY (aperçu latéral quand un step épingle le tool). L'app
 * complète (DecisionEngineApp) vit dans le dock via APP_REGISTRY.
 */

import type { FC } from "react";
import type { ToolComponentProps } from "../../types";
import { listDecisions } from "../api";

const STATUS_LABEL: Record<string, string> = {
  draft: "Brouillon",
  in_progress: "En cours",
  finalized: "Actée",
  archived: "Archivée",
};

export const DecisionEngineToolPanel: FC<ToolComponentProps> = ({ state }) => {
  const decisions = listDecisions(state).slice(0, 12);
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Décisions</h3>
      {decisions.length === 0 ? (
        <p className="text-sm text-gray-400">Aucune décision en cours.</p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {decisions.map((d) => (
            <li key={d.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-800">
              <span aria-hidden>🧭</span>
              <span className="line-clamp-1 flex-1">{d.title || "(sans titre)"}</span>
              <span className="shrink-0 text-[10px] text-gray-400">{STATUS_LABEL[d.status]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
