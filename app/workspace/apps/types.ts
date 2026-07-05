/**
 * Types partagés des apps du workspace (contrat §1).
 * Une app est une brique d'interface : elle reçoit l'état du poste de
 * travail et dispatch des WorkspaceAction — AUCUNE logique moteur.
 */

import type { FC } from "react";
import type { ActorDef, DocumentDef } from "@/app/lib/engine/mechanics";
import type { WorkspaceAction, WorkspaceState } from "@/app/lib/engine/workspace";

export type WorkspaceDispatch = (action: WorkspaceAction) => void;

/** Contexte de navigation inter-apps (ex : ouvrir Documents sur une PJ,
 *  remonter à la source d'une annotation du Bloc-notes). */
export interface AppNavContext {
  document_id?: string;
  thread_id?: string;
  mail_id?: string;
  note_id?: string;
  /** Ouverture d'un artefact du Decision Engine depuis un lien de mail. */
  decision_id?: string;
  board_id?: string;
}

export interface WorkspaceAppProps {
  workspace: WorkspaceState;
  actors: ActorDef[];
  documents: DocumentDef[];
  dispatch: WorkspaceDispatch;
  /** Fils où un interlocuteur est en train d'écrire (indicateur de frappe). */
  busyThreads?: string[];
  /** Navigation pilotée par le shell : ouvrir une autre app (+ contexte). */
  openApp: (appId: string, context?: AppNavContext) => void;
  /** Contexte reçu du dernier openApp vers cette app. */
  context?: AppNavContext;
}

export interface WorkspaceApp {
  id: string;
  title: string;
  icon: string;
  /** Nombre affiché en pastille sur l'icône du rail (0 = rien). */
  badge(ws: WorkspaceState): number;
  Component: FC<WorkspaceAppProps>;
}
