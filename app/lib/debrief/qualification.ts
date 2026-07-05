/**
 * qualification.ts — analyse PÉDAGOGIQUE post-scénario de la mécanique
 * Qualification / Entretien (docs : Outils_analyse_mecanique_qualification).
 *
 * Ne concerne PAS le jeu en cours : ne s'exécute qu'APRÈS un scénario, sur
 * la session enregistrée. Deux couches :
 *   1) DÉTERMINISTE (ici, pur, testé) : statistiques calculables sans IA —
 *      temps de parole, questions, sans-réponse, tours enchaînés, timeline.
 *   2) IA (optionnelle, fusionnée) : classification des questions et
 *      couverture des dimensions ; l'analyse reste utilisable sans IA.
 *
 * PUR / node-safe : aucun React, aucun effet de bord, types sérialisables.
 */

import type { ThreadMessage } from "@/app/lib/engine/workspace";

// ─── Référentiel de qualification (dimensions attendues) ──────────

export interface RubricDimension {
  dimension: string;
  label: string;
}

/** Référentiel générique par défaut (surcharge par scénario possible plus tard). */
export const QUALIFICATION_RUBRIC: RubricDimension[] = [
  { dimension: "besoins", label: "Besoins" },
  { dimension: "contraintes", label: "Contraintes" },
  { dimension: "budget", label: "Budget" },
  { dimension: "decideurs", label: "Décideurs" },
  { dimension: "risques", label: "Risques" },
  { dimension: "delais", label: "Délais" },
  { dimension: "parties_prenantes", label: "Parties prenantes" },
];

// ─── Modèle d'observations ─────────────────────────────────────────

export type QuestionType = "ouverte" | "fermée" | "relance" | "clarification" | "orientée";

export interface QuestionObs {
  at: number;
  content: string;
  answered: boolean;
  /** Rempli par la passe IA (sinon undefined). */
  type?: QuestionType;
}

export type CoverageLevel = "oui" | "partiel" | "non";

export interface CoverageCell {
  dimension: string;
  label: string;
  covered: CoverageLevel;
  evidence?: string;
}

export type DiscoveryStatus = "à temps" | "tard" | "manquée";

export interface DiscoveryEvent {
  at: number | null;
  dimension: string;
  label: string;
  status: DiscoveryStatus;
  excerpt?: string;
}

export interface QualStats {
  playerTurns: number;
  actorTurns: number;
  playerChars: number;
  actorChars: number;
  /** Part du joueur dans le volume total (0..1). */
  talkRatioPlayer: number;
  questionCount: number;
  unansweredCount: number;
  /** Tours enchaînés du joueur (sans laisser l'acteur répondre). */
  interruptions: number;
  durationMs: number;
}

export interface QualSynthesis {
  strengths: string[];
  improvements: string[];
  recommendations: string[];
}

export interface QualificationObservations {
  stats: QualStats;
  questions: QuestionObs[];
  coverage: CoverageCell[];
  discovery: DiscoveryEvent[];
  hypotheses: { text: string; status: string }[];
  synthesis: QualSynthesis;
  /** true si une passe IA a enrichi (types de questions, couverture). */
  aiEnriched: boolean;
}

/** Résultat de la passe IA (fusionné dans les observations). */
export interface QualAiClassification {
  /** Type par index de question (aligné sur observations.questions). */
  questionTypes?: (QuestionType | null)[];
  coverage?: { dimension: string; covered: CoverageLevel; evidence?: string }[];
  discovery?: DiscoveryEvent[];
  synthesis?: Partial<QualSynthesis>;
}

// ─── Couche déterministe ───────────────────────────────────────────

const isConv = (m: ThreadMessage): boolean => m.from === "player" || m.from === "actor";

/** Une question du joueur est « répondue » si un message acteur suit avant
 *  le prochain message joueur. Heuristique, sans IA. */
function isAnswered(conv: ThreadMessage[], i: number): boolean {
  for (let j = i + 1; j < conv.length; j++) {
    if (conv[j].from === "player") return false;
    if (conv[j].from === "actor") return true;
  }
  return false;
}

export interface AnalyzeOptions {
  rubric?: RubricDimension[];
  hypotheses?: { text: string; status: string }[];
}

/**
 * Analyse déterministe d'un entretien (transcript = messages d'un fil).
 * Ne remplit ni les types de questions ni la couverture (→ passe IA).
 */
export function analyzeQualification(
  messages: ThreadMessage[],
  opts: AnalyzeOptions = {},
): QualificationObservations {
  const rubric = opts.rubric ?? QUALIFICATION_RUBRIC;
  const conv = messages.filter(isConv);

  let playerTurns = 0;
  let actorTurns = 0;
  let playerChars = 0;
  let actorChars = 0;
  let interruptions = 0;
  let unansweredCount = 0;
  const questions: QuestionObs[] = [];

  for (let i = 0; i < conv.length; i++) {
    const m = conv[i];
    if (m.from === "player") {
      playerTurns += 1;
      playerChars += m.content.length;
      if (i > 0 && conv[i - 1].from === "player") interruptions += 1;
      if (m.content.includes("?")) {
        const answered = isAnswered(conv, i);
        if (!answered) unansweredCount += 1;
        questions.push({ at: m.at, content: m.content.trim(), answered });
      }
    } else {
      actorTurns += 1;
      actorChars += m.content.length;
    }
  }

  const totalChars = playerChars + actorChars || 1;
  const durationMs = conv.length > 0 ? conv[conv.length - 1].at - conv[0].at : 0;

  const stats: QualStats = {
    playerTurns,
    actorTurns,
    playerChars,
    actorChars,
    talkRatioPlayer: playerChars / totalChars,
    questionCount: questions.length,
    unansweredCount,
    interruptions,
    durationMs,
  };

  const coverage: CoverageCell[] = rubric.map((r) => ({
    dimension: r.dimension,
    label: r.label,
    covered: "non",
  }));

  return {
    stats,
    questions,
    coverage,
    discovery: [],
    hypotheses: opts.hypotheses ?? [],
    synthesis: { strengths: [], improvements: [], recommendations: [] },
    aiEnriched: false,
  };
}

/** Fusionne le résultat d'une passe IA dans des observations déterministes. */
export function mergeAiClassification(
  base: QualificationObservations,
  ai: QualAiClassification,
): QualificationObservations {
  const questions = base.questions.map((q, i) => {
    const t = ai.questionTypes?.[i];
    return t ? { ...q, type: t } : q;
  });

  const byDim = new Map((ai.coverage ?? []).map((c) => [c.dimension, c]));
  const coverage = base.coverage.map((c) => {
    const found = byDim.get(c.dimension);
    return found ? { ...c, covered: found.covered, evidence: found.evidence } : c;
  });

  return {
    ...base,
    questions,
    coverage,
    discovery: ai.discovery ?? base.discovery,
    synthesis: {
      strengths: ai.synthesis?.strengths ?? base.synthesis.strengths,
      improvements: ai.synthesis?.improvements ?? base.synthesis.improvements,
      recommendations: ai.synthesis?.recommendations ?? base.synthesis.recommendations,
    },
    aiEnriched: true,
  };
}

/** Score de couverture par dimension pour le radar (oui=1, partiel=0.5, non=0). */
export function coverageScore(level: CoverageLevel): number {
  return level === "oui" ? 1 : level === "partiel" ? 0.5 : 0;
}

/** Part couverte globale (0..1) — pour un résumé rapide. */
export function coverageRate(coverage: CoverageCell[]): number {
  if (coverage.length === 0) return 0;
  const sum = coverage.reduce((acc, c) => acc + coverageScore(c.covered), 0);
  return sum / coverage.length;
}
