"use client";

/**
 * AnnotateButton — bouton 📓 + popover d'annotation, EXPORTÉ vers les
 * apps hôtes (Messages, Mail, Documents). L'hôte ne connaît RIEN du
 * carnet : il fournit une SourceRef complète et son dispatch, le bouton
 * construit l'op via api.annotate. Popover local, jamais de re-render de
 * l'hôte, micro-feedback « Ajouté au bloc-notes » puis disparition.
 *
 * SelectionAnnotate — variante flottante sur sélection de texte
 * (window.getSelection) : à monter DANS un conteneur `relative` ; l'icône
 * suit la sélection, le popover reprend l'extrait sélectionné.
 */

import { useEffect, useRef, useState, type RefObject } from "react";
import type { WorkspaceAction } from "@/app/lib/engine/workspace";
import { annotate } from "./api";
import type { SourceRef } from "./spec";

type Dispatch = (action: WorkspaceAction) => void;

// ─── Popover partagé (extrait + commentaire + Valider) ────────────

function AnnotatePopover({
  excerpt,
  onSubmit,
  onClose,
  side = "below",
  align = "left",
}: {
  excerpt: string;
  onSubmit: (comment: string) => void;
  onClose: () => void;
  side?: "above" | "below";
  align?: "left" | "right";
}) {
  const [comment, setComment] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  // Fermeture : Escape ou clic extérieur — sans toucher à l'hôte.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label="Ajouter au bloc-notes"
      className={`absolute z-50 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-xl ${
        side === "below" ? "top-full mt-1.5" : "bottom-full mb-1.5"
      } ${align === "right" ? "right-0" : "left-0"}`}
      onClick={(e) => e.stopPropagation()}
    >
      <p className="mb-2 line-clamp-3 rounded-lg border-l-2 border-indigo-300 bg-indigo-50/60 px-2.5 py-1.5 text-xs italic leading-relaxed text-gray-700">
        {excerpt}
      </p>
      <textarea
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        rows={2}
        className="w-full resize-none rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        placeholder="Un commentaire (optionnel)…"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit(comment.trim());
          }
        }}
      />
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <button
          type="button"
          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-gray-100"
          onClick={onClose}
        >
          Annuler
        </button>
        <button
          type="button"
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          onClick={() => onSubmit(comment.trim())}
        >
          Valider
        </button>
      </div>
    </div>
  );
}

/** Confirmation éphémère locale — jamais un modal, jamais bloquant. */
function DoneChip() {
  return (
    <span className="absolute right-0 top-full z-50 mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-gray-900/90 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg">
      ✓ Ajouté au bloc-notes
    </span>
  );
}

// ─── Bouton ancré à un élément (bulle de message, en-tête de mail) ─

interface AnnotateButtonProps {
  /** SourceRef complète (contrat §3) — construite par l'hôte. */
  source: SourceRef;
  /** Extrait affiché/enregistré — défaut : source.excerpt. */
  excerpt?: string;
  dispatch: Dispatch;
  /** Classes du bouton (ex : opacity-0 group-hover:opacity-100). */
  className?: string;
  side?: "above" | "below";
  align?: "left" | "right";
  title?: string;
}

export function AnnotateButton({
  source,
  excerpt,
  dispatch,
  className = "",
  side = "below",
  align = "left",
  title = "Ajouter au bloc-notes",
}: AnnotateButtonProps) {
  const [phase, setPhase] = useState<"idle" | "open" | "done">("idle");
  const text = excerpt ?? source.excerpt;

  useEffect(() => {
    if (phase !== "done") return;
    const t = setTimeout(() => setPhase("idle"), 1600);
    return () => clearTimeout(t);
  }, [phase]);

  const submit = (comment: string) => {
    dispatch(annotate({ source, excerpt: text, comment }));
    setPhase("done");
  };

  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        title={title}
        aria-label={title}
        className={`rounded-md px-1 py-0.5 text-sm leading-none text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 ${
          phase !== "idle" ? "!opacity-100" : ""
        } ${className}`}
        onClick={(e) => {
          e.stopPropagation();
          setPhase(phase === "open" ? "idle" : "open");
        }}
      >
        <span aria-hidden>📓</span>
      </button>
      {phase === "open" && (
        <AnnotatePopover
          excerpt={text}
          side={side}
          align={align}
          onSubmit={submit}
          onClose={() => setPhase("idle")}
        />
      )}
      {phase === "done" && <DoneChip />}
    </span>
  );
}

// ─── Icône flottante sur sélection de texte ───────────────────────

interface SelectionAnnotateProps {
  /** Conteneur `relative` qui englobe le texte sélectionnable. */
  containerRef: RefObject<HTMLElement | null>;
  /** Construit la SourceRef à partir de l'extrait sélectionné. */
  makeSource: (excerpt: string) => SourceRef;
  dispatch: Dispatch;
}

export function SelectionAnnotate({ containerRef, makeSource, dispatch }: SelectionAnnotateProps) {
  const [sel, setSel] = useState<{ text: string; x: number; y: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const update = () => {
      if (open) return; // popover ouvert : on fige la position
      const s = window.getSelection();
      const c = containerRef.current;
      if (!s || s.rangeCount === 0 || s.isCollapsed || !c) {
        setSel(null);
        return;
      }
      const text = s.toString().trim();
      const range = s.getRangeAt(0);
      if (!text || !c.contains(range.commonAncestorContainer)) {
        setSel(null);
        return;
      }
      const r = range.getBoundingClientRect();
      const cr = c.getBoundingClientRect();
      setSel({
        text: text.slice(0, 600),
        x: Math.max(4, Math.min(r.right - cr.left + c.scrollLeft, cr.width - 48)),
        y: Math.max(4, r.top - cr.top + c.scrollTop - 34),
      });
    };
    const c = containerRef.current;
    document.addEventListener("selectionchange", update);
    c?.addEventListener("scroll", update, true);
    return () => {
      document.removeEventListener("selectionchange", update);
      c?.removeEventListener("scroll", update, true);
    };
  }, [containerRef, open]);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1600);
    return () => clearTimeout(t);
  }, [done]);

  const submit = (comment: string) => {
    if (!sel) return;
    dispatch(annotate({ source: makeSource(sel.text), excerpt: sel.text, comment }));
    setOpen(false);
    setSel(null);
    setDone(true);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <>
      {sel && (
        <span className="absolute z-40" style={{ left: sel.x, top: sel.y }}>
          <button
            type="button"
            title="Ajouter la sélection au bloc-notes"
            aria-label="Ajouter la sélection au bloc-notes"
            className="rounded-lg border border-gray-200 bg-white px-1.5 py-1 text-sm leading-none shadow-md transition hover:border-indigo-300 hover:bg-indigo-50"
            onMouseDown={(e) => e.preventDefault() /* préserve la sélection */}
            onClick={() => setOpen(true)}
          >
            <span aria-hidden>📓</span>
          </button>
          {open && (
            <AnnotatePopover
              excerpt={sel.text}
              side="below"
              align="left"
              onSubmit={submit}
              onClose={() => {
                setOpen(false);
                setSel(null);
              }}
            />
          )}
        </span>
      )}
      {done && (
        <span className="absolute bottom-3 right-3 z-40 inline-flex items-center gap-1 rounded-full bg-gray-900/90 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg">
          ✓ Ajouté au bloc-notes
        </span>
      )}
    </>
  );
}
