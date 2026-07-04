"use client";

/**
 * EditeurTool — éditeur de document en panneau (contrat §3).
 * Zone titre + corps markdown, autosave débouncé via `tool_state_changed`
 * (tout passe par le journal), compteur de caractères, template de
 * référence repliable (rendu Markdown) au-dessus de l'éditeur.
 * « Rendre le document » → deliverable_submitted
 *   { tool_id: "editeur", payload: { title, body } }.
 * Le joueur garde Messages/Mail/Documents à gauche et peut ouvrir une
 * bulle ChatDock pour demander conseil pendant qu'il rédige.
 */

import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/app/workspace/primitives/Markdown";
import { PrimaryButton } from "@/app/workspace/primitives/ui";
import type { ToolComponentProps } from "../types";
import {
  EDITEUR_TOOL_ID,
  normalizeEditeurState,
  parseEditeurConfig,
} from "./spec";

const SAVE_DEBOUNCE_MS = 700;

export function EditeurTool({ state, config, dispatch }: ToolComponentProps) {
  const { template, titleHint } = parseEditeurConfig(config);
  const persisted = normalizeEditeurState(state, config);

  const [title, setTitle] = useState(persisted.title);
  const [body, setBody] = useState(persisted.body);
  const [dirty, setDirty] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ title, body, dirty });
  latest.current = { title, body, dirty };

  // Flush à la fermeture du panneau : aucun brouillon ne se perd.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (latest.current.dirty) {
        dispatch({
          type: "tool_state_changed",
          tool_id: EDITEUR_TOOL_ID,
          state: { title: latest.current.title, body: latest.current.body },
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scheduleSave = (nextTitle: string, nextBody: string) => {
    setDirty(true);
    setSubmitted(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      dispatch({
        type: "tool_state_changed",
        tool_id: EDITEUR_TOOL_ID,
        state: { title: nextTitle, body: nextBody },
      });
      setDirty(false);
    }, SAVE_DEBOUNCE_MS);
  };

  const submit = () => {
    if (timer.current) clearTimeout(timer.current);
    dispatch({
      type: "tool_state_changed",
      tool_id: EDITEUR_TOOL_ID,
      state: { title, body },
    });
    setDirty(false);
    dispatch({
      type: "deliverable_submitted",
      tool_id: EDITEUR_TOOL_ID,
      payload: { title, body },
    });
    setSubmitted(true);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {/* Template de référence — repliable, rendu Markdown. */}
      {template.length > 0 && (
        <div className="shrink-0 border-b border-gray-200">
          <button
            type="button"
            aria-expanded={showTemplate}
            className="flex w-full items-center justify-between px-4 py-2 text-left text-xs font-medium text-gray-600 transition hover:bg-gray-50"
            onClick={() => setShowTemplate((v) => !v)}
          >
            <span>📋 Template de référence</span>
            <span aria-hidden>{showTemplate ? "▾" : "▸"}</span>
          </button>
          {showTemplate && (
            <div className="max-h-56 overflow-y-auto border-t border-gray-100 bg-gray-50/60 px-4 py-3">
              <Markdown>{template}</Markdown>
            </div>
          )}
        </div>
      )}

      <div className="shrink-0 border-b border-gray-100 px-4 py-2.5">
        <input
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-900 placeholder:font-normal placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          placeholder={titleHint.length > 0 ? titleHint : "Titre du document"}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            scheduleSave(e.target.value, body);
          }}
          aria-label="Titre du document"
        />
      </div>

      <textarea
        className="min-h-0 w-full flex-1 resize-none bg-white px-4 py-3 text-sm leading-relaxed text-gray-800 placeholder:text-gray-400 focus:outline-none"
        placeholder="Rédigez votre document… (markdown accepté)"
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          scheduleSave(title, e.target.value);
        }}
        aria-label="Corps du document"
      />

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-200 px-4 py-2.5">
        <p className="text-[11px] text-gray-400" aria-live="polite">
          {body.length} caractère{body.length > 1 ? "s" : ""}
          {" · "}
          {dirty ? "Enregistrement…" : submitted ? "Document rendu ✓" : "Enregistré"}
        </p>
        <PrimaryButton
          disabled={body.trim().length === 0}
          onClick={submit}
        >
          Rendre le document
        </PrimaryButton>
      </div>
    </div>
  );
}
