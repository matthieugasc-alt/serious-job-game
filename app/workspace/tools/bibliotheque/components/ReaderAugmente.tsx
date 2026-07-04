"use client";

/**
 * ReaderAugmente — le lecteur du dossier documentaire (contrat §5).
 * Rendu par type de source (document du scénario en markdown, mail/fil
 * archivés depuis leur snapshot) + couche d'annotation SANS interruption :
 *   - sélection de texte → barre flottante (surligner en couleur,
 *     commenter, poser un signet, extraire « → Bloc-notes ») ;
 *   - panneau latéral des annotations (surlignages, commentaires,
 *     signets), chacun retirable ;
 *   - surlignages RE-PEINTS dans le texte des contenus mail/fil archivés
 *     (rendus en texte, correspondance exacte de l'extrait). Les documents
 *     markdown gardent leur rendu riche : leurs surlignages sont listés
 *     dans le panneau (peinture in-texte des docs = V2).
 *
 * Couplage Tool→Tool (extraction vers le Bloc-notes) UNIQUEMENT par la
 * façade publique `bloc-notes/api` (contrat §4) — jamais l'état interne.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { WorkspaceAction } from "@/app/lib/engine/workspace";
import { Markdown } from "@/app/workspace/primitives/Markdown";
import { DocumentViewer } from "@/app/workspace/primitives/DocumentViewer";
import type { DocumentDef } from "@/app/lib/engine/mechanics";
import { annotate as blocNotesAnnotate } from "@/app/workspace/tools/bloc-notes/api";
import type { SourceRef } from "@/app/workspace/tools/bloc-notes/spec";
import { LinkToDecisionButton } from "@/app/workspace/tools/decision-engine/LinkToDecisionButton";
import type { SourceLink } from "@/app/workspace/tools/decision-engine/spec";
import type { Json } from "@/app/lib/engine/mechanics";
import {
  addBookmark,
  addComment,
  addHighlight,
  removeAnnotation,
  togglePin,
  toggleFavorite,
} from "../api";
import type { Annotation, DocEntry } from "../spec";

type Dispatch = (action: WorkspaceAction) => void;

const KIND_LABEL: Record<string, string> = {
  scenario_doc: "Document",
  archived_mail: "Mail archivé",
  archived_messages: "Fil archivé",
};

const HL_COLORS: { name: string; value: string }[] = [
  { name: "Jaune", value: "#fde68a" },
  { name: "Vert", value: "#bbf7d0" },
  { name: "Bleu", value: "#bfdbfe" },
  { name: "Rose", value: "#fbcfe8" },
];

function fmtDate(at: number): string {
  try {
    return new Date(at).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/** Offset caractère d'un point de sélection dans un conteneur (anchor
 *  sérialisable, robuste au re-render — contrat §3). */
function offsetIn(container: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(container);
  range.setEnd(node, offset);
  return range.toString().length;
}

/** Peint les surlignages dans un texte brut (correspondance exacte de
 *  l'extrait, première occurrence non chevauchante). React pur — aucune
 *  manipulation du DOM rendu. */
function paintHighlights(text: string, highlights: Annotation[]): ReactNode {
  const marks = highlights
    .filter((a): a is Extract<Annotation, { kind: "highlight" }> => a.kind === "highlight")
    .map((a) => ({ id: a.id, excerpt: a.excerpt, color: a.color ?? "#fde68a" }));
  if (marks.length === 0) return text;

  type Span = { start: number; end: number; color: string; id: string };
  const spans: Span[] = [];
  for (const m of marks) {
    if (!m.excerpt) continue;
    const start = text.indexOf(m.excerpt);
    if (start < 0) continue;
    const end = start + m.excerpt.length;
    if (spans.some((s) => start < s.end && end > s.start)) continue; // pas de chevauchement
    spans.push({ start, end, color: m.color, id: m.id });
  }
  if (spans.length === 0) return text;
  spans.sort((a, b) => a.start - b.start);

  const out: ReactNode[] = [];
  let cursor = 0;
  spans.forEach((s, i) => {
    if (s.start > cursor) out.push(text.slice(cursor, s.start));
    out.push(
      <mark key={s.id ?? i} style={{ backgroundColor: s.color }} className="rounded-sm px-0.5">
        {text.slice(s.start, s.end)}
      </mark>,
    );
    cursor = s.end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

export function ReaderAugmente({
  entry,
  documents,
  dispatch,
  nameOf,
  defaultShowPanel = true,
  decisionState,
}: {
  entry: DocEntry;
  documents: DocumentDef[];
  dispatch: Dispatch;
  nameOf?: (id: string) => string;
  /** Panneau d'annotations replié par défaut (fenêtres multiples / comparaison). */
  defaultShowPanel?: boolean;
  /** État brut du Decision Engine (toolStates["decision-engine"]) pour le
   *  bouton « → Décision » — fourni par l'hôte, optionnel. */
  decisionState?: Json;
}) {
  const who = (id: string) => (nameOf ? nameOf(id) : id);

  const decisionLink = (): SourceLink => {
    const src = entry.source;
    if (src.kind === "archived_mail") return { kind: "mail", mail_id: src.mail_id, label: entry.title };
    if (src.kind === "archived_messages") return { kind: "message", thread_id: src.thread_id, label: entry.title };
    if (src.kind === "scenario_doc") return { kind: "document", document_id: src.document_id, label: entry.title };
    return { kind: "library", entry_id: entry.id, label: entry.title };
  };
  const bodyRef = useRef<HTMLDivElement>(null);
  const [showPanel, setShowPanel] = useState(defaultShowPanel);
  const [sel, setSel] = useState<{ text: string; anchor: string; x: number; y: number } | null>(null);
  const [commenting, setCommenting] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [chip, setChip] = useState<string | null>(null);

  // ── Détection de sélection dans le corps du lecteur.
  useEffect(() => {
    const update = () => {
      if (commenting) return;
      const s = window.getSelection();
      const c = bodyRef.current;
      if (!s || s.rangeCount === 0 || s.isCollapsed || !c) {
        setSel(null);
        return;
      }
      const range = s.getRangeAt(0);
      const text = s.toString().trim();
      if (!text || !c.contains(range.commonAncestorContainer)) {
        setSel(null);
        return;
      }
      const start = offsetIn(c, range.startContainer, range.startOffset);
      const end = start + range.toString().length;
      const r = range.getBoundingClientRect();
      const cr = c.getBoundingClientRect();
      setSel({
        text: text.slice(0, 600),
        anchor: `${start}:${end}`,
        x: Math.max(4, Math.min(r.left - cr.left + c.scrollLeft, cr.width - 220)),
        y: Math.max(4, r.top - cr.top + c.scrollTop - 44),
      });
    };
    const c = bodyRef.current;
    document.addEventListener("selectionchange", update);
    c?.addEventListener("scroll", update, true);
    return () => {
      document.removeEventListener("selectionchange", update);
      c?.removeEventListener("scroll", update, true);
    };
  }, [commenting]);

  useEffect(() => {
    if (!chip) return;
    const t = setTimeout(() => setChip(null), 1600);
    return () => clearTimeout(t);
  }, [chip]);

  const clearSelection = useCallback(() => {
    setSel(null);
    setCommenting(false);
    setCommentText("");
    window.getSelection()?.removeAllRanges();
  }, []);

  const makeSource = useCallback(
    (excerpt: string): SourceRef => {
      const src = entry.source;
      if (src.kind === "archived_mail") {
        const m = src.snapshot;
        return { kind: "mail", mail_id: src.mail_id, subject: m.subject, from: m.from, at: m.at, excerpt };
      }
      if (src.kind === "archived_messages") {
        const last = src.snapshot.messages[src.snapshot.messages.length - 1];
        return { kind: "message", thread_id: src.thread_id, at: last?.at ?? entry.added_at, excerpt };
      }
      return { kind: "document", document_id: src.document_id, excerpt };
    },
    [entry],
  );

  const doHighlight = (color: string) => {
    if (!sel) return;
    dispatch(addHighlight(entry.id, { anchor: sel.anchor, excerpt: sel.text, color }));
    setChip("Surligné");
    clearSelection();
  };
  const doBookmark = () => {
    if (!sel) return;
    const label = sel.text.length > 48 ? `${sel.text.slice(0, 47)}…` : sel.text;
    dispatch(addBookmark(entry.id, { label, anchor: sel.anchor }));
    setChip("Signet posé");
    clearSelection();
  };
  const doComment = () => {
    if (!sel) return;
    const text = commentText.trim();
    if (text) dispatch(addComment(entry.id, { text, anchor: sel.anchor, excerpt: sel.text }));
    setChip("Commentaire ajouté");
    clearSelection();
  };
  const doExtract = () => {
    if (!sel) return;
    dispatch(blocNotesAnnotate({ source: makeSource(sel.text), excerpt: sel.text }));
    setChip("Ajouté au bloc-notes");
    clearSelection();
  };

  const highlights = entry.annotations.filter((a) => a.kind === "highlight");
  const comments = entry.annotations.filter((a) => a.kind === "comment");

  return (
    <div className="flex h-full min-h-0 bg-white">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-start gap-3 border-b border-gray-200 bg-gray-50/80 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              {KIND_LABEL[entry.source.kind] ?? "Document"}
            </p>
            <h2 className="truncate text-sm font-semibold text-gray-900" title={entry.title}>
              {entry.title || "(sans titre)"}
            </h2>
            {entry.tags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {entry.tags.map((t) => (
                  <span key={t} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {decisionState !== undefined && (
              <LinkToDecisionButton link={decisionLink()} decisionState={decisionState} dispatch={dispatch} />
            )}
            <button
              type="button"
              title={entry.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
              className={`rounded-md px-1.5 py-1 text-sm transition hover:bg-gray-100 ${entry.favorite ? "text-amber-500" : "text-gray-400"}`}
              onClick={() => dispatch(toggleFavorite(entry.id))}
            >
              {entry.favorite ? "★" : "☆"}
            </button>
            <button
              type="button"
              title={entry.pinned ? "Désépingler" : "Épingler"}
              className={`rounded-md px-1.5 py-1 text-sm transition hover:bg-gray-100 ${entry.pinned ? "text-indigo-600" : "text-gray-400"}`}
              onClick={() => dispatch(togglePin(entry.id))}
            >
              📌
            </button>
            <button
              type="button"
              title={showPanel ? "Masquer les annotations" : "Afficher les annotations"}
              aria-pressed={showPanel}
              className={`rounded-md px-1.5 py-1 text-sm transition hover:bg-gray-100 ${showPanel ? "text-indigo-600" : "text-gray-400"}`}
              onClick={() => setShowPanel((v) => !v)}
            >
              ✎ {entry.annotations.length + entry.bookmarks.length || ""}
            </button>
          </div>
        </header>

        {/* Corps + couche de sélection. */}
        <div ref={bodyRef} className="relative min-h-0 flex-1 overflow-y-auto">
          <EntryBody entry={entry} documents={documents} who={who} highlights={highlights} />

          {sel && !commenting && (
            <div
              className="absolute z-40 flex items-center gap-0.5 rounded-xl border border-gray-200 bg-white px-1 py-1 shadow-lg"
              style={{ left: sel.x, top: sel.y }}
              onMouseDown={(e) => e.preventDefault()}
            >
              {HL_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={`Surligner (${c.name})`}
                  className="h-5 w-5 rounded-full border border-black/10 transition hover:scale-110"
                  style={{ backgroundColor: c.value }}
                  onClick={() => doHighlight(c.value)}
                />
              ))}
              <span className="mx-0.5 h-4 w-px bg-gray-200" />
              <button type="button" title="Commenter" className="rounded-md px-1.5 py-0.5 text-sm hover:bg-gray-100" onClick={() => setCommenting(true)}>
                💬
              </button>
              <button type="button" title="Poser un signet" className="rounded-md px-1.5 py-0.5 text-sm hover:bg-gray-100" onClick={doBookmark}>
                🔖
              </button>
              <button type="button" title="Extraire vers le bloc-notes" className="rounded-md px-1.5 py-0.5 text-sm hover:bg-gray-100" onClick={doExtract}>
                📓
              </button>
            </div>
          )}

          {sel && commenting && (
            <div
              className="absolute z-40 w-72 rounded-xl border border-gray-200 bg-white p-2.5 shadow-xl"
              style={{ left: Math.min(sel.x, 40), top: sel.y }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <p className="mb-1.5 line-clamp-2 border-l-2 border-indigo-300 bg-indigo-50/60 px-2 py-1 text-[11px] italic text-gray-700">
                {sel.text}
              </p>
              <textarea
                autoFocus
                rows={2}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    doComment();
                  }
                  if (e.key === "Escape") clearSelection();
                }}
                placeholder="Votre commentaire…"
                className="w-full resize-none rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
              <div className="mt-1.5 flex justify-end gap-1.5">
                <button type="button" className="rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100" onClick={clearSelection}>
                  Annuler
                </button>
                <button type="button" className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700" onClick={doComment}>
                  Ajouter
                </button>
              </div>
            </div>
          )}

          {chip && (
            <span className="absolute bottom-3 right-3 z-40 inline-flex items-center gap-1 rounded-full bg-gray-900/90 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg">
              ✓ {chip}
            </span>
          )}
        </div>
      </div>

      {showPanel && (
        <aside className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto border-l border-gray-200 bg-gray-50/70 px-3 py-3">
          <AnnotationSection title="Surlignages" count={highlights.length} empty="Sélectionnez du texte pour surligner.">
            {highlights.map((a) => (
              <AnnotationRow key={a.id} onRemove={() => dispatch(removeAnnotation(entry.id, a.id))}>
                <span
                  className="mt-0.5 inline-block h-3 w-3 shrink-0 rounded-sm border border-black/10"
                  style={{ backgroundColor: a.kind === "highlight" ? a.color ?? "#fde68a" : undefined }}
                />
                <span className="line-clamp-3 text-xs text-gray-700">
                  {a.kind === "highlight" ? a.excerpt : ""}
                </span>
              </AnnotationRow>
            ))}
          </AnnotationSection>

          <AnnotationSection title="Commentaires" count={comments.length} empty="Aucun commentaire.">
            {comments.map((a) => (
              <AnnotationRow key={a.id} onRemove={() => dispatch(removeAnnotation(entry.id, a.id))}>
                <span className="flex flex-col gap-0.5">
                  {a.kind === "comment" && a.excerpt && (
                    <span className="line-clamp-2 border-l-2 border-gray-300 pl-1.5 text-[11px] italic text-gray-500">
                      {a.excerpt}
                    </span>
                  )}
                  <span className="text-xs text-gray-800">{a.kind === "comment" ? a.text : ""}</span>
                </span>
              </AnnotationRow>
            ))}
          </AnnotationSection>

          <AnnotationSection title="Signets" count={entry.bookmarks.length} empty="Aucun signet.">
            {entry.bookmarks.map((b) => (
              <div key={b.id} className="flex items-center gap-1.5 rounded-lg bg-white px-2 py-1.5 text-xs text-gray-700 shadow-sm">
                <span aria-hidden>🔖</span>
                <span className="line-clamp-1 flex-1">{b.label}</span>
              </div>
            ))}
          </AnnotationSection>
        </aside>
      )}
    </div>
  );
}

function AnnotationSection({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        {title} {count > 0 && <span className="text-gray-300">· {count}</span>}
      </p>
      {count === 0 ? <p className="text-[11px] text-gray-400">{empty}</p> : <div className="flex flex-col gap-1.5">{children}</div>}
    </div>
  );
}

function AnnotationRow({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  return (
    <div className="group flex items-start gap-1.5 rounded-lg bg-white px-2 py-1.5 shadow-sm">
      <div className="flex min-w-0 flex-1 items-start gap-1.5">{children}</div>
      <button
        type="button"
        title="Retirer"
        className="shrink-0 rounded px-1 text-xs text-gray-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100"
        onClick={onRemove}
      >
        ✕
      </button>
    </div>
  );
}

function EntryBody({
  entry,
  documents,
  who,
  highlights,
}: {
  entry: DocEntry;
  documents: DocumentDef[];
  who: (id: string) => string;
  highlights: Annotation[];
}) {
  const src = entry.source;

  if (src.kind === "scenario_doc") {
    const doc = documents.find((d) => d.id === src.document_id);
    if (!doc) {
      return <p className="p-4 text-sm text-gray-400">Ce document n’est plus disponible dans le contexte courant.</p>;
    }
    return <DocumentViewer documents={[doc]} />;
  }

  if (src.kind === "archived_mail") {
    const m = src.snapshot;
    return (
      <div className="px-5 py-4">
        <div className="mx-auto w-full max-w-[72ch]">
          <p className="text-[11px] text-gray-500">
            De : {who(m.from)} · À : {m.to.map(who).join(", ") || "—"} · {fmtDate(m.at)}
          </p>
          <h3 className="mt-1 text-base font-semibold text-gray-900">{m.subject}</h3>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
            {paintHighlights(m.body, highlights)}
          </p>
        </div>
      </div>
    );
  }

  const t = src.snapshot;
  return (
    <div className="px-5 py-4">
      <div className="mx-auto flex w-full max-w-[72ch] flex-col gap-2">
        {t.messages.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun message dans ce fil.</p>
        ) : (
          t.messages.map((msg, i) => (
            <div key={i} className="rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2">
              <p className="text-[11px] font-medium text-gray-500">
                {who(msg.from)} · {fmtDate(msg.at)}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                {paintHighlights(msg.content, highlights)}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
