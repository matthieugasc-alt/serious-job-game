/**
 * brainstorm.ts — analyse PÉDAGOGIQUE post-scénario de la mécanique
 * Créativité / Brainstorming (docs :
 * Outils_analyse_mecanique_brainstorming).
 *
 * Matière première : les post-it du whiteboard (idées) + la convergence
 * (idées → tâches / options / décisions). DÉTERMINISTE : volume, familles
 * de couleurs, temps de génération, convergence, outils. IA : diversité,
 * originalité, pertinence, exploration/fixation, regroupement, qualité de
 * la convergence, synthèse.
 *
 * PUR / node-safe : entrée normalisée, aucune dépendance React/moteur.
 */

export interface IdeaInput {
  text: string;
  author: string;
  color: string;
  at: number;
}

export interface BrainstormInput {
  ideas: IdeaInput[];
  convergence: { tasks: number; decisions: number; options: number };
  toolUsage: { label: string; used: boolean }[];
}

export interface BrainstormQualitative {
  diversity: string;
  originality: string;
  relevance: string;
  exploration: string;
  grouping: string;
  convergenceQuality: string;
}

export interface BrainstormSynthesis {
  strengths: string[];
  improvements: string[];
  methodsToTry: string[];
  underusedTools: string[];
}

export interface BrainstormObservations {
  volume: { total: number; byPlayer: number; byOthers: number };
  families: { color: string; count: number }[];
  generationSpanMs: number;
  convergence: { tasks: number; decisions: number; options: number; converted: boolean };
  toolUsage: { label: string; used: boolean }[];
  /** Parties IA. */
  qualitative: BrainstormQualitative;
  synthesis: BrainstormSynthesis;
  aiEnriched: boolean;
}

export interface BrainstormAiResult {
  qualitative?: Partial<BrainstormQualitative>;
  synthesis?: Partial<BrainstormSynthesis>;
}

// ─── Couche déterministe ───────────────────────────────────────────

export function analyzeBrainstorm(input: BrainstormInput): BrainstormObservations {
  const isPlayer = (a: string) => a === "player" || a === "";
  const byPlayer = input.ideas.filter((i) => isPlayer(i.author)).length;

  const byColor = new Map<string, number>();
  for (const i of input.ideas) byColor.set(i.color, (byColor.get(i.color) ?? 0) + 1);
  const families = [...byColor.entries()].map(([color, count]) => ({ color, count })).sort((a, b) => b.count - a.count);

  const times = input.ideas.map((i) => i.at).filter((t) => t > 0);
  const generationSpanMs = times.length > 1 ? Math.max(...times) - Math.min(...times) : 0;

  const conv = input.convergence;
  const converted = conv.tasks + conv.decisions + conv.options > 0;

  return {
    volume: { total: input.ideas.length, byPlayer, byOthers: input.ideas.length - byPlayer },
    families,
    generationSpanMs,
    convergence: { ...conv, converted },
    toolUsage: input.toolUsage,
    qualitative: { diversity: "", originality: "", relevance: "", exploration: "", grouping: "", convergenceQuality: "" },
    synthesis: { strengths: [], improvements: [], methodsToTry: [], underusedTools: [] },
    aiEnriched: false,
  };
}

export function mergeBrainstormAi(base: BrainstormObservations, ai: BrainstormAiResult): BrainstormObservations {
  return {
    ...base,
    qualitative: {
      diversity: ai.qualitative?.diversity ?? base.qualitative.diversity,
      originality: ai.qualitative?.originality ?? base.qualitative.originality,
      relevance: ai.qualitative?.relevance ?? base.qualitative.relevance,
      exploration: ai.qualitative?.exploration ?? base.qualitative.exploration,
      grouping: ai.qualitative?.grouping ?? base.qualitative.grouping,
      convergenceQuality: ai.qualitative?.convergenceQuality ?? base.qualitative.convergenceQuality,
    },
    synthesis: {
      strengths: ai.synthesis?.strengths ?? base.synthesis.strengths,
      improvements: ai.synthesis?.improvements ?? base.synthesis.improvements,
      methodsToTry: ai.synthesis?.methodsToTry ?? base.synthesis.methodsToTry,
      underusedTools: ai.synthesis?.underusedTools ?? base.synthesis.underusedTools,
    },
    aiEnriched: true,
  };
}
