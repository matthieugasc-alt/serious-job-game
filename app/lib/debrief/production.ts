/**
 * production.ts — analyse PÉDAGOGIQUE post-scénario de la mécanique
 * Production (docs : Outils_analyse_mecanique_production).
 *
 * Le livrable étant du texte libre, le DÉTERMINISTE reste modeste :
 * détection de structure (sections attendues), métriques de concision,
 * usage des sources. L'IA fait le qualitatif : complétude, traçabilité,
 * clarté, argumentation, adéquation à la demande, synthèse.
 *
 * PUR / node-safe : entrée normalisée, aucune dépendance React/moteur.
 */

export interface ProductionInput {
  deliverable: { type: string; title: string; body: string };
  instructions: string;
  documentsOpened: number;
  documentsTotal: number;
  supporting: { notes: number; decisions: number };
}

// ─── Sections canoniques d'un livrable structuré ──────────────────

const SECTIONS: { label: string; re: RegExp }[] = [
  { label: "Introduction", re: /introduction|en pr[ée]ambule|objet\b/i },
  { label: "Contexte", re: /contexte|situation actuelle|rappel/i },
  { label: "Analyse", re: /analyse|constat|diagnostic/i },
  { label: "Recommandations", re: /recommandation|pr[ée]conisation|proposition/i },
  { label: "Plan d'action", re: /plan d.?action|prochaines? [ée]tapes|next steps|feuille de route/i },
  { label: "Conclusion", re: /conclusion|en r[ée]sum[ée]|pour conclure|synth[èe]se/i },
];

// ─── Modèle d'observations ─────────────────────────────────────────

export interface DeliverableMetrics {
  type: string;
  title: string;
  wordCount: number;
  sentenceCount: number;
  avgSentenceLen: number;
}

export interface StructureSection {
  label: string;
  present: boolean;
}

export interface Completeness {
  present: string[];
  missing: string[];
  superfluous: string[];
}

export interface TraceItem {
  claim: string;
  basis: string[];
}

export interface Qualitative {
  clarity: string;
  argumentation: string;
  coherence: string;
  adequacy: string;
}

export interface ProductionSynthesis {
  strengths: string[];
  improvements: string[];
  recommendations: string[];
  skillsToWork: string[];
}

export interface ProductionObservations {
  deliverable: DeliverableMetrics;
  structure: StructureSection[];
  sources: { opened: number; total: number };
  supporting: { notes: number; decisions: number };
  /** Parties IA. */
  completeness: Completeness;
  traceability: TraceItem[];
  qualitative: Qualitative;
  synthesis: ProductionSynthesis;
  aiEnriched: boolean;
}

export interface ProductionAiResult {
  completeness?: Partial<Completeness>;
  traceability?: TraceItem[];
  qualitative?: Partial<Qualitative>;
  synthesis?: Partial<ProductionSynthesis>;
}

// ─── Couche déterministe ───────────────────────────────────────────

export function analyzeProduction(input: ProductionInput): ProductionObservations {
  const body = input.deliverable.body ?? "";
  const trimmed = body.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  const sentenceCount = (body.match(/[.!?]+/g)?.length ?? 0) || (wordCount > 0 ? 1 : 0);
  const avgSentenceLen = sentenceCount > 0 ? Math.round(wordCount / sentenceCount) : 0;

  const structure: StructureSection[] = SECTIONS.map((s) => ({ label: s.label, present: s.re.test(body) }));

  return {
    deliverable: {
      type: input.deliverable.type,
      title: input.deliverable.title,
      wordCount,
      sentenceCount,
      avgSentenceLen,
    },
    structure,
    sources: { opened: input.documentsOpened, total: input.documentsTotal },
    supporting: input.supporting,
    completeness: { present: [], missing: [], superfluous: [] },
    traceability: [],
    qualitative: { clarity: "", argumentation: "", coherence: "", adequacy: "" },
    synthesis: { strengths: [], improvements: [], recommendations: [], skillsToWork: [] },
    aiEnriched: false,
  };
}

export function mergeProductionAi(base: ProductionObservations, ai: ProductionAiResult): ProductionObservations {
  return {
    ...base,
    completeness: {
      present: ai.completeness?.present ?? base.completeness.present,
      missing: ai.completeness?.missing ?? base.completeness.missing,
      superfluous: ai.completeness?.superfluous ?? base.completeness.superfluous,
    },
    traceability: ai.traceability ?? base.traceability,
    qualitative: {
      clarity: ai.qualitative?.clarity ?? base.qualitative.clarity,
      argumentation: ai.qualitative?.argumentation ?? base.qualitative.argumentation,
      coherence: ai.qualitative?.coherence ?? base.qualitative.coherence,
      adequacy: ai.qualitative?.adequacy ?? base.qualitative.adequacy,
    },
    synthesis: {
      strengths: ai.synthesis?.strengths ?? base.synthesis.strengths,
      improvements: ai.synthesis?.improvements ?? base.synthesis.improvements,
      recommendations: ai.synthesis?.recommendations ?? base.synthesis.recommendations,
      skillsToWork: ai.synthesis?.skillsToWork ?? base.synthesis.skillsToWork,
    },
    aiEnriched: true,
  };
}

/** Part des sections attendues effectivement présentes (0..1). */
export function structureRate(sections: StructureSection[]): number {
  if (sections.length === 0) return 0;
  return sections.filter((s) => s.present).length / sections.length;
}
