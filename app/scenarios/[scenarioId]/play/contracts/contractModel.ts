// ══════════════════════════════════════════════════════════════════
// Contract module — data builders & state helpers
// ══════════════════════════════════════════════════════════════════

import type { ContractClause, ContractDocument, ContractThreadMessage } from "./types";

// ── Helpers ──
function clause(
  id: string,
  title: string,
  content: string,
  toxic = false,
  moderate = false,
): ContractClause {
  return { id, title, content, modifiedContent: null, toxic, moderate };
}

/**
 * Append a standard e-signature article as the last clause of any contract.
 * The article number is computed from the existing clauses.
 */
function appendESignatureClause(articles: ContractClause[]): ContractClause[] {
  const nextNum = articles.length + 1;
  return [
    ...articles,
    clause(
      `article_${nextNum}`,
      `Article ${nextNum} — Signature électronique`,
      `Conformément aux articles 1366 et 1367 du Code civil, les Parties conviennent que le présent document peut être signé par voie électronique. La signature électronique produit les mêmes effets juridiques qu'une signature manuscrite. Chaque Partie reconnaît avoir vérifié l'identité de son signataire et l'intégrité du document avant signature. Le procédé de signature utilisé garantit le lien entre la signature et l'acte auquel elle s'attache, conformément au règlement eIDAS (UE) n° 910/2014.`,
    ),
  ];
}

// ══════════════════════════════════════════════════════════════════
// S0 — Pacte d'associés
// ══════════════════════════════════════════════════════════════════

/**
 * Build the 15 articles of the pacte d'associés.
 * Article 6 is the pedagogical trap: CTO has NO exclusivity / full-time clause.
 */
export function buildPacteArticles(playerName: string, ctoName: string): ContractClause[] {
  const articles: ContractClause[] = [
    clause("article_1", "Article 1 — Objet",
      "Le présent pacte définit les droits et obligations des Associés entre eux, en complément des statuts de la Société. En cas de contradiction, le pacte prévaut entre les Associés."),

    clause("article_2", "Article 2 — Capital et répartition",
      `Capital social : 1 000 €, divisé en 1 000 actions de 1 € chacune.\n${playerName} (CEO) : 500 actions (50%) — Apport : 500 € en numéraire.\nAlexandre Morel (CPO) : 250 actions (25%) — Apport : 250 € en numéraire.\n${ctoName} (CTO) : 250 actions (25%) — Apport : 250 € en numéraire.`),

    clause("article_3", "Article 3 — Rôles et gouvernance",
      `${playerName} : Président de la SAS. Responsable de la stratégie commerciale, du business development et des opérations.\nAlexandre Morel : Directeur Produit. Responsable de la vision médicale, du lien avec le terrain clinique et de la validation des parcours utilisateurs.\n${ctoName} : Directeur Technique. Responsable de l'architecture logicielle, du développement produit et des choix technologiques.`),

    clause("article_4", "Article 4 — Engagements du CEO",
      `Le CEO s'engage à :\n- Exercer ses fonctions à plein temps (5 jours/semaine minimum)\n- Investir 15 000 € en compte courant d'associé dans les 30 jours suivant l'immatriculation\n- Ne pas exercer d'autre activité professionnelle rémunérée`),

    clause("article_5", "Article 5 — Engagements du CPO",
      `Alexandre Morel s'engage à :\n- Consacrer un minimum de 2 jours par semaine au projet\n- Assurer le lien avec le terrain clinique (retours utilisateurs, accès aux blocs, introductions)\n- Informer la Société de toute évolution de ses engagements professionnels extérieurs`),

    // ── THE TRAP: no full-time, no exclusivity ──
    clause("article_6", "Article 6 — Engagements du CTO",
      `Le CTO s'engage à :\n- Assurer la direction technique de la Société\n- Définir et mettre en œuvre l'architecture logicielle\n- Recruter et encadrer l'équipe technique le moment venu`,
      true),  // toxic = true (intentional omission)

    clause("article_7", "Article 7 — Vesting",
      "Les actions de chaque Associé sont soumises à un vesting de 4 ans :\n- Cliff : 12 mois. Aucune action n'est considérée comme acquise avant le premier anniversaire.\n- Acquisition : 25% des actions à la fin du cliff, puis acquisition mensuelle linéaire sur les 36 mois suivants.\n- Point de départ : date d'immatriculation de la Société."),

    clause("article_8", "Article 8 — Clause de leaver",
      "Good leaver (départ justifié : maladie, accord mutuel, révocation sans faute) : l'Associé sortant conserve ses actions acquises (vestées). Les actions non acquises sont rachetées par la Société à leur valeur nominale.\nBad leaver (démission volontaire avant 24 mois, faute grave, activité concurrente) : la totalité des actions non acquises est rachetée à leur valeur nominale. 50% des actions acquises est rachetée à leur valeur nominale."),

    clause("article_9", "Article 9 — Non-concurrence",
      "Chaque Associé s'interdit, pendant la durée de son association et pendant 24 mois après son départ, d'exercer une activité concurrente dans le domaine de l'optimisation des blocs opératoires et de la planification chirurgicale, en France."),

    clause("article_10", "Article 10 — Décisions stratégiques",
      "Les décisions suivantes nécessitent une majorité de 75% du capital :\n- Levée de fonds ou émission de nouvelles actions\n- Cession d'actifs significatifs (> 5 000 €)\n- Recrutement d'un nouvel associé\n- Pivot stratégique du produit\n- Dissolution de la Société\n- Révocation d'un Associé de ses fonctions"),

    clause("article_11", "Article 11 — Droit de préemption",
      "En cas de projet de cession d'actions par un Associé, les autres Associés disposent d'un droit de préemption. L'Associé cédant doit notifier son projet par écrit avec le prix proposé. Les autres disposent de 30 jours pour exercer leur droit."),

    clause("article_12", "Article 12 — Clause de sortie conjointe (tag-along)",
      "Si un Associé détenant plus de 50% du capital reçoit une offre de rachat, les autres Associés peuvent exiger d'être inclus dans la cession aux mêmes conditions."),

    clause("article_13", "Article 13 — Résolution des conflits",
      "En cas de désaccord persistant :\n1. Médiation par un tiers désigné d'un commun accord (30 jours)\n2. Si échec : arbitrage selon les règles du CMAP (Centre de Médiation et d'Arbitrage de Paris)"),

    clause("article_14", "Article 14 — Confidentialité",
      "Les Associés s'engagent à ne divulguer aucune information confidentielle relative à la Société, son produit, ses clients et ses données, pendant la durée du pacte et 3 ans après sa cessation."),

    clause("article_15", "Article 15 — Durée",
      "Le présent pacte prend effet à la date d'immatriculation de la Société et reste en vigueur tant que les signataires sont actionnaires."),
  ];
  return appendESignatureClause(articles);
}

// ── Contract summary builder (for AI prompt injection) ──

/**
 * Build a text summary of the contract's current state,
 * showing [MODIFIÉ] tags on amended clauses.
 */
export function buildContractSummary(clauses: ContractClause[]): string {
  return clauses
    .map(
      (a) =>
        `${a.title}: ${a.modifiedContent ? "[MODIFIÉ] " + a.modifiedContent : a.content}`,
    )
    .join("\n");
}

// ══════════════════════════════════════════════════════════════════
// S2 — Contrat de prestation NovaDev
// ══════════════════════════════════════════════════════════════════

export interface NovadevContractVars {
  price: string;              // e.g. "15000" or "À définir"
  features: string[];         // e.g. ["Planning temps réel", "Notifications"]
  equity: string | null;      // e.g. "3%" or null
  playerName: string;
}

/**
 * Build the structured articles for the NovaDev development contract.
 * Dynamic content based on what the player negotiated in phase 2.
 */
export function buildNovadevArticles(vars: NovadevContractVars): ContractClause[] {
  const priceDisplay = vars.price && vars.price !== "À définir"
    ? `${parseInt(vars.price).toLocaleString("fr-FR")} € HT`
    : "Selon accord verbal";

  const featuresText = vars.features.length > 0
    ? vars.features.map((f, i) => `Module ${i + 1} — ${f}`).join("\n")
    : "Fonctionnalités selon accord entre les parties.";

  const articles: ContractClause[] = [
    clause("article_1", "Article 1 — Objet",
      "Le Prestataire s'engage à réaliser pour le compte du Client le développement d'un MVP de la plateforme Orisio, selon le périmètre défini à l'Article 2."),

    clause("article_2", "Article 2 — Périmètre de la prestation",
      `${featuresText}\n\nInfrastructure : Hébergement conforme HDS (OVH Healthcare). API REST sécurisée. Interface web responsive.`),

    clause("article_3", "Article 3 — Prix et conditions de paiement",
      `Le prix total de la prestation est fixé à ${priceDisplay}.\nPaiement en trois échéances : 30% à la signature, 40% à la livraison beta, 30% à la recette finale.`),
  ];

  let nextNum = 4;

  if (vars.equity) {
    articles.push(
      clause(`article_${nextNum}`, `Article ${nextNum} — Participation au capital`,
        `En complément du prix cash, le Client cède au Prestataire ${vars.equity} du capital d'Orisio SAS, via BSPCE avec vesting de 2 ans et cliff de 6 mois.\nLe Prestataire n'a pas de droit de vote ni de siège au board.`),
    );
    nextNum++;
  }

  articles.push(
    clause(`article_${nextNum}`, `Article ${nextNum} — Délais de réalisation`,
      "Prestation réalisée en 7 semaines à compter de la signature."),
  );
  nextNum++;

  articles.push(
    clause(`article_${nextNum}`, `Article ${nextNum} — Propriété intellectuelle`,
      "Le code source est la propriété exclusive du Client dès paiement intégral."),
  );
  nextNum++;

  articles.push(
    clause(`article_${nextNum}`, `Article ${nextNum} — Confidentialité`,
      "Le Prestataire s'engage à maintenir la confidentialité de toutes les informations relatives au projet."),
  );
  nextNum++;

  articles.push(
    clause(`article_${nextNum}`, `Article ${nextNum} — Garantie`,
      "Garantie de bon fonctionnement pendant 3 mois après livraison. Corrections de bugs incluses."),
  );
  nextNum++;

  articles.push(
    clause(`article_${nextNum}`, `Article ${nextNum} — Résiliation`,
      "Résiliation possible avec préavis de 15 jours. Le prorata du travail effectué est dû."),
  );

  return appendESignatureClause(articles);
}

// ══════════════════════════════════════════════════════════════════
// S5 — Bon de commande — Conditions particulières (exceptions CGV)
// ══════════════════════════════════════════════════════════════════

/**
 * Build the 5 exception articles for the S5 bon de commande.
 * These are conditions particulières proposed by the establishment's jurist
 * that derogate from Orisio's CGV.
 */
export function buildExceptionsArticles(establishmentName: string): ContractClause[] {
  const articles: ContractClause[] = [
    clause("article_1", "Article 1 — Remise commerciale",
      `En tant que premier client référencé, l'établissement ${establishmentName} bénéficie d'une remise de 15% sur le tarif par salle/mois communiqué à la DSI.`,
      false, true),  // moderate = true (negotiable)

    clause("article_2", "Article 2 — Communication (déroge à l'art. 6.5 CGV)",
      `L'établissement refuse toute communication publique de la part de l'Éditeur mentionnant l'établissement comme client ou référence, y compris sur le site web, en congrès ou dans des supports marketing.`,
      false, true),

    clause("article_3", "Article 3 — Pénalités de retard de paiement (déroge à l'art. 3.5 CGV)",
      `Les pénalités de retard de paiement prévues aux CGV sont supprimées. L'établissement étant un acteur public, les délais de mandatement sont une contrainte administrative incompressible.`,
      false, true),

    clause("article_4", "Article 4 — Pénalités d'indisponibilité (clause additionnelle)",
      `En cas de disponibilité inférieure à 99,5% sur un mois donné, un avoir proportionnel au temps d'indisponibilité est appliqué. En cas d'indisponibilité supérieure à 48h consécutives, résiliation de plein droit sans indemnité.`,
      false, true),

    clause("article_5", "Article 5 — Durée d'engagement (déroge à l'art. 2.1 CGV)",
      `L'engagement de 36 mois prévu aux CGV est remplacé par une période de test de 6 mois, suivie d'un engagement de 12 mois renouvelable tacitement.`,
      true, false),  // toxic = true (jurist won't budge on this one)
  ];
  return appendESignatureClause(articles);
}

// ── Exclusivity detection (S0 pedagogical mechanic) ──

/** Broad regex matching any mention of exclusivity / full-time / Article 6 issues */
export const EXCLUSIVITY_REGEX =
  /exclusivit|full.?time|temps.?(plein|complet)|article.?6|clause.?6|travail.*ailleurs|autre.*projet|autre.*activit|concurren|non.?concur|plein.?temps|consacr|dedi|engag.*plein|restrict|interdi|emp[eê]ch|ne.*(pas|peut).*(travaill|exerc)|uniquement.*orisio|100.?%|à temps complet/i;

/**
 * Check if the player's message mentions exclusivity concerns.
 * Used for the S0 pedagogical trap on Article 6.
 */
export function detectsExclusivity(text: string): boolean {
  return EXCLUSIVITY_REGEX.test(text);
}

/** Check if the AI reply indicates acceptance */
export function detectsAcceptance(reply: string): boolean {
  return /accept|d'accord|on ajoute|logique|ok|pas de probl[eè]me|entendu|valid|je signe|bonne id[ée]e|c'est not[ée]|c'est fait|modifi|ajout/i.test(reply);
}
