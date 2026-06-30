/**
 * useNovadevContract — S2 NovaDev contract signature + negotiation state.
 *
 * 7 useStates around the contract overlay. Side-effect heavy handlers
 * (sendNegotiationMessage, handleNovadevSign) stay in page.tsx because
 * they reach into other shared state.
 */

import { useState } from "react";
import type { ContractClause, ContractThreadMessage } from "../contracts";

export type NovadevContractVars = {
  price: string;
  features: string[];
  equity: string | null;
  rawMailBody: string;
};

export function useNovadevContract() {
  const [showContractSignature, setShowContractSignature] = useState(false);
  const [contractSigned, setContractSigned] = useState(false);
  const [contractVars, setContractVars] = useState<NovadevContractVars>({
    price: "",
    features: [],
    equity: null,
    rawMailBody: "",
  });
  const [novadevArticles, setNovadevArticles] = useState<ContractClause[]>([]);
  const [novadevThread, setNovadevThread] = useState<ContractThreadMessage[]>([]);
  const [novadevThreadLoading, setNovadevThreadLoading] = useState(false);
  const [novadevNegInput, setNovadevNegInput] = useState("");

  return {
    showContractSignature, setShowContractSignature,
    contractSigned, setContractSigned,
    contractVars, setContractVars,
    novadevArticles, setNovadevArticles,
    novadevThread, setNovadevThread,
    novadevThreadLoading, setNovadevThreadLoading,
    novadevNegInput, setNovadevNegInput,
  };
}
