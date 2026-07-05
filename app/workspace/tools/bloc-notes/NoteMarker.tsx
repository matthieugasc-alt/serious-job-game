"use client";

/**
 * NoteMarker — petit marqueur JAUNE « 📓 » accroché à un message ou un
 * mail annoté, EXPORTÉ vers les apps hôtes (Messages, Mail). Au survol,
 * un aperçu de la note attachée s'affiche (extraits + commentaires).
 *
 * SELF-CONTAINED comme AnnotateButton : l'hôte ne connaît RIEN du carnet.
 * Il passe son `workspace` + une source légère ({kind, id}) ; le marqueur
 * retrouve lui-même la note via les sélecteurs internes et ne rend RIEN
 * s'il n'y a pas de note attachée.
 */

import type { WorkspaceState } from "@/app/lib/engine/workspace";
import { selectNoteForDocument, selectNoteForMail, selectNoteForMessageThread } from "./api";
import type { Block, Note } from "./spec";

export type MarkerSource =
  | { kind: "message"; thread_id: string }
  | { kind: "mail"; mail_id: string }
  | { kind: "document"; document_id: string };

function lineGlyph(kind: Block["kind"]): string {
  if (kind === "quote") return "❝";
  if (kind === "heading1" || kind === "heading2") return "▸";
  return "·";
}

interface Props {
  workspace: WorkspaceState;
  source: MarkerSource;
  side?: "above" | "below";
  align?: "left" | "right";
  className?: string;
}

export function NoteMarker({ workspace, source, side = "below", align = "left", className = "" }: Props) {
  const notebook = workspace.toolStates["bloc-notes"] ?? null;
  const note: Note | null =
    source.kind === "message"
      ? selectNoteForMessageThread(notebook, source.thread_id)
      : source.kind === "mail"
        ? selectNoteForMail(notebook, source.mail_id)
        : selectNoteForDocument(notebook, source.document_id);

  if (!note) return null;

  const lines = note.blocks.filter((b) => b.kind !== "separator" && (b.text.trim() || b.kind === "todo"));
  // Nombre d'ANNOTATIONS = nombre d'extraits (chaque annotation ajoute un
  // bloc « quote » ; un éventuel commentaire est un bloc paragraphe RATTACHÉ,
  // pas une annotation de plus). Évite le « 2 » trompeur pour 1 annotation.
  const count = note.blocks.filter((b) => b.kind === "quote").length || lines.length;

  return (
    <span className={`group/marker relative inline-flex shrink-0 ${className}`}>
      <span
        className="inline-flex cursor-default items-center gap-0.5 rounded-md border border-amber-300 bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-amber-900 shadow-sm transition group-hover/marker:bg-amber-300"
        title="Note attachée — survol pour lire"
        aria-label={`Note attachée : ${note.title || "sans titre"}`}
      >
        <span aria-hidden>📓</span>
        {count > 1 && <span className="tabular-nums">{count}</span>}
      </span>

      <div
        className={`absolute z-50 hidden max-h-64 w-72 overflow-auto rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-left shadow-xl group-hover/marker:block ${
          side === "below" ? "top-full mt-1.5" : "bottom-full mb-1.5"
        } ${align === "right" ? "right-0" : "left-0"}`}
      >
        <p className="mb-1.5 flex items-center gap-1 border-b border-amber-200 pb-1 text-[11px] font-semibold text-amber-900">
          <span aria-hidden>📓</span>
          <span className="truncate">{note.title.trim() || "Note"}</span>
        </p>
        <div className="space-y-1">
          {lines.length === 0 && <p className="text-[11px] italic text-amber-700/70">Note vide.</p>}
          {lines.map((b) => (
            <div key={b.id} className="flex gap-1.5 text-[11px] leading-snug text-gray-700">
              <span aria-hidden className="shrink-0 text-amber-500">
                {b.kind === "todo" ? (b.checked ? "☑" : "☐") : lineGlyph(b.kind)}
              </span>
              <span
                className={
                  b.kind === "quote"
                    ? "italic text-gray-600"
                    : b.kind === "heading1" || b.kind === "heading2"
                      ? "font-semibold text-gray-800"
                      : ""
                }
              >
                {b.text.trim() || <span className="italic opacity-40">(vide)</span>}
              </span>
            </div>
          ))}
        </div>
      </div>
    </span>
  );
}
