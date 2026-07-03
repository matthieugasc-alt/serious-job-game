"use client";

/**
 * NotesApp — le Tool notes monté en app plein volet (contrat §1).
 * Aucune logique propre : lit l'état du tool dans le workspace et
 * délègue tout au composant NotesTool (autosave → tool_state_changed).
 */

import { NotesTool } from "../../tools/notes/NotesTool";
import { notesSpec } from "../../tools/notes/spec";
import type { WorkspaceAppProps } from "../types";

export function NotesApp({ workspace, dispatch }: WorkspaceAppProps) {
  const state = workspace.toolStates[notesSpec.id] ?? notesSpec.initialState({});
  return <NotesTool state={state} config={{}} dispatch={dispatch} />;
}
