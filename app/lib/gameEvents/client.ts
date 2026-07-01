// ══════════════════════════════════════════════════════════════════
// Game Events — Client-side fire-and-forget logger
// ══════════════════════════════════════════════════════════════════
//
// Sends events to POST /api/game-events.
// NEVER awaited, NEVER affects gameplay.
// If the call fails, nothing happens — the game continues.
// ══════════════════════════════════════════════════════════════════

/**
 * Fire-and-forget: send a game event to the logging endpoint.
 * Returns void — callers MUST NOT await this.
 */
function fireEvent(
  token: string,
  type: string,
  sessionId: string,
  scenarioId: string,
  phaseId: string | null,
  payload: Record<string, unknown>,
): void {
  try {
    fetch("/api/game-events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ type, sessionId, scenarioId, phaseId, ...payload }),
    }).catch(() => {
      // Swallow — NEVER break the game
    });
  } catch {
    // Swallow — NEVER break the game
  }
}

// ── Public helpers — one per event type ───────────────────────────

export function fireSessionStarted(
  token: string,
  sessionId: string,
  scenarioId: string,
  playerName: string,
  isFounder: boolean,
  campaignId: string | null,
): void {
  fireEvent(token, "session_started", sessionId, scenarioId, null, {
    playerName,
    isFounder,
    campaignId,
  });
}

export function firePhaseStarted(
  token: string,
  sessionId: string,
  scenarioId: string,
  phaseId: string,
  phaseIndex: number,
  phaseTitle: string,
  modules: string[],
): void {
  fireEvent(token, "phase_started", sessionId, scenarioId, phaseId, {
    phaseIndex,
    phaseTitle,
    modules,
  });
}

export function firePlayerMessage(
  token: string,
  sessionId: string,
  scenarioId: string,
  phaseId: string,
  actor: string,
  content: string,
): void {
  fireEvent(token, "player_message", sessionId, scenarioId, phaseId, {
    actor,
    content,
  });
}

export function fireAIMessage(
  token: string,
  sessionId: string,
  scenarioId: string,
  phaseId: string,
  actor: string,
  content: string,
): void {
  fireEvent(token, "ai_message", sessionId, scenarioId, phaseId, {
    actor,
    content,
  });
}

export function fireMailSent(
  token: string,
  sessionId: string,
  scenarioId: string,
  phaseId: string,
  mailKind: string,
  to: string,
  subject: string,
  bodyLength: number,
  hasAttachments: boolean,
): void {
  fireEvent(token, "mail_sent", sessionId, scenarioId, phaseId, {
    mailKind,
    to,
    subject,
    bodyLength,
    hasAttachments,
  });
}

export function fireContractSigned(
  token: string,
  sessionId: string,
  scenarioId: string,
  phaseId: string,
  contractType: string,
  articleCount: number,
  flagsSet: string[],
): void {
  fireEvent(token, "contract_signed", sessionId, scenarioId, phaseId, {
    contractType,
    articleCount,
    flagsSet,
  });
}

export function firePhaseCompleted(
  token: string,
  sessionId: string,
  scenarioId: string,
  phaseId: string,
  phaseIndex: number,
  phaseScore: number,
  durationMs: number,
): void {
  fireEvent(token, "phase_completed", sessionId, scenarioId, phaseId, {
    phaseIndex,
    phaseScore,
    durationMs,
  });
}

export function fireScenarioCompleted(
  token: string,
  sessionId: string,
  scenarioId: string,
  ending: string,
  totalScore: number,
  completedPhases: string[],
  durationMs: number,
): void {
  fireEvent(token, "scenario_completed", sessionId, scenarioId, null, {
    ending,
    totalScore,
    completedPhases,
    durationMs,
  });
}

export function firePhaseAbandoned(
  token: string,
  sessionId: string,
  scenarioId: string,
  phaseId: string,
  phaseIndex: number,
  reason: string,
): void {
  fireEvent(token, "phase_abandoned", sessionId, scenarioId, phaseId, {
    phaseIndex,
    reason,
  });
}

// ── Y-chantier: telemetry events for analytics dashboard ──────────

/**
 * Fired after applyPhaseObservation() when the moteur has evaluated
 * an AI observation. Emits ONE event per criterion — enables the
 * analytics dashboard to compute match rates per criterion cheaply.
 */
export function firePhaseEvaluated(
  token: string,
  sessionId: string,
  scenarioId: string,
  phaseId: string,
  observation: {
    passed: boolean;
    appliedRule: string;
    matched: string[];
    missing: string[];
    criticalFailures: string[];
    criteriaObserved: Record<string, boolean>;
    /** CF-chantier — per-criterion metadata (competencies, error_type, severity)
     *  captured at observation time to enable transverse aggregation. */
    criteriaMeta?: Record<string, {
      competencies?: string[];
      error_type?: string;
      severity?: string;
    }>;
  },
): void {
  fireEvent(token, "phase_evaluated", sessionId, scenarioId, phaseId, {
    passed: observation.passed,
    appliedRule: observation.appliedRule,
    matched: observation.matched,
    missing: observation.missing,
    criticalFailures: observation.criticalFailures,
    criteriaObserved: observation.criteriaObserved,
    ...(observation.criteriaMeta ? { criteriaMeta: observation.criteriaMeta } : {}),
  });
}

/**
 * Fired when the player asks for help (clicks a hint, opens the
 * briefing overlay a 2nd+ time, opens a document during a
 * blocking phase, etc.). Payload identifies what triggered.
 */
export function fireHelpRequested(
  token: string,
  sessionId: string,
  scenarioId: string,
  phaseId: string | null,
  source: string,
  meta: Record<string, unknown> = {},
): void {
  fireEvent(token, "help_requested", sessionId, scenarioId, phaseId, {
    source,
    ...meta,
  });
}

/**
 * Fired when the scenario is deliberately abandoned by the player
 * (close tab, "Quitter" button, campaign paused). Distinct from
 * scenario_completed which fires on natural end.
 */
export function fireScenarioAbandoned(
  token: string,
  sessionId: string,
  scenarioId: string,
  lastPhaseId: string | null,
  reason: string,
): void {
  fireEvent(token, "scenario_abandoned", sessionId, scenarioId, lastPhaseId, {
    reason,
  });
}
