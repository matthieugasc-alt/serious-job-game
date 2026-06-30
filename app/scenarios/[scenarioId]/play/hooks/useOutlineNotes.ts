/**
 * useOutlineNotes — mindmap / outline notes state.
 *
 * Wraps the raw text, derived items, "copied" feedback and split-view
 * mode. Insertion handlers (into mail / chat) stay in page.tsx because
 * they need access to currentMailDraft + setPlayerInput which are
 * page-scoped.
 */

import { useMemo, useState } from "react";
import { parseOutlineText, type OutlineItem } from "../lib/outlineParser";

export type MindmapView = "split" | "editor" | "map";

export function useOutlineNotes() {
  const [outlineRawText, setOutlineRawText] = useState("");
  const outlineItems: OutlineItem[] = useMemo(
    () => parseOutlineText(outlineRawText),
    [outlineRawText],
  );
  const [outlineCopiedFeedback, setOutlineCopiedFeedback] = useState("");
  const [mindmapView, setMindmapView] = useState<MindmapView>("split");

  /** Shorthand to flash a feedback message ("Copié !", "Inséré !", …). */
  function flashFeedback(msg: string, ms = 1500) {
    setOutlineCopiedFeedback(msg);
    setTimeout(() => setOutlineCopiedFeedback(""), ms);
  }

  return {
    outlineRawText,
    setOutlineRawText,
    outlineItems,
    outlineCopiedFeedback,
    setOutlineCopiedFeedback,
    flashFeedback,
    mindmapView,
    setMindmapView,
  };
}
