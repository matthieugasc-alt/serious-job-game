/**
 * useSendChatMessage — extracted from page.tsx.
 *
 * Sends the current playerInput to the selected contact via /api/chat:
 *   1. Guards: valid session, actor active in phase, not mail-only, timer not expired
 *   2. Optimistic add: player message + setSession(next)
 *   3. Build chat_context (C3 enrichment) + payload
 *   4. fetchChatWithRetry with 401/429/5xx/network retry
 *   5. Add AI reply + applyEvaluation
 *   6. Success/failure keyword post-processing (KOL flags, HARD_REJECT)
 *   7. S3-specific pivot detection (switched_to_clinique)
 *   8. updateAdaptiveMode + scheduleInterruption
 *
 * Zero business logic change vs the previous inline function.
 */

import type { PlayerContextValue } from "../contexts/PlayerContext";
import { fetchChatWithRetry } from "../lib/fetchChatWithRetry";
import { firePlayerMessage, fireAIMessage } from "@/app/lib/gameEvents/client";
import { applyPhaseObservation } from "@/app/lib/evaluation/applyPhaseObservation";

export function useSendChatMessage(ctx: PlayerContextValue) {
  return async () => {
    const {
      playerInput, session, scenario, view, scenarioId,
      phaseMaxDurationTriggeredRef, setPlayerInput, inputRef,
      selectedContact, resolveActor, currentPhaseAiActors, actors,
      cloneSession, addPlayerMessage, setSession,
      authTokenRef, gameSessionIdRef, setIsSending,
      conversation, aiPromptsMapRef, aiPromptRef,
      buildChatContext, displayPlayerName, apiHeaders,
      sessionRef, playNotificationSound, addAIMessage, applyEvaluation,
      checkNpcSuccessKeywords, checkNpcFailureKeywords, handlePhaseFailure,
      resolveDynamicActors, resolveEstablishmentPlaceholders,
      phaseStartRealTimeRef, updateAdaptiveMode, scheduleInterruption,
    } = ctx;

    if (!playerInput.trim() || !session || !scenario || !view) return;
    const curPhase = scenario.phases[session.currentPhaseIndex] as any;
    const curPhaseId = curPhase?.phase_id || `phase_${session.currentPhaseIndex}`;
    if (phaseMaxDurationTriggeredRef.current === curPhaseId) return;
    const text = playerInput;
    setPlayerInput("");
    setTimeout(() => inputRef.current?.focus(), 0);

    // Determine which AI actor will respond (resolve chosen_cto placeholder)
    const rawTarget = selectedContact || scenario.phases[session.currentPhaseIndex]?.ai_actors?.[0] || "npc";
    const targetActor = resolveActor(rawTarget);

    // Block sending to actors not active in the current phase
    if (!currentPhaseAiActors.includes(targetActor)) {
      setPlayerInput(text);
      return;
    }
    // Block chat with mail-only actors
    const targetActorDef = actors.find((a: any) => a.actor_id === targetActor);
    if ((targetActorDef as any)?.mail_only) {
      setPlayerInput(text);
      return;
    }

    // Optimistic add
    const next = cloneSession(session);
    addPlayerMessage(next, text, targetActor);
    setSession(next);

    try { firePlayerMessage(authTokenRef.current || "", gameSessionIdRef.current, scenarioId as string, curPhaseId, targetActor, text); } catch { /* never break */ }

    setIsSending(true);
    try {
      const relevantConv = conversation.filter((m: any) => {
        if (m.role === "player") return m.toActor === targetActor;
        if (m.role === "npc") return m.actor === targetActor;
        return false;
      });
      const recentConv = relevantConv.slice(-10).map((m: any) => ({
        role: m.role === "player" ? "user" : "assistant",
        content: m.content,
      }));
      const playerOnlyMessages = relevantConv
        .filter((m: any) => m.role === "player")
        .slice(-6)
        .map((m: any) => m.content);

      const activePrompt = aiPromptsMapRef.current[targetActor] || aiPromptRef.current;

      const chatContext = buildChatContext({
        scenario: scenario as any,
        currentPhase: scenario.phases[session.currentPhaseIndex] as any,
        session,
        contactId: targetActor,
      });

      // E-chantier E2: forward observed_criteria if declared on the phase.
      // /api/chat then augments the eval prompt to also return a
      // `phase_observation` block that the client feeds to applyPhaseObservation.
      const observedCriteria =
        (scenario.phases[session.currentPhaseIndex] as any)?.evaluation?.observed_criteria;

      const chatPayload = {
        playerName: displayPlayerName,
        message: text,
        phaseTitle: view.phaseTitle,
        phaseObjective: view.phaseObjective,
        phaseFocus: view.phaseFocus,
        phasePrompt: view.phasePrompt,
        criteria: view.criteria,
        mode: view.adaptiveMode,
        narrative: scenario.narrative,
        recentConversation: recentConv,
        playerMessages: playerOnlyMessages,
        roleplayPrompt: activePrompt,
        ...(chatContext ? { chat_context: chatContext } : {}),
        ...(Array.isArray(observedCriteria) && observedCriteria.length > 0
          ? { observed_criteria: observedCriteria }
          : {}),
      };

      const { data, error: fetchError } = await fetchChatWithRetry(chatPayload, {
        apiHeaders,
        authTokenRef,
      });

      if (!data) {
        const latestSession = sessionRef.current || next;
        const errFinal = cloneSession(latestSession);
        errFinal.chatMessages.push({
          role: "system",
          actor: "system",
          content: `⚠️ Impossible d'obtenir une réponse. ${fetchError || "Vérifiez votre connexion et réessayez."}`,
          type: "error",
          phaseId: curPhaseId,
          timestamp: Date.now(),
        });
        setSession(errFinal);
        return;
      }

      // Discard AI response if timer has fired while waiting for the API
      if (phaseMaxDurationTriggeredRef.current === curPhaseId) return;
      playNotificationSound();

      const latestSession = sessionRef.current || next;
      const final = cloneSession(latestSession);
      addAIMessage(final, data.reply, targetActor);

      try { fireAIMessage(authTokenRef.current || "", gameSessionIdRef.current, scenarioId as string, curPhaseId, targetActor, data.reply); } catch { /* never break */ }
      applyEvaluation(final, data.matched_criteria || [], data.score_delta || 0, data.flags_to_set || {});

      // ── E-chantier E2/E3/E4 — apply phase observation ──
      // When /api/chat returned a phase_observation block (only if the
      // phase declared evaluation.observed_criteria), let the moteur
      // applyPhaseObservation decide pass/fail based on completion_rules
      // and persist the full audit trail in session.evaluation_history.
      // If passed=true, we ALSO set a standardized flag
      // `phase_evaluation_passed_<phase_id>` that any_flags can consume
      // (bridge legacy completion_rules with the E-chantier moteur).
      const rawObs = (data as any).phase_observation;
      const currentPhaseE = scenario.phases[final.currentPhaseIndex] as any;
      if (rawObs && currentPhaseE?.evaluation) {
        const result = applyPhaseObservation(currentPhaseE, {
          criteria: rawObs.criteria || {},
          evidence: rawObs.evidence,
          meta: rawObs.meta,
        });
        if (!Array.isArray(final.evaluation_history)) final.evaluation_history = [];
        final.evaluation_history.push({
          phaseId: result.phaseId,
          timestamp: result.timestamp,
          passed: result.passed,
          appliedRule: result.appliedRule,
          matched: result.matched,
          missing: result.missing,
          unexpected: result.unexpected,
          weightedScore: result.weightedScore,
          weightedThreshold: result.weightedThreshold,
          reason: result.reason,
          observation: result.observation,
        });
        if (result.passed) {
          final.flags[`phase_evaluation_passed_${result.phaseId}`] = true;
        }
      }

      // ── Success keywords: NPC positive response sets flags ──
      const successFlags = checkNpcSuccessKeywords(final, data.reply);
      if (successFlags) {
        for (const [key, value] of Object.entries(successFlags)) {
          if (value === true) final.flags[key] = true;
        }
      }

      // ── Failure loop-back: NPC refusal triggers return to previous phase ──
      if (checkNpcFailureKeywords(final, data.reply)) {
        const handled = handlePhaseFailure(final);
        if (handled.applied) {
          resolveDynamicActors(final);
          resolveEstablishmentPlaceholders(final);
          phaseStartRealTimeRef.current = Date.now();
          phaseMaxDurationTriggeredRef.current = null;
          updateAdaptiveMode(final);
          setSession(final);
          return;
        }
      }

      // ── Scénario 3 Phase 3: detect pivot to clinique via chat with Alexandre ──
      if (scenarioId?.startsWith("founder_03") && final.flags.switched_to_clinique && !final.flags.pivot_contract_sent) {
        final.flags.pivot_contract_sent = true;
        final.flags.chose_chu = false;
        final.flags.chose_saint_martin = false;
        final.flags.chose_clinique = true;
        const curPhaseId2 = scenario.phases[final.currentPhaseIndex]?.phase_id || "phase_3_contract";
        final.pendingTimedEvents.push({
          id: `${curPhaseId2}::pivot_contrat_mail`,
          actor: "contact_clinique",
          content: "Suite à votre demande transmise par le Dr. Morel, veuillez trouver ci-joint la convention type pour le test pilote. Merci de retourner le document signé ou vos observations.",
          dueAt: Date.now() + 5000,
          phaseId: curPhaseId2,
          type: "mail",
          subject: "Convention de test — Clinique Saint-Augustin",
          attachments: [{ id: "contrat_clinique", label: "Convention de test — Clinique Saint-Augustin" }],
        });
      }

      updateAdaptiveMode(final);
      scheduleInterruption(final);
      setSession(final);
    } catch (err) {
      console.error("Erreur chat:", err);
      try {
        const latestSession = sessionRef.current || next;
        const errFinal = cloneSession(latestSession);
        errFinal.chatMessages.push({
          role: "system",
          actor: "system",
          content: `⚠️ Une erreur inattendue s'est produite. Veuillez réessayer.`,
          type: "error",
          phaseId: curPhaseId,
          timestamp: Date.now(),
        });
        setSession(errFinal);
      } catch {}
    } finally {
      setIsSending(false);
    }
  };
}
