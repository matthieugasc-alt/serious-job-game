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
