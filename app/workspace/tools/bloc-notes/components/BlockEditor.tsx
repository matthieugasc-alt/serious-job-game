"use client";

/**
 * BlockEditor — éditeur de blocs FLUIDE du Bloc-notes (référence Apple
 * Notes / Notion épuré). Frappe débouncée (500 ms → op update_blocks
 * compacte), structure immédiate :
 *   Entrée = nouveau bloc (scission au caret), Backspace sur bloc vide =
 *   suppression, Tab/Shift-Tab = hiérarchie (children), raccourcis
 *   markdown en début de bloc (`- `, `1. `, `[] `, `# `, `## `, `---`),
 *   Cmd/Ctrl+B/I + boutons contextuels (gras/italique/surlignage),
 *   drag-and-drop de blocs (HTML5), todos cochables (op toggle_todo).
 * Toutes les mutations passent par les constructeurs d'api.ts.
 */

import { useEffect, useRef, useState } from "react";
import type { WorkspaceAction } from "@/app/lib/engine/workspace";
import { createTask, toggleTodo, updateBlocks } from "../api";
import { createDecision, openPreset } from "@/app/workspace/tools/decision-engine/api";
import type { Block } from "../spec";
import {
  asAnyBlocks,
  asBlocks,
  BLOCK_MOVE_MIME,
  newBlock,
  uid,
  type AnyBlock,
  type BlockKind,
} from "./uiHelpers";

type MarkKey = "bold" | "italic" | "underline" | "strikethrough" | "highlight";

const TYPING_DEBOUNCE_MS = 500;

// ─── Opérations pures sur l'arbre de blocs ────────────────────────

const clone = (b: AnyBlock[]): AnyBlock[] => JSON.parse(JSON.stringify(b)) as AnyBlock[];

/** Empreinte structurelle (ids ignorés) — pour comparer un arbre local à
 *  l'état stocké sans se laisser piéger par les ids éphémères. */
const stripIds = (b: AnyBlock[]): string => JSON.stringify(b, (k, v) => (k === "id" ? undefined : v));

function findPath(list: AnyBlock[], id: string, base: number[] = []): number[] | null {
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return [...base, i];
    const inChild = list[i].children
      ? findPath(list[i].children!, id, [...base, i])
      : null;
    if (inChild) return inChild;
  }
  return null;
}

/** Liste (children) contenant l'index final du chemin. */
function listAt(root: AnyBlock[], path: number[]): AnyBlock[] {
  let list = root;
  for (let i = 0; i < path.length - 1; i++) {
    const b = list[path[i]];
    if (!b.children) b.children = [];
    list = b.children;
  }
  return list;
}

const getAt = (root: AnyBlock[], path: number[]): AnyBlock =>
  listAt(root, path)[path[path.length - 1]];

const removeAt = (root: AnyBlock[], path: number[]): AnyBlock =>
  listAt(root, path).splice(path[path.length - 1], 1)[0];

function insertAt(root: AnyBlock[], path: number[], ...blocks: AnyBlock[]) {
  listAt(root, path).splice(path[path.length - 1], 0, ...blocks);
}

const siblingAfter = (path: number[]): number[] => [
  ...path.slice(0, -1),
  path[path.length - 1] + 1,
];

function isDescendant(root: AnyBlock[], ancestorId: string, id: string): boolean {
  const p = findPath(root, ancestorId);
  if (!p) return false;
  const inside = getAt(root, p).children ?? [];
  return findPath(inside, id) !== null;
}

interface Row {
  block: AnyBlock;
  depth: number;
  number?: number;
}

function flatten(list: AnyBlock[], depth = 0, rows: Row[] = []): Row[] {
  let num = 0;
  for (const b of list) {
    num = b.kind === "numbered" ? num + 1 : 0;
    rows.push({ block: b, depth, number: b.kind === "numbered" ? num : undefined });
    if (b.children?.length) flatten(b.children, depth + 1, rows);
  }
  return rows;
}

const ensureOne = (b: AnyBlock[]): AnyBlock[] => (b.length > 0 ? b : [newBlock()]);

// Raccourcis markdown en début de bloc — l'ordre compte (## avant #).
const MD_SHORTCUTS: [string, BlockKind][] = [
  ["- ", "bullet"],
  ["* ", "bullet"],
  ["1. ", "numbered"],
  ["[] ", "todo"],
  ["[ ] ", "todo"],
  ["## ", "heading2"],
  ["# ", "heading1"],
];

// ─── Composant ────────────────────────────────────────────────────

interface Props {
  noteId: string;
  blocks: Block[];
  dispatch: (action: WorkspaceAction) => void;
}

export function BlockEditor({ noteId, blocks, dispatch }: Props) {
  const [tree, setTree] = useState<AnyBlock[]>(() => ensureOne(asAnyBlocks(blocks)));
  const treeRef = useRef(tree);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const areaRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const pendingFocus = useRef<{ id: string; caret: number } | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; before: boolean } | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  // Changement de note → repartir de l'état stocké, purger le débounce.
  useEffect(() => {
    setTree(ensureOne(asAnyBlocks(blocks)));
    treeRef.current = ensureOne(asAnyBlocks(blocks));
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  // Réconciliation avec une modif EXTERNE des blocs (ex. un bloc déplacé
  // vers une AUTRE note) : si aucune frappe n'est en attente et que l'état
  // stocké diffère de l'arbre local, on resynchronise. Le bloc déplacé
  // disparaît alors IMMÉDIATEMENT de la note source (fin de la duplication
  // au re-drag).
  // GARDE-FOUS anti-écrasement de la saisie : `normalizeNotebookState`
  // recrée un tableau `blocks` neuf à CHAQUE rendu parent (tick d'horloge,
  // renommage du titre…), donc cet effet se redéclenche souvent. On ne
  // resynchronise JAMAIS pendant que l'utilisateur édite cette note :
  //   1) frappe en attente (débounce actif), ou
  //   2) un textarea de cette note a le focus (édition en cours).
  useEffect(() => {
    if (timer.current) return;
    const active = document.activeElement;
    for (const el of areaRefs.current.values()) {
      if (el === active) return; // édition en cours → l'arbre local prime
    }
    const incoming = ensureOne(asAnyBlocks(blocks));
    if (stripIds(incoming) !== stripIds(treeRef.current)) {
      treeRef.current = incoming;
      setTree(incoming);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks]);

  // Démontage / bascule : flush du texte en attente (rien ne se perd).
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        dispatch(updateBlocks(noteId, asBlocks(treeRef.current)));
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  /** Toute mutation passe ici : structure = immédiat, frappe = débouncé. */
  const commit = (next: AnyBlock[], immediate: boolean) => {
    treeRef.current = next;
    setTree(next);
    if (timer.current) clearTimeout(timer.current);
    if (immediate) {
      timer.current = null;
      dispatch(updateBlocks(noteId, asBlocks(next)));
    } else {
      timer.current = setTimeout(() => {
        timer.current = null;
        dispatch(updateBlocks(noteId, asBlocks(next)));
      }, TYPING_DEBOUNCE_MS);
    }
  };

  const focusBlock = (id: string, caret: number) => {
    pendingFocus.current = { id, caret };
  };

  useEffect(() => {
    const f = pendingFocus.current;
    if (!f) return;
    const ta = areaRefs.current.get(f.id);
    if (ta) {
      ta.focus();
      const caret = Math.min(f.caret, ta.value.length);
      ta.setSelectionRange(caret, caret);
    }
    pendingFocus.current = null;
  });

  const autosize = (ta: HTMLTextAreaElement) => {
    ta.style.height = "0px";
    ta.style.height = `${ta.scrollHeight}px`;
  };

  // ─── Mutations ──────────────────────────────────────────────────

  const onTextChange = (id: string, value: string) => {
    const next = clone(treeRef.current);
    const path = findPath(next, id);
    if (!path) return;
    const b = getAt(next, path);

    // `---` seul → séparateur + nouveau paragraphe dessous.
    if (b.kind === "paragraph" && value.trim() === "---") {
      b.kind = "separator";
      b.text = "";
      const nb = newBlock();
      insertAt(next, siblingAfter(path), nb);
      commit(next, true);
      focusBlock(nb.id, 0);
      return;
    }

    // Raccourcis markdown — uniquement depuis un paragraphe.
    if (b.kind === "paragraph") {
      for (const [prefix, kind] of MD_SHORTCUTS) {
        if (value.startsWith(prefix)) {
          b.kind = kind;
          b.text = value.slice(prefix.length);
          if (kind === "todo") b.checked = false;
          commit(next, true);
          focusBlock(id, 0);
          return;
        }
      }
    }

    b.text = value;
    commit(next, false);
  };

  const splitBlock = (id: string, caret: number) => {
    const next = clone(treeRef.current);
    const path = findPath(next, id);
    if (!path) return;
    const b = getAt(next, path);
    // Bloc de liste vide → on sort de la liste (retour paragraphe).
    if ((b.kind === "bullet" || b.kind === "numbered" || b.kind === "todo") && b.text.trim() === "") {
      b.kind = "paragraph";
      delete b.checked;
      commit(next, true);
      focusBlock(id, 0);
      return;
    }
    const after = b.text.slice(caret);
    b.text = b.text.slice(0, caret);
    const kind: BlockKind =
      b.kind === "bullet" || b.kind === "numbered" || b.kind === "todo" ? b.kind : "paragraph";
    const nb = newBlock(kind, after);
    insertAt(next, siblingAfter(path), nb);
    commit(next, true);
    focusBlock(nb.id, 0);
  };

  const deleteBlock = (id: string) => {
    const flatBefore = flatten(treeRef.current);
    const idx = flatBefore.findIndex((r) => r.block.id === id);
    const next = clone(treeRef.current);
    const path = findPath(next, id);
    if (!path) return;
    const removed = removeAt(next, path);
    // Ses enfants remontent à sa place — rien ne disparaît en silence.
    if (removed.children?.length) insertAt(next, path, ...removed.children);
    if (next.length === 0) next.push(newBlock());
    commit(next, true);
    const prev = flatBefore[idx - 1];
    if (prev) focusBlock(prev.block.id, prev.block.text.length);
    else focusBlock(next[0].id, 0);
  };

  const demoteToParagraph = (id: string) => {
    const next = clone(treeRef.current);
    const path = findPath(next, id);
    if (!path) return;
    const b = getAt(next, path);
    b.kind = "paragraph";
    delete b.checked;
    commit(next, true);
    focusBlock(id, 0);
  };

  const indent = (id: string, caret: number) => {
    const next = clone(treeRef.current);
    const path = findPath(next, id);
    if (!path || path[path.length - 1] === 0) return; // pas de frère au-dessus
    const b = removeAt(next, path);
    const prevSibling = getAt(next, [...path.slice(0, -1), path[path.length - 1] - 1]);
    prevSibling.children = [...(prevSibling.children ?? []), b];
    commit(next, true);
    focusBlock(id, caret);
  };

  const outdent = (id: string, caret: number) => {
    const next = clone(treeRef.current);
    const path = findPath(next, id);
    if (!path || path.length < 2) return; // déjà à la racine
    const b = removeAt(next, path);
    insertAt(next, siblingAfter(path.slice(0, -1)), b);
    commit(next, true);
    focusBlock(id, caret);
  };

  const toggleMark = (id: string, key: MarkKey) => {
    const next = clone(treeRef.current);
    const path = findPath(next, id);
    if (!path) return;
    const b = getAt(next, path);
    const marks = { ...(b.marks ?? {}) };
    if (key === "highlight") {
      if (marks.highlight) delete marks.highlight;
      else marks.highlight = "yellow";
    } else {
      marks[key] = !marks[key];
      if (!marks[key]) delete marks[key];
    }
    b.marks = Object.keys(marks).length > 0 ? marks : undefined;
    commit(next, true);
    focusBlock(id, areaRefs.current.get(id)?.selectionStart ?? b.text.length);
  };

  // ── Transformer / manipuler une ligne (via le menu de ligne) ──────
  const convertKind = (id: string, kind: BlockKind) => {
    const next = clone(treeRef.current);
    const path = findPath(next, id);
    if (!path) return;
    const b = getAt(next, path);
    b.kind = kind;
    if (kind === "todo") b.checked = false;
    else delete b.checked;
    if (kind === "separator") b.text = "";
    commit(next, true);
    setMenuFor(null);
  };

  const regenIds = (b: AnyBlock): AnyBlock => ({
    ...b,
    id: uid("blk"),
    children: b.children ? b.children.map(regenIds) : undefined,
  });

  const duplicateBlock = (id: string) => {
    const next = clone(treeRef.current);
    const path = findPath(next, id);
    if (!path) return;
    insertAt(next, siblingAfter(path), regenIds(getAt(next, path)));
    commit(next, true);
    setMenuFor(null);
  };

  const moveLine = (id: string, dir: -1 | 1) => {
    const next = clone(treeRef.current);
    const path = findPath(next, id);
    if (!path) return;
    const list = listAt(next, path);
    const i = path[path.length - 1];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    commit(next, true);
  };

  const blockTextOf = (id: string): string => {
    const p = findPath(treeRef.current, id);
    return p ? getAt(treeRef.current, p).text.trim() : "";
  };

  /** Ligne → tâche du Bloc-notes (Kanban / Base). */
  const lineToTask = (id: string) => {
    const text = blockTextOf(id);
    if (text) dispatch(createTask({ title: text }));
    setMenuFor(null);
  };

  /** Ligne → nouvelle décision dans le Decision Engine (façade publique). */
  const lineToDecision = (id: string) => {
    const text = blockTextOf(id);
    if (text) dispatch(createDecision({ title: text }, { id: uid("dec") }));
    setMenuFor(null);
  };

  /** Ligne → nouveau tableau (Kanban par défaut) dans le Decision Engine. */
  const lineToBoard = (id: string) => {
    const text = blockTextOf(id);
    if (text) {
      const action = openPreset("kanban.board", { title: text }, { id: uid("board") });
      if (action) dispatch(action);
    }
    setMenuFor(null);
  };

  /** Cocher/décocher : op dédiée toggle_todo (audit fin), jamais dupliquée
   *  dans update_blocks — le texte en attente est flushé AVANT. */
  const onToggleTodo = (id: string) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      dispatch(updateBlocks(noteId, asBlocks(treeRef.current)));
    }
    dispatch(toggleTodo(noteId, id));
    const next = clone(treeRef.current);
    const path = findPath(next, id);
    if (!path) return;
    const b = getAt(next, path);
    b.checked = !b.checked;
    treeRef.current = next;
    setTree(next);
  };

  const moveBlock = (dragId: string, targetId: string, before: boolean) => {
    if (dragId === targetId || isDescendant(treeRef.current, dragId, targetId)) return;
    const next = clone(treeRef.current);
    const from = findPath(next, dragId);
    if (!from) return;
    const b = removeAt(next, from);
    const to = findPath(next, targetId);
    if (!to) return;
    insertAt(next, before ? to : siblingAfter(to), b);
    commit(next, true);
  };

  const appendParagraph = () => {
    const last = treeRef.current[treeRef.current.length - 1];
    if (last && last.kind === "paragraph" && last.text === "") {
      focusBlock(last.id, 0);
      setTree([...treeRef.current]);
      return;
    }
    const nb = newBlock();
    commit([...clone(treeRef.current), nb], true);
    focusBlock(nb.id, 0);
  };

  // ─── Rendu ──────────────────────────────────────────────────────

  const rows = flatten(tree);

  const textClass = (b: AnyBlock): string => {
    const base =
      b.kind === "heading1"
        ? "text-xl font-bold text-gray-900"
        : b.kind === "heading2"
          ? "text-lg font-semibold text-gray-900"
          : b.kind === "quote"
            ? "italic text-gray-400"
            : "text-[15px] text-gray-800";
    const marks = `${b.marks?.bold ? " font-semibold" : ""}${b.marks?.italic ? " italic" : ""}${
      b.marks?.underline ? " underline" : ""
    }${b.marks?.strikethrough ? " line-through" : ""}${b.marks?.highlight ? " bg-yellow-100 rounded" : ""}`;
    return base + marks;
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-2" onDragLeave={() => setDropTarget(null)}>
        {rows.map(({ block: b, depth, number }) => {
          const isDrop = dropTarget?.id === b.id;
          return (
            <div
              key={b.id}
              style={{ marginLeft: depth * 24 }}
              className={`group relative flex items-start gap-1 rounded-md py-px transition ${
                isDrop && dropTarget?.before ? "border-t-2 border-indigo-400" : ""
              } ${isDrop && !dropTarget?.before ? "border-b-2 border-indigo-400" : ""}`}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes("text/bloc-notes-block")) return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                setDropTarget({ id: b.id, before: e.clientY < r.top + r.height / 2 });
              }}
              onDrop={(e) => {
                const dragId = e.dataTransfer.getData("text/bloc-notes-block");
                if (dragId) {
                  e.preventDefault();
                  moveBlock(dragId, b.id, e.clientY < e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2);
                }
                setDropTarget(null);
              }}
            >
              {/* Contrôles de ligne (survol) : menu d'actions + poignée de drag. */}
              <span className="relative flex shrink-0 items-center">
                <button
                  type="button"
                  title="Actions de la ligne"
                  aria-label="Actions de la ligne"
                  className="mt-1 rounded px-0.5 text-sm leading-none text-gray-300 opacity-0 transition hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100"
                  onClick={() => setMenuFor((v) => (v === b.id ? null : b.id))}
                >
                  ⋮
                </button>
                <span
                  draggable
                  title="Déplacer le bloc (dans la note, ou vers une autre note via la liste)"
                  className="mt-1.5 cursor-grab select-none text-xs leading-none text-gray-300 opacity-0 transition group-hover:opacity-100 active:cursor-grabbing"
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/bloc-notes-block", b.id);
                    // Flush le débounce : l'état source est à jour pour un
                    // déplacement inter-notes (rien de récent n'est perdu).
                    if (timer.current) {
                      clearTimeout(timer.current);
                      timer.current = null;
                      dispatch(updateBlocks(noteId, asBlocks(treeRef.current)));
                    }
                    const path = findPath(treeRef.current, b.id);
                    const subtree = path ? getAt(treeRef.current, path) : null;
                    if (subtree) {
                      e.dataTransfer.setData(BLOCK_MOVE_MIME, JSON.stringify({ sourceNoteId: noteId, block: subtree }));
                    }
                    e.dataTransfer.effectAllowed = "move";
                  }}
                >
                  ⠿
                </span>
                {menuFor === b.id && (
                  <LineMenu
                    block={b}
                    onClose={() => setMenuFor(null)}
                    onToggleMark={(k) => toggleMark(b.id, k)}
                    onConvert={(k) => convertKind(b.id, k)}
                    onToTask={() => lineToTask(b.id)}
                    onToDecision={() => lineToDecision(b.id)}
                    onToBoard={() => lineToBoard(b.id)}
                    onMoveUp={() => moveLine(b.id, -1)}
                    onMoveDown={() => moveLine(b.id, 1)}
                    onDuplicate={() => duplicateBlock(b.id)}
                    onDelete={() => {
                      deleteBlock(b.id);
                      setMenuFor(null);
                    }}
                  />
                )}
              </span>

              {/* Préfixe structurel. */}
              {b.kind === "bullet" && (
                <span aria-hidden className="mt-[7px] shrink-0 text-gray-500">•</span>
              )}
              {b.kind === "numbered" && (
                <span className="mt-[5px] w-5 shrink-0 text-right text-sm tabular-nums text-gray-500">
                  {number}.
                </span>
              )}
              {b.kind === "todo" && (
                <input
                  type="checkbox"
                  aria-label={b.checked ? "Décocher la tâche" : "Cocher la tâche"}
                  checked={Boolean(b.checked)}
                  className="mt-[7px] h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-indigo-600"
                  onChange={() => onToggleTodo(b.id)}
                />
              )}
              {b.kind === "quote" && (
                <span aria-hidden className="mt-1 h-[calc(100%-8px)] w-1 shrink-0 self-stretch rounded bg-indigo-200" />
              )}

              {b.kind === "separator" ? (
                <span className="flex min-w-0 flex-1 items-center gap-2 py-1.5">
                  <hr className="flex-1 border-gray-200" />
                  <button
                    type="button"
                    aria-label="Supprimer le séparateur"
                    className="rounded px-1 text-xs text-gray-300 opacity-0 transition hover:text-gray-500 group-hover:opacity-100"
                    onClick={() => deleteBlock(b.id)}
                  >
                    ✕
                  </button>
                </span>
              ) : (
                <textarea
                  ref={(el) => {
                    if (el) {
                      areaRefs.current.set(b.id, el);
                      autosize(el);
                    } else {
                      areaRefs.current.delete(b.id);
                    }
                  }}
                  rows={1}
                  value={b.text}
                  placeholder={b.kind === "paragraph" && rows.length === 1 ? "Écrivez, ou tapez « - », « [] », « # »…" : ""}
                  className={`min-w-0 flex-1 resize-none overflow-hidden bg-transparent px-1 py-1 leading-relaxed outline-none placeholder:text-gray-300 ${textClass(b)} ${
                    b.kind === "todo" && b.checked ? "text-gray-400 line-through" : ""
                  }`}
                  onFocus={() => setFocusedId(b.id)}
                  onChange={(e) => {
                    autosize(e.currentTarget);
                    onTextChange(b.id, e.currentTarget.value);
                  }}
                  onKeyDown={(e) => {
                    const ta = e.currentTarget;
                    const meta = e.metaKey || e.ctrlKey;
                    const key = e.key.toLowerCase();
                    if (meta && !e.shiftKey && key === "b") {
                      e.preventDefault();
                      toggleMark(b.id, "bold");
                      return;
                    }
                    if (meta && !e.shiftKey && key === "i") {
                      e.preventDefault();
                      toggleMark(b.id, "italic");
                      return;
                    }
                    if (meta && !e.shiftKey && key === "u") {
                      e.preventDefault();
                      toggleMark(b.id, "underline");
                      return;
                    }
                    if (meta && e.shiftKey && key === "s") {
                      e.preventDefault();
                      toggleMark(b.id, "strikethrough");
                      return;
                    }
                    if (meta && e.shiftKey && key === "h") {
                      e.preventDefault();
                      toggleMark(b.id, "highlight");
                      return;
                    }
                    // Actions de ligne au clavier.
                    if (meta && e.shiftKey && key === "t") {
                      e.preventDefault();
                      convertKind(b.id, "todo");
                      return;
                    }
                    if (meta && e.shiftKey && key === "d") {
                      e.preventDefault();
                      lineToDecision(b.id);
                      return;
                    }
                    if (meta && e.shiftKey && e.key === "ArrowUp") {
                      e.preventDefault();
                      moveLine(b.id, -1);
                      return;
                    }
                    if (meta && e.shiftKey && e.key === "ArrowDown") {
                      e.preventDefault();
                      moveLine(b.id, 1);
                      return;
                    }
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      splitBlock(b.id, ta.selectionStart ?? b.text.length);
                      return;
                    }
                    if (e.key === "Backspace" && ta.selectionStart === 0 && ta.selectionEnd === 0) {
                      if (b.text === "") {
                        e.preventDefault();
                        deleteBlock(b.id);
                        return;
                      }
                      if (b.kind !== "paragraph" && b.kind !== "quote") {
                        e.preventDefault();
                        demoteToParagraph(b.id);
                        return;
                      }
                    }
                    if (e.key === "Tab") {
                      e.preventDefault();
                      const caret = ta.selectionStart ?? 0;
                      if (e.shiftKey) outdent(b.id, caret);
                      else indent(b.id, caret);
                    }
                  }}
                />
              )}

              {/* Boutons contextuels gras / italique / surlignage. */}
              {b.kind !== "separator" && b.kind !== "todo" && focusedId === b.id && (
                <span className="absolute -top-0.5 right-0 z-10 hidden items-center gap-0.5 rounded-lg border border-gray-200 bg-white px-1 py-0.5 shadow-sm group-hover:inline-flex">
                  {(
                    [
                      ["bold", "B", "font-bold"],
                      ["italic", "I", "italic"],
                      ["highlight", "🖍", ""],
                    ] as const
                  ).map(([key, label, cls]) => (
                    <button
                      key={key}
                      type="button"
                      title={key === "bold" ? "Gras (⌘B)" : key === "italic" ? "Italique (⌘I)" : "Surligner"}
                      aria-pressed={Boolean(b.marks?.[key])}
                      className={`rounded px-1.5 py-0.5 text-[11px] leading-none transition hover:bg-gray-100 ${cls} ${
                        b.marks?.[key] ? "bg-indigo-50 text-indigo-700" : "text-gray-500"
                      }`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => toggleMark(b.id, key)}
                    >
                      {label}
                    </button>
                  ))}
                </span>
              )}
            </div>
          );
        })}
        {/* Zone libre : cliquer sous le dernier bloc = continuer d'écrire. */}
        <div aria-hidden className="min-h-[120px] cursor-text" onClick={appendParagraph} />
      </div>
    </div>
  );
}

// ─── Menu d'actions d'une ligne (à gauche de chaque bloc) ──────────

const MARK_BTNS: [MarkKey, string, string, string, string][] = [
  ["bold", "B", "font-bold", "Gras", "⌘B"],
  ["italic", "I", "italic", "Italique", "⌘I"],
  ["underline", "U", "underline", "Souligné", "⌘U"],
  ["strikethrough", "S", "line-through", "Barré", "⌘⇧S"],
  ["highlight", "🖍", "", "Surligné", "⌘⇧H"],
];

const CONVERT_BTNS: [BlockKind, string, string?][] = [
  ["paragraph", "Texte"],
  ["heading1", "Titre"],
  ["heading2", "Sous-titre"],
  ["bullet", "• Puce"],
  ["numbered", "1. Numérotée"],
  ["todo", "☑ Tâche", "⌘⇧T"],
  ["quote", "❝ Citation"],
  ["separator", "— Séparateur"],
];

function LineMenu({
  block,
  onClose,
  onToggleMark,
  onConvert,
  onToTask,
  onToDecision,
  onToBoard,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
}: {
  block: AnyBlock;
  onClose: () => void;
  onToggleMark: (k: MarkKey) => void;
  onConvert: (k: BlockKind) => void;
  onToTask: () => void;
  onToDecision: () => void;
  onToBoard: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      {/* Backdrop : clic extérieur → fermeture. */}
      <button type="button" aria-label="Fermer le menu" className="fixed inset-0 z-20 cursor-default" onClick={onClose} />
      <div className="absolute left-3 top-6 z-30 w-56 rounded-xl border border-gray-200 bg-white p-1.5 text-left shadow-xl" onMouseDown={(e) => e.preventDefault()}>
        {block.kind !== "separator" && (
          <>
            <p className="px-1.5 pb-0.5 pt-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-400">Format</p>
            <div className="mb-1 flex items-stretch gap-0.5 px-1">
              {MARK_BTNS.map(([key, label, cls, title, shortcut]) => (
                <button
                  key={key}
                  type="button"
                  title={`${title} (${shortcut})`}
                  aria-pressed={Boolean(block.marks?.[key])}
                  className={`flex flex-1 flex-col items-center gap-0.5 rounded px-1 py-1 transition hover:bg-gray-100 ${block.marks?.[key] ? "bg-indigo-50 text-indigo-700" : "text-gray-600"}`}
                  onClick={() => onToggleMark(key)}
                >
                  <span className={`text-xs leading-none ${cls}`}>{label}</span>
                  <span className="rounded bg-gray-100 px-1 text-[8px] leading-tight text-gray-400">{shortcut}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <p className="px-1.5 pb-0.5 pt-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-400">Transformer en</p>
        <div className="mb-1 grid grid-cols-2 gap-0.5">
          {CONVERT_BTNS.map(([kind, label, sc]) => (
            <button
              key={kind}
              type="button"
              aria-pressed={block.kind === kind}
              className={`flex items-center justify-between gap-1 rounded-md px-1.5 py-1 text-left text-[11px] transition hover:bg-gray-100 ${block.kind === kind ? "bg-indigo-50 font-medium text-indigo-700" : "text-gray-700"}`}
              onClick={() => onConvert(kind)}
            >
              <span className="truncate">{label}</span>
              {sc && <span className="shrink-0 rounded bg-gray-100 px-1 text-[8px] text-gray-400">{sc}</span>}
            </button>
          ))}
        </div>

        <p className="px-1.5 pb-0.5 pt-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-400">Envoyer vers</p>
        <button type="button" className="block w-full rounded-md px-2 py-1 text-left text-[11px] text-gray-700 hover:bg-gray-100" onClick={onToTask}>☑ Créer une tâche</button>
        <button type="button" className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-[11px] text-gray-700 hover:bg-gray-100" onClick={onToDecision}>
          <span>🧭 Créer une décision</span>
          <span className="shrink-0 rounded bg-gray-100 px-1 text-[8px] text-gray-400">⌘⇧D</span>
        </button>
        <button type="button" className="block w-full rounded-md px-2 py-1 text-left text-[11px] text-gray-700 hover:bg-gray-100" onClick={onToBoard}>📊 Créer un tableau</button>

        <div className="my-1 h-px bg-gray-100" />
        <div className="flex items-center gap-0.5">
          <button type="button" title="Monter (⌘⇧↑)" className="flex flex-1 items-center justify-center gap-1 rounded-md px-1 py-1 text-xs text-gray-600 hover:bg-gray-100" onClick={onMoveUp}>↑<span className="rounded bg-gray-100 px-0.5 text-[8px] text-gray-400">⌘⇧↑</span></button>
          <button type="button" title="Descendre (⌘⇧↓)" className="flex flex-1 items-center justify-center gap-1 rounded-md px-1 py-1 text-xs text-gray-600 hover:bg-gray-100" onClick={onMoveDown}>↓<span className="rounded bg-gray-100 px-0.5 text-[8px] text-gray-400">⌘⇧↓</span></button>
          <button type="button" title="Dupliquer" className="flex-1 rounded-md px-1 py-1 text-xs text-gray-600 hover:bg-gray-100" onClick={onDuplicate}>⧉</button>
          <button type="button" title="Supprimer" className="flex-1 rounded-md px-1 py-1 text-xs text-red-500 hover:bg-red-50" onClick={onDelete}>🗑</button>
        </div>
      </div>
    </>
  );
}
