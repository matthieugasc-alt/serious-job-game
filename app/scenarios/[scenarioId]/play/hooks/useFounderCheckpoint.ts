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

/** Shape of the deep snapshot payload sent to /deep_save. Mirrors the
 *  server-side FounderCheckpoint["sessionSnapshot"] type. */
export type DeepSaveSnapshot = {
  flags: Record<string, any>;
  chatMessages: any[];
  mailDrafts: Record<string, any>;
  savedDrafts: Record<string, any>;
  scores: Record<string, number>;
  pendingTimedEvents: any[];
  inboxMails: any[];
  sentMails: any[];
  injectedPhaseEntryEvents: string[];
  currentPhaseIndex: number;
  chosenCtoId?: string | null;
  chosenKolId?: string | null;
};

export type FounderCheckpointAPI = {
  notifyAdvance: (completedPhaseId: string, newPhaseIndex: number) => void;
  notifyClear: () => void;
  notifyRollback: (targetPhaseId: string, targetPhaseIndex: number) => void;
  /** Persist the deep session snapshot. Non-blocking, silent on failure.
   *  Callers throttle: hook useDeepSave does 10 s cadence + on unload. */
  notifyDeepSave: (snapshot: DeepSaveSnapshot) => void;
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

  const notifyDeepSave = useCallback(
    (snapshot: DeepSaveSnapshot) => {
      if (!isFounderScenario) return;
      // Best-effort: swallow all errors so throttled saves never disrupt
      // gameplay. The server logs its own reject reasons.
      fetch("/api/founder/checkpoint", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({
          scenarioId,
          action: "deep_save",
          snapshot,
        }),
      }).catch((e) => console.warn("[founder] deep_save failed:", e));
    },
    [scenarioId, isFounderScenario, apiHeaders],
  );

  return { notifyAdvance, notifyClear, notifyRollback, notifyDeepSave };
}
