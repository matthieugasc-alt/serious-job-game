"use client";

/**
 * DocumentViewer — primitive d'affichage des documents d'un step.
 * Contenu inline (markdown brut) ou fichier téléchargeable.
 */

import { useState } from "react";
import type { DocumentDef } from "@/app/lib/engine/mechanics";

export function DocumentViewer({ documents }: { documents: DocumentDef[] }) {
  const [openId, setOpenId] = useState<string | null>(
    documents.length === 1 ? documents[0].id : null,
  );
  if (documents.length === 0) return null;
  const open = documents.find((d) => d.id === openId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap gap-2 border-b p-2">
        {documents.map((d) => (
          <button
            key={d.id}
            className={`rounded px-3 py-1 text-xs ${
              d.id === openId ? "bg-black text-white" : "bg-gray-100"
            }`}
            onClick={() => setOpenId(d.id)}
          >
            {d.title}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {open?.content && (
          <pre className="whitespace-pre-wrap font-sans text-sm">{open.content}</pre>
        )}
        {open?.file_path && (
          <a
            className="text-sm text-blue-600 underline"
            href={open.file_path}
            target="_blank"
            rel="noreferrer"
          >
            Ouvrir {open.title}
          </a>
        )}
        {!open && <p className="text-sm opacity-50">Sélectionnez un document.</p>}
      </div>
    </div>
  );
}
