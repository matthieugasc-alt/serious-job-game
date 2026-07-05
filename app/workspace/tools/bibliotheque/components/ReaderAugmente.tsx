"use client";

/**
 * ReaderAugmente — le lecteur du dossier documentaire (contrat §5).
 * Rendu par type de source + couche d'annotation SANS interruption :
 *   - sélection de texte → barre flottante (surligner en couleur,
 *     commenter, poser un signet) ;
 *   - SURLIGNAGE VISIBLE dans le document (markdown compris) via la CSS
 *     Custom Highlight API — fond à 75 % de transparence, offsets
 *     sérialisables ; les commentaires sont pointés (soulignés) au bon
 *     endroit du texte ;
 *   - chaque surlignage / commentaire est AUTO-IMPORTÉ dans le Bloc-notes
 *     (le carnet garde toutes les actions faites sur un document, avec un
 *     lien navigable vers la source).
 *
 * Couplage Tool→Tool (vers le Bloc-notes) UNIQUEMENT par la façade
 * publique `bloc-notes/api` (contrat §4).
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { WorkspaceAction } from "@/app/lib/engine/workspace";
import { Markdown } from "@/app/workspace/primitives/Markdown";
import { DocumentViewer } from "@/app/workspace/primitives/DocumentViewer";
import type { DocumentDef } from "@/app/lib/engine/mechanics";
import { annotate as blocNotesAnnotate } from "@/app/workspace/tools/bloc-notes/api";
import type { SourceRef } from "@/app/workspace/tools/bloc-notes/spec";
import { LinkToDecisionButton } from "@/app/workspace/tools/decision-engine/LinkToDecisionButton";
import type { SourceLink } from "@/app/workspace/tools/decision-engine/spec";
import type { Json } from "@/app/lib/engine/mechanics";
import { addBookmark, addComment, addHighlight, removeAnnotation, togglePin, toggleFavorite } from "../api";
import type { DocEntry } from "../spec";

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
    return new Date(at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/** Offset caractère d'un point de sélection dans un conteneur. */
function offsetIn(container: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(container);
  range.setEnd(node, offset);
  return range.toString().length;
}

/** Reconstruit un Range à partir d'offsets caractère (start:end) dans le
 *  texte du conteneur — robuste au re-render (même contenu). */
function rangeFromOffsets(root: HTMLElement, start: number, end: number): Range | null {
  if (!(end > start)) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let pos = 0;
  let startSet = false;
  let node = walker.nextNode();
  while (node) {
    const len = node.textContent?.length ?? 0;
    if (!startSet && start <= pos + len) {
      range.setStart(node, start - pos);
      startSet = true;
    }
    if (startSet && end <= pos + len) {
      range.setEnd(node, end - pos);
      return range;
    }
    pos += len;
    node = walker.nextNode();
  }
  return null;
}

/** Repli : trouve l'extrait dans le texte du conteneur. */
function rangeFromExcerpt(root: HTMLElement, excerpt: string): Range | null {
  const text = root.textContent ?? "";
  const idx = text.indexOf(excerpt);
  return idx >= 0 ? rangeFromOffsets(root, idx, idx + excerpt.length) : null;
}

function anchorRange(root: HTMLElement, anchor: string | undefined, excerpt: string | undefined): Range | null {
  if (anchor) {
    const [s, e] = anchor.split(":").map(Number);
    if (Number.isFinite(s) && Number.isFinite(e)) {
      const r = rangeFromOffsets(root, s, e);
      if (r) return r;
    }
  }
  return excerpt ? rangeFromExcerpt(root, excerpt) : null;
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return `rgba(253,230,138,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export function ReaderAugmente({
  entry,
  documents,
  dispatch,
  nameOf,
  defaultShowPanel = false,
  decisionState,
}: {
  entry: DocEntry;
  documents: DocumentDef[];
  dispatch: Dispatch;
  nameOf?: (id: string) => string;
  defaultShowPanel?: boolean;
  decisionState?: Json;
}) {
  const who = useCallback((id: string) => (nameOf ? nameOf(id) : id), [nameOf]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const instanceId = useId().replace(/[^a-zA-Z0-9]/g, "");
  // Panneau d'annotations : masqué par défaut (le document prend toute la
  // largeur). Basculé au clic sur ✎ — EN FLUX (le document se reformate à
  // côté), jamais en superposition : il ne masque donc plus le texte.
  const [panelPinned, setPanelPinned] = useState(defaultShowPanel);
  const showPanel = panelPinned;
  const [sel, setSel] = useState<{ text: string; anchor: string; x: number; y: number } | null>(null);
  const [commenting, setCommenting] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [chip, setChip] = useState<string | null>(null);
  const [hlStyle, setHlStyle] = useState("");

  const decisionLink = (): SourceLink => {
    const src = entry.source;
    if (src.kind === "archived_mail") return { kind: "mail", mail_id: src.mail_id, label: entry.title };
    if (src.kind === "archived_messages") return { kind: "message", thread_id: src.thread_id, label: entry.title };
    if (src.kind === "scenario_doc") return { kind: "document", document_id: src.document_id, label: entry.title };
    return { kind: "library", entry_id: entry.id, label: entry.title };
  };

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

  // ── Détection de sélection : on capture UNIQUEMENT à la FIN du geste
  //    (mouseup/keyup), jamais pendant le drag — sinon un re-render en
  //    cours de sélection réancre le curseur au début du document.
  useEffect(() => {
    const c = bodyRef.current;
    if (!c) return;
    const capture = () => {
      if (commenting) return;
      const s = window.getSelection();
      if (!s || s.rangeCount === 0 || s.isCollapsed) {
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
    document.addEventListener("mouseup", capture);
    document.addEventListener("keyup", capture);
    c.addEventListener("scroll", capture, true);
    return () => {
      document.removeEventListener("mouseup", capture);
      document.removeEventListener("keyup", capture);
      c.removeEventListener("scroll", capture, true);
    };
  }, [commenting]);

  useEffect(() => {
    if (!chip) return;
    const t = setTimeout(() => setChip(null), 1600);
    return () => clearTimeout(t);
  }, [chip]);

  // ── Peinture des surlignages / commentaires (CSS Custom Highlight API).
  //    Fonctionne PAR-DESSUS le markdown rendu, sans toucher au DOM React.
  useEffect(() => {
    const anyWin = window as unknown as { Highlight?: new (...r: Range[]) => unknown };
    const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
    const names: string[] = [];
    const raf = requestAnimationFrame(() => {
      const c = bodyRef.current;
      if (!c || typeof anyWin.Highlight !== "function" || !registry) {
        setHlStyle("");
        return;
      }
      const HighlightCtor = anyWin.Highlight;
      const css: string[] = [];
      const byColor = new Map<string, Range[]>();
      for (const a of entry.annotations) {
        if (a.kind !== "highlight") continue;
        const r = anchorRange(c, a.anchor, a.excerpt);
        if (!r) continue;
        const col = a.color ?? "#fde68a";
        const arr = byColor.get(col) ?? [];
        arr.push(r);
        byColor.set(col, arr);
      }
      const commentRanges: Range[] = [];
      for (const a of entry.annotations) {
        if (a.kind !== "comment") continue;
        const r = anchorRange(c, a.anchor, a.excerpt);
        if (r) commentRanges.push(r);
      }
      let i = 0;
      for (const [col, ranges] of byColor) {
        const name = `bib_${instanceId}_h${i++}`;
        registry.set(name, new HighlightCtor(...ranges) as unknown);
        names.push(name);
        css.push(`::highlight(${name}){ background-color:${hexToRgba(col, 0.25)}; }`);
      }
      if (commentRanges.length > 0) {
        const name = `bib_${instanceId}_c`;
        registry.set(name, new HighlightCtor(...commentRanges) as unknown);
        names.push(name);
        css.push(`::highlight(${name}){ background-color:rgba(99,102,241,0.14); text-decoration:underline dotted rgba(99,102,241,0.85); }`);
      }
      setHlStyle(css.join("\n"));
    });
    return () => {
      cancelAnimationFrame(raf);
      if (registry) for (const n of names) registry.delete(n);
    };
  }, [entry.id, entry.annotations, instanceId]);

  const clearSelection = useCallback(() => {
    setSel(null);
    setCommenting(false);
    setCommentText("");
    window.getSelection()?.removeAllRanges();
  }, []);

  const sourceLabel = (): string => {
    const src = entry.source;
    if (src.kind === "archived_mail") return `Mail : ${src.snapshot.subject}`;
    if (src.kind === "archived_messages") return `Messages de ${src.snapshot.title}`;
    return `Document : ${entry.title}`;
  };

  const doHighlight = (color: string) => {
    if (!sel) return;
    dispatch(addHighlight(entry.id, { anchor: sel.anchor, excerpt: sel.text, color }));
    // Auto-import dans le Bloc-notes (une note par source, incrémentale).
    dispatch(blocNotesAnnotate({ source: makeSource(sel.text), excerpt: sel.text, title: sourceLabel() }));
    setChip("Surligné · ajouté au bloc-notes");
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
    if (text) {
      dispatch(addComment(entry.id, { text, anchor: sel.anchor, excerpt: sel.text }));
      dispatch(blocNotesAnnotate({ source: makeSource(sel.text), excerpt: sel.text, comment: text, title: sourceLabel() }));
    }
    setChip("Commentaire ajouté · ajouté au bloc-notes");
    clearSelection();
  };

  const highlights = entry.annotations.filter((a) => a.kind === "highlight");
  const comments = entry.annotations.filter((a) => a.kind === "comment");

  // Le corps du document est MÉMOÏSÉ : il ne doit pas se re-rendre quand
  // l'état de sélection (sel/commenting/chip) change, sinon react-markdown
  // recrée les nœuds DOM et la sélection native du navigateur saute au
  // relâchement de la souris (barre flottante inutilisable). Il ne se
  // recalcule que si le document, ses pièces ou le résolveur de noms change.
  const body = useMemo(
    () => <EntryBody entry={entry} documents={documents} who={who} />,
    [entry, documents, who],
  );

  return (
    <div className="relative flex h-full min-h-0 bg-white">
      {hlStyle && <style dangerouslySetInnerHTML={{ __html: hlStyle }} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-start gap-3 border-b border-gray-200 bg-gray-50/80 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{KIND_LABEL[entry.source.kind] ?? "Document"}</p>
            <h2 className="truncate text-sm font-semibold text-gray-900" title={entry.title}>{entry.title || "(sans titre)"}</h2>
            {entry.tags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {entry.tags.map((t) => (
                  <span key={t} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">#{t}</span>
                ))}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {decisionState !== undefined && <LinkToDecisionButton link={decisionLink()} decisionState={decisionState} dispatch={dispatch} />}
            <button type="button" title={entry.favorite ? "Retirer des favoris" : "Ajouter aux favoris"} className={`rounded-md px-1.5 py-1 text-sm transition hover:bg-gray-100 ${entry.favorite ? "text-amber-500" : "text-gray-400"}`} onClick={() => dispatch(toggleFavorite(entry.id))}>
              {entry.favorite ? "★" : "☆"}
            </button>
            <button type="button" title={entry.pinned ? "Désépingler (garder en haut de la liste)" : "Épingler en haut de la liste"} className={`rounded-md px-1.5 py-1 text-sm transition hover:bg-gray-100 ${entry.pinned ? "text-indigo-600" : "text-gray-300"}`} onClick={() => dispatch(togglePin(entry.id))}>
              📌
            </button>
            <button
              type="button"
              title={showPanel ? "Masquer le panneau d'annotations" : "Afficher les annotations (surlignages, commentaires, signets)"}
              aria-pressed={showPanel}
              className={`rounded-md px-1.5 py-1 text-sm transition hover:bg-gray-100 ${showPanel ? "bg-indigo-50 text-indigo-600" : "text-gray-400"}`}
              onClick={() => setPanelPinned((v) => !v)}
            >
              ✎ {entry.annotations.length + entry.bookmarks.length || ""}
            </button>
          </div>
        </header>

        <div ref={bodyRef} className="relative min-h-0 flex-1 overflow-y-auto">
          {body}

          {sel && !commenting && (
            <div className="absolute z-40 flex items-center gap-0.5 rounded-xl border border-gray-200 bg-white px-1 py-1 shadow-lg" style={{ left: sel.x, top: sel.y }} onMouseDown={(e) => e.preventDefault()}>
              {HL_COLORS.map((c) => (
                <button key={c.value} type="button" title={`Surligner (${c.name}) — importe dans le bloc-notes`} className="h-5 w-5 rounded-full border border-black/10 transition hover:scale-110" style={{ backgroundColor: c.value }} onClick={() => doHighlight(c.value)} />
              ))}
              <span className="mx-0.5 h-4 w-px bg-gray-200" />
              <button type="button" title="Commenter (importe dans le bloc-notes)" className="rounded-md px-1.5 py-0.5 text-sm hover:bg-gray-100" onClick={() => setCommenting(true)}>💬</button>
              <button type="button" title="Poser un signet" className="rounded-md px-1.5 py-0.5 text-sm hover:bg-gray-100" onClick={doBookmark}>🔖</button>
            </div>
          )}

          {sel && commenting && (
            <div className="absolute z-40 w-72 rounded-xl border border-gray-200 bg-white p-2.5 shadow-xl" style={{ left: Math.min(sel.x, 40), top: sel.y }} onMouseDown={(e) => e.stopPropagation()}>
              <p className="mb-1.5 line-clamp-2 border-l-2 border-indigo-300 bg-indigo-50/60 px-2 py-1 text-[11px] italic text-gray-700">{sel.text}</p>
              <textarea autoFocus rows={2} value={commentText} onChange={(e) => setCommentText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doComment(); } if (e.key === "Escape") clearSelection(); }} placeholder="Votre commentaire…" className="w-full resize-none rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
              <div className="mt-1.5 flex justify-end gap-1.5">
                <button type="button" className="rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100" onClick={clearSelection}>Annuler</button>
                <button type="button" className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700" onClick={doComment}>Ajouter</button>
              </div>
            </div>
          )}

          {chip && <span className="absolute bottom-3 right-3 z-40 inline-flex items-center gap-1 rounded-full bg-gray-900/90 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg">✓ {chip}</span>}
        </div>
      </div>

      {showPanel && (
        <aside className="flex h-full w-64 shrink-0 flex-col gap-3 overflow-y-auto border-l border-gray-200 bg-gray-50/80 px-3 py-3">
          <AnnotationSection title="Surlignages" count={highlights.length} empty="Sélectionnez du texte pour surligner.">
            {highlights.map((a) => (
              <AnnotationRow key={a.id} onRemove={() => dispatch(removeAnnotation(entry.id, a.id))}>
                <span className="mt-0.5 inline-block h-3 w-3 shrink-0 rounded-sm border border-black/10" style={{ backgroundColor: a.kind === "highlight" ? a.color ?? "#fde68a" : undefined }} />
                <span className="line-clamp-3 text-xs text-gray-700">{a.kind === "highlight" ? a.excerpt : ""}</span>
              </AnnotationRow>
            ))}
          </AnnotationSection>

          <AnnotationSection title="Commentaires" count={comments.length} empty="Aucun commentaire.">
            {comments.map((a) => (
              <AnnotationRow key={a.id} onRemove={() => dispatch(removeAnnotation(entry.id, a.id))}>
                <span className="flex flex-col gap-0.5">
                  {a.kind === "comment" && a.excerpt && <span className="line-clamp-2 border-l-2 border-gray-300 pl-1.5 text-[11px] italic text-gray-500">{a.excerpt}</span>}
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

function AnnotationSection({ title, count, empty, children }: { title: string; count: number; empty: string; children: ReactNode }) {
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
      <button type="button" title="Retirer" className="shrink-0 rounded px-1 text-xs text-gray-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100" onClick={onRemove}>✕</button>
    </div>
  );
}

function EntryBody({ entry, documents, who }: { entry: DocEntry; documents: DocumentDef[]; who: (id: string) => string }) {
  const src = entry.source;

  if (src.kind === "scenario_doc") {
    const doc = documents.find((d) => d.id === src.document_id);
    if (!doc) return <p className="p-4 text-sm text-gray-400">Ce document n’est plus disponible dans le contexte courant.</p>;
    // Contenu texte/markdown → rendu riche annotable (surlignage par-dessus).
    if (doc.content) {
      return (
        <div className="px-5 py-4">
          <div className="mx-auto w-full max-w-[72ch]">
            <Markdown>{doc.content}</Markdown>
          </div>
        </div>
      );
    }
    // Fichier/PDF sans contenu texte → viewer (surlignage désactivé, V2).
    return <DocumentViewer documents={[doc]} />;
  }

  if (src.kind === "archived_mail") {
    const m = src.snapshot;
    return (
      <div className="px-5 py-4">
        <div className="mx-auto w-full max-w-[72ch]">
          <p className="text-[11px] text-gray-500">De : {who(m.from)} · À : {m.to.map(who).join(", ") || "—"} · {fmtDate(m.at)}</p>
          <h3 className="mt-1 text-base font-semibold text-gray-900">{m.subject}</h3>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{m.body}</p>
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
              <p className="text-[11px] font-medium text-gray-500">{who(msg.from)} · {fmtDate(msg.at)}</p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{msg.content}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
