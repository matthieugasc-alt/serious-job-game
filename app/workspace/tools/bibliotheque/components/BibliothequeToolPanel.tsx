"use client";

/**
 * BibliothequeToolPanel — adaptateur ToolComponentProps pour le
 * TOOL_REGISTRY. Placeholder du Lot 1 (couche pure) : l'application
 * complète (BibliothequeApp : bureau multi-fenêtres, lecteur augmenté,
 * comparaison) est le Lot 2 et vivra HÔTÉE par l'app documents du dock
 * (docs/TOOL_GESTIONNAIRE_DOC.md §1). Ici, aperçu inline des documents
 * récemment consultés — lecture seule via l'API publique.
 */

import type { FC } from "react";
import type { ToolComponentProps } from "../../types";
import { selectRecent } from "../api";

const SOURCE_ICON: Record<string, string> = {
  scenario_doc: "📄",
  archived_mail: "📧",
  archived_messages: "💬",
};

export const BibliothequeToolPanel: FC<ToolComponentProps> = ({ state }) => {
  const recent = selectRecent(state, 12);
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        Dossier documentaire
      </h3>
      {recent.length === 0 ? (
        <p className="text-sm text-gray-400">Aucun document au dossier pour l’instant.</p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {recent.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-800"
            >
              <span aria-hidden>{SOURCE_ICON[e.source.kind] ?? "📄"}</span>
              <span className="line-clamp-1 flex-1">{e.title || "(sans titre)"}</span>
              {e.favorite && <span aria-hidden title="Favori">★</span>}
              {e.pinned && <span aria-hidden title="Épinglé">📌</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
