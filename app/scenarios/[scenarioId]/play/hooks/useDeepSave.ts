/**
 * useDeepSave — fires a POST /api/founder/checkpoint {action:"deep_save"}
 * with the current PlayerSession snapshot, throttled to a fixed cadence
 * and opportunistically on `beforeunload`.
 *
 * Design contract
 * ───────────────
 *   - Cadence: every DEEP_SAVE_INTERVAL_MS (10 s by default).
 *   - Additional trigger on `beforeunload` via navigator.sendBeacon so the
 *     save survives a page reload / tab close without blocking navigation.
 *   - No-ops entirely when isFounderScenario === false — non-founder
 *     scenarios don't have a checkpoint on the server side.
 *   - Skipped while session is null (still booting) or after the scenario
 *     is finished (view.isFinished) — no point saving after the debrief.
 *   - Uses a ref for the snapshot builder to avoid re-creating the
 *     setInterval every time session changes. The builder is called
 *     inside the tick so it always sees the latest state.
 *
 * Why not per-setSession: too noisy (would fire dozens of times per
 * second during a chat batch). Fixed cadence gives predictable network
 * behaviour and matches the "save every N seconds" mental model.
 *
 * Why not React Query mutations: overkill for a fire-and-forget POST.
 */

import { useEffect, useRef } from "react";
import type { DeepSaveSnapshot } from "./useFounderCheckpoint";

export const DEEP_SAVE_INTERVAL_MS = 10_000;

export function useDeepSave(opts: {
  isFounderScenario: boolean;
  isFinished: boolean;
  sessionRef: { current: any };
  notifyDeepSave: (snapshot: DeepSaveSnapshot) => void;
  scenarioId: string;
  /** Read the current auth token so the beacon can include it. */
  authTokenRef: { current: string | null };
}): void {
  const { isFounderScenario, isFinished, sessionRef, notifyDeepSave, scenarioId, authTokenRef } = opts;

  // Keep the latest args in a ref so setInterval closes over stable
  // callbacks without needing to be re-created every render.
  const argsRef = useRef({ isFinished, sessionRef, notifyDeepSave, scenarioId, authTokenRef });
  argsRef.current = { isFinished, sessionRef, notifyDeepSave, scenarioId, authTokenRef };

  useEffect(() => {
    if (!isFounderScenario) return;

    // chosenCtoId / chosenKolId are derived from session (sentMails +
    // flags) so we don't persist them — they'll be re-derived from the
    // restored session on hydrate.
    const buildSnapshot = (): DeepSaveSnapshot | null => {
      const { sessionRef, isFinished } = argsRef.current;
      const s = sessionRef.current;
      if (!s || isFinished) return null;
      return {
        flags: s.flags || {},
        chatMessages: s.chatMessages || [],
        mailDrafts: s.mailDrafts || {},
        savedDrafts: s.savedDrafts || {},
        scores: s.scores || {},
        pendingTimedEvents: s.pendingTimedEvents || [],
        inboxMails: s.inboxMails || [],
        sentMails: s.sentMails || [],
        injectedPhaseEntryEvents: s.injectedPhaseEntryEvents || [],
        currentPhaseIndex: s.currentPhaseIndex ?? 0,
      };
    };

    // ── Cadence tick ──
    const intervalId = setInterval(() => {
      const snap = buildSnapshot();
      if (snap) argsRef.current.notifyDeepSave(snap);
    }, DEEP_SAVE_INTERVAL_MS);

    // ── Unload beacon ──
    // sendBeacon is fire-and-forget and survives page unload. We can't
    // set custom headers (no Authorization), so we embed the token in
    // the payload. The server route already validates it via `req.json()`.
    const onUnload = () => {
      const snap = buildSnapshot();
      if (!snap) return;
      try {
        const token = argsRef.current.authTokenRef.current || "";
        const payload = JSON.stringify({
          scenarioId: argsRef.current.scenarioId,
          action: "deep_save",
          snapshot: snap,
          _unloadToken: token, // consumed by /deep_save unload path
        });
        // Try sendBeacon first (survives unload), fall back to keepalive fetch.
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: "application/json" });
          navigator.sendBeacon("/api/founder/checkpoint", blob);
        } else {
          fetch("/api/founder/checkpoint", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: payload,
            keepalive: true,
          }).catch(() => {});
        }
      } catch {
        // Never block unload
      }
    };
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("pagehide", onUnload); // Safari

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("pagehide", onUnload);
    };
  }, [isFounderScenario]);
}
