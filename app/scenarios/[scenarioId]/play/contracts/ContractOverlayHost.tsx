"use client";
// ══════════════════════════════════════════════════════════════════
// ContractOverlayHost — renders all migrated contract overlays
// ══════════════════════════════════════════════════════════════════
//
// This component is UI-only. All state, handlers, and callbacks
// remain in page.tsx — this file only receives props and renders.
//
// Migrated overlays:
//  - S0: Pacte d'associés (ContractOverlay)
//  - S2: Contrat NovaDev (ContractOverlay)
//  - S4: Devis NovaDev V1 (custom split-view)
//  - S5: Bon de commande exceptions (ContractOverlay)
//
// NOT included: S3 clinical contract (not migrated)
// ══════════════════════════════════════════════════════════════════

import React from "react";
import type { ContractClause, ContractThreadMessage } from "./types";
import ContractOverlay from "./ContractOverlay";

// ══════════════════════════════════════════════════════════════════
// S4 pure helpers (no state dependency — extracted from IIFE)
// ══════════════════════════════════════════════════════════════════

export const DEVIS_FEATURES_DATA = [
  { key: "bug_fix", label: "Bug annulation (verrouillage + confirmation)", price: 2000 },
  { key: "notifications", label: "Notifications basiques", price: 3500 },
  { key: "dashboard", label: "Dashboard direction simple", price: 5000 },
  { key: "materiel", label: "Module gestion matériel", price: 7000 },
  { key: "api_si", label: "API SI établissement", price: 8000 },
] as const;

export const DISCOUNT_TABLE: Record<string, { int_only: number; bsa_only: number; both: number }> = {
  tier1: { int_only: 50, bsa_only: 40, both: 75 },
  tier2: { int_only: 40, bsa_only: 30, both: 60 },
  tier3: { int_only: 35, bsa_only: 25, both: 50 },
  tier4: { int_only: 30, bsa_only: 20, both: 45 },
};

export function getTierKey(totalPrice: number): string {
  return totalPrice <= 3000 ? "tier1" : totalPrice <= 8000 ? "tier2" : totalPrice <= 15000 ? "tier3" : "tier4";
}

export function computeDiscount(totalPrice: number, intPct: number, bsaPct: number): number {
  const tier = DISCOUNT_TABLE[getTierKey(totalPrice)];
  const hasInt = intPct > 0;
  const hasBsa = bsaPct > 0;
  if (hasInt && hasBsa) return tier.both;
  if (hasInt) return tier.int_only;
  if (hasBsa) return tier.bsa_only;
  return 0;
}

export interface DealTerms {
  interessement: { pct: number; cap: number | null; duration: number } | null;
  bsa: number | null;
  discount: number;
}

/**
 * Parse [TERMS:...] tag from Thomas's response and strip it from display.
 * Format: [TERMS: int=X cap=Xk dur=X bsa=X]
 */
export function parseDealTag(
  reply: string,
  totalPrice: number,
): { clean: string; parsed: DealTerms | null } {
  // Try new TERMS format first
  const termsMatch = reply.match(/\[TERMS:\s*int=(\d+(?:\.\d+)?)\s+cap=(\d+)k?\s+dur=(\d+)\s+bsa=(\d+(?:\.\d+)?)\s*\]/i);
  if (termsMatch) {
    const clean = reply.replace(termsMatch[0], "").trim();
    const intPct = parseFloat(termsMatch[1]);
    const intCap = parseInt(termsMatch[2]) * 1000;
    const intDur = parseInt(termsMatch[3]);
    const bsaPct = parseFloat(termsMatch[4]);
    const discount = computeDiscount(totalPrice, intPct, bsaPct);
    return {
      clean,
      parsed: {
        interessement: intPct > 0 ? { pct: intPct, cap: intCap > 0 ? intCap : null, duration: intDur } : null,
        bsa: bsaPct > 0 ? bsaPct : null,
        discount,
      },
    };
  }
  // Fallback: old DEAL format for backward compat
  const dealMatch = reply.match(/\[DEAL:\s*cash=(\d+),?\s*remise=(\d+(?:\.\d+)?)%,?\s*interessement=(\d+(?:\.\d+)?)%\s*plafond=(\d+)k?\s*duree=(\d+),?\s*bsa=(\d+(?:\.\d+)?)%\s*\]/i);
  if (dealMatch) {
    const clean = reply.replace(dealMatch[0], "").trim();
    const intPct = parseFloat(dealMatch[3]);
    const intCap = parseInt(dealMatch[4]) * 1000;
    const intDur = parseInt(dealMatch[5]);
    const bsaPct = parseFloat(dealMatch[6]);
    const discount = computeDiscount(totalPrice, intPct, bsaPct);
    return {
      clean,
      parsed: {
        interessement: intPct > 0 ? { pct: intPct, cap: intCap > 0 ? intCap : null, duration: intDur } : null,
        bsa: bsaPct > 0 ? bsaPct : null,
        discount,
      },
    };
  }
  return { clean: reply, parsed: null };
}

// ══════════════════════════════════════════════════════════════════
// Prop types
// ══════════════════════════════════════════════════════════════════

/** S0 — Pacte d'associés */
interface S0PacteConfig {
  visible: boolean;
  onClose: () => void;
  articles: ContractClause[];
  thread: ContractThreadMessage[];
  threadLoading: boolean;
  input: string;
  onInputChange: (v: string) => void;
  onSendMessage: () => void;
  onClauseAction?: (message: string) => void;
  signed: boolean;
  onSign: () => void;
  /** CTO info resolved from chosenCtoId */
  ctoInfo: { name: string; color: string; initials: string };
  currentPhaseId: string | null;
}

/** S2 — Contrat NovaDev */
interface S2NovadevConfig {
  visible: boolean;
  onClose: () => void;
  articles: ContractClause[];
  thread: ContractThreadMessage[];
  threadLoading: boolean;
  input: string;
  onInputChange: (v: string) => void;
  onSendMessage: () => void;
  onClauseAction?: (message: string) => void;
  signed: boolean;
  onSign: () => void;
}

/** S4 — Devis NovaDev V1 */
interface S4DevisConfig {
  visible: boolean;
  onClose: () => void;
  features: Record<string, boolean>;
  onFeatureChange: (features: Record<string, boolean>) => void;
  locked: boolean;
  onLock: () => void;
  messages: Array<{ role: "player" | "npc"; content: string }>;
  input: string;
  onInputChange: (v: string) => void;
  loading: boolean;
  onSendMessage: () => void;
  dealTerms: DealTerms;
  prevDealTerms: DealTerms | null;
  signed: boolean;
  onSign: () => void;
  chatRef: React.RefObject<HTMLDivElement | null>;
  establishmentLabel: string | null;
}

/** S5 — Bon de commande exceptions */
interface S5ExceptionsConfig {
  visible: boolean;
  onClose: () => void;
  articles: ContractClause[];
  thread: ContractThreadMessage[];
  threadLoading: boolean;
  input: string;
  onInputChange: (v: string) => void;
  onSendMessage: () => void;
  onClauseAction?: (message: string) => void;
  signed: boolean;
  onSign: () => void;
}

export interface ContractOverlayHostProps {
  playerName: string;
  s0: S0PacteConfig;
  s2: S2NovadevConfig;
  s4: S4DevisConfig;
  s5: S5ExceptionsConfig;
}

// ══════════════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════════════

export default function ContractOverlayHost({
  playerName,
  s0,
  s2,
  s4,
  s5,
}: ContractOverlayHostProps) {
  const dateStr = new Date().toLocaleDateString("fr-FR");

  return (
    <>
      {/* ── S0 — Pacte d'associés ── */}
      {s0.visible && (
        <ContractOverlay
          visible={s0.visible}
          onClose={s0.onClose}
          title="Signature électronique — Pacte d'associés"
          subtitle={`Orisio SAS · ${dateStr}`}
          clauses={s0.articles}
          headerContent={
            <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 13, lineHeight: 1.7, color: "#1a1a2e" }}>
              <p style={{ fontWeight: 600 }}>Entre :</p>
              <ol style={{ paddingLeft: 20, margin: "4px 0 12px" }}>
                <li><strong>{playerName || "CEO"}</strong> ({"«"} CEO {"»"})</li>
                <li><strong>Alexandre Morel</strong> ({"«"} CPO {"»"}), né le 14 mars 1986, demeurant 45 rue Judaïque, 33000 Bordeaux</li>
                <li><strong>{s0.ctoInfo.name}</strong> ({"«"} CTO {"»"})</li>
              </ol>
              <p>Ci-après dénommés ensemble {"«"} les Associés {"»"}.</p>
              <p><strong>Société :</strong> Orisio SAS, en cours d&apos;immatriculation, siège social à Bordeaux.</p>
              <hr style={{ border: "none", borderTop: "1px solid #e8e8e8", margin: "16px 0" }} />
            </div>
          }
          footerContent={
            <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 12, color: "#888" }}>
              <p>Fait en trois exemplaires originaux, à Bordeaux, le {dateStr}.</p>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                <span>{playerName || "CEO"}</span>
                <span>Alexandre Morel</span>
                <span>{s0.ctoInfo.name}</span>
              </div>
            </div>
          }
          thread={s0.thread}
          isLoading={s0.threadLoading}
          inputValue={s0.input}
          onInputChange={s0.onInputChange}
          onSendMessage={s0.onSendMessage}
          counterpart={{
            name: s0.ctoInfo.name,
            role: "CTO — Orisio SAS",
            color: s0.ctoInfo.color,
            initials: s0.ctoInfo.initials,
          }}
          playerName={playerName}
          loadingText={`${s0.ctoInfo.name} est en train de répondre...`}
          inputPlaceholder="Commenter une clause, demander une modification..."
          showNegotiation={!s0.signed && s0.currentPhaseId === "phase_3_pacte"}
          isSigned={s0.signed}
          onSign={s0.onSign}
          onClauseAction={s0.onClauseAction}
          signLabel="Signer et envoyer"
          progressSteps={[
            { label: "1. Relire le document", active: true },
            { label: "2. Négocier", active: s0.thread.length > 0 || s0.signed },
            { label: "3. Signer", active: s0.signed },
            { label: "4. Renvoyer par mail", active: false },
          ]}
        />
      )}

      {/* ── S2 — Contrat NovaDev ── */}
      {s2.visible && (
        <ContractOverlay
          visible={s2.visible}
          onClose={s2.onClose}
          title="Contrat de prestation — NovaDev Solutions"
          subtitle={`Orisio SAS × NovaDev Solutions · ${dateStr}`}
          clauses={s2.articles}
          headerContent={
            <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 13, lineHeight: 1.7, color: "#1a1a2e" }}>
              <p><strong>Entre les soussignés :</strong></p>
              <p><strong>Le Client :</strong><br/>Orisio SAS, société par actions simplifiée<br/>Représentée par {playerName || "CEO"} en qualité de Président</p>
              <p><strong>Le Prestataire :</strong><br/>NovaDev Solutions SARL<br/>Représentée par Thomas Vidal, Directeur technique<br/>12 rue Sainte-Catherine, 33000 Bordeaux</p>
              <hr style={{ border: "none", borderTop: "1px solid #e8e8e8", margin: "16px 0" }} />
            </div>
          }
          footerContent={
            <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 12, color: "#888" }}>
              <p>Fait en deux exemplaires originaux, à Bordeaux, le {dateStr}.</p>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                <span>{playerName || "CEO"} — Orisio SAS</span>
                <span>Thomas Vidal — NovaDev Solutions</span>
              </div>
            </div>
          }
          thread={s2.thread}
          isLoading={s2.threadLoading}
          inputValue={s2.input}
          onInputChange={s2.onInputChange}
          onSendMessage={s2.onSendMessage}
          counterpart={{
            name: "Thomas Vidal",
            role: "Directeur technique — NovaDev Solutions",
            color: "#37474F",
            initials: "TV",
          }}
          playerName={playerName}
          loadingText="Thomas Vidal est en train de répondre..."
          inputPlaceholder="Négocier le prix, le périmètre, les délais, l'equity..."
          showNegotiation={!s2.signed}
          isSigned={s2.signed}
          onClauseAction={s2.onClauseAction}
          signLabel="Signer et lancer le MVP"
          signatureSummary={
            s2.articles.filter(a => a.modifiedContent).length > 0
              ? `${s2.articles.filter(a => a.modifiedContent).length} article(s) modifié(s) par négociation. La signature vaut acceptation de la version actuelle.`
              : undefined
          }
          instructionBanner={s2.thread.length < 2 ? "Négociez au moins un point du contrat avant de signer." : undefined}
          onSign={s2.onSign}
          progressSteps={[
            { label: "1. Relire le contrat", active: true },
            { label: "2. Négocier", active: s2.thread.length > 0 || s2.signed },
            { label: "3. Signer", active: s2.signed },
          ]}
        />
      )}

      {/* ── S4 — Devis NovaDev V1 (custom overlay) ── */}
      {s4.visible && <DevisOverlay {...s4} playerName={playerName} />}

      {/* ── S5 — Bon de commande exceptions ── */}
      {s5.visible && (
        <ContractOverlay
          visible={s5.visible}
          onClose={s5.onClose}
          title="Bon de commande — Conditions particulières"
          subtitle={`Orisio SAS × Établissement · ${dateStr}`}
          clauses={s5.articles}
          headerContent={
            <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 13, lineHeight: 1.7, color: "#1a1a2e" }}>
              <p><strong>Document dérogatoire aux Conditions Générales de Vente</strong></p>
              <p>Les conditions ci-dessous dérogent aux CGV d{"'"}Orisio SAS et s{"'"}appliquent par priorité en cas de contradiction.</p>
              <hr style={{ border: "none", borderTop: "1px solid #e8e8e8", margin: "16px 0" }} />
            </div>
          }
          footerContent={
            <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 12, color: "#888" }}>
              <p>Fait en deux exemplaires, le {dateStr}.</p>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                <span>{playerName || "CEO"} — Orisio SAS</span>
                <span>Me Claire Vasseur — Direction des affaires juridiques</span>
              </div>
            </div>
          }
          thread={s5.thread}
          isLoading={s5.threadLoading}
          inputValue={s5.input}
          onInputChange={s5.onInputChange}
          onSendMessage={s5.onSendMessage}
          counterpart={{
            name: "Me Claire Vasseur",
            role: "Juriste — Direction des affaires juridiques",
            color: "#5D4037",
            initials: "CV",
          }}
          playerName={playerName}
          loadingText="Me Vasseur analyse votre proposition..."
          inputPlaceholder="Négocier la remise, la communication, les pénalités, l'engagement..."
          showNegotiation={!s5.signed}
          isSigned={s5.signed}
          onClauseAction={s5.onClauseAction}
          signLabel="Valider le bon de commande"
          signatureSummary={
            s5.articles.filter(a => a.modifiedContent).length > 0
              ? `${s5.articles.filter(a => a.modifiedContent).length} condition(s) modifiée(s) par négociation.`
              : "Aucune condition modifiée — vous acceptez les termes de l'établissement tels quels."
          }
          instructionBanner={s5.thread.length < 2 ? "Négociez au moins un point avant de valider." : undefined}
          onSign={s5.onSign}
          progressSteps={[
            { label: "1. Lire les conditions", active: true },
            { label: "2. Négocier", active: s5.thread.length > 0 || s5.signed },
            { label: "3. Valider", active: s5.signed },
          ]}
        />
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════
// S4 Devis — custom split-view overlay (internal component)
// ══════════════════════════════════════════════════════════════════

function DevisOverlay({
  onClose,
  features,
  onFeatureChange,
  locked,
  onLock,
  messages,
  input,
  onInputChange,
  loading,
  onSendMessage,
  dealTerms,
  prevDealTerms,
  signed,
  onSign,
  chatRef,
  playerName,
  establishmentLabel,
}: S4DevisConfig & { playerName: string }) {
  const totalPrice = DEVIS_FEATURES_DATA.reduce((sum, feat) =>
    features[feat.key] ? sum + feat.price : sum, 0
  );
  const cashPrice = Math.round(totalPrice * (1 - (dealTerms.discount || 0) / 100));

  const tierLabel = totalPrice <= 3000 ? "TRANCHE 1 (petit scope)" : totalPrice <= 8000 ? "TRANCHE 2 (scope moyen)" : totalPrice <= 15000 ? "TRANCHE 3 (gros scope)" : "TRANCHE 4 (scope maximal)";
  const tierShort = totalPrice <= 3000 ? "Petit scope" : totalPrice <= 8000 ? "Scope moyen" : totalPrice <= 15000 ? "Gros scope" : "Scope maximal";
  const tierColor = totalPrice <= 3000 ? { bg: "#dcfce7", fg: "#166534" } : totalPrice <= 8000 ? { bg: "#dbeafe", fg: "#1e40af" } : totalPrice <= 15000 ? { bg: "#fef3c7", fg: "#92400e" } : { bg: "#fee2e2", fg: "#991b1b" };

  const hasDeal = dealTerms.interessement || dealTerms.bsa || dealTerms.discount > 0;
  const canSign = messages.length >= 2;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10001,
      background: "rgba(0,0,0,0.7)", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, maxWidth: 1050, width: "100%",
        maxHeight: "92vh", display: "flex", flexDirection: "column",
        boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
      }}>
        {/* Header */}
        <div style={{
          padding: "14px 24px", background: "linear-gradient(135deg, #1a1a2e, #16213e)",
          borderRadius: "16px 16px 0 0",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: "#E65100", display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff",
            }}>TV</div>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#fff" }}>
                Devis NovaDev — Passage en V1
              </h2>
              <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                Thomas Vidal · NovaDev Solutions{establishmentLabel ? ` · Pilote : ${establishmentLabel}` : ""}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.1)", border: "none", fontSize: 18,
              color: "#fff", cursor: "pointer", padding: "4px 10px", borderRadius: 6,
            }}
          >✕</button>
        </div>

        {/* Split view: devis left, chat right */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Left: devis content (dynamic) */}
          <div style={{ flex: 1, overflow: "auto", padding: "20px 24px", borderRight: "1px solid #e8e8e8" }}>
            <div style={{ textAlign: "center", marginBottom: 12 }}>
              <span style={{
                display: "inline-block", padding: "3px 12px", borderRadius: 12,
                fontSize: 11, fontWeight: 700, background: tierColor.bg, color: tierColor.fg,
              }}>
                {tierShort}
              </span>
            </div>
            <p style={{ fontSize: 12, color: "#666", margin: "0 0 12px" }}>
              <strong>De :</strong> Thomas Vidal — NovaDev Solutions<br/>
              <strong>Pour :</strong> {playerName || "CEO"} — Orisio SAS
            </p>

            {/* Feature table with lock */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                <tr style={{ background: "#f5f5f5" }}>
                  <th style={{ textAlign: "left", padding: "6px 8px", border: "1px solid #ddd" }}>Module</th>
                  <th style={{ textAlign: "center", padding: "6px 8px", border: "1px solid #ddd", width: 60 }}>Inclus</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", border: "1px solid #ddd", width: 90 }}>Prix</th>
                </tr>
                {DEVIS_FEATURES_DATA.map((feat) => (
                  <tr key={feat.key} style={{ opacity: features[feat.key] ? 1 : 0.5 }}>
                    <td style={{ padding: "6px 8px", border: "1px solid #ddd" }}>{feat.label}</td>
                    <td style={{ padding: "6px 8px", border: "1px solid #ddd", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={features[feat.key]}
                        disabled={locked}
                        onChange={(e) => onFeatureChange({
                          ...features,
                          [feat.key]: e.target.checked,
                        })}
                        title={locked ? "Scope verrouillé — la négociation est en cours" : ""}
                        style={{ cursor: locked ? "not-allowed" : "pointer" }}
                      />
                    </td>
                    <td style={{ textAlign: "right", padding: "6px 8px", border: "1px solid #ddd" }}>
                      {features[feat.key] ? `${feat.price.toLocaleString("fr-FR")} €` : "—"}
                    </td>
                  </tr>
                ))}
                <tr style={{ background: "#f5f5f5", fontWeight: "bold" }}>
                  <td colSpan={2} style={{ padding: "6px 8px", border: "1px solid #ddd" }}>Sous-total HT</td>
                  <td style={{ textAlign: "right", padding: "6px 8px", border: "1px solid #ddd" }}>
                    {totalPrice.toLocaleString("fr-FR")} €
                  </td>
                </tr>
                {dealTerms.discount > 0 && (
                  <tr style={{ color: "#16a34a" }}>
                    <td colSpan={2} style={{ padding: "6px 8px", border: "1px solid #ddd" }}>
                      Remise négociée ({dealTerms.discount}%)
                    </td>
                    <td style={{ textAlign: "right", padding: "6px 8px", border: "1px solid #ddd" }}>
                      −{(totalPrice - cashPrice).toLocaleString("fr-FR")} €
                    </td>
                  </tr>
                )}
                <tr style={{ background: "#1a1a2e", color: "#fff", fontWeight: "bold" }}>
                  <td colSpan={2} style={{ padding: "8px", border: "1px solid #333" }}>
                    MONTANT À PAYER
                  </td>
                  <td style={{ textAlign: "right", padding: "8px", border: "1px solid #333" }}>
                    {cashPrice.toLocaleString("fr-FR")} €
                  </td>
                </tr>
              </tbody>
            </table>

            {locked && (
              <p style={{ fontSize: 10, color: "#999", marginTop: 4, fontStyle: "italic" }}>
                Scope verrouillé — la négociation est en cours.
              </p>
            )}

            {/* Dynamic deal terms section with visual diff */}
            <div style={{ marginTop: 16, padding: 12, background: hasDeal ? "#f0f9ff" : "#fafafa", borderRadius: 8, border: `1px solid ${hasDeal ? "#bae6fd" : "#e8e8e8"}` }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: hasDeal ? "#0369a1" : "#999" }}>
                Conditions négociées
                {prevDealTerms && hasDeal && (
                  <span style={{ fontSize: 10, fontWeight: 400, color: "#16a34a", marginLeft: 8 }}>● mis à jour</span>
                )}
              </h3>
              {!hasDeal ? (
                <p style={{ margin: 0, fontSize: 12, color: "#999", fontStyle: "italic" }}>
                  Aucune condition négociée pour l&apos;instant. Discutez avec Thomas pour définir les termes.
                </p>
              ) : (
                <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                  {dealTerms.interessement && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ color: "#e65100", fontWeight: 700 }}>Intéressement :</span>
                      {prevDealTerms?.interessement && prevDealTerms.interessement.pct !== dealTerms.interessement.pct && (
                        <span style={{ textDecoration: "line-through", color: "#999", fontSize: 11 }}>{prevDealTerms.interessement.pct}%</span>
                      )}
                      <span style={{ background: prevDealTerms?.interessement && prevDealTerms.interessement.pct !== dealTerms.interessement.pct ? "#dcfce7" : "transparent", padding: "0 4px", borderRadius: 3 }}>
                        {dealTerms.interessement.pct}% du CA net
                      </span>
                      {dealTerms.interessement.cap ? (
                        <>
                          {prevDealTerms?.interessement && prevDealTerms.interessement.cap !== dealTerms.interessement.cap && prevDealTerms.interessement.cap && (
                            <span style={{ textDecoration: "line-through", color: "#999", fontSize: 11 }}>(plafonné {(prevDealTerms.interessement.cap / 1000).toLocaleString("fr-FR")}k€)</span>
                          )}
                          <span style={{ color: "#666", background: prevDealTerms?.interessement && prevDealTerms.interessement.cap !== dealTerms.interessement.cap ? "#dcfce7" : "transparent", padding: "0 4px", borderRadius: 3 }}>
                            (plafonné {(dealTerms.interessement.cap / 1000).toLocaleString("fr-FR")}k€)
                          </span>
                        </>
                      ) : (
                        <span style={{ color: "#dc2626", fontWeight: 700 }}>SANS PLAFOND</span>
                      )}
                      {prevDealTerms?.interessement && prevDealTerms.interessement.duration !== dealTerms.interessement.duration && (
                        <span style={{ textDecoration: "line-through", color: "#999", fontSize: 11 }}>{prevDealTerms.interessement.duration} ans</span>
                      )}
                      <span style={{ color: "#666", background: prevDealTerms?.interessement && prevDealTerms.interessement.duration !== dealTerms.interessement.duration ? "#dcfce7" : "transparent", padding: "0 4px", borderRadius: 3 }}>
                        · {dealTerms.interessement.duration} ans
                      </span>
                    </div>
                  )}
                  {prevDealTerms?.interessement && !dealTerms.interessement && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: "#e65100", fontWeight: 700 }}>Intéressement :</span>
                      <span style={{ textDecoration: "line-through", color: "#999", fontSize: 11 }}>
                        {prevDealTerms.interessement.pct}% du CA net · {prevDealTerms.interessement.duration} ans
                      </span>
                      <span style={{ color: "#16a34a", fontSize: 11, fontWeight: 600 }}>Supprimé</span>
                    </div>
                  )}
                  {dealTerms.bsa != null && dealTerms.bsa > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: "#7c3aed", fontWeight: 700 }}>BSA/BSPCE :</span>
                      {prevDealTerms?.bsa != null && prevDealTerms.bsa > 0 && prevDealTerms.bsa !== dealTerms.bsa && (
                        <span style={{ textDecoration: "line-through", color: "#999", fontSize: 11 }}>{prevDealTerms.bsa}%</span>
                      )}
                      <span style={{ background: prevDealTerms?.bsa != null && prevDealTerms.bsa !== dealTerms.bsa ? "#dcfce7" : "transparent", padding: "0 4px", borderRadius: 3 }}>
                        {dealTerms.bsa}% du capital
                      </span>
                    </div>
                  )}
                  {prevDealTerms?.bsa != null && prevDealTerms.bsa > 0 && (dealTerms.bsa == null || dealTerms.bsa === 0) && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: "#7c3aed", fontWeight: 700 }}>BSA/BSPCE :</span>
                      <span style={{ textDecoration: "line-through", color: "#999", fontSize: 11 }}>{prevDealTerms.bsa}%</span>
                      <span style={{ color: "#16a34a", fontSize: 11, fontWeight: 600 }}>Supprimé</span>
                    </div>
                  )}
                  {dealTerms.discount > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: "#16a34a", fontWeight: 700 }}>Remise :</span>
                      {prevDealTerms && prevDealTerms.discount !== dealTerms.discount && prevDealTerms.discount > 0 && (
                        <span style={{ textDecoration: "line-through", color: "#999", fontSize: 11 }}>{prevDealTerms.discount}%</span>
                      )}
                      <span style={{ background: prevDealTerms && prevDealTerms.discount !== dealTerms.discount ? "#dcfce7" : "transparent", padding: "0 4px", borderRadius: 3 }}>
                        {dealTerms.discount}% sur le tarif (−{(totalPrice - cashPrice).toLocaleString("fr-FR")} €)
                      </span>
                    </div>
                  )}
                  {!dealTerms.interessement && !(dealTerms.bsa && dealTerms.bsa > 0) && dealTerms.discount === 0 && (
                    <div style={{ color: "#666" }}>Cash seul — tarif plein, pas de remise.</div>
                  )}
                </div>
              )}
            </div>

            <hr style={{ margin: "12px 0", border: "none", borderTop: "1px solid #e0e0e0" }} />
            <p style={{ fontSize: 11, color: "#888" }}><strong>PI :</strong> Cession complète et irrévocable de tout le code au Client.</p>
          </div>

          {/* Right: negotiation chat */}
          <div style={{ width: 380, display: "flex", flexDirection: "column", flexShrink: 0 }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #e8e8e8", fontSize: 12, fontWeight: 700, color: "#555" }}>
              💬 Négociation avec Thomas Vidal
            </div>
            <div ref={chatRef} style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
              {!locked && messages.length === 0 && (
                <div style={{ textAlign: "center", marginTop: 32, padding: "0 16px" }}>
                  <div style={{ fontSize: 28, marginBottom: 12 }}>📋</div>
                  <p style={{ color: "#555", fontSize: 13, lineHeight: 1.6, margin: "0 0 8px" }}>
                    <strong>Étape 1 :</strong> Cochez les modules que vous souhaitez commander à gauche.
                  </p>
                  <p style={{ color: "#888", fontSize: 12, lineHeight: 1.5, margin: "0 0 16px" }}>
                    Une fois votre sélection validée, le scope sera verrouillé et vous pourrez négocier les conditions avec Thomas.
                  </p>
                  <button
                    onClick={() => {
                      const anyChecked = Object.values(features).some(v => v);
                      if (!anyChecked) return;
                      onLock();
                    }}
                    disabled={!Object.values(features).some(v => v)}
                    style={{
                      padding: "10px 28px",
                      background: Object.values(features).some(v => v) ? "linear-gradient(135deg, #5b5fc7, #4338ca)" : "#ddd",
                      color: Object.values(features).some(v => v) ? "#fff" : "#999",
                      border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700,
                      cursor: Object.values(features).some(v => v) ? "pointer" : "not-allowed",
                      boxShadow: Object.values(features).some(v => v) ? "0 4px 12px rgba(91,95,199,0.3)" : "none",
                    }}
                  >
                    Valider le scope ({totalPrice.toLocaleString("fr-FR")} €)
                  </button>
                </div>
              )}
              {locked && messages.length === 0 && (
                <div style={{ textAlign: "center", color: "#888", fontSize: 12, marginTop: 24 }}>
                  Scope verrouillé à {totalPrice.toLocaleString("fr-FR")} €.<br/>
                  Écrivez à Thomas pour négocier les termes.
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: msg.role === "player" ? "flex-end" : "flex-start",
                  marginBottom: 8,
                }}>
                  <div style={{
                    maxWidth: "85%", padding: "8px 12px", borderRadius: 12,
                    background: msg.role === "player" ? "#5b5fc7" : "#f0f0f0",
                    color: msg.role === "player" ? "#fff" : "#333",
                    fontSize: 13, lineHeight: 1.5,
                  }}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 8 }}>
                  <div style={{ padding: "8px 16px", background: "#f0f0f0", borderRadius: 12, color: "#999", fontSize: 13 }}>
                    Thomas écrit...
                  </div>
                </div>
              )}
            </div>
            <div style={{ padding: "10px 16px", borderTop: "1px solid #e8e8e8", display: "flex", gap: 8 }}>
              <input
                type="text"
                value={input}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && locked) onSendMessage(); }}
                placeholder={locked ? "Votre position..." : "Validez le scope d'abord →"}
                disabled={!locked}
                style={{
                  flex: 1, padding: "8px 12px", border: "1px solid #ddd", borderRadius: 8,
                  fontSize: 13, fontFamily: "inherit",
                  background: locked ? "#fff" : "#f5f5f5",
                  color: locked ? "#333" : "#bbb",
                }}
              />
              <button
                onClick={onSendMessage}
                disabled={!locked || loading || !input.trim()}
                style={{
                  padding: "8px 16px", borderRadius: 8, border: "none",
                  background: !locked || loading ? "#ccc" : "#5b5fc7",
                  color: "#fff", fontSize: 13, fontWeight: 600,
                  cursor: !locked || loading ? "not-allowed" : "pointer",
                }}
              >↑</button>
            </div>
          </div>
        </div>

        {/* Signature bar */}
        <div style={{
          padding: "12px 24px", borderTop: "2px solid #ffd700",
          background: signed ? "#f0fdf4" : "#fffbeb",
        }}>
          {!signed ? (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 2 }}>
                  Signataire : {playerName || "CEO"} — Président, Orisio SAS
                </div>
                <div style={{ fontSize: 11, color: "#888" }}>
                  {!canSign
                    ? "Négociez d'abord les termes avec Thomas avant de signer."
                    : `À payer : ${cashPrice.toLocaleString("fr-FR")} €${dealTerms.interessement ? ` + ${dealTerms.interessement.pct}% intéressement` : ""}${dealTerms.bsa ? ` + ${dealTerms.bsa}% BSA` : ""}`
                  }
                </div>
              </div>
              <button
                disabled={!canSign}
                onClick={onSign}
                style={{
                  padding: "12px 32px", flexShrink: 0,
                  background: !canSign
                    ? "#ddd"
                    : "linear-gradient(135deg, #ffd700, #ffb300)",
                  border: !canSign ? "2px solid #ccc" : "2px solid #e6a800",
                  borderRadius: 10,
                  color: !canSign ? "#999" : "#1a1a2e",
                  fontSize: 15, fontWeight: 800,
                  cursor: !canSign ? "not-allowed" : "pointer",
                  boxShadow: !canSign ? "none" : "0 4px 16px rgba(255,215,0,0.3)",
                }}
              >
                ✍️ Signer le devis
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 20 }}>✅</span>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#16a34a" }}>
                Devis signé — Accord NovaDev formalisé
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
