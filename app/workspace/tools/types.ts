/**
 * Types partagés des Tools du workspace (contrat §3).
 * Un Tool ne connaît AUCUNE mécanique et AUCUN scénario : il reçoit un
 * état sérialisable, une config déclarée par le step, et un dispatch.
 */

import type { FC } from "react";
import type { Json, JsonObject } from "@/app/lib/engine/mechanics";
import type { ToolOpApplier, WorkspaceAction } from "@/app/lib/engine/workspace";

export type WorkspaceDispatch = (action: WorkspaceAction) => void;

export interface ToolComponentProps {
  state: Json;
  config: JsonObject;
  dispatch: WorkspaceDispatch;
}

export interface WorkspaceTool {
  id: string;
  title: string;
  icon: string;
  Component: FC<ToolComponentProps>;
  initialState(config: JsonObject): Json;
  /** Résumé lisible par l'observateur IA — fonction PURE (spec.ts, sans React). */
  describeForObservation(state: Json): string;
  /**
   * Reducer PUR des actions `tool_op` du tool (TOOL_BLOC_NOTES.md §2) —
   * optionnel : les tools simples restent sur `tool_state_changed`.
   * Exporté par le spec.ts du tool (node-safe, comme
   * describeForObservation) et câblé au moteur par le WorkspacePlayer
   * via ReducerOptions.toolAppliers. Op inconnue → état inchangé.
   */
  applyOp?: ToolOpApplier;
}
