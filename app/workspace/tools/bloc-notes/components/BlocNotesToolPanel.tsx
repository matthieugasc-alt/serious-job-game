"use client";

/**
 * BlocNotesToolPanel — adaptateur ToolComponentProps pour le
 * TOOL_REGISTRY : quand un step épingle "bloc-notes" dans le panneau
 * latéral droit du shell, on monte la vue rapide (note immédiate,
 * récentes, tags, chrono). L'application complète vit dans le dock
 * (BlocNotesApp) ; ici, pas de navigation — aperçu inline des notes.
 */

import type { FC } from "react";
import type { ToolComponentProps } from "../../types";
import { normalizeNotebookState } from "../api";
import { NotebookQuickContent } from "./QuickContent";

export const BlocNotesToolPanel: FC<ToolComponentProps> = ({ state, dispatch }) => (
  <NotebookQuickContent state={normalizeNotebookState(state)} dispatch={dispatch} />
);
