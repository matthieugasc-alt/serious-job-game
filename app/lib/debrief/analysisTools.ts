/**
 * analysisTools.ts — couche de MAPPING typée des outils d'analyse
 * pédagogique par mécanique (spec produit issue des fichiers
 * Outils_analyse_mecanique_*.md, rendue exploitable par le moteur).
 *
 * Rôle : documenter, pour chaque mécanique, QUELS outils d'analyse
 * existent, à quelles données de session ils se rattachent, comment ils
 * apparaissent au débrief et au replay, et leur statut d'implémentation.
 *
 * COUCHE INTERNE : jamais montrée au joueur (le bilan reste un bloc unifié
 * sans vocabulaire moteur). Elle alimente la passe IA finale (collect.ts →
 * debrief-final) et servira au replay quand il sera construit.
 *
 * PUR / node-safe.
 */

export type AnalysisToolStatus = "V1" | "V2" | "non-implémenté";

export interface AnalysisTool {
  id: string;
  title: string;
  description: string;
  /** Mécanique associée (id du registre). */
  mechanic: string;
  /** Facettes de données de session exploitées (clés du collecteur /
   *  WorkspaceActions : conversation, documents, decisions, deliverable,
   *  speech, negotiation, plan, ideas, notes, tasks, contract, whiteboard). */
  dataNeeded: string[];
  /** Comment l'outil nourrit le débrief unifié. */
  debriefDisplay: string;
  /** Comment il apparaîtra au replay (non construit à ce jour). */
  replayDisplay: string;
  status: AnalysisToolStatus;
}

const REPLAY_TODO = "Replay non implémenté (prévu)";

export const ANALYSIS_TOOLS: Record<string, AnalysisTool[]> = {
  entretien: [
    { id: "qa_question_analysis", title: "Analyse des questions", description: "Types de questions (ouverte/fermée/relance/clarification/orientée), sans-réponse, temps de parole.", mechanic: "entretien", dataNeeded: ["conversation"], debriefDisplay: "Nourrit le bilan : conduite de l'échange, exemples de questions.", replayDisplay: REPLAY_TODO, status: "V1" },
    { id: "qa_discovery_timeline", title: "Chronologie de découverte", description: "Quand les informations clés ont été obtenues (à temps / tard / jamais).", mechanic: "entretien", dataNeeded: ["conversation"], debriefDisplay: "Nourrit le bilan : ce qui a été découvert et manqué.", replayDisplay: REPLAY_TODO, status: "V1" },
    { id: "qa_coverage_map", title: "Carte de couverture", description: "Dimensions attendues (besoins, contraintes, budget, décideurs, risques, délais, parties prenantes) couvertes vs angles morts.", mechanic: "entretien", dataNeeded: ["conversation"], debriefDisplay: "Radar de compétences (couverture).", replayDisplay: REPLAY_TODO, status: "V2" },
    { id: "qa_actor_map", title: "Carte des acteurs", description: "Qui décide/influence/bloque — perception du joueur vs réalité.", mechanic: "entretien", dataNeeded: ["conversation"], debriefDisplay: "V2 : requiert une vérité-terrain par scénario.", replayDisplay: REPLAY_TODO, status: "V2" },
  ],
  analyse: [
    { id: "doc_sources_map", title: "Carte des sources", description: "Documents ouverts / ignorés / lus en profondeur / parcourus.", mechanic: "analyse", dataNeeded: ["documents"], debriefDisplay: "Nourrit le bilan : exploitation des sources.", replayDisplay: REPLAY_TODO, status: "V1" },
    { id: "doc_transformation", title: "Transformation de l'information", description: "Entonnoir document → annotation → note → décision.", mechanic: "analyse", dataNeeded: ["documents", "notes", "decisions"], debriefDisplay: "Nourrit le bilan : où l'information se perd.", replayDisplay: REPLAY_TODO, status: "V1" },
    { id: "doc_evidence_map", title: "Carte des preuves", description: "Pour chaque conclusion : sources utilisées, niveau de confiance.", mechanic: "analyse", dataNeeded: ["documents", "notes"], debriefDisplay: "Nourrit le bilan (IA) : conclusions fondées ou non.", replayDisplay: REPLAY_TODO, status: "V1" },
    { id: "doc_coherence", title: "Cohérence documentaire", description: "Contradictions détectées / ignorées, confirmations croisées.", mechanic: "analyse", dataNeeded: ["documents"], debriefDisplay: "V2 : requiert des contradictions déclarées.", replayDisplay: REPLAY_TODO, status: "V2" },
  ],
  decision: [
    { id: "dec_reasoning", title: "Reconstruction du raisonnement", description: "Contexte → options → critères → hypothèses → décision.", mechanic: "decision", dataNeeded: ["decisions"], debriefDisplay: "Nourrit le bilan : construction de la décision.", replayDisplay: REPLAY_TODO, status: "V1" },
    { id: "dec_options", title: "Comparaison des options", description: "Options envisagées, critères favorables/défavorables, scores.", mechanic: "decision", dataNeeded: ["decisions"], debriefDisplay: "Nourrit le bilan : arbitrage.", replayDisplay: REPLAY_TODO, status: "V1" },
    { id: "dec_risks", title: "Analyse des risques", description: "Risques identifiés, prévention/guérison, re-cotation résiduelle.", mechanic: "decision", dataNeeded: ["decisions"], debriefDisplay: "Nourrit le bilan : gestion des risques.", replayDisplay: REPLAY_TODO, status: "V1" },
    { id: "dec_biases", title: "Analyse des biais cognitifs", description: "Confirmation, ancrage, excès de confiance, statu quo — pistes.", mechanic: "decision", dataNeeded: ["decisions", "conversation"], debriefDisplay: "Nourrit le bilan (IA) : pistes de biais.", replayDisplay: REPLAY_TODO, status: "V1" },
    { id: "dec_profiles", title: "Comparaison profils experts", description: "Confronter la décision à plusieurs profils crédibles.", mechanic: "decision", dataNeeded: ["decisions"], debriefDisplay: "V2.", replayDisplay: REPLAY_TODO, status: "V2" },
  ],
  production: [
    { id: "prod_structure", title: "Analyse de la structure", description: "Cohérence de construction du livrable (sections attendues).", mechanic: "production", dataNeeded: ["deliverable"], debriefDisplay: "Nourrit le bilan : structure.", replayDisplay: REPLAY_TODO, status: "V1" },
    { id: "prod_traceability", title: "Traçabilité des affirmations", description: "Chaque affirmation → sa source (document/note/décision).", mechanic: "production", dataNeeded: ["deliverable", "documents", "notes"], debriefDisplay: "Nourrit le bilan (IA) : livrable fondé sur des preuves.", replayDisplay: REPLAY_TODO, status: "V1" },
    { id: "prod_adequacy", title: "Adéquation avec la demande", description: "Le livrable répond-il réellement à la commande initiale ?", mechanic: "production", dataNeeded: ["deliverable"], debriefDisplay: "Nourrit le bilan (IA).", replayDisplay: REPLAY_TODO, status: "V1" },
    { id: "prod_versions", title: "Évolution du livrable", description: "Comparaison des versions successives.", mechanic: "production", dataNeeded: ["deliverable"], debriefDisplay: "Non implémenté : pas de versionnage capturé.", replayDisplay: REPLAY_TODO, status: "non-implémenté" },
  ],
  presentation: [
    { id: "pres_structure", title: "Structure de la présentation", description: "Enchaînement introduction → contexte → démonstration → reco → conclusion.", mechanic: "presentation", dataNeeded: ["speech"], debriefDisplay: "Nourrit le bilan : structure de l'exposé.", replayDisplay: REPLAY_TODO, status: "V1" },
    { id: "pres_time", title: "Gestion du temps", description: "Durée, débit (mots/min), rythme.", mechanic: "presentation", dataNeeded: ["speech"], debriefDisplay: "Nourrit le bilan.", replayDisplay: REPLAY_TODO, status: "V1" },
    { id: "pres_questions", title: "Gestion des questions", description: "Questions reçues / répondues / éludées.", mechanic: "presentation", dataNeeded: ["conversation", "speech"], debriefDisplay: "Nourrit le bilan (pattern Q&A).", replayDisplay: REPLAY_TODO, status: "V1" },
    { id: "pres_impact", title: "Impact du discours", description: "Réactions des acteurs (adhésion, scepticisme, objection).", mechanic: "presentation", dataNeeded: ["conversation"], debriefDisplay: "Nourrit le bilan (IA).", replayDisplay: REPLAY_TODO, status: "V1" },
  ],
  planification: [
    { id: "plan_coherence", title: "Cohérence du plan", description: "Ordre des étapes, jalons, séquencement.", mechanic: "planification", dataNeeded: ["plan"], debriefDisplay: "Nourrit le bilan : logique du plan.", replayDisplay: REPLAY_TODO, status: "V1" },
    { id: "plan_dependencies", title: "Analyse des dépendances", description: "Dépendances identifiées et leurs impacts.", mechanic: "planification", dataNeeded: ["plan"], debriefDisplay: "Nourrit le bilan.", replayDisplay: REPLAY_TODO, status: "V1" },
    { id: "plan_load", title: "Analyse de la charge", description: "Répartition des tâches (à faire/en cours/terminé), avancement.", mechanic: "planification", dataNeeded: ["plan"], debriefDisplay: "Nourrit le bilan.", replayDisplay: REPLAY_TODO, status: "V1" },
    { id: "plan_risks", title: "Gestion des risques du plan", description: "Risques anticipés, mesures préventives.", mechanic: "planification", dataNeeded: ["plan", "decisions"], debriefDisplay: "Nourrit le bilan.", replayDisplay: REPLAY_TODO, status: "V1" },
    { id: "plan_robustness", title: "Robustesse du plan", description: "Le plan tient-il face aux imprévus (retard, indispo, contrainte) ?", mechanic: "planification", dataNeeded: ["plan"], debriefDisplay: "Nourrit le bilan (IA).", replayDisplay: REPLAY_TODO, status: "V1" },
    { id: "plan_priorities", title: "Analyse des priorités", description: "Priorités choisies vs attendues, tâches critiques.", mechanic: "planification", dataNeeded: ["plan"], debriefDisplay: "V2 : requiert des priorités attendues déclarées.", replayDisplay: REPLAY_TODO, status: "V2" },
  ],
  negociation: [
    { id: "nego_concessions", title: "Carte des concessions", description: "Mouvements par terme (ouverture → final), concessions.", mechanic: "negociation", dataNeeded: ["negotiation"], debriefDisplay: "Nourrit le bilan : dynamique des échanges.", replayDisplay: REPLAY_TODO, status: "V1" },
    { id: "nego_balance", title: "Équilibre de l'accord", description: "Accord équilibré / déséquilibré, gains et concessions.", mechanic: "negociation", dataNeeded: ["negotiation"], debriefDisplay: "Nourrit le bilan (IA).", replayDisplay: REPLAY_TODO, status: "V1" },
    { id: "nego_timeline", title: "Chronologie de la négociation", description: "Ouverture, propositions, contre-propositions, accord.", mechanic: "negociation", dataNeeded: ["negotiation"], debriefDisplay: "Nourrit le bilan.", replayDisplay: REPLAY_TODO, status: "V1" },
    { id: "nego_value", title: "Création de valeur", description: "Partage de la valeur existante vs agrandissement de l'accord.", mechanic: "negociation", dataNeeded: ["negotiation", "conversation"], debriefDisplay: "Nourrit le bilan (IA).", replayDisplay: REPLAY_TODO, status: "V1" },
  ],
  facilitation: [
    { id: "fac_talk_share", title: "Répartition du temps de parole", description: "Temps de parole par participant, domination, silencieux.", mechanic: "facilitation", dataNeeded: ["conversation"], debriefDisplay: "Nourrit le bilan : dynamique de la réunion.", replayDisplay: REPLAY_TODO, status: "V1" },
    { id: "fac_participation", title: "Participation des acteurs", description: "Acteurs actifs vs jamais sollicités.", mechanic: "facilitation", dataNeeded: ["conversation"], debriefDisplay: "Nourrit le bilan.", replayDisplay: REPLAY_TODO, status: "V1" },
    { id: "fac_production", title: "Production de la réunion", description: "Décisions, actions, idées, risques réellement produits.", mechanic: "facilitation", dataNeeded: ["decisions", "tasks", "ideas"], debriefDisplay: "Nourrit le bilan : réunion productive ou simple discussion.", replayDisplay: REPLAY_TODO, status: "V1" },
    { id: "fac_dynamics", title: "Dynamique collective", description: "Consensus, écoute, gestion des tensions, recentrage.", mechanic: "facilitation", dataNeeded: ["conversation"], debriefDisplay: "Nourrit le bilan (IA).", replayDisplay: REPLAY_TODO, status: "V1" },
    { id: "fac_agenda", title: "Respect de l'ordre du jour", description: "Sujets prévus vs réellement abordés.", mechanic: "facilitation", dataNeeded: ["conversation"], debriefDisplay: "V2 : requiert un ordre du jour déclaré.", replayDisplay: REPLAY_TODO, status: "V2" },
  ],
};

/** Outils d'analyse déclarés pour une mécanique. */
export function analysisToolsFor(mechanic: string): AnalysisTool[] {
  return ANALYSIS_TOOLS[mechanic] ?? [];
}

/** Facettes de données exploitées par une mécanique (dédupliquées). */
export function dataNeededFor(mechanic: string): string[] {
  return [...new Set(analysisToolsFor(mechanic).flatMap((t) => t.dataNeeded))];
}
