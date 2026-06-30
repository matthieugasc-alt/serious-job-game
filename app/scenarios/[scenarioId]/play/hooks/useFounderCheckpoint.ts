/**
 * useFounderCheckpoint — POSTs to /api/founder/checkpoint to keep the
 * server's notion of "current phase" in sync with the React state.
 *
 * Trio of actions:
 *   • advance   — phase completed normally
 *   • clear     — scenario finished
 *   • rollback  — HARD_REJECT regressed the React session, server must
 *                 follow or the next "Reprendre" rebuilds a stale state.
 */

import { useCallback } from "react";

export type FounderCheckpointAPI = {
  notifyAdvance: (completedPhaseId: string, newPhaseIndex: number) => void;
  notifyClear: () => void;
  notifyRollback: (targetPhaseId: string, targetPhaseIndex: number) => void;
};

export function useFounderCheckpoint(args: {
  scenarioId: string;
  isFounderScenario: boolean;
  apiHeaders: (extra?: Record<string, string>) => Record<string, string>;
}): FounderCheckpointAPI {
  const { scenarioId, isFounderScenario, apiHeaders } = args;

  const notifyAdvance = useCallback(
    (completedPhaseId: string, newPhaseIndex: number) => {
      if (!isFounderScenario) return;
      fetch("/api/founder/checkpoint", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({
          scenarioId,
          action: "advance",
          completedPhaseId,
          phaseIndex: newPhaseIndex,
        }),
      }).catch((e) => console.warn("[founder] checkpoint advance failed:", e));
    },
    [scenarioId, isFounderScenario, apiHeaders],
  );

  const notifyClear = useCallback(() => {
    if (!isFounderScenario) return;
    fetch("/api/founder/checkpoint", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ scenarioId, action: "clear" }),
    }).catch((e) => console.warn("[founder] checkpoint clear failed:", e));
  }, [scenarioId, isFounderScenario, apiHeaders]);

  const notifyRollback = useCallback(
    (targetPhaseId: string, targetPhaseIndex: number) => {
      if (!isFounderScenario) return;
      fetch("/api/founder/checkpoint", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({
          scenarioId,
          action: "rollback",
          targetPhaseId,
          targetPhaseIndex,
        }),
      }).catch((e) => console.warn("[founder] checkpoint rollback failed:", e));
    },
    [scenarioId, isFounderScenario, apiHeaders],
  );

  return { notifyAdvance, notifyClear, notifyRollback };
}
