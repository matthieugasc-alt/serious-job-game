/**
 * presentation.ts — analyse PÉDAGOGIQUE post-scénario de la mécanique
 * Présentation (docs : Outils_analyse_mecanique_presentation).
 *
 * DÉTERMINISTE : structure du discours, gestion du temps (débit),
 * gestion des questions, usage des supports. IA : clarté, argumentation,
 * confiance perçue, cohérence, impact du discours (réactions), synthèse.
 *
 * PUR / node-safe : entrée normalisée, aucune dépendance React/moteur.
 */

export interface PresentationInput {
  speech: string;
  /** Durée de prise de parole en secondes (0 si inconnue). */
  durationS: number;
  qa: { received: number; answered: number };
  supporting: { documents: number; notes: number; decisions: number };
}

const SECTIONS: { label: string; re: RegExp }[] = [
  { label: "Introduction", re: /introduction|bonjour|merci de|objet\b|aujourd.?hui/i },
  { label: "Contexte", re: /contexte|situation|rappel|pour situer/i },
  { label: "Démonstration", re: /d[ée]monstration|analyse|constat|nos r[ée]sultats|les chiffres|voici pourquoi/i },
  { label: "Recommandations", re: /recommand|pr[ée]conis|proposition|je propose|nous proposons/i },
  { label: "Conclusion", re: /conclusion|en r[ée]sum[ée]|pour conclure|en synth[èe]se|merci/i },
];

export interface SpeechMetrics {
  wordCount: number;
  durationS: number;
  wordsPerMinute: number;
  sentenceCount: number;
}

export interface StructureSection {
  label: string;
  present: boolean;
}

export interface ImpactItem {
  reaction: string;
  note: string;
}

export interface PresentationSynthesis {
  strengths: string[];
  improvements: string[];
  recommendations: string[];
  skillsToWork: string[];
}

export interface PresentationObservations {
  speech: SpeechMetrics;
  structure: StructureSection[];
  qa: { received: number; answered: number };
  supporting: { documents: number; notes: number; decisions: number };
  /** Parties IA. */
  clarity: string;
  argumentation: string;
  confidence: string;
  coherence: string;
  impact: ImpactItem[];
  synthesis: PresentationSynthesis;
  aiEnriched: boolean;
}

export interface PresentationAiResult {
  clarity?: string;
  argumentation?: string;
  confidence?: string;
  coherence?: string;
  impact?: ImpactItem[];
  synthesis?: Partial<PresentationSynthesis>;
}

// ─── Couche déterministe ───────────────────────────────────────────

export function analyzePresentation(input: PresentationInput): PresentationObservations {
  const speech = input.speech ?? "";
  const trimmed = speech.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  const sentenceCount = (speech.match(/[.!?]+/g)?.length ?? 0) || (wordCount > 0 ? 1 : 0);
  const wordsPerMinute = input.durationS > 0 ? Math.round(wordCount / (input.durationS / 60)) : 0;

  return {
    speech: { wordCount, durationS: input.durationS, wordsPerMinute, sentenceCount },
    structure: SECTIONS.map((s) => ({ label: s.label, present: s.re.test(speech) })),
    qa: input.qa,
    supporting: input.supporting,
    clarity: "",
    argumentation: "",
    confidence: "",
    coherence: "",
    impact: [],
    synthesis: { strengths: [], improvements: [], recommendations: [], skillsToWork: [] },
    aiEnriched: false,
  };
}

export function mergePresentationAi(base: PresentationObservations, ai: PresentationAiResult): PresentationObservations {
  return {
    ...base,
    clarity: ai.clarity ?? base.clarity,
    argumentation: ai.argumentation ?? base.argumentation,
    confidence: ai.confidence ?? base.confidence,
    coherence: ai.coherence ?? base.coherence,
    impact: ai.impact ?? base.impact,
    synthesis: {
      strengths: ai.synthesis?.strengths ?? base.synthesis.strengths,
      improvements: ai.synthesis?.improvements ?? base.synthesis.improvements,
      recommendations: ai.synthesis?.recommendations ?? base.synthesis.recommendations,
      skillsToWork: ai.synthesis?.skillsToWork ?? base.synthesis.skillsToWork,
    },
    aiEnriched: true,
  };
}

/** Appréciation simple du débit (mots/min) — repère, sans jugement. */
export function paceLabel(wpm: number): "lent" | "posé" | "soutenu" | "rapide" | "—" {
  if (wpm <= 0) return "—";
  if (wpm < 100) return "lent";
  if (wpm < 150) return "posé";
  if (wpm < 190) return "soutenu";
  return "rapide";
}
