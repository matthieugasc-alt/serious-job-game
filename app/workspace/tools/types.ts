/**
 * Types partagés des Tools du workspace (contrat §3).
 * Un Tool ne connaît AUCUNE mécanique et AUCUN scénario : il reçoit un
 * état sérialisable, une config déclarée par le step, et un dispatch.
 */

import type { FC } from "react";
import type { Json, JsonObject } from "@/app/lib/engine/mechanics";
import type { WorkspaceAction } from "@/app/lib/engine/workspace";

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
}
