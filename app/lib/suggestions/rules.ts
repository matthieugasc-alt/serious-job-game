// ═══════════════════════════════════════════════════════════════════
// AS-chantier — Règles d'analyse suggérante
// ═══════════════════════════════════════════════════════════════════
//
// Prend en entrée les métriques calculées par computeAnalytics() et
// produit des suggestions actionnables. Pas d'IA, juste des règles
// déclaratives + seuils configurables.
//
// Chaque suggestion a :
//   - type            : catégorie (severity_adjustment, consigne_ambiguity, ...)
//   - severity        : info / warning / critical
//   - title           : phrase courte "Ce critère est peut-être trop exigeant"
//   - evidence        : les métriques qui déclenchent la règle
//   - suggested_action: quoi faire concrètement
//   - editTarget      : deep link vers l'endroit à éditer (X1)
// ═══════════════════════════════════════════════════════════════════

export type SuggestionSeverity = "info" | "warning" | "critical";

export interface Suggestion {
  type:
    | "severity_adjustment"
    | "consigne_ambiguity"
    | "document_blocker"
    | "critical_over_triggered"
    | "competency_gap"
    | "phase_too_long"
    | "unmatched_never";
  severity: SuggestionSeverity;
  title: string;
  evidence: Record<string, unknown>;
  suggested_action: string;
  editTarget?: {
    scenarioId: string;
    phaseId?: string;
    criterionId?: string;
  };
}

export interface SuggestionInputs {
  phases: Array<{
    scenarioId: string;
    phaseId: string;
    attempts: number;
    abandonRate: number;
    criticalFailures: number;
    averageDurationMs: number;
  }>;
  criteria: Array<{
    scenarioId: string;
    phaseId: string;
    criterionId: string;
    matched: number;
    seen: number;
    matchRate: number;
  }>;
  targetDurations?: Record<string, number>; // phaseKey -> target ms (optional)
}

// Seuils configurables — extrait comme constants pour test/tuning.
export const THRESHOLDS = {
  MIN_SAMPLE: 5,
  CRITERION_TOO_HARD: 0.2,       // match rate < 20% + required → suggest bonus
  CRITERION_NEVER: 0.05,          // match rate < 5% → suggest ambiguïté
  ABANDON_HIGH: 0.3,              // > 30% abandon → alert
  CRITICAL_OVER_TRIGGERED: 0.2,   // critical fire on > 20% des tentatives
  DURATION_MULTIPLIER: 2.0,       // durée > 2x target
};

/**
 * Compute suggestions from analytics inputs.
 * Deterministic and pure — safe to call from any surface.
 */
export function computeSuggestions(inputs: SuggestionInputs): Suggestion[] {
  const out: Suggestion[] = [];

  // ── Critères trop exigeants (rare match + required) ──
  // Note: on ne peut pas savoir depuis les métriques Y si un critère est
  // required. Le contexte est ajouté côté /admin/analytics via le contract.
  // Ici on flag tous les critères sous le seuil "jamais matché".
  for (const c of inputs.criteria) {
    if (c.seen < THRESHOLDS.MIN_SAMPLE) continue;
    if (c.matchRate < THRESHOLDS.CRITERION_NEVER) {
      out.push({
        type: "unmatched_never",
        severity: "warning",
        title: `Ce critère est presque jamais validé (${Math.round(c.matchRate * 100)}%)`,
        evidence: { matched: c.matched, seen: c.seen, matchRate: c.matchRate },
        suggested_action:
          "Vérifie la clarté de la description dans le prompt IA, ou la formulation de la consigne côté joueur. Souvent = attente floue.",
        editTarget: { scenarioId: c.scenarioId, phaseId: c.phaseId, criterionId: c.criterionId },
      });
    } else if (c.matchRate < THRESHOLDS.CRITERION_TOO_HARD) {
      out.push({
        type: "severity_adjustment",
        severity: "info",
        title: `Ce critère semble trop exigeant (${Math.round(c.matchRate * 100)}%)`,
        evidence: { matched: c.matched, seen: c.seen, matchRate: c.matchRate },
        suggested_action:
          "Si ce critère est `required`, envisage de le passer en `bonus` pour ne pas bloquer trop de joueurs. Ou détaille sa description pour lever l'ambiguïté.",
        editTarget: { scenarioId: c.scenarioId, phaseId: c.phaseId, criterionId: c.criterionId },
      });
    }
  }

  // ── Phases avec abandon élevé ──
  for (const p of inputs.phases) {
    if (p.attempts < THRESHOLDS.MIN_SAMPLE) continue;
    if (p.abandonRate > THRESHOLDS.ABANDON_HIGH) {
      out.push({
        type: "consigne_ambiguity",
        severity: "warning",
        title: `Phase avec taux d'abandon élevé (${Math.round(p.abandonRate * 100)}%)`,
        evidence: { attempts: p.attempts, abandonRate: p.abandonRate },
        suggested_action:
          "Vérifie la consigne d'entrée de phase (briefing) et les documents attachés. L'abandon massif signale souvent une consigne ambiguë ou un mur trop haut.",
        editTarget: { scenarioId: p.scenarioId, phaseId: p.phaseId },
      });
    }
    if (p.criticalFailures > THRESHOLDS.CRITICAL_OVER_TRIGGERED * p.attempts) {
      out.push({
        type: "critical_over_triggered",
        severity: "warning",
        title: `Critical déclenché trop souvent sur cette phase (${p.criticalFailures}/${p.attempts})`,
        evidence: { criticalFailures: p.criticalFailures, attempts: p.attempts },
        suggested_action:
          "Un critère `critical` ne doit se déclencher qu'en cas d'erreur rédhibitoire réelle. S'il fire >20% des tentatives, revoit soit sa formulation, soit passe-le en `required`.",
        editTarget: { scenarioId: p.scenarioId, phaseId: p.phaseId },
      });
    }
    const target = inputs.targetDurations?.[`${p.scenarioId}::${p.phaseId}`];
    if (target && p.averageDurationMs > target * THRESHOLDS.DURATION_MULTIPLIER) {
      out.push({
        type: "phase_too_long",
        severity: "info",
        title: `Cette phase dure ${(p.averageDurationMs / target).toFixed(1)}× le temps prévu`,
        evidence: { averageDurationMs: p.averageDurationMs, target },
        suggested_action:
          "Les joueurs passent beaucoup plus de temps que prévu. Soit la phase est plus riche qu'anticipé (ajuste la target), soit il y a un point de friction à éliminer.",
        editTarget: { scenarioId: p.scenarioId, phaseId: p.phaseId },
      });
    }
  }

  // Sort by severity descending (critical > warning > info)
  const sevOrder: Record<SuggestionSeverity, number> = { critical: 0, warning: 1, info: 2 };
  out.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

  return out;
}
