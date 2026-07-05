/**
 * docSynthesis.ts — analyse PÉDAGOGIQUE post-scénario de la mécanique
 * Analyse / Synthèse documentaire (docs :
 * Outils_analyse_mecanique_analyse_synthese_documentaire).
 *
 * Deux couches, comme pour la Qualification :
 *   1) DÉTERMINISTE (ici, pur, testé) : carte des sources (ouvert/parcouru/
 *      ignoré), chronologie de lecture, entonnoir de transformation
 *      (doc → annotation → note → décision), utilisation des outils.
 *   2) IA (optionnelle, fusionnée) : carte des preuves, carte du
 *      raisonnement, synthèse (forces/axes/outils sous-utilisés).
 *
 * PUR / node-safe : aucun React, aucun effet de bord, entrées normalisées
 * (l'appelant extrait depuis workspace/toolStates → couplage minimal).
 */

export type ReadDepth = "profond" | "parcouru" | "ignoré";

export interface RawDoc {
  id: string;
  title: string;
  opened: boolean;
  annotationCount: number;
}

export type EventCategory =
  | "lecture"
  | "annotation"
  | "note"
  | "décision"
  | "livrable"
  | "tag"
  | "collection"
  | "comparaison";

export interface RawEvent {
  at: number;
  category: EventCategory;
  label: string;
}

export interface ToolCounts {
  notes: number;
  annotations: number;
  tags: number;
  collections: number;
  decisions: number;
  comparateur: number;
  blocNotesOps: number;
  bibliothequeOps: number;
  decisionOps: number;
}

export interface DocSynthInput {
  documents: RawDoc[];
  events: RawEvent[];
  counts: ToolCounts;
}

// ─── Modèle d'observations ─────────────────────────────────────────

export interface SourceObs {
  id: string;
  title: string;
  readDepth: ReadDepth;
  annotationCount: number;
}

export interface TransformationFunnel {
  documentsOpened: number;
  annotations: number;
  notes: number;
  decisions: number;
}

export type Confidence = "faible" | "moyenne" | "forte";

export interface EvidenceItem {
  conclusion: string;
  sources: string[];
  confidence: Confidence;
}

export interface DocSynthSynthesis {
  strengths: string[];
  improvements: string[];
  recommendations: string[];
  underusedTools: string[];
}

export interface DocSynthObservations {
  sources: SourceObs[];
  chronology: RawEvent[];
  transformation: TransformationFunnel;
  toolUsage: ToolCounts;
  /** Rempli par la passe IA. */
  evidence: EvidenceItem[];
  reasoning: string;
  synthesis: DocSynthSynthesis;
  aiEnriched: boolean;
}

export interface DocSynthAiResult {
  evidence?: EvidenceItem[];
  reasoning?: string;
  synthesis?: Partial<DocSynthSynthesis>;
  replayComments?: { index: number; text: string }[];
}

// ─── Couche déterministe ───────────────────────────────────────────

/** Profondeur de lecture : pas ouvert → ignoré ; ouvert + annoté →
 *  profond ; ouvert sans annotation → simplement parcouru. */
export function readDepthOf(doc: RawDoc): ReadDepth {
  if (!doc.opened) return "ignoré";
  return doc.annotationCount > 0 ? "profond" : "parcouru";
}

export function analyzeDocSynthesis(input: DocSynthInput): DocSynthObservations {
  const sources: SourceObs[] = input.documents.map((d) => ({
    id: d.id,
    title: d.title,
    readDepth: readDepthOf(d),
    annotationCount: d.annotationCount,
  }));

  const chronology = [...input.events].sort((a, b) => a.at - b.at);

  const transformation: TransformationFunnel = {
    documentsOpened: sources.filter((s) => s.readDepth !== "ignoré").length,
    annotations: input.counts.annotations,
    notes: input.counts.notes,
    decisions: input.counts.decisions,
  };

  return {
    sources,
    chronology,
    transformation,
    toolUsage: input.counts,
    evidence: [],
    reasoning: "",
    synthesis: { strengths: [], improvements: [], recommendations: [], underusedTools: [] },
    aiEnriched: false,
  };
}

export function mergeDocSynthAi(base: DocSynthObservations, ai: DocSynthAiResult): DocSynthObservations {
  return {
    ...base,
    evidence: ai.evidence ?? base.evidence,
    reasoning: ai.reasoning ?? base.reasoning,
    synthesis: {
      strengths: ai.synthesis?.strengths ?? base.synthesis.strengths,
      improvements: ai.synthesis?.improvements ?? base.synthesis.improvements,
      recommendations: ai.synthesis?.recommendations ?? base.synthesis.recommendations,
      underusedTools: ai.synthesis?.underusedTools ?? base.synthesis.underusedTools,
    },
    aiEnriched: true,
  };
}

/** Part des documents lus en profondeur (0..1) — résumé rapide. */
export function deepReadRate(sources: SourceObs[]): number {
  if (sources.length === 0) return 0;
  return sources.filter((s) => s.readDepth === "profond").length / sources.length;
}
