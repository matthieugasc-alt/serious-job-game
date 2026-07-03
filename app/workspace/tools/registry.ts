/**
 * TOOL_REGISTRY — registre des Tools du workspace (contrat §3).
 * Chaque Tool = un dossier autonome : spec.ts (PUR, importable par le
 * moteur) + composant React. Le garde-fou workspace.gardefou.test.ts
 * vérifie la cohérence dossiers ↔ registre et la pureté des specs.
 */

import type { WorkspaceTool } from "./types";
import { notesSpec } from "./notes/spec";
import { NotesTool } from "./notes/NotesTool";
import { contratSpec } from "./contrat/spec";
import { ContratTool } from "./contrat/ContratTool";

export const TOOL_REGISTRY: Record<string, WorkspaceTool> = {
  [notesSpec.id]: { ...notesSpec, Component: NotesTool },
  [contratSpec.id]: { ...contratSpec, Component: ContratTool },
};

export type { WorkspaceTool, ToolComponentProps, WorkspaceDispatch } from "./types";
