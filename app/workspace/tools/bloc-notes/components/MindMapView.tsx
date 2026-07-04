"use client";

/**
 * MindMapView — onglet « Mind map » du Bloc-notes.
 * Rend la hiérarchie de blocs d'UNE note comme carte mentale horizontale
 * (centre = titre → branches de niveau 1 → sous-branches). La donnée est
 * l'arbre de blocs lui-même : AUCUN modèle parallèle. Chaque édition
 * (texte, ajout d'idée) repasse par updateBlocks/renameNote → source de
 * vérité unique, synchronisée avec l'onglet Notes.
 *
 * Layout : tidy-tree — x = profondeur, y = position des feuilles, un
 * parent est centré sur ses enfants. Connecteurs = courbes SVG.
 */

import { useMemo, useState } from "react";
import type { WorkspaceAppProps } from "../../../apps/types";
import { renameNote, updateBlocks } from "../api";
import type { NotebookState } from "../spec";
import { asAnyBlocks, asBlocks, newBlock, removeBlockById, type AnyBlock, type BlockKind } from "./uiHelpers";

const COL_W = 210;
const ROW_H = 52;
const NODE_W = 168;
const NODE_H = 40;
const PAD = 24;
const BRANCH_COLORS = [
  "#6366f1",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];

/** Blocs qui deviennent des NŒUDS de la carte (structure). */
const STRUCTURAL = new Set<BlockKind>(["heading1", "heading2", "bullet", "numbered"]);
const isStructural = (k: BlockKind): boolean => STRUCTURAL.has(k);

/** Contenu non structurel rattaché à un nœud, visible au survol. */
interface DetailLine {
  kind: BlockKind;
  text: string;
  checked?: boolean;
}

interface MapNode {
  id: string;
  text: string;
  kind: BlockKind | "root";
  checked?: boolean;
  color: string;
  depth: number;
  children: MapNode[];
  /** Paragraphes / citations / todos rattachés — aperçu au survol. */
  details: DetailLine[];
  x: number;
  y: number;
}

// ─── Construction de l'arbre depuis les blocs ─────────────────────
// Seuls titres + puces/numéros deviennent des nœuds. Les autres blocs
// sont collectés comme « détails » du nœud parent (survol). Les nœuds
// structurels enfouis sous un bloc-détail remontent au même niveau.

function splitChildren(blocks: AnyBlock[], depth: number): { nodes: MapNode[]; details: DetailLine[] } {
  const nodes: MapNode[] = [];
  const details: DetailLine[] = [];
  for (const b of blocks) {
    if (b.kind === "separator") continue;
    if (isStructural(b.kind)) {
      const sub = splitChildren(b.children ?? [], depth + 1);
      nodes.push({
        id: b.id,
        text: b.text,
        kind: b.kind,
        checked: b.checked,
        color: "",
        depth,
        children: sub.nodes,
        details: sub.details,
        x: 0,
        y: 0,
      });
    } else {
      if (b.text.trim() || b.kind === "todo") details.push({ kind: b.kind, text: b.text, checked: b.checked });
      const sub = splitChildren(b.children ?? [], depth);
      nodes.push(...sub.nodes);
      details.push(...sub.details);
    }
  }
  return { nodes, details };
}

function paintBranch(n: MapNode, color: string): void {
  n.color = color;
  n.children.forEach((c) => paintBranch(c, color));
}

function buildTree(title: string, blocks: AnyBlock[]): MapNode {
  const top = splitChildren(blocks, 1);
  top.nodes.forEach((n, i) => paintBranch(n, BRANCH_COLORS[i % BRANCH_COLORS.length]));
  return {
    id: "__root__",
    text: title.trim() || "Sans titre",
    kind: "root",
    color: "#334155",
    depth: 0,
    children: top.nodes,
    details: top.details,
    x: 0,
    y: 0,
  };
}

function detailGlyph(d: DetailLine): string {
  if (d.kind === "todo") return d.checked ? "☑" : "☐";
  if (d.kind === "quote") return "❝";
  return "¶";
}

/** Assigne x (profondeur) et y (feuilles) ; parent centré sur ses enfants. */
function layout(root: MapNode, collapsed: Set<string>): { w: number; h: number } {
  let row = 0;
  let maxDepth = 0;
  const place = (n: MapNode): void => {
    n.x = n.depth * COL_W;
    maxDepth = Math.max(maxDepth, n.depth);
    const kids = collapsed.has(n.id) ? [] : n.children;
    if (kids.length === 0) {
      n.y = row * ROW_H;
      row += 1;
      return;
    }
    kids.forEach(place);
    n.y = (kids[0].y + kids[kids.length - 1].y) / 2;
  };
  place(root);
  return { w: maxDepth * COL_W + NODE_W + PAD * 2, h: Math.max(1, row) * ROW_H + PAD * 2 };
}

function flatten(root: MapNode, collapsed: Set<string>): MapNode[] {
  const out: MapNode[] = [];
  const walk = (n: MapNode) => {
    out.push(n);
    if (!collapsed.has(n.id)) n.children.forEach(walk);
  };
  walk(root);
  return out;
}

// ─── Mutations immuables sur l'arbre de blocs ─────────────────────

function setText(blocks: AnyBlock[], id: string, text: string): AnyBlock[] {
  return blocks.map((b) =>
    b.id === id
      ? { ...b, text }
      : b.children
        ? { ...b, children: setText(b.children, id, text) }
        : b,
  );
}

function addChildTo(blocks: AnyBlock[], id: string, child: AnyBlock): AnyBlock[] {
  return blocks.map((b) =>
    b.id === id
      ? { ...b, children: [...(b.children ?? []), child] }
      : b.children
        ? { ...b, children: addChildTo(b.children, id, child) }
        : b,
  );
}

/** Retrouve un bloc (sous-arbre) par id — référence, récursif. */
function findBlock(blocks: AnyBlock[], id: string): AnyBlock | null {
  for (const b of blocks) {
    if (b.id === id) return b;
    if (b.children) {
      const f = findBlock(b.children, id);
      if (f) return f;
    }
  }
  return null;
}

/** Le sous-arbre `node` contient-il `id` (lui-même compris) ? Anti-cycle. */
function subtreeHas(node: AnyBlock, id: string): boolean {
  if (node.id === id) return true;
  return (node.children ?? []).some((c) => subtreeHas(c, id));
}

// ─── Composant ────────────────────────────────────────────────────

interface Props {
  state: NotebookState;
  initialNoteId: string | null;
  dispatch: WorkspaceAppProps["dispatch"];
  onOpenNote: (noteId: string) => void;
}

export function MindMapView({ state, initialNoteId, dispatch, onOpenNote }: Props) {
  const [override, setOverride] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [scale, setScale] = useState(1);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);

  const activeId = override && state.notes[override] ? override : initialNoteId;
  const note = activeId ? state.notes[activeId] : null;

  const { root, size } = useMemo(() => {
    if (!note) return { root: null, size: { w: 0, h: 0 } };
    const tree = buildTree(note.title, asAnyBlocks(note.blocks));
    const s = layout(tree, collapsed);
    return { root: tree, size: s };
  }, [note, collapsed]);

  const notes = state.order.map((id) => state.notes[id]).filter(Boolean);

  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const commitEdit = () => {
    if (!note || !editingId) return;
    const value = draft.trim();
    if (editingId === "__root__") dispatch(renameNote(note.id, value));
    else dispatch(updateBlocks(note.id, asBlocks(setText(asAnyBlocks(note.blocks), editingId, value))));
    setEditingId(null);
  };

  /** Un nœud peut-il accueillir le nœud glissé ? (pas soi-même, pas un descendant). */
  const canDropOn = (targetId: string): boolean => {
    if (!note || !dragId || dragId === "__root__" || dragId === targetId) return false;
    const moved = findBlock(asAnyBlocks(note.blocks), dragId);
    if (!moved) return false;
    if (targetId !== "__root__" && subtreeHas(moved, targetId)) return false;
    return true;
  };

  /** Reparente le sous-arbre glissé sous la cible (racine = niveau 1). */
  const reparent = (targetId: string) => {
    if (!note || !dragId || !canDropOn(targetId)) return;
    const blocks = asAnyBlocks(note.blocks);
    const moved = findBlock(blocks, dragId);
    if (!moved) return;
    const without = removeBlockById(blocks, dragId);
    const next = targetId === "__root__" ? [...without, moved] : addChildTo(without, targetId, moved);
    dispatch(updateBlocks(note.id, asBlocks(next)));
    setCollapsed((prev) => {
      const s = new Set(prev);
      s.delete(targetId);
      return s;
    });
  };

  const addChild = (parentId: string) => {
    if (!note) return;
    const child = newBlock("bullet", "Nouvelle idée");
    const next =
      parentId === "__root__"
        ? [...asAnyBlocks(note.blocks), child]
        : addChildTo(asAnyBlocks(note.blocks), parentId, child);
    dispatch(updateBlocks(note.id, asBlocks(next)));
    setCollapsed((prev) => {
      const s = new Set(prev);
      s.delete(parentId);
      return s;
    });
  };

  const nodes = root ? flatten(root, collapsed) : [];
  const edges: { from: MapNode; to: MapNode }[] = [];
  for (const n of nodes) {
    if (collapsed.has(n.id)) continue;
    for (const c of n.children) edges.push({ from: n, to: c });
  }

  const nodeStyle = (n: MapNode): React.CSSProperties => {
    if (n.kind === "root") return { background: n.color, color: "#fff", borderColor: n.color };
    if (n.kind === "heading1" || n.kind === "heading2")
      return { background: "#fff", color: n.color, borderColor: n.color, fontWeight: 700 };
    return { background: "#fff", color: "#1f2937", borderColor: n.color };
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-50/60">
      {/* Barre d'outils : sélecteur de note + zoom. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-4 py-2.5">
        <span aria-hidden className="text-base leading-none">🧠</span>
        <select
          aria-label="Note à cartographier"
          className="max-w-[240px] rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-900 focus:border-indigo-300 focus:bg-white focus:outline-none"
          value={activeId ?? ""}
          onChange={(e) => setOverride(e.target.value || null)}
        >
          {notes.length === 0 && <option value="">Aucune note</option>}
          {notes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.title.trim() || "Sans titre"}
            </option>
          ))}
        </select>
        {note && (
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-[11px] font-semibold text-gray-500 transition hover:bg-gray-50 hover:text-indigo-700"
            title="Ouvrir dans l'éditeur"
            onClick={() => onOpenNote(note.id)}
          >
            ✎ Éditer
          </button>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Dézoomer"
            className="rounded-md border border-gray-200 px-2 py-0.5 text-sm text-gray-600 transition hover:bg-gray-50"
            onClick={() => setScale((s) => Math.max(0.5, Math.round((s - 0.1) * 10) / 10))}
          >
            −
          </button>
          <span className="w-10 text-center text-[11px] tabular-nums text-gray-500">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            aria-label="Zoomer"
            className="rounded-md border border-gray-200 px-2 py-0.5 text-sm text-gray-600 transition hover:bg-gray-50"
            onClick={() => setScale((s) => Math.min(1.6, Math.round((s + 0.1) * 10) / 10))}
          >
            +
          </button>
        </div>
      </div>

      {/* Carte. */}
      {!note ? (
        <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
          Sélectionnez une note à cartographier.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-2">
          <div
            className="relative"
            style={{ width: size.w * scale, height: size.h * scale }}
          >
            <div
              className="absolute left-0 top-0"
              style={{ width: size.w, height: size.h, transform: `scale(${scale})`, transformOrigin: "top left" }}
            >
              <svg
                className="pointer-events-none absolute left-0 top-0"
                width={size.w}
                height={size.h}
                aria-hidden
              >
                {edges.map(({ from, to }) => {
                  const x1 = PAD + from.x + NODE_W;
                  const y1 = PAD + from.y + NODE_H / 2;
                  const x2 = PAD + to.x;
                  const y2 = PAD + to.y + NODE_H / 2;
                  const mx = (x1 + x2) / 2;
                  return (
                    <path
                      key={`${from.id}-${to.id}`}
                      d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      stroke={to.color}
                      strokeWidth={2}
                      strokeOpacity={0.5}
                    />
                  );
                })}
              </svg>

              {nodes.map((n) => {
                const hidden = collapsed.has(n.id);
                const line = n.text.split("\n")[0];
                const isDrag = dragId === n.id;
                const isDrop = dropId === n.id && canDropOn(n.id);
                return (
                  <div
                    key={n.id}
                    draggable={editingId !== n.id && n.kind !== "root"}
                    onDragStart={(e) => {
                      if (n.kind === "root") {
                        e.preventDefault();
                        return;
                      }
                      e.dataTransfer.effectAllowed = "move";
                      setDragId(n.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setDropId(null);
                    }}
                    onDragOver={(e) => {
                      if (canDropOn(n.id)) {
                        e.preventDefault();
                        if (dropId !== n.id) setDropId(n.id);
                      }
                    }}
                    onDragLeave={() => setDropId((d) => (d === n.id ? null : d))}
                    onDrop={(e) => {
                      e.preventDefault();
                      reparent(n.id);
                      setDragId(null);
                      setDropId(null);
                    }}
                    className={`group absolute flex items-center rounded-lg border px-2.5 text-xs shadow-sm transition ${
                      n.kind === "root" ? "" : "cursor-grab active:cursor-grabbing"
                    } ${isDrag ? "opacity-40" : ""} ${isDrop ? "ring-2 ring-indigo-400 ring-offset-1" : ""}`}
                    style={{
                      left: PAD + n.x,
                      top: PAD + n.y,
                      width: NODE_W,
                      minHeight: NODE_H,
                      ...nodeStyle(n),
                    }}
                    title={n.text}
                  >
                    {n.kind === "todo" && (
                      <span aria-hidden className="mr-1 shrink-0">
                        {n.checked ? "☑" : "☐"}
                      </span>
                    )}
                    {editingId === n.id ? (
                      <textarea
                        autoFocus
                        className="min-w-0 flex-1 resize-none bg-transparent py-1.5 text-xs outline-none"
                        rows={2}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            commitEdit();
                          } else if (e.key === "Escape") {
                            setEditingId(null);
                          }
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate py-2 text-left"
                        onDoubleClick={() => {
                          setEditingId(n.id);
                          setDraft(n.text);
                        }}
                        title="Double-clic pour éditer"
                      >
                        {line || <span className="opacity-40">vide</span>}
                      </button>
                    )}

                    {/* Indicateur de contenu rattaché (survol pour lire). */}
                    {n.details.length > 0 && (
                      <span
                        className="ml-1 shrink-0 rounded px-1 text-[9px] font-semibold leading-4"
                        style={{
                          background: n.kind === "root" ? "rgba(255,255,255,.2)" : "rgba(0,0,0,.05)",
                          color: n.kind === "root" ? "#fff" : n.color,
                        }}
                        title={`${n.details.length} élément(s) rattaché(s)`}
                      >
                        ≡{n.details.length}
                      </span>
                    )}

                    {/* Aperçu du contenu non structurel au survol. */}
                    {n.details.length > 0 && (
                      <div className="absolute left-0 top-full z-20 mt-1 hidden max-h-48 w-64 overflow-auto rounded-lg border border-gray-200 bg-white p-2 text-left text-[11px] leading-snug text-gray-600 shadow-xl group-hover:block">
                        {n.details.map((d, i) => (
                          <div key={`${n.id}-d${i}`} className="flex gap-1.5 py-0.5">
                            <span aria-hidden className="shrink-0 opacity-60">
                              {detailGlyph(d)}
                            </span>
                            <span className={d.kind === "quote" ? "italic text-gray-500" : ""}>
                              {d.text.trim() || <span className="opacity-40">(vide)</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Ajouter une idée enfant. */}
                    <button
                      type="button"
                      aria-label="Ajouter une idée"
                      className="ml-1 hidden h-5 w-5 shrink-0 items-center justify-center rounded-full text-[13px] leading-none opacity-70 transition hover:opacity-100 group-hover:flex"
                      style={{ background: n.kind === "root" ? "rgba(255,255,255,.25)" : "#f1f5f9", color: n.kind === "root" ? "#fff" : n.color }}
                      title="Ajouter une branche"
                      onClick={() => addChild(n.id)}
                    >
                      +
                    </button>

                    {/* Plier/déplier si enfants. */}
                    {n.children.length > 0 && (
                      <button
                        type="button"
                        aria-label={hidden ? "Déplier" : "Replier"}
                        className="absolute -right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border bg-white text-[10px] font-bold shadow-sm"
                        style={{ borderColor: n.color, color: n.color }}
                        onClick={() => toggleCollapse(n.id)}
                      >
                        {hidden ? n.children.length : "–"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
