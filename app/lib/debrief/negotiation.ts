/**
 * negotiation.ts — analyse PÉDAGOGIQUE post-scénario de la mécanique
 * Négociation (docs : Outils_analyse_mecanique_negociation).
 *
 * L'outil contrat structure déjà : termes (ouverture → valeur finale),
 * historique des propositions, statut (signé / rejeté / ouvert). Le
 * DÉTERMINISTE relit ces artefacts : issue, concessions par terme,
 * chronologie des offres, objections. L'IA fait le qualitatif : intérêts,
 * objections, création de valeur, rapport de force, cohérence, robustesse.
 *
 * PUR / node-safe : entrée normalisée, aucune dépendance React/moteur.
 */

export interface TermInput {
  id: string;
  label: string;
  opening: number | string | null;
  final: number | string | null;
  suffix?: string;
}

export interface NegotiationInput {
  terms: TermInput[];
  proposals: { at: number; values: Record<string, number | string> }[];
  status: "open" | "signed" | "rejected";
  objections: { received: number; answered: number };
}

export type MoveDirection = "hausse" | "baisse" | "inchangé" | "—";

export interface TermMove {
  label: string;
  opening: number | string | null;
  final: number | string | null;
  suffix?: string;
  delta: number | null;
  direction: MoveDirection;
}

export interface NegotiationQualitative {
  balance: string;
  interests: string;
  objections: string;
  valueCreation: string;
  powerBalance: string;
  coherence: string;
  robustness: string;
}

export interface NegotiationSynthesis {
  strengths: string[];
  improvements: string[];
  techniquesUnderused: string[];
  recurringErrors: string[];
  recommendations: string[];
}

export interface NegotiationObservations {
  outcome: { status: "open" | "signed" | "rejected"; proposalsCount: number; concessionCount: number };
  terms: TermMove[];
  chronology: { at: number; label: string }[];
  objections: { received: number; answered: number };
  /** Parties IA. */
  qualitative: NegotiationQualitative;
  synthesis: NegotiationSynthesis;
  aiEnriched: boolean;
}

export interface NegotiationAiResult {
  qualitative?: Partial<NegotiationQualitative>;
  synthesis?: Partial<NegotiationSynthesis>;
}

// ─── Couche déterministe ───────────────────────────────────────────

function num(v: number | string | null): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function termMove(t: TermInput): TermMove {
  const o = num(t.opening);
  const f = num(t.final);
  let delta: number | null = null;
  let direction: MoveDirection = "—";
  if (o !== null && f !== null) {
    delta = f - o;
    direction = delta > 0 ? "hausse" : delta < 0 ? "baisse" : "inchangé";
  } else if (t.opening !== t.final && (t.opening != null || t.final != null)) {
    direction = "—";
  } else {
    direction = "inchangé";
  }
  return { label: t.label, opening: t.opening, final: t.final, suffix: t.suffix, delta, direction };
}

export function analyzeNegotiation(input: NegotiationInput): NegotiationObservations {
  const terms = input.terms.map(termMove);
  const concessionCount = terms.filter((t) => t.direction !== "inchangé" && t.direction !== "—" ? t.delta !== 0 : String(t.opening ?? "") !== String(t.final ?? "")).length;

  const labelById = new Map(input.terms.map((t) => [t.id, { label: t.label, suffix: t.suffix }]));
  const chronology = input.proposals.map((p) => {
    const parts = Object.entries(p.values).map(([id, v]) => {
      const meta = labelById.get(id);
      return `${meta?.label ?? id} ${v}${meta?.suffix ? " " + meta.suffix : ""}`;
    });
    return { at: p.at, label: parts.join(", ") || "(proposition)" };
  });

  return {
    outcome: { status: input.status, proposalsCount: input.proposals.length, concessionCount },
    terms,
    chronology,
    objections: input.objections,
    qualitative: { balance: "", interests: "", objections: "", valueCreation: "", powerBalance: "", coherence: "", robustness: "" },
    synthesis: { strengths: [], improvements: [], techniquesUnderused: [], recurringErrors: [], recommendations: [] },
    aiEnriched: false,
  };
}

export function mergeNegotiationAi(base: NegotiationObservations, ai: NegotiationAiResult): NegotiationObservations {
  return {
    ...base,
    qualitative: {
      balance: ai.qualitative?.balance ?? base.qualitative.balance,
      interests: ai.qualitative?.interests ?? base.qualitative.interests,
      objections: ai.qualitative?.objections ?? base.qualitative.objections,
      valueCreation: ai.qualitative?.valueCreation ?? base.qualitative.valueCreation,
      powerBalance: ai.qualitative?.powerBalance ?? base.qualitative.powerBalance,
      coherence: ai.qualitative?.coherence ?? base.qualitative.coherence,
      robustness: ai.qualitative?.robustness ?? base.qualitative.robustness,
    },
    synthesis: {
      strengths: ai.synthesis?.strengths ?? base.synthesis.strengths,
      improvements: ai.synthesis?.improvements ?? base.synthesis.improvements,
      techniquesUnderused: ai.synthesis?.techniquesUnderused ?? base.synthesis.techniquesUnderused,
      recurringErrors: ai.synthesis?.recurringErrors ?? base.synthesis.recurringErrors,
      recommendations: ai.synthesis?.recommendations ?? base.synthesis.recommendations,
    },
    aiEnriched: true,
  };
}
