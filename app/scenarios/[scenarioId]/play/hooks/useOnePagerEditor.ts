/**
 * useOnePagerEditor — S1 (founder_01_incubator) one-pager editing state.
 *
 * Tracks whether the editor overlay is open, whether the player has
 * touched the contentEditable, and whether the final submit has been
 * made. The actual editor JSX still lives in page.tsx; this hook just
 * owns the state so it stops cluttering page-level useStates.
 */

import { useState } from "react";

export function useOnePagerEditor() {
  const [showOnePagerEditor, setShowOnePagerEditor] = useState(false);
  const [onePagerEdited, setOnePagerEdited] = useState(false);
  const [onePagerSubmitted, setOnePagerSubmitted] = useState(false);

  return {
    showOnePagerEditor,
    setShowOnePagerEditor,
    onePagerEdited,
    setOnePagerEdited,
    onePagerSubmitted,
    setOnePagerSubmitted,
  };
}
