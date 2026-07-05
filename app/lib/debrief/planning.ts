/**
 * planning.ts — analyse PÉDAGOGIQUE post-scénario de la mécanique
 * Planification / Organisation (docs :
 * Outils_analyse_mecanique_planification).
 *
 * Il n'existe pas de mécanique moteur dédiée : le plan se construit via les
 * outils (Timeline, Kanban, graphe de dépendances, tâches, risques). On lit
 * donc ces artefacts. DÉTERMINISTE : volume du plan, répartition des
 * tâches, dépendances, risques, outils mobilisés. IA : cohérence, réalisme
 * temporel, priorités, robustesse, adaptabilité, synthèse.
 *
 * PUR / node-safe : entrée normalisée, aucune dépendance React/moteur.
 */

export interface PlanningInput {
  /** Nombre total d'items de plan (tâches + items de tableaux). */
  steps: number;
  /** Jalons (items de timeline). */
  milestones: number;
  tasksByStatus: { todo: number; doing: number; done: number };
  dependencies: { fromLabel: string; toLabel: string }[];
  risks: { label: string; probability: number; impact: number }[];
  toolUsage: { label: string; count: number }[];
}

export interface PlanningSynthesis {
  strengths: string[];
  improvements: string[];
  recurringErrors: string[];
  recommendations: string[];
}

export interface PlanningObservations {
  planning: {
    steps: number;
    milestones: number;
    tasksByStatus: { todo: number; doing: number; done: number };
    dependencies: number;
    risks: number;
  };
  toolUsage: { label: string; count: number }[];
  dependencyList: { fromLabel: string; toLabel: string }[];
  riskList: { label: string; probability: number; impact: number }[];
  /** Parties IA. */
  coherence: string;
  realism: string;
  priorities: string;
  robustness: string;
  adaptability: string;
  synthesis: PlanningSynthesis;
  aiEnriched: boolean;
}

export interface PlanningAiResult {
  coherence?: string;
  realism?: string;
  priorities?: string;
  robustness?: string;
  adaptability?: string;
  synthesis?: Partial<PlanningSynthesis>;
}

// ─── Couche déterministe ───────────────────────────────────────────

export function analyzePlanning(input: PlanningInput): PlanningObservations {
  return {
    planning: {
      steps: input.steps,
      milestones: input.milestones,
      tasksByStatus: input.tasksByStatus,
      dependencies: input.dependencies.length,
      risks: input.risks.length,
    },
    toolUsage: input.toolUsage,
    dependencyList: input.dependencies,
    riskList: input.risks,
    coherence: "",
    realism: "",
    priorities: "",
    robustness: "",
    adaptability: "",
    synthesis: { strengths: [], improvements: [], recurringErrors: [], recommendations: [] },
    aiEnriched: false,
  };
}

export function mergePlanningAi(base: PlanningObservations, ai: PlanningAiResult): PlanningObservations {
  return {
    ...base,
    coherence: ai.coherence ?? base.coherence,
    realism: ai.realism ?? base.realism,
    priorities: ai.priorities ?? base.priorities,
    robustness: ai.robustness ?? base.robustness,
    adaptability: ai.adaptability ?? base.adaptability,
    synthesis: {
      strengths: ai.synthesis?.strengths ?? base.synthesis.strengths,
      improvements: ai.synthesis?.improvements ?? base.synthesis.improvements,
      recurringErrors: ai.synthesis?.recurringErrors ?? base.synthesis.recurringErrors,
      recommendations: ai.synthesis?.recommendations ?? base.synthesis.recommendations,
    },
    aiEnriched: true,
  };
}

/** Part de tâches terminées (0..1) — avancement du plan. */
export function completionRate(t: { todo: number; doing: number; done: number }): number {
  const total = t.todo + t.doing + t.done;
  return total > 0 ? t.done / total : 0;
}
