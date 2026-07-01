/**
 * useEndPresentation — extracted from page.tsx.
 *
 * Terminates a presentation phase (voice recording):
 *   1. Stop voice capture and inspect the transcript
 *   2. Fail fast with an explicit error if capture failed or transcript is empty
 *   3. Otherwise: add player+AI messages, advance phase, dispatch enter_phase
 *   4. Background: POST /api/evaluate-presentation for score/criteria eval
 *
 * Zero business logic change vs the previous inline function — only the
 * dependencies are now explicit via `ctx` (PlayerContextValue).
 */

import type { PlayerContextValue } from "../contexts/PlayerContext";
import { InterviewHandler } from "../handlers";

export function useEndPresentation(ctx: PlayerContextValue) {
  return async (trigger: "manual" | "auto") => {
      const {
        setPresentationDone, setPresentationError, stopRecognition,
        session, scenario, view, currentPhaseConfig,
        cloneSession, addPlayerMessage, addAIMessage,
        completeCurrentPhaseAndAdvance, injectPhaseEntryEvents,
        dispatchEnterPhase, setSelectedContact, setSession,
        setVoiceTranscript, presentationAutoStoppedRef,
        apiHeaders, sessionRef, applyEvaluation, addToast,
      } = ctx;

      setPresentationDone(true);
      setPresentationError(null);
      const result = await stopRecognition();
      const trimmed = result.transcript.trim();

      // ── Case 1: explicit error from capture pipeline ──
      if (result.source === "error") {
        console.warn(`[presentation:${trigger}] capture error:`, result.errorCategory, result.errorMessage);
        setPresentationError({
          category:
            result.errorCategory === "transcribe_timeout" ? "timeout"
            : result.errorCategory === "transcribe_network" ? "network"
            : result.errorCategory === "transcribe_invalid_response" ? "invalid_response"
            : "server_error",
          message: result.errorMessage || "Erreur de transcription.",
        });
        presentationAutoStoppedRef.current = false;
        return;
      }

      // ── Case 2: no transcript at all (silence / mic didn't work) ──
      if (!trimmed) {
        console.warn(`[presentation:${trigger}] empty transcript (source=${result.source})`);
        setPresentationError({
          category: "empty_transcript",
          message:
            "Aucun son n'a été capté pendant votre présentation. Vérifiez l'autorisation micro dans votre navigateur, fermez les autres applis qui l'utilisent, et réessayez.",
        });
        presentationAutoStoppedRef.current = false;
        return;
      }

      // ── Case 3: usable transcript → advance phase synchronously ──
      if (!session || !scenario || !view) {
        setPresentationError({
          category: "server_error",
          message: "État de session invalide. Rechargez la page.",
        });
        return;
      }

      const targetActor = (currentPhaseConfig as any)?.ai_actors?.[0] || "sophie_renard";
      const next = cloneSession(session);
      addPlayerMessage(next, trimmed, targetActor);
      addAIMessage(next, "Présentation terminée. Passons à la suite !", targetActor);
      completeCurrentPhaseAndAdvance(next);
      injectPhaseEntryEvents(next);
      const newPhase = scenario.phases[next.currentPhaseIndex];
      const modulesHandled = dispatchEnterPhase(next);
      if (!modulesHandled) {
        const newBriefing = InterviewHandler.getBriefingActor(newPhase);
        if (newBriefing) {
          setSelectedContact(newBriefing);
        } else if (newPhase?.ai_actors?.[0]) {
          setSelectedContact(newPhase.ai_actors[0]);
        }
      }
      setSession(next);

      setPresentationDone(false);
      setVoiceTranscript("");
      presentationAutoStoppedRef.current = false;

      // ── Background evaluation with timeout ──
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45_000);

      fetch("/api/evaluate-presentation", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({
          transcript: trimmed,
          phaseTitle: view.phaseTitle,
          phaseObjective: view.phaseObjective,
          criteria: view.criteria,
        }),
        signal: controller.signal,
      })
        .then(async (res) => {
          clearTimeout(timeoutId);
          if (!res.ok) {
            const errText = await res.text().catch(() => "");
            throw new Error(`server_error:${res.status}:${errText.slice(0, 120)}`);
          }
          let data: any;
          try {
            data = await res.json();
          } catch {
            throw new Error("invalid_response");
          }
          if (!data || typeof data !== "object") throw new Error("invalid_response");
          const updated = cloneSession(sessionRef.current);
          applyEvaluation(
            updated,
            data.matched_criteria || [],
            data.score_delta || 0,
            data.flags_to_set || {},
          );
          setSession(updated);
        })
        .catch((err) => {
          clearTimeout(timeoutId);
          const msg = String(err?.message || err);
          let category: "timeout" | "network" | "server_error" | "invalid_response" = "network";
          if (err?.name === "AbortError") category = "timeout";
          else if (msg.startsWith("server_error")) category = "server_error";
          else if (msg === "invalid_response") category = "invalid_response";
          console.error(`[presentation:${trigger}] background eval failed (${category}):`, err);
          const toastText =
            category === "timeout"
              ? "Analyse de présentation expirée (45 s). Progression conservée, critères non évalués."
              : category === "server_error"
                ? "Erreur serveur d'analyse. Progression conservée, critères non évalués."
                : category === "invalid_response"
                  ? "Réponse d'analyse invalide. Progression conservée, critères non évalués."
                  : "Analyse indisponible (réseau). Progression conservée, critères non évalués.";
          addToast(toastText, "⚠️", "chat");
        });
    };
}
