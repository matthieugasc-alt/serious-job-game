/**
 * Spec PURE du Tool notes — importable par le moteur (AUCUN React).
 * Le garde-fou workspace.gardefou.test.ts vérifie cette pureté.
 */

import type { Json, JsonObject } from "@/app/lib/engine/mechanics";

export const NOTES_TOOL_ID = "notes";

export type NotesToolState = { content: string };

export function initialNotesState(_config: JsonObject): NotesToolState {
  return { content: "" };
}

/** L'observateur IA lit le contenu brut du bloc-notes. */
export function describeNotesForObservation(state: Json): string {
  const content =
    state && typeof state === "object" && !Array.isArray(state)
      ? (state as { content?: Json }).content
      : undefined;
  if (typeof content !== "string" || content.trim().length === 0) {
    return "Bloc-notes vide.";
  }
  return content;
}

export const notesSpec = {
  id: NOTES_TOOL_ID,
  title: "Bloc-notes",
  icon: "📝",
  initialState: initialNotesState,
  describeForObservation: describeNotesForObservation,
} as const;
