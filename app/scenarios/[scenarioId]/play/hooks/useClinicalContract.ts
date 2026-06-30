/**
 * useClinicalContract — S3 (founder_03_clinical) phase 3 contract state.
 *
 * Centralises the 7 useStates of the clinical pilot contract overlay.
 * The buildClinicalArticles / handleClinicalSign / handleClinicalRefused
 * functions stay in page.tsx because they reach into session + scenario
 * + checkpoint + many other helpers.
 */

import { useState } from "react";

export type ClinicalArticle = {
  id: string;
  title: string;
  content: string;
  modifiedContent: string | null;
  toxic: boolean;
  moderate: boolean;
};

export type ClinicalNegMsg = { role: "player" | "juriste"; content: string };

export function useClinicalContract() {
  const [showClinicalContract, setShowClinicalContract] = useState(false);
  const [clinicalContractSigned, setClinicalContractSigned] = useState(false);
  const [clinicalContractArticles, setClinicalContractArticles] = useState<ClinicalArticle[]>([]);
  const [clinicalNegThread, setClinicalNegThread] = useState<ClinicalNegMsg[]>([]);
  const [clinicalNegLoading, setClinicalNegLoading] = useState(false);
  const [clinicalNegInput, setClinicalNegInput] = useState("");
  const [clinicalContractRefused, setClinicalContractRefused] = useState(false);

  return {
    showClinicalContract, setShowClinicalContract,
    clinicalContractSigned, setClinicalContractSigned,
    clinicalContractArticles, setClinicalContractArticles,
    clinicalNegThread, setClinicalNegThread,
    clinicalNegLoading, setClinicalNegLoading,
    clinicalNegInput, setClinicalNegInput,
    clinicalContractRefused, setClinicalContractRefused,
  };
}
