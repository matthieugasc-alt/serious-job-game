/**
 * useDevisNegotiation — S2 devis negotiation overlay state.
 *
 * 10 useStates + 1 ref. Handlers and JSX overlay stay in page.tsx
 * because they reach into many shared helpers (sendNegotiationMessage,
 * apiHeaders, etc.).
 */

import { useRef, useState } from "react";

export type DevisNegoMsg = { role: "player" | "npc"; content: string };

export type DealTerms = {
  interessement: { pct: number; cap: number | null; duration: number } | null;
  bsa: number | null;
  discount: number;
};

export function useDevisNegotiation() {
  const [showDevisNego, setShowDevisNego] = useState(false);
  const [devisSigned, setDevisSigned] = useState(false);
  const [devisNegoMessages, setDevisNegoMessages] = useState<DevisNegoMsg[]>([]);
  const [devisNegoInput, setDevisNegoInput] = useState("");
  const [devisNegoLoading, setDevisNegoLoading] = useState(false);
  const [devisFeatures, setDevisFeatures] = useState<Record<string, boolean>>({
    bug_fix: true,
    notifications: true,
    dashboard: true,
    materiel: true,
    api_si: true,
  });
  const [devisLocked, setDevisLocked] = useState(false);
  const [dealTerms, setDealTerms] = useState<DealTerms>({
    interessement: null,
    bsa: null,
    discount: 0,
  });
  const [prevDealTerms, setPrevDealTerms] = useState<DealTerms | null>(null);
  const devisNegoChatRef = useRef<HTMLDivElement>(null);

  return {
    showDevisNego, setShowDevisNego,
    devisSigned, setDevisSigned,
    devisNegoMessages, setDevisNegoMessages,
    devisNegoInput, setDevisNegoInput,
    devisNegoLoading, setDevisNegoLoading,
    devisFeatures, setDevisFeatures,
    devisLocked, setDevisLocked,
    dealTerms, setDealTerms,
    prevDealTerms, setPrevDealTerms,
    devisNegoChatRef,
  };
}
