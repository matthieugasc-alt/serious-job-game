"use client";

/**
 * NotesTool — bloc-notes markdown simple (contrat §3).
 * Autosave débouncé via `tool_state_changed` : tout passe par le journal.
 */

import { useEffect, useRef, useState } from "react";
import type { Json } from "@/app/lib/engine/mechanics";
import type { ToolComponentProps } from "../types";
import { NOTES_TOOL_ID } from "./spec";

const SAVE_DEBOUNCE_MS = 700;

function contentOf(state: Json): string {
  if (state && typeof state === "object" && !Array.isArray(state)) {
    const c = (state as { content?: Json }).content;
    if (typeof c === "string") return c;
  }
  return "";
}

export function NotesTool({ state, dispatch }: ToolComponentProps) {
  const [content, setContent] = useState<string>(() => contentOf(state));
  const [dirty, setDirty] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ content, dirty });
  latest.current = { content, dirty };

  // Flush à la fermeture du panneau : aucune note ne se perd.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (latest.current.dirty) {
        dispatch({
          type: "tool_state_changed",
          tool_id: NOTES_TOOL_ID,
          state: { content: latest.current.content },
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChange = (value: string) => {
    setContent(value);
    setDirty(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      dispatch({
        type: "tool_state_changed",
        tool_id: NOTES_TOOL_ID,
        state: { content: value },
      });
      setDirty(false);
    }, SAVE_DEBOUNCE_MS);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2.5">
        <p className="text-xs font-medium text-gray-500">Notes personnelles · markdown accepté</p>
        <p className="text-[11px] text-gray-400" aria-live="polite">
          {dirty ? "Enregistrement…" : "Enregistré"}
        </p>
      </div>
      <textarea
        className="min-h-0 w-full flex-1 resize-none bg-white px-4 py-3 text-sm leading-relaxed text-gray-800 placeholder:text-gray-400 focus:outline-none"
        placeholder="Notez vos observations, hypothèses, chiffres clés…"
        value={content}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Bloc-notes"
      />
    </div>
  );
}
