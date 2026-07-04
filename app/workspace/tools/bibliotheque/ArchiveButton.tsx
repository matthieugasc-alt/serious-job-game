"use client";

/**
 * ArchiveButton — « Ajouter au dossier documentaire », EXPORTÉ vers les
 * apps hôtes Mail et Messages (contrat §2/§5, même pattern que le
 * AnnotateButton du Bloc-notes). L'hôte ne connaît RIEN du dossier : il
 * fournit une cible (mail ou fil + snapshot horodaté), l'état brut du
 * Tool (`workspace.toolStates["bibliotheque"]`) et son dispatch. Le bouton
 * construit l'op via l'API publique, propose un dossier / des tags
 * optionnels dans un popover local, et confirme sans re-render de l'hôte.
 *
 * Idempotence : si la source est déjà au dossier (dédup par mail_id /
 * thread_id dans le modèle), le bouton l'affiche (« ✓ Au dossier ») —
 * ré-archiver reste un no-op.
 */

import { useEffect, useRef, useState } from "react";
import type { Json } from "@/app/lib/engine/mechanics";
import type { WorkspaceAction } from "@/app/lib/engine/workspace";
import { archiveMail, archiveThread, selectAllEntries, selectFolders } from "./api";
import type { ArchivedMailSnapshot, ArchivedThreadSnapshot } from "./spec";

type Dispatch = (action: WorkspaceAction) => void;

export type ArchiveTarget =
  | { kind: "mail"; mail_id: string; title?: string; snapshot: ArchivedMailSnapshot }
  | { kind: "thread"; thread_id: string; title?: string; snapshot: ArchivedThreadSnapshot };

interface ArchiveButtonProps {
  target: ArchiveTarget;
  /** État brut du Tool : workspace.toolStates["bibliotheque"] (Json ou null). */
  libraryState: Json;
  dispatch: Dispatch;
  className?: string;
  side?: "above" | "below";
  align?: "left" | "right";
}

function isArchived(libraryState: Json, target: ArchiveTarget): boolean {
  return selectAllEntries(libraryState).some((e) =>
    target.kind === "mail"
      ? e.source.kind === "archived_mail" && e.source.mail_id === target.mail_id
      : e.source.kind === "archived_messages" && e.source.thread_id === target.thread_id,
  );
}

export function ArchiveButton({
  target,
  libraryState,
  dispatch,
  className = "",
  side = "below",
  align = "right",
}: ArchiveButtonProps) {
  const [phase, setPhase] = useState<"idle" | "open" | "done">("idle");
  const archived = isArchived(libraryState, target);

  useEffect(() => {
    if (phase !== "done") return;
    const t = setTimeout(() => setPhase("idle"), 1600);
    return () => clearTimeout(t);
  }, [phase]);

  const submit = (folderId: string | null, tags: string[]) => {
    if (target.kind === "mail") {
      dispatch(
        archiveMail({
          mail_id: target.mail_id,
          snapshot: target.snapshot,
          title: target.title,
          folder_id: folderId ?? undefined,
          tags: tags.length > 0 ? tags : undefined,
        }),
      );
    } else {
      dispatch(
        archiveThread({
          thread_id: target.thread_id,
          snapshot: target.snapshot,
          title: target.title,
          folder_id: folderId ?? undefined,
          tags: tags.length > 0 ? tags : undefined,
        }),
      );
    }
    setPhase("done");
  };

  if (archived) {
    return (
      <span
        className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-emerald-600 ${className}`}
        title="Déjà dans le dossier documentaire"
      >
        ✓ Au dossier
      </span>
    );
  }

  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        title="Ajouter au dossier documentaire"
        aria-label="Ajouter au dossier documentaire"
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 ${className}`}
        onClick={(e) => {
          e.stopPropagation();
          setPhase(phase === "open" ? "idle" : "open");
        }}
      >
        <span aria-hidden>🗂️</span> Au dossier
      </button>
      {phase === "open" && (
        <ArchivePopover
          folders={selectFolders(libraryState)}
          side={side}
          align={align}
          onSubmit={submit}
          onClose={() => setPhase("idle")}
        />
      )}
      {phase === "done" && (
        <span className="absolute right-0 top-full z-50 mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-gray-900/90 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg">
          ✓ Ajouté au dossier
        </span>
      )}
    </span>
  );
}

function ArchivePopover({
  folders,
  onSubmit,
  onClose,
  side,
  align,
}: {
  folders: { id: string; name: string }[];
  onSubmit: (folderId: string | null, tags: string[]) => void;
  onClose: () => void;
  side: "above" | "below";
  align: "left" | "right";
}) {
  const [folderId, setFolderId] = useState<string>("");
  const [tags, setTags] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  const confirm = () => {
    const parsed = tags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    onSubmit(folderId || null, parsed);
  };

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label="Ajouter au dossier documentaire"
      className={`absolute z-50 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-xl ${
        side === "below" ? "top-full mt-1.5" : "bottom-full mb-1.5"
      } ${align === "right" ? "right-0" : "left-0"}`}
      onClick={(e) => e.stopPropagation()}
    >
      <p className="mb-2 text-xs font-semibold text-gray-700">Ajouter au dossier documentaire</p>
      {folders.length > 0 && (
        <label className="mb-2 block">
          <span className="mb-1 block text-[11px] font-medium text-gray-500">Dossier (optionnel)</span>
          <select
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-800 focus:border-indigo-400 focus:outline-none"
          >
            <option value="">Aucun dossier</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="mb-2 block">
        <span className="mb-1 block text-[11px] font-medium text-gray-500">Tags (optionnel, séparés par des virgules)</span>
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              confirm();
            }
          }}
          placeholder="ex : urgent, budget"
          className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-800 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none"
        />
      </label>
      <div className="flex items-center justify-end gap-1.5">
        <button type="button" className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-gray-100" onClick={onClose}>
          Annuler
        </button>
        <button
          type="button"
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          onClick={confirm}
        >
          Ajouter
        </button>
      </div>
    </div>
  );
}
