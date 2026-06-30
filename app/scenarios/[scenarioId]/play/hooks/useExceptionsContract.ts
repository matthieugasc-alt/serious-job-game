/**
 * useExceptionsContract — S5 phase 5 (Négociation CGV exceptions) state.
 *
 * The signing/negotiation overlay JSX still lives in page.tsx; this
 * hook just centralises the 6 useStates used by it. Side-effect heavy
 * handlers (handleOpenExceptionsSign, exceptions negotiation send) stay
 * in page.tsx because they reach into other shared state.
 */

import { useState } from "react";
import type { ContractClause, ContractThreadMessage } from "../contracts";

export function useExceptionsContract() {
  const [showExceptionsOverlay, setShowExceptionsOverlay] = useState(false);
  const [exceptionsArticles, setExceptionsArticles] = useState<ContractClause[]>([]);
  const [exceptionsThread, setExceptionsThread] = useState<ContractThreadMessage[]>([]);
  const [exceptionsThreadLoading, setExceptionsThreadLoading] = useState(false);
  const [exceptionsNegInput, setExceptionsNegInput] = useState("");
  const [exceptionsSigned, setExceptionsSigned] = useState(false);

  return {
    showExceptionsOverlay, setShowExceptionsOverlay,
    exceptionsArticles, setExceptionsArticles,
    exceptionsThread, setExceptionsThread,
    exceptionsThreadLoading, setExceptionsThreadLoading,
    exceptionsNegInput, setExceptionsNegInput,
    exceptionsSigned, setExceptionsSigned,
  };
}
