/**
 * usePacteContract — S0 (founder_00_cto) "pacte d'associés" state.
 *
 * 7 useStates around the pacte sign overlay + inline doc viewer.
 * Handlers (handleOpenPacteSign, sendPacteNegotiation) stay in page.tsx
 * because they reach into many shared helpers.
 */

import { useState } from "react";
import type { ContractClause, ContractThreadMessage } from "../contracts";

export type InlineDocContent = { title: string; content: string };

export function usePacteContract() {
  const [pacteSigned, setPacteSigned] = useState(false);
  const [inlineDocContent, setInlineDocContent] = useState<InlineDocContent | null>(null);
  const [showSignatureView, setShowSignatureView] = useState(false);
  const [pacteArticles, setPacteArticles] = useState<ContractClause[]>([]);
  const [amendmentInput, setAmendmentInput] = useState("");
  const [pacteThread, setPacteThread] = useState<ContractThreadMessage[]>([]);
  const [pacteThreadLoading, setPacteThreadLoading] = useState(false);

  return {
    pacteSigned, setPacteSigned,
    inlineDocContent, setInlineDocContent,
    showSignatureView, setShowSignatureView,
    pacteArticles, setPacteArticles,
    amendmentInput, setAmendmentInput,
    pacteThread, setPacteThread,
    pacteThreadLoading, setPacteThreadLoading,
  };
}
