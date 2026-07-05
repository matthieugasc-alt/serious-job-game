"use client";

/**
 * AttachToMailButton — joint un artefact (note, mind map, décision,
 * tableau, tableau blanc) au brouillon de mail « compose ».
 *
 * Dumb component : reçoit la référence de l'artefact + dispatch. Il émet
 * l'action `artifact_attached_to_mail` ; c'est le reducer qui insère le
 * lien cliquable dans le corps du mail et enregistre la référence. Le
 * snapshot exhaustif, lui, est figé à l'ENVOI du mail (MailApp), pas ici.
 */

import { useState } from "react";
import type { ArtifactKind } from "@/app/lib/engine/workspace";
import type { WorkspaceDispatch } from "@/app/workspace/tools/types";

interface Props {
  tool: string;
  id: string;
  kind: ArtifactKind;
  title: string;
  dispatch: WorkspaceDispatch;
  /** Rendu compact (icône seule) pour les barres d'outils denses. */
  compact?: boolean;
}

export function AttachToMailButton({ tool, id, kind, title, dispatch, compact }: Props) {
  const [done, setDone] = useState(false);

  const attach = () => {
    dispatch({ type: "artifact_attached_to_mail", ref: { tool, id, kind, title } });
    setDone(true);
    window.setTimeout(() => setDone(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={attach}
      title="Joindre au brouillon d'email (lien cliquable + contenu analysé)"
      className={
        "inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 transition hover:bg-amber-100 " +
        (done ? "opacity-70" : "")
      }
    >
      <span aria-hidden>📎</span>
      {!compact && <span>{done ? "Joint à l'email ✓" : "Joindre à l'email"}</span>}
    </button>
  );
}
