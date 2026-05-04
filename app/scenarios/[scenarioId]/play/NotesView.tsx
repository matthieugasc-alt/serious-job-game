"use client";
// ══════════════════════════════════════════════════════════════════
// NotesView — Notes / Outline / Mind Map panel
// ══════════════════════════════════════════════════════════════════
//
// Pure UI component. All state remains in page.tsx.
// ══════════════════════════════════════════════════════════════════

import React from "react";

// ── Types ──

export interface OutlineItem {
  id: string;
  text: string;
  depth: number;
}

export type MindmapViewMode = "editor" | "split" | "map";

export interface NotesViewProps {
  outlineItems: OutlineItem[];
  outlineRawText: string;
  onOutlineRawTextChange: (text: string) => void;
  mindmapView: MindmapViewMode;
  onMindmapViewChange: (mode: MindmapViewMode) => void;
  outlineCopiedFeedback: string;
  onCopy: () => void;
  onInsertInMail: () => void;
}

// ── Constants ──

const depthColors = ["#1a3c6e", "#5b5fc7", "#7c3aed", "#0891b2", "#059669", "#d97706"];

// ── Tree helpers ──

type TreeNode = { item: OutlineItem; children: TreeNode[] };

function buildTree(items: OutlineItem[]): TreeNode[] {
  const roots: TreeNode[] = [];
  const stack: TreeNode[] = [];
  for (const item of items) {
    const node: TreeNode = { item, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].item.depth >= item.depth) {
      stack.pop();
    }
    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }
    stack.push(node);
  }
  return roots;
}

function renderTreeNode(node: TreeNode, isLast: boolean, parentColor: string): React.ReactNode {
  const d = Math.min(node.item.depth, depthColors.length - 1);
  const color = depthColors[d];
  const hasChildren = node.children.length > 0;
  return (
    <div key={node.item.id} style={{ marginLeft: node.item.depth === 0 ? 0 : 20 }}>
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 8, padding: "4px 0",
        position: "relative",
      }}>
        {node.item.depth > 0 && (
          <div style={{
            position: "absolute", left: -14, top: 0, bottom: isLast ? "50%" : 0,
            width: 1, background: parentColor, opacity: 0.25,
          }} />
        )}
        {node.item.depth > 0 && (
          <div style={{
            position: "absolute", left: -14, top: "50%", width: 10, height: 1,
            background: parentColor, opacity: 0.25,
          }} />
        )}
        <span style={{
          width: 8, height: 8, borderRadius: hasChildren ? 2 : "50%",
          background: color, flexShrink: 0, marginTop: 5,
        }} />
        <span style={{
          fontSize: node.item.depth === 0 ? 14 : 13,
          fontWeight: node.item.depth === 0 ? 700 : 400,
          color, lineHeight: 1.5,
        }}>
          {node.item.text}
        </span>
      </div>
      {hasChildren && (
        <div style={{ position: "relative" }}>
          {node.children.map((child, ci) =>
            renderTreeNode(child, ci === node.children.length - 1, color)
          )}
        </div>
      )}
    </div>
  );
}

// ── Component ──

export default function NotesView({
  outlineItems,
  outlineRawText,
  onOutlineRawTextChange,
  mindmapView,
  onMindmapViewChange,
  outlineCopiedFeedback,
  onCopy,
  onInsertInMail,
}: NotesViewProps) {
  const tree = buildTree(outlineItems);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid #e8e8e8", background: "#fff", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1a3c6e" }}>
            🗒️ Notes d&apos;analyse
          </h2>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {outlineCopiedFeedback && (
              <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>
                {outlineCopiedFeedback}
              </span>
            )}
            {/* View mode toggle */}
            <div style={{ display: "flex", border: "1px solid #ddd", borderRadius: 6, overflow: "hidden" }}>
              {(["editor", "split", "map"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => onMindmapViewChange(mode)}
                  style={{
                    padding: "4px 10px", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
                    background: mindmapView === mode ? "#5b5fc7" : "#fff",
                    color: mindmapView === mode ? "#fff" : "#666",
                  }}
                >
                  {mode === "editor" ? "Éditeur" : mode === "split" ? "Split" : "Mind Map"}
                </button>
              ))}
            </div>
            <button
              onClick={onCopy}
              style={{
                padding: "5px 12px", borderRadius: 6, border: "1px solid #ddd",
                background: "#fff", color: "#555", fontSize: 12, cursor: "pointer",
                fontWeight: 500, display: "flex", alignItems: "center", gap: 4,
              }}
            >
              📋 Copier
            </button>
            <button
              onClick={onInsertInMail}
              style={{
                padding: "5px 12px", borderRadius: 6, border: "1px solid rgba(91,95,199,0.3)",
                background: "#f0f0ff", color: "#5b5fc7", fontSize: 12, cursor: "pointer",
                fontWeight: 600, display: "flex", alignItems: "center", gap: 4,
              }}
            >
              ✉️ Insérer dans le mail
            </button>
          </div>
        </div>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#888" }}>
          Tape ou colle ton analyse. Indente avec <strong>2 espaces</strong> ou <strong>Tab</strong> pour créer des sous-niveaux. Préfixes reconnus : <strong>- * • ◦ ▪</strong>
        </p>
      </div>

      {/* Content area — split, editor-only, or map-only */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Textarea editor */}
        {(mindmapView === "editor" || mindmapView === "split") && (
          <div style={{
            flex: mindmapView === "split" ? 1 : 1,
            display: "flex", flexDirection: "column",
            borderRight: mindmapView === "split" ? "1px solid #e8e8e8" : "none",
            minWidth: 0,
          }}>
            <textarea
              value={outlineRawText}
              onChange={(e) => onOutlineRawTextChange(e.target.value)}
              onKeyDown={(e) => {
                // Tab inserts 2 spaces at cursor position
                if (e.key === "Tab") {
                  e.preventDefault();
                  const ta = e.target as HTMLTextAreaElement;
                  const start = ta.selectionStart;
                  const end = ta.selectionEnd;
                  if (e.shiftKey) {
                    // Remove up to 2 leading spaces on the current line
                    const before = outlineRawText.slice(0, start);
                    const lineStart = before.lastIndexOf("\n") + 1;
                    const line = outlineRawText.slice(lineStart);
                    const spacesToRemove = line.startsWith("  ") ? 2 : line.startsWith(" ") ? 1 : line.startsWith("\t") ? 1 : 0;
                    if (spacesToRemove > 0) {
                      const newText = outlineRawText.slice(0, lineStart) + outlineRawText.slice(lineStart + spacesToRemove);
                      onOutlineRawTextChange(newText);
                      setTimeout(() => {
                        ta.selectionStart = ta.selectionEnd = Math.max(lineStart, start - spacesToRemove);
                      }, 0);
                    }
                  } else {
                    const newText = outlineRawText.slice(0, start) + "  " + outlineRawText.slice(end);
                    onOutlineRawTextChange(newText);
                    setTimeout(() => {
                      ta.selectionStart = ta.selectionEnd = start + 2;
                    }, 0);
                  }
                }
              }}
              placeholder={"Problème adoption\n  Seulement 2/12 chirurgiens actifs\n  Secrétariat reste sur Excel\n    Mme Bertrand refuse de partager\n  Pas de formation initiale\nBug annulation\n  Double système Excel/Orisio\n  Incident Mme Dupont\n    Prothèse annulée sans notification\nModules demandés par Alexandre\n  Dashboard direction — 5K\n  Notifications — 3.5K\n  Gestion matériel — 7K"}
              style={{
                flex: 1, padding: "16px 20px", border: "none", outline: "none",
                resize: "none", fontSize: 13, fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
                lineHeight: 1.7, color: "#333", background: "#fafbfc",
                tabSize: 2,
              }}
            />
          </div>
        )}

        {/* Visual Mind Map */}
        {(mindmapView === "map" || mindmapView === "split") && (
          <div style={{
            flex: 1, overflowY: "auto", padding: "16px 20px", background: "#fff",
            minWidth: 0,
          }}>
            {outlineItems.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#bbb", gap: 8 }}>
                <span style={{ fontSize: 32 }}>🌳</span>
                <span style={{ fontSize: 13 }}>Ta mind map apparaîtra ici</span>
                <span style={{ fontSize: 11, color: "#ccc" }}>Commence à écrire dans l&apos;éditeur</span>
              </div>
            ) : (
              <div style={{ padding: "8px 0" }}>
                {tree.map((node, i) => renderTreeNode(node, i === tree.length - 1, depthColors[0]))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats footer */}
      <div style={{
        padding: "8px 20px", borderTop: "1px solid #e8e8e8", background: "#fafafa",
        fontSize: 11, color: "#999", display: "flex", justifyContent: "space-between", flexShrink: 0,
      }}>
        <span>{outlineItems.length} éléments</span>
        <span>{outlineItems.filter((i) => i.depth === 0).length} catégories principales</span>
      </div>
    </div>
  );
}
