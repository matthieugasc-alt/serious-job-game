"use client";

/**
 * DocumentViewer — primitive d'affichage des documents d'un step.
 *
 * Exigence PO : « la gestion des pièces jointes au scénario doit être
 * parfaite ». Concrètement :
 *   - premier document auto-sélectionné (jamais d'état vide) ;
 *   - contenu inline rendu en markdown typographié (Markdown primitive) ;
 *   - file_path PDF → aperçu embarqué + « Ouvrir dans un onglet » ;
 *   - autres fichiers → carte fichier avec icône et bouton d'ouverture ;
 *   - un seul document → pas d'onglets, titre en tête ;
 *   - panneau scrollable indépendamment.
 */

import { useState } from "react";
import type { DocumentDef } from "@/app/lib/engine/mechanics";
import { Markdown } from "./Markdown";
import { SecondaryButton } from "./ui";

function extensionOf(filePath?: string): string {
  if (!filePath) return "";
  const clean = filePath.split(/[?#]/)[0];
  const dot = clean.lastIndexOf(".");
  return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : "";
}

/** Icône par type : 📊 données (tableaux / tableurs), 📄 texte. */
function docIcon(doc: DocumentDef): string {
  const ext = extensionOf(doc.file_path);
  if (["csv", "xls", "xlsx", "tsv"].includes(ext)) return "📊";
  if (doc.content && /\n\|.*\|/.test(doc.content)) return "📊";
  return "📄";
}

function openInTab(filePath: string) {
  window.open(filePath, "_blank", "noopener,noreferrer");
}

export function DocumentViewer({ documents }: { documents: DocumentDef[] }) {
  // Auto-sélection du premier document — jamais d'écran vide.
  const [openId, setOpenId] = useState<string | null>(documents[0]?.id ?? null);
  if (documents.length === 0) return null;
  const open = documents.find((d) => d.id === openId) ?? documents[0];

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {documents.length > 1 ? (
        <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-gray-200 bg-gray-50/80 p-2">
          {documents.map((d) => {
            const active = d.id === open.id;
            return (
              <button
                key={d.id}
                type="button"
                title={d.title}
                aria-pressed={active}
                className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition ${
                  active
                    ? "border-indigo-300 bg-indigo-50 text-indigo-800 shadow-sm"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900"
                }`}
                onClick={() => setOpenId(d.id)}
              >
                <span aria-hidden>{docIcon(d)}</span>
                <span className="truncate">{d.title}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 bg-gray-50/80 px-4 py-2.5">
          <span aria-hidden className="text-base leading-none">
            {docIcon(open)}
          </span>
          <p className="truncate text-sm font-semibold text-gray-800" title={open.title}>
            {open.title}
          </p>
        </div>
      )}

      <DocumentBody key={open.id} doc={open} />
    </div>
  );
}

function DocumentBody({ doc }: { doc: DocumentDef }) {
  // Contenu inline → markdown typographié, largeur de lecture maîtrisée.
  if (doc.content) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[72ch] px-4 py-4 sm:px-5">
          <Markdown>{doc.content}</Markdown>
        </div>
      </div>
    );
  }

  if (doc.file_path) {
    const ext = extensionOf(doc.file_path);
    if (ext === "pdf") {
      return (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 bg-white px-3 py-2">
            <p className="truncate text-xs text-gray-500" title={doc.title}>
              Aperçu PDF — {doc.title}
            </p>
            <SecondaryButton
              className="!px-3 !py-1.5 !text-xs"
              onClick={() => openInTab(doc.file_path!)}
            >
              Ouvrir dans un onglet ↗
            </SecondaryButton>
          </div>
          <object
            data={doc.file_path}
            type="application/pdf"
            aria-label={doc.title}
            className="min-h-[420px] w-full flex-1 bg-gray-100"
          >
            {/* Fallback navigateurs sans visionneuse PDF embarquée. */}
            <FileCard doc={doc} />
          </object>
        </div>
      );
    }

    // Autre type de fichier → carte fichier propre, jamais un lien nu.
    return (
      <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto p-4">
        <FileCard doc={doc} />
      </div>
    );
  }

  return (
    <p className="p-4 text-sm text-gray-400">Document vide.</p>
  );
}

function FileCard({ doc }: { doc: DocumentDef }) {
  const ext = extensionOf(doc.file_path);
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-6 py-8 text-center">
      <span aria-hidden className="text-4xl">
        {docIcon(doc)}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900">{doc.title}</p>
        {ext && (
          <p className="mt-0.5 text-xs uppercase tracking-wide text-gray-500">
            Fichier {ext}
          </p>
        )}
      </div>
      <SecondaryButton onClick={() => doc.file_path && openInTab(doc.file_path)}>
        Ouvrir le document ↗
      </SecondaryButton>
    </div>
  );
}
