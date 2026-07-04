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
import { editeurSpec } from "./editeur/spec";
import { EditeurTool } from "./editeur/EditeurTool";
import { reunionSpec } from "./reunion/spec";
import { ReunionTool } from "./reunion/ReunionTool";
import { blocNotesSpec } from "./bloc-notes/spec";
import { BlocNotesToolPanel } from "./bloc-notes/components/BlocNotesToolPanel";
import { bibliothequeSpec } from "./bibliotheque/spec";
import { BibliothequeToolPanel } from "./bibliotheque/components/BibliothequeToolPanel";
import { decisionEngineSpec } from "./decision-engine/spec";
import { DecisionEngineToolPanel } from "./decision-engine/components/DecisionEngineToolPanel";

export const TOOL_REGISTRY: Record<string, WorkspaceTool> = {
  [notesSpec.id]: { ...notesSpec, Component: NotesTool },
  [contratSpec.id]: { ...contratSpec, Component: ContratTool },
  [editeurSpec.id]: { ...editeurSpec, Component: EditeurTool },
  [reunionSpec.id]: { ...reunionSpec, Component: ReunionTool },
  // Bloc-notes Universel : spec pure + applyOp (tool_op). Épinglé dans
  // le panneau droit → vue rapide ; l'app complète (BlocNotesApp) vit
  // dans le dock via APP_REGISTRY.
  [blocNotesSpec.id]: { ...blocNotesSpec, Component: BlocNotesToolPanel },
  // Gestionnaire Documentaire Universel (docs/TOOL_GESTIONNAIRE_DOC.md) :
  // spec pure + applyOp (tool_op), jamais réinitialisé. Panneau = aperçu ;
  // l'app complète (Lot 2) sera hébergée par l'app documents du dock.
  [bibliothequeSpec.id]: { ...bibliothequeSpec, Component: BibliothequeToolPanel },
  // Decision Engine Universel (docs/TOOL_DECISION_ENGINE.md) : spec pure +
  // applyOp (tool_op), jamais réinitialisé. Panneau = aperçu ; l'app
  // complète (DecisionEngineApp) vit dans le dock via APP_REGISTRY.
  [decisionEngineSpec.id]: { ...decisionEngineSpec, Component: DecisionEngineToolPanel },
};

export type { WorkspaceTool, ToolComponentProps, WorkspaceDispatch } from "./types";
