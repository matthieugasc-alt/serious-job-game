/**
 * Spec PURE du Tool bibliotheque (Gestionnaire Documentaire Universel) —
 * node-safe, importable par le moteur et les tests.
 * Réf : docs/TOOL_GESTIONNAIRE_DOC.md (contrat FIGÉ, §3 pour le modèle).
 * Modèle architectural : docs/TOOL_BLOC_NOTES.md (mêmes règles, même
 * pattern tool_op / reducer pur / API publique / garde-fous CI).
 *
 * Règles de pureté (garde-fous testés) :
 *   - AUCUN React, AUCUN import moteur hors types Json ;
 *   - ne connaît NI le scénario, NI les mécaniques, NI le moteur ;
 *   - types = contrat §3 (state sérialisable, stocké dans
 *     workspace.toolStates["bibliotheque"], JAMAIS réinitialisé).
 */

import type { Json, JsonObject } from "@/app/lib/engine/mechanics";
import { applyLibraryOp, emptyLibraryState, normalizeLibraryState } from "./model";

export const BIBLIOTHEQUE_TOOL_ID = "bibliotheque";

// ─── Modèle de données (contrat §3) ───────────────────────────────
// Type aliases (pas d'interfaces) : l'index signature implicite les rend
// assignables à Json — l'état vit tel quel dans toolStates (sérialisable).

export type EntryId = string;
export type FolderId = string;
export type AnnotationId = string;
export type BookmarkId = string;

/** Snapshot horodaté d'un mail archivé (le contenu ne vit plus dans le moteur). */
export type ArchivedMailSnapshot = {
  from: string;
  to: string[];
  subject: string;
  body: string;
  at: number;
};

/** Snapshot horodaté d'un fil Teams archivé (messages figés). */
export type ArchivedThreadSnapshot = {
  title: string;
  messages: { from: string; at: number; content: string }[];
};

/**
 * Qu'est-ce que ce document ? (contrat §3, `source.kind`).
 *   - scenario_doc  : le contenu vit dans scenario.documents (résolu par
 *     l'hôte via un callback pur, le Tool ne connaît pas le scénario) ;
 *   - archived_mail : entré par le geste « Ajouter au dossier » depuis Mail ;
 *   - archived_messages : idem depuis Messages (fil ou sélection).
 */
export type EntrySource =
  | { kind: "scenario_doc"; document_id: string }
  | { kind: "archived_mail"; mail_id: string; snapshot: ArchivedMailSnapshot }
  | { kind: "archived_messages"; thread_id: string; snapshot: ArchivedThreadSnapshot };

export const ENTRY_SOURCE_KINDS = ["scenario_doc", "archived_mail", "archived_messages"] as const;
export type EntrySourceKind = (typeof ENTRY_SOURCE_KINDS)[number];

/** Travail du joueur SUR le document — vit dans l'état du Tool, jamais
 *  dans le document immuable du scénario. */
export type Annotation =
  | {
      id: AnnotationId;
      kind: "highlight";
      anchor: string;
      excerpt: string;
      color?: string;
      at: number;
    }
  | { id: AnnotationId; kind: "comment"; anchor?: string; excerpt?: string; text: string; at: number };

export const ANNOTATION_KINDS = ["highlight", "comment"] as const;
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];

export type Bookmark = { id: BookmarkId; label: string; anchor: string };

/** Lien navigable document ↔ document. */
export type EntryLink = { entry_id: EntryId; label?: string };

export type DocEntry = {
  id: EntryId;
  title: string;
  source: EntrySource;
  folder_id?: FolderId;
  tags: string[];
  pinned: boolean;
  favorite: boolean;
  added_at: number;
  last_opened_at?: number;
  /** Liées AU document, pour toujours. */
  annotations: Annotation[];
  bookmarks: Bookmark[];
  links: EntryLink[];
};

export type Folder = { id: FolderId; name: string; order: number };

export const DESK_LAYOUTS = ["single", "split-v", "split-h", "grid"] as const;
export type DeskLayout = (typeof DESK_LAYOUTS)[number];

export type DeskState = {
  /** Fenêtres ouvertes (ordre = disposition courante). */
  windows: { entry_id: EntryId; order: number }[];
  layout: DeskLayout;
  /** Lecture parallèle (comparaison côte à côte). */
  compare?: [EntryId, EntryId];
  // V2 vue Bureau : positions?: Record<EntryId, {x; y; pile_id?}> — réservé.
};

export type DeskId = string;

/** Bureau personnalisé : une « boîte » nommée dans laquelle le joueur
 *  dépose des documents ; un clic les rouvre tous ensemble. */
export type SavedDesk = {
  id: DeskId;
  name: string;
  entry_ids: EntryId[];
  created_at: number;
};

export type LibraryState = {
  entries: Record<EntryId, DocEntry>;
  folders: Record<FolderId, Folder>;
  desk: DeskState;
  /** Bureaux personnalisés (collections de documents ouvrables en un clic). */
  desks: Record<DeskId, SavedDesk>;
};

// ─── Contrat Tool (initialState / describeForObservation / applyOp) ─

export function initialLibraryState(_config: JsonObject): LibraryState {
  return emptyLibraryState();
}

const SOURCE_LABELS: Record<EntrySourceKind, string> = {
  scenario_doc: "document",
  archived_mail: "mail archivé",
  archived_messages: "fil archivé",
};

function truncate(text: string, max: number): string {
  const single = text.replace(/\s+/g, " ").trim();
  return single.length > max ? `${single.slice(0, max - 1)}…` : single;
}

/**
 * Résumé LISIBLE du dossier documentaire pour l'observateur IA : entrées
 * par type/dossier/tags, épingles, favoris, fenêtres ouvertes. Jamais de
 * logique d'évaluation ici — l'IA observe, le moteur décide. Pur :
 * n'altère jamais l'état, déterministe.
 */
export function describeLibraryForObservation(state: Json): string {
  const s = normalizeLibraryState(state);
  const entries = Object.values(s.entries);
  if (entries.length === 0) {
    return "Dossier documentaire vide : aucun document.";
  }

  const byKind: Record<EntrySourceKind, number> = {
    scenario_doc: 0,
    archived_mail: 0,
    archived_messages: 0,
  };
  for (const e of entries) byKind[e.source.kind]++;
  const kindParts = ENTRY_SOURCE_KINDS.filter((k) => byKind[k] > 0).map(
    (k) => `${byKind[k]} ${SOURCE_LABELS[k]}${byKind[k] > 1 ? "s" : ""}`,
  );

  const lines: string[] = [
    `Dossier documentaire : ${entries.length} document(s) — ${kindParts.join(", ")}.`,
  ];

  const sorted = [...entries].sort(
    (a, b) => b.added_at - a.added_at || a.id.localeCompare(b.id),
  );
  lines.push("Documents :");
  for (const e of sorted.slice(0, 20)) {
    const tags = e.tags.length > 0 ? ` [tags : ${e.tags.join(", ")}]` : "";
    const folder = e.folder_id && s.folders[e.folder_id] ? ` {${s.folders[e.folder_id].name}}` : "";
    const flags = [e.pinned ? "épinglé" : "", e.favorite ? "favori" : ""].filter(Boolean).join(", ");
    const flagStr = flags ? ` (${flags})` : "";
    const notes = e.annotations.length > 0 ? ` · ${e.annotations.length} annotation(s)` : "";
    lines.push(`- « ${truncate(e.title, 80) || "(sans titre)"} »${folder}${tags}${flagStr}${notes}`);
  }
  if (sorted.length > 20) lines.push(`… et ${sorted.length - 20} autre(s) document(s).`);

  const folders = Object.values(s.folders).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  if (folders.length > 0) {
    lines.push(`Dossiers : ${folders.map((f) => f.name).join(", ")}.`);
  }

  const open = s.desk.windows.length;
  if (open > 0) {
    const cmp = s.desk.compare ? ", comparaison active" : "";
    lines.push(`Bureau : ${open} fenêtre(s) ouverte(s), disposition ${s.desk.layout}${cmp}.`);
  }

  return lines.join("\n");
}

/**
 * La spec enregistrée dans le TOOL_REGISTRY. `applyOp` est LE reducer
 * pur du dossier (model.ts), câblé au moteur par le WorkspacePlayer via
 * ReducerOptions.toolAppliers — le moteur reste ignorant des ops.
 */
export const bibliothequeSpec = {
  id: BIBLIOTHEQUE_TOOL_ID,
  title: "Gestionnaire documentaire",
  icon: "🗂️",
  initialState: initialLibraryState,
  describeForObservation: describeLibraryForObservation,
  applyOp: applyLibraryOp,
} as const;
