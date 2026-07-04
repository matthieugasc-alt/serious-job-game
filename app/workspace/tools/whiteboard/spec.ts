/**
 * Spec PURE du Tool whiteboard (Tableau blanc à post-it) — node-safe,
 * importable par le moteur et les tests. Pattern docs/TOOL_BLOC_NOTES.md
 * (tool_op / reducer pur / API publique / garde-fous).
 *
 * Un tableau blanc minimal pour le brainstorming : des post-it de couleur
 * qu'on écrit et qu'on colle (glisser-déposer). AUCUN classement, aucune
 * évaluation — le tool est « bête » ; l'observateur IA lit les idées.
 * Règles de pureté : aucun React, aucun import moteur hors types Json.
 */

import type { Json, JsonObject } from "@/app/lib/engine/mechanics";
import { applyWhiteboardOp, emptyWhiteboardState, normalizeWhiteboardState } from "./model";

export const WHITEBOARD_TOOL_ID = "whiteboard";

export type StickyId = string;

/** Palette de post-it (le composant peut en proposer un sous-ensemble). */
export const STICKY_COLORS = ["yellow", "pink", "blue", "green", "orange"] as const;
export type StickyColor = (typeof STICKY_COLORS)[number];

export type StickyNote = {
  id: StickyId;
  text: string;
  color: StickyColor;
  /** Position sur le tableau, en fraction [0,1] (indépendante du rendu). */
  x: number;
  y: number;
  /** Auteur du post-it : "player" ou un actor_id (coéquipier IA). */
  author?: string;
  created_at: number;
  updated_at: number;
};

export type WhiteboardState = {
  notes: Record<StickyId, StickyNote>;
};

export function initialWhiteboardState(_config: JsonObject): WhiteboardState {
  return emptyWhiteboardState();
}

function truncate(text: string, max: number): string {
  const s = text.replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Résumé LISIBLE pour l'observateur IA : le nombre d'idées et leur texte
 * (le brainstorming se juge sur la quantité/diversité produite). Jamais
 * d'évaluation ici. Pur, déterministe.
 */
export function describeWhiteboardForObservation(state: Json): string {
  const s = normalizeWhiteboardState(state);
  const notes = Object.values(s.notes).sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id));
  if (notes.length === 0) return "Tableau blanc vide : aucun post-it.";
  const byPlayer = notes.filter((n) => (n.author ?? "player") === "player").length;
  const lines: string[] = [
    `Tableau blanc : ${notes.length} post-it (dont ${byPlayer} du joueur).`,
    "Idées :",
  ];
  for (const n of notes.slice(0, 60)) {
    const who = n.author && n.author !== "player" ? ` (${n.author})` : "";
    lines.push(`- ${truncate(n.text, 120) || "(vide)"}${who}`);
  }
  if (notes.length > 60) lines.push(`… et ${notes.length - 60} autre(s).`);
  return lines.join("\n");
}

export const whiteboardSpec = {
  id: WHITEBOARD_TOOL_ID,
  title: "Tableau blanc",
  icon: "🗒️",
  initialState: initialWhiteboardState,
  describeForObservation: describeWhiteboardForObservation,
  applyOp: applyWhiteboardOp,
} as const;
