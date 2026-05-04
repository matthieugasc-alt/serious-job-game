// ══════════════════════════════════════════════════════════════════
// ContractHandler — Orchestrates contract overlays (S0/S2/S4/S5)
// ══════════════════════════════════════════════════════════════════
//
// Pure function handler. No React hooks, no owned state.
// page.tsx owns all contract state (articles, threads, signed flags).
// This handler provides:
//   - Detection: which contract type applies to a scenario?
//   - Articles: build initial articles for first open
//   - CanSign: validate signing preconditions
//   - NegotiationConfig: actor/title/focus for sendNegotiationMessage
//   - ComputeSign: flag computation + mail draft + directives
//
// NOT registered in the phase handler registry — contracts are
// triggered by explicit user actions, not automatic phase detection.
//
// Fallback: resolveContractType returns null → page.tsx uses legacy.
// ══════════════════════════════════════════════════════════════════

import type {
  ContractPhaseHandler,
  ContractType,
  BuildArticlesParams,
  SignFlagsParams,
  SignResult,
  NegotiationConfig,
} from "./types";
import type { ContractClause } from "../contracts/types";
import {
  buildPacteArticles,
  buildNovadevArticles,
  buildExceptionsArticles,
  detectsExclusivity,
  DEVIS_FEATURES_DATA,
} from "../contracts";

// ══════════════════════════════════════════════════════════════════
// Scenario → ContractType mapping
// ══════════════════════════════════════════════════════════════════

const SCENARIO_CONTRACT_MAP: Record<string, ContractType> = {
  founder_00_cto: "s0_pacte",
  founder_02_novadev: "s2_novadev",
  founder_04_devis: "s4_devis",
  founder_05_vente_complexe: "s5_exceptions",
};

// ══════════════════════════════════════════════════════════════════
// Handler implementation
// ══════════════════════════════════════════════════════════════════

export const ContractHandler: ContractPhaseHandler = {
  type: "contract",

  // ── Detection ──────────────────────────────────────────────────

  resolveContractType(scenarioId: string): ContractType | null {
    return SCENARIO_CONTRACT_MAP[scenarioId] ?? null;
  },

  // ── Build initial articles ────────────────────────────────────

  buildArticles(type: ContractType, params: BuildArticlesParams): ContractClause[] {
    switch (type) {
      case "s0_pacte":
        return buildPacteArticles(params.playerName, params.ctoName || "CTO");
      case "s2_novadev":
        if (!params.novadevVars) return [];
        return buildNovadevArticles(params.novadevVars);
      case "s4_devis":
        // S4 doesn't use ContractClause articles — it has feature checkboxes
        return [];
      case "s5_exceptions":
        return buildExceptionsArticles(params.establishmentLabel || "l'établissement");
      default:
        return [];
    }
  },

  // ── Can sign? ─────────────────────────────────────────────────

  canSign(type: ContractType, threadOrMessagesLength: number): boolean {
    switch (type) {
      case "s0_pacte":
        return true; // no minimum thread length for pacte
      case "s2_novadev":
      case "s4_devis":
      case "s5_exceptions":
        return threadOrMessagesLength >= 2;
      default:
        return false;
    }
  },

  // ── Negotiation config ────────────────────────────────────────

  getNegotiationConfig(type: ContractType): NegotiationConfig {
    switch (type) {
      case "s0_pacte":
        return {
          actorId: "chosen_cto", // resolved by caller
          phaseTitle: "Négociation du pacte d'associés",
          phaseFocus:
            "Discussion sur une clause du pacte d'associés. Le CEO fait un commentaire ou demande une modification. Réponds de manière directe et naturelle.",
          fallbackError: "Je vais vérifier avec mon avocat et te reviens.",
        };
      case "s2_novadev":
        return {
          actorId: "thomas_novadev",
          phaseTitle: "Négociation du contrat de prestation NovaDev",
          phaseFocus:
            "Discussion contractuelle sur le contrat de prestation MVP. Le joueur négocie les clauses (prix, périmètre, délais, equity, livrables, conditions). Réponds en tant que Thomas Vidal, directeur technique de NovaDev. Ton sec et professionnel, maximum 3-4 phrases (hors bloc MODIFICATION).",
          fallbackError: "Je reviens vers vous rapidement.",
        };
      case "s4_devis":
        // S4 uses /api/chat directly, not sendNegotiationMessage
        return {
          actorId: "thomas_vidal",
          phaseTitle: "Négociation NovaDev",
          phaseFocus: "",
          fallbackError: "",
        };
      case "s5_exceptions":
        return {
          actorId: "claire_vasseur",
          phaseTitle: "Négociation des conditions particulières — Bon de commande",
          phaseFocus:
            "Discussion contractuelle sur les exceptions aux CGV. Le joueur négocie chaque clause avec la juriste de l'établissement. Réponds en tant que Me Claire Vasseur, juriste. Ton sec, juridique, professionnel. Maximum 3-4 phrases (hors bloc MODIFICATION).",
          fallbackError: "Je vais vérifier ce point avec la direction.",
        };
      default:
        return { actorId: "", phaseTitle: "", phaseFocus: "", fallbackError: "" };
    }
  },

  // ── Compute sign result ───────────────────────────────────────
  // Returns flags + mail draft + directives. Caller applies them.

  computeSign(type: ContractType, params: SignFlagsParams): SignResult {
    switch (type) {
      case "s0_pacte":
        return computeS0Sign(params);
      case "s2_novadev":
        return computeS2Sign(params);
      case "s4_devis":
        return computeS4Sign(params);
      case "s5_exceptions":
        return computeS5Sign(params);
      default:
        return { flags: {}, mailDraft: null, mailKind: null, shouldAdvancePhase: false, shouldFinishScenario: false };
    }
  },
};

// ══════════════════════════════════════════════════════════════════
// Per-type sign computation (internal)
// ══════════════════════════════════════════════════════════════════

function computeS0Sign(p: SignFlagsParams): SignResult {
  const flags: Record<string, any> = {};
  const articles = p.articles || [];
  const thread = p.thread || [];

  // Determine clean vs dirty
  const alreadyClean = !!p.currentFlags?.pacte_signed_clean;
  if (!alreadyClean) {
    flags.pacte_signed_dirty = true;
  }

  const art6Modified = articles.find((a) => a.id === "article_6")?.modifiedContent !== null;
  const hasExclusivityThread = thread.some(
    (m) => m.role === "player" && detectsExclusivity(m.content),
  );
  if (art6Modified || hasExclusivityThread || alreadyClean) {
    flags.pacte_signed_clean = true;
    flags.pacte_signed_dirty = false;
  }

  // Build mail draft
  const modifiedArticles = articles.filter((a) => a.modifiedContent !== null);
  const amendSummary =
    modifiedArticles.length > 0
      ? `\n\nArticles modifiés par négociation :\n${modifiedArticles.map((a) => `- ${a.title}`).join("\n")}`
      : "";

  const mailDraft = {
    to: p.ctoName || "CTO",
    cc: "",
    subject: "RE: Pacte d'associés — Orisio",
    body: `Bonjour,\n\nJ'ai relu et signé le pacte d'associés.${amendSummary}\n\nCordialement,\n${p.playerName || "CEO"}`,
    attachments: [{ id: "pacte_associes", label: "Pacte d'associés — Orisio SAS" }],
  };

  const mailKind = p.phaseMailConfig?.kind || "pacte_response";
  const shouldAdvancePhase = !!p.phaseMailConfig?.send_advances_phase;

  return { flags, mailDraft, mailKind, shouldAdvancePhase, shouldFinishScenario: false };
}

function computeS2Sign(p: SignFlagsParams): SignResult {
  const flags: Record<string, any> = { contract_signed: true };
  const articles = p.articles || [];

  // Extract price from article_3
  const priceArticle = articles.find((a) => a.id === "article_3");
  const priceContent = priceArticle?.modifiedContent || priceArticle?.content || "";
  const priceMatch = priceContent.match(/(\d[\d\s]*)\s*€/);
  if (priceMatch) {
    flags.contract_price = parseInt(priceMatch[1].replace(/\s/g, ""), 10);
  } else if (p.contractVars?.price && p.contractVars.price !== "À définir") {
    flags.contract_price = parseInt(p.contractVars.price, 10);
  }

  // Extract equity from capital article
  if (p.contractVars?.equity) {
    const eqArticle = articles.find(
      (a) =>
        a.content.includes("capital") ||
        (a.modifiedContent && a.modifiedContent.includes("capital")),
    );
    const eqContent = eqArticle?.modifiedContent || eqArticle?.content || p.contractVars.equity;
    const eqMatch = eqContent.match(/(\d+)\s*%/);
    if (eqMatch) {
      flags.contract_equity = parseInt(eqMatch[1], 10);
    }
  }

  flags.contract_amendments = articles.filter((a) => a.modifiedContent !== null).length;

  // Build mail draft
  const modifiedArticles = articles.filter((a) => a.modifiedContent !== null);
  const amendSummary =
    modifiedArticles.length > 0
      ? `\n\nArticles modifiés par négociation :\n${modifiedArticles.map((a) => `- ${a.title}`).join("\n")}`
      : "";

  const mailDraft = {
    to: "Thomas Vidal (NovaDev)",
    cc: "",
    subject: "RE: Contrat de prestation — MVP Orisio",
    body: `Bonjour Thomas,\n\nJ'ai relu et signé le contrat de prestation.${amendSummary}\n\nOn est partis.\n\nCordialement,\n${p.playerName || "CEO"}`,
    attachments: [{ id: "contrat_novadev", label: "Contrat signé" }],
  };

  return {
    flags,
    mailDraft,
    mailKind: "contract_signature",
    shouldAdvancePhase: true,
    shouldFinishScenario: true,
  };
}

function computeS4Sign(p: SignFlagsParams): SignResult {
  const flags: Record<string, any> = { devis_signed: true };
  const features = p.features || {};
  const dealTerms = p.dealTerms || { interessement: null, bsa: null, discount: 0 };

  // Compute total price
  const totalPrice = DEVIS_FEATURES_DATA.reduce(
    (sum, feat) => (features[feat.key] ? sum + feat.price : sum),
    0,
  );
  const cashPrice = Math.round(totalPrice * (1 - (dealTerms.discount || 0) / 100));

  flags.devis_total = totalPrice;
  flags.devis_cash_paid = cashPrice;
  flags.devis_discount = dealTerms.discount;
  flags.devis_selected_features = Object.keys(features).filter((k) => features[k]);

  // Intéressement
  if (dealTerms.interessement) {
    flags.deal_interessement_pct = dealTerms.interessement.pct;
    flags.deal_interessement_cap = dealTerms.interessement.cap;
    flags.deal_interessement_duration = dealTerms.interessement.duration;
    if (dealTerms.interessement.cap === null || dealTerms.interessement.cap === 0) {
      flags.deal_interessement_uncapped = true;
    } else {
      flags.deal_interessement_capped = true;
    }
  }

  // BSA
  if (dealTerms.bsa && dealTerms.bsa > 0) {
    flags.deal_bsa_pct = dealTerms.bsa;
    if (dealTerms.bsa > 3) {
      flags.deal_bsa_excessive = true;
    } else {
      flags.deal_bsa_reasonable = true;
    }
  }

  // Cash only
  if (!dealTerms.interessement && (!dealTerms.bsa || dealTerms.bsa === 0)) {
    flags.deal_cash_only = true;
  }

  // Royalties
  if (dealTerms.interessement) {
    flags.royalties_pct = dealTerms.interessement.pct;
    flags.royalties_cap = dealTerms.interessement.cap;
    flags.royalties_duration_years = dealTerms.interessement.duration;
  }

  return {
    flags,
    mailDraft: null, // S4 has no post-sign mail
    mailKind: null,
    shouldAdvancePhase: false,
    shouldFinishScenario: true,
  };
}

function computeS5Sign(p: SignFlagsParams): SignResult {
  const flags: Record<string, any> = { contract_signed: true };
  const articles = p.articles || [];

  const modifiedCount = articles.filter((a) => a.modifiedContent !== null).length;
  if (modifiedCount === 0) {
    flags.contract_too_generous = true;
  }
  flags.contract_amendments = modifiedCount;

  // Build mail draft
  const modifiedArticles = articles.filter((a) => a.modifiedContent !== null);
  const amendSummary =
    modifiedArticles.length > 0
      ? `\n\nConditions modifiées par négociation :\n${modifiedArticles.map((a) => `- ${a.title}`).join("\n")}`
      : "\n\nConditions acceptées telles quelles.";

  const mailDraft = {
    to: "Me Claire Vasseur",
    cc: "",
    subject: "RE: Document dérogatoire aux CGV — Orisio / Établissement",
    body: `Madame,\n\nJ'ai examiné et validé le bon de commande avec les conditions particulières.${amendSummary}\n\nCordialement,\n${p.playerName || "CEO"}`,
    attachments: [] as { id: string; label: string }[],
  };

  return {
    flags,
    mailDraft,
    mailKind: "exceptions_response",
    shouldAdvancePhase: true,
    shouldFinishScenario: false,
  };
}
