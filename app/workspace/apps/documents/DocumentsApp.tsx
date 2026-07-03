"use client";

/**
 * DocumentsApp — bibliothèque de documents du scénario.
 * Grille de cartes, ouverture → dispatch `document_opened` + lecteur
 * (réutilise DocumentViewer : markdown typographié, aperçu PDF).
 * Accepte un contexte de navigation (PJ d'un mail → ouvre le doc).
 */

import { useEffect, useRef, useState } from "react";
import type { DocumentDef } from "@/app/lib/engine/mechanics";
import { DocumentViewer } from "@/app/player/primitives/DocumentViewer";
import type { WorkspaceAppProps } from "../types";

/** Icône par type : 📊 données, 📄 texte — même heuristique que le viewer. */
function docIcon(doc: DocumentDef): string {
  const ext = doc.file_path?.split(/[?#]/)[0].split(".").pop()?.toLowerCase() ?? "";
  if (["csv", "xls", "xlsx", "tsv"].includes(ext)) return "📊";
  if (doc.content && /\n\|.*\|/.test(doc.content)) return "📊";
  return "📄";
}

export function DocumentsApp({ workspace, documents, dispatch, context }: WorkspaceAppProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const handledContext = useRef<string | null>(null);

  const openDoc = (id: string) => {
    setOpenId(id);
    dispatch({ type: "document_opened", document_id: id });
  };

  // Navigation inter-apps : « ouvrir la PJ » depuis un mail.
  const requested = context?.document_id;
  useEffect(() => {
    if (requested && requested !== handledContext.current && documents.some((d) => d.id === requested)) {
      handledContext.current = requested;
      openDoc(requested);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested]);

  const open = documents.find((d) => d.id === openId) ?? null;

  if (open) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-white">
        <div className="shrink-0 border-b border-gray-100 px-3 py-2">
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50"
            onClick={() => setOpenId(null)}
          >
            ← Tous les documents
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <DocumentViewer key={open.id} documents={[open]} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-gray-50/60 p-5">
      <h2 className="mb-4 text-sm font-semibold text-gray-900">Documents</h2>
      {documents.length === 0 ? (
        <p className="text-sm text-gray-400">Aucun document disponible.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {documents.map((d) => {
            const consulted = workspace.documents[d.id]?.opened ?? false;
            return (
              <button
                key={d.id}
                type="button"
                className="flex flex-col items-start gap-2 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-300 hover:shadow"
                onClick={() => openDoc(d.id)}
              >
                <span aria-hidden className="text-3xl">{docIcon(d)}</span>
                <span className="line-clamp-2 text-sm font-medium text-gray-900">{d.title}</span>
                <span className={`text-[11px] font-medium ${consulted ? "text-emerald-600" : "text-gray-400"}`}>
                  {consulted ? "✓ Consulté" : "Non consulté"}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
