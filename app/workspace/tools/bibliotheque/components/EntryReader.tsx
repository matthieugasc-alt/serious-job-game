"use client";

/**
 * EntryReader — lecteur d'une entrée du dossier documentaire.
 * Tranche 1 : rendu par type de source (document du scénario via
 * DocumentViewer ; mail/fil archivés depuis leur snapshot horodaté),
 * en-tête avec épingle/favori/tags. La couche d'ANNOTATION (surlignage,
 * commentaires ancrés, signets, extraction → Bloc-notes) est ajoutée en
 * tranche 2, par-dessus ce même rendu (offsets texte sérialisables).
 */

import type { DocumentDef } from "@/app/lib/engine/mechanics";
import type { WorkspaceAction } from "@/app/lib/engine/workspace";
import { Markdown } from "@/app/workspace/primitives/Markdown";
import { DocumentViewer } from "@/app/workspace/primitives/DocumentViewer";
import { togglePin, toggleFavorite } from "../api";
import type { DocEntry } from "../spec";

type Dispatch = (action: WorkspaceAction) => void;

const KIND_LABEL: Record<string, string> = {
  scenario_doc: "Document",
  archived_mail: "Mail archivé",
  archived_messages: "Fil archivé",
};

function fmtDate(at: number): string {
  try {
    return new Date(at).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function EntryReader({
  entry,
  documents,
  dispatch,
  nameOf,
}: {
  entry: DocEntry;
  documents: DocumentDef[];
  dispatch: Dispatch;
  /** Résout un actor_id/participant en nom lisible (fourni par l'hôte). */
  nameOf?: (id: string) => string;
}) {
  const who = (id: string) => (nameOf ? nameOf(id) : id);

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <header className="flex shrink-0 items-start gap-3 border-b border-gray-200 bg-gray-50/80 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            {KIND_LABEL[entry.source.kind] ?? "Document"}
          </p>
          <h2 className="truncate text-sm font-semibold text-gray-900" title={entry.title}>
            {entry.title || "(sans titre)"}
          </h2>
          {entry.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {entry.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            title={entry.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
            aria-pressed={entry.favorite}
            className={`rounded-md px-1.5 py-1 text-sm transition hover:bg-gray-100 ${
              entry.favorite ? "text-amber-500" : "text-gray-400"
            }`}
            onClick={() => dispatch(toggleFavorite(entry.id))}
          >
            {entry.favorite ? "★" : "☆"}
          </button>
          <button
            type="button"
            title={entry.pinned ? "Désépingler" : "Épingler"}
            aria-pressed={entry.pinned}
            className={`rounded-md px-1.5 py-1 text-sm transition hover:bg-gray-100 ${
              entry.pinned ? "text-indigo-600" : "text-gray-400"
            }`}
            onClick={() => dispatch(togglePin(entry.id))}
          >
            📌
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        <EntryBody entry={entry} documents={documents} who={who} />
      </div>
    </div>
  );
}

function EntryBody({
  entry,
  documents,
  who,
}: {
  entry: DocEntry;
  documents: DocumentDef[];
  who: (id: string) => string;
}) {
  const src = entry.source;

  if (src.kind === "scenario_doc") {
    const doc = documents.find((d) => d.id === src.document_id);
    if (!doc) {
      return (
        <p className="p-4 text-sm text-gray-400">
          Ce document n’est plus disponible dans le contexte courant.
        </p>
      );
    }
    return <DocumentViewer documents={[doc]} />;
  }

  if (src.kind === "archived_mail") {
    const m = src.snapshot;
    return (
      <div className="h-full overflow-y-auto px-5 py-4">
        <div className="mx-auto w-full max-w-[72ch]">
          <p className="text-[11px] text-gray-500">
            De : {who(m.from)} · À : {m.to.map(who).join(", ") || "—"} · {fmtDate(m.at)}
          </p>
          <h3 className="mt-1 text-base font-semibold text-gray-900">{m.subject}</h3>
          <div className="mt-3">
            <Markdown>{m.body}</Markdown>
          </div>
        </div>
      </div>
    );
  }

  // archived_messages
  const t = src.snapshot;
  return (
    <div className="h-full overflow-y-auto px-5 py-4">
      <div className="mx-auto flex w-full max-w-[72ch] flex-col gap-2">
        {t.messages.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun message dans ce fil.</p>
        ) : (
          t.messages.map((msg, i) => (
            <div key={i} className="rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2">
              <p className="text-[11px] font-medium text-gray-500">
                {who(msg.from)} · {fmtDate(msg.at)}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                {msg.content}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
