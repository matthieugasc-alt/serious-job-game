/**
 * serialize.ts — SNAPSHOT textuel EXHAUSTIF d'un artefact de Tool.
 *
 * Produit le contenu figé qui part en pièce jointe d'un mail (feature
 * « joindre un artefact à l'email »). Le snapshot est calculé À L'ENVOI,
 * côté UI, à partir de l'état vivant du Tool, puis voyage dans l'action
 * `mail_sent` comme du texte : ni le moteur ni les mécaniques n'ont
 * besoin de relire l'état d'un Tool (invariant d'indépendance préservé).
 *
 * Ce module vit dans app/workspace/ (couche UI) : il a le droit d'importer
 * les api pures des Tools. Il NE DOIT PAS être importé par app/mechanics/
 * ni par app/lib/engine/ (qui restent découplés des Tools).
 *
 * PUR / déterministe : aucune dépendance React, aucun I/O.
 */

import type { Json } from "@/app/lib/engine/mechanics";
import type { ArtifactKind } from "@/app/lib/engine/workspace";
import type { Block, Note } from "@/app/workspace/tools/bloc-notes/spec";
import { selectNote } from "@/app/workspace/tools/bloc-notes/api";
import type {
  Board,
  DecisionItem,
  DecisionObject,
  GraphEdge,
} from "@/app/workspace/tools/decision-engine/spec";
import {
  boardEdgesOf,
  boardItemsOf,
  getBoard,
  getDecisionById,
} from "@/app/workspace/tools/decision-engine/api";
import type { StickyNote } from "@/app/workspace/tools/whiteboard/spec";
import { selectNotes } from "@/app/workspace/tools/whiteboard/api";

// ─── Bloc-notes : note & mind map (même source de vérité) ───────────

function blockPrefix(kind: Block["kind"]): string {
  switch (kind) {
    case "heading1":
      return "# ";
    case "heading2":
      return "## ";
    case "bullet":
      return "- ";
    case "numbered":
      return "- ";
    case "quote":
      return "> ";
    case "separator":
      return "";
    default:
      return "";
  }
}

function renderBlocks(blocks: Block[] | undefined, depth: number, out: string[]): void {
  for (const b of blocks ?? []) {
    const indent = "  ".repeat(depth);
    if (b.kind === "separator") {
      out.push(`${indent}---`);
    } else if (b.kind === "todo") {
      out.push(`${indent}- [${b.checked ? "x" : " "}] ${b.text}`);
    } else {
      const text = b.text ?? "";
      out.push(`${indent}${blockPrefix(b.kind)}${text}`.trimEnd());
    }
    if ("children" in b) renderBlocks(b.children, depth + 1, out);
  }
}

function serializeNote(note: Note): string {
  const out: string[] = [`NOTE : ${note.title || "(sans titre)"}`];
  if (note.tags.length > 0) out.push(`Tags : ${note.tags.join(", ")}`);
  out.push("");
  renderBlocks(note.blocks, 0, out);
  return out.join("\n").trim();
}

// ─── Decision Engine : décision (ADR) ──────────────────────────────

function serializeDecision(d: DecisionObject): string {
  const out: string[] = [`DÉCISION : ${d.title || "(sans titre)"}  [${d.status}]`];
  if (d.context) out.push(`Contexte : ${d.context}`);
  if (d.final_decision) out.push(`Décision retenue : ${d.final_decision}`);
  if (d.justification) out.push(`Justification : ${d.justification}`);
  if (d.method) out.push(`Méthode : ${d.method}`);
  if (d.expected_impacts) out.push(`Impacts attendus : ${d.expected_impacts}`);

  if (d.options.length > 0) {
    out.push("", "Options :");
    for (const o of d.options) out.push(`  • ${o.label}${o.note ? ` — ${o.note}` : ""}`);
  }
  if (d.criteria.length > 0) {
    out.push("", "Critères (poids) :");
    for (const c of d.criteria) out.push(`  • ${c.label} (poids ${c.weight})${c.note ? ` — ${c.note}` : ""}`);
  }
  // Matrice de scores option × critère
  const scoredOptions = Object.keys(d.scores ?? {});
  if (scoredOptions.length > 0 && d.criteria.length > 0) {
    out.push("", "Scores :");
    for (const o of d.options) {
      const row = d.scores[o.id];
      if (!row) continue;
      const cells = d.criteria
        .map((c) => {
          const cell = row[c.id];
          if (!cell) return null;
          return `${c.label}=${cell.value}${cell.justification ? ` (${cell.justification})` : ""}`;
        })
        .filter(Boolean);
      if (cells.length > 0) out.push(`  ${o.label} : ${cells.join(" ; ")}`);
    }
  }
  if (d.hypotheses.length > 0) {
    out.push("", "Hypothèses :");
    for (const h of d.hypotheses)
      out.push(`  • [${h.status}]${h.confidence != null ? ` (confiance ${h.confidence})` : ""} ${h.text}`);
  }
  if (d.risks.length > 0) {
    out.push("", "Risques :");
    for (const r of d.risks) {
      const parts = [`  • ${r.label} — proba ${r.probability}/5, impact ${r.impact}/5 [${r.status}]`];
      if (r.prevention) parts.push(`prévenir: ${r.prevention}`);
      if (r.cure) parts.push(`guérir: ${r.cure}`);
      if (r.residual_probability != null || r.residual_impact != null)
        parts.push(
          `résiduel: proba ${r.residual_probability ?? "?"}/5, impact ${r.residual_impact ?? "?"}/5`,
        );
      if (!r.prevention && !r.cure && r.mitigation) parts.push(`mesure: ${r.mitigation}`);
      out.push(parts.join(" — "));
    }
  }
  return out.join("\n").trim();
}

// ─── Decision Engine : tableau (board, tous moteurs) ───────────────

function serializeItem(it: DecisionItem): string {
  const bits: string[] = [];
  if (it.zone_id) bits.push(`zone=${it.zone_id}`);
  if (it.status) bits.push(`statut=${it.status}`);
  if (it.tags.length > 0) bits.push(`tags=${it.tags.join("/")}`);
  const fieldEntries = Object.entries(it.fields ?? {}).filter(([, v]) => v !== null && v !== "");
  for (const [k, v] of fieldEntries) bits.push(`${k}=${v}`);
  if (it.x != null && it.y != null) bits.push(`pos=(${it.x.toFixed(2)},${it.y.toFixed(2)})`);
  const meta = bits.length > 0 ? ` [${bits.join(", ")}]` : "";
  return `  • ${it.label}${meta}${it.comment ? ` — ${it.comment}` : ""}`;
}

function serializeBoard(board: Board): string {
  const out: string[] = [`TABLEAU (${board.engine}) : ${board.title || "(sans titre)"}`];
  const items = boardItemsOf(board);
  if (items.length > 0) {
    out.push(`${items.length} élément(s) :`);
    for (const it of items) out.push(serializeItem(it));
  } else {
    out.push("(aucun élément)");
  }
  const edges: GraphEdge[] = boardEdgesOf(board);
  if (edges.length > 0) {
    const byId = new Map(items.map((i) => [i.id, i.label]));
    out.push("", "Liens :");
    for (const e of edges) {
      const arrow = e.directed === false ? "—" : "→";
      out.push(`  ${byId.get(e.from) ?? e.from} ${arrow} ${byId.get(e.to) ?? e.to}${e.label ? ` (${e.label})` : ""}`);
    }
  }
  return out.join("\n").trim();
}

// ─── Whiteboard : le tableau blanc entier (tous les post-it) ───────

function serializeWhiteboard(stickies: StickyNote[]): string {
  if (stickies.length === 0) return "TABLEAU BLANC : vide.";
  const ordered = [...stickies].sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id));
  const out: string[] = [`TABLEAU BLANC : ${ordered.length} post-it`];
  for (const s of ordered) {
    const author = s.author && s.author !== "player" ? ` (par ${s.author})` : "";
    out.push(`  • [${s.color}${author}] ${s.text.replace(/\s+/g, " ").trim()}`);
  }
  return out.join("\n");
}

// ─── Dispatcher ────────────────────────────────────────────────────

/**
 * Snapshot exhaustif d'un artefact, ou null s'il est introuvable dans
 * l'état fourni. `toolState` est l'état vivant du Tool (workspace
 * .toolStates[tool]) au moment de l'appel.
 */
export function serializeArtifact(
  tool: string,
  kind: ArtifactKind,
  toolState: Json | undefined,
  id: string,
): string | null {
  if (toolState == null) return null;
  switch (kind) {
    case "note":
    case "mindmap": {
      const note = selectNote(toolState, id);
      return note ? serializeNote(note) : null;
    }
    case "decision": {
      const d = getDecisionById(toolState, id);
      return d ? serializeDecision(d) : null;
    }
    case "board": {
      const b = getBoard(toolState, id);
      return b ? serializeBoard(b) : null;
    }
    case "whiteboard":
      return serializeWhiteboard(selectNotes(toolState));
    default:
      return null;
  }
}
