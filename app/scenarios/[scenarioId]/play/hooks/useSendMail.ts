/**
 * useSendMail — extracted from page.tsx.
 *
 * Sends the currently-composed mail draft:
 *   1. Clean up any saved draft for the same recipient
 *   2. Fire the pure-function `sendCurrentPhaseMail` (runtime)
 *   3. Passive logging (fireMailSent)
 *   4. Ask MailModule to handle it (module system dispatch)
 *   5. Legacy fallback: check completion_rules + advance phase +
 *      re-inject entry events + reset next phase draft
 *
 * Zero business logic change vs the previous inline function.
 */

import type { PlayerContextValue } from "../contexts/PlayerContext";
import { resolveModules, dispatch, buildModuleContext } from "../handlers";
import type { MailModuleExtra } from "../handlers";
import { buildRuntimeView } from "@/app/lib/runtime";
import { fireMailSent } from "@/app/lib/gameEvents/client";
import { checkCompletionRules } from "../lib/checkCompletionRules";

export function useSendMail(ctx: PlayerContextValue) {
  return () => {
    const {
      session, scenario, view, canActuallySendMail,
      cloneSession, sendCurrentPhaseMail, playNotificationSound,
      currentMailDraft, authTokenRef, gameSessionIdRef, scenarioId,
      isFounderScenario, chosenCtoId, actors,
      displayPlayerName, aiPromptsMapRef, aiPromptRef,
      applyModuleActions, setSession, setShowCompose,
      resolveDynamicActors, resolveEstablishmentPlaceholders,
      injectPhaseEntryEvents, completeCurrentPhaseAndAdvance,
      dispatchEnterPhase, notifyCheckpointClear, updateMailDraft,
    } = ctx;

    if (!session || !scenario || !view || !canActuallySendMail) return;
    const phase = scenario.phases[session.currentPhaseIndex];
    const mailKind = phase?.mail_config?.kind || "other";
    const next = cloneSession(session);

    // Clean up saved draft for this recipient since we're sending
    const draftTo = next.mailDrafts[view.phaseId]?.to?.trim().toLowerCase();
    if (draftTo && next.savedDrafts) {
      delete next.savedDrafts[`${view.phaseId}::${draftTo}`];
    }
    sendCurrentPhaseMail(next, mailKind);
    playNotificationSound();

    // ── Passive logging: mail_sent ──
    try {
      const draft = currentMailDraft || { to: "", subject: "", body: "" };
      fireMailSent(
        authTokenRef.current || "", gameSessionIdRef.current, scenarioId as string,
        view.phaseId, mailKind, draft.to || "", draft.subject || "",
        (draft.body || "").length, !!(draft as any).attachments?.length,
      );
    } catch { /* never break */ }

    // ── Module system — try MailModule BEFORE legacy code ──
    const mailModules = resolveModules(phase, scenario);
    if (mailModules) {
      const mailCtx = {
        ...buildModuleContext({
          session: next,
          scenario,
          phase,
          playerName: displayPlayerName,
          scenarioId: scenarioId || "",
        }),
        extra: {
          mailBody: currentMailDraft?.body || "",
          mailTo: currentMailDraft?.to || "",
          mailKind,
          isFounderScenario,
          chosenCtoId: chosenCtoId || "sofia_renault",
          actors,
          conversation: view?.conversation || [],
          scores: session.scores || {},
          constraints: (scenario as any)?.constraints || {},
          currentMailDraft: currentMailDraft || { to: "", subject: "", body: "" },
          runtimeView: buildRuntimeView(next),
          activePromptMap: aiPromptsMapRef.current,
          defaultPrompt: aiPromptRef.current,
          displayPlayerName,
        } as MailModuleExtra,
      };
      const mailResult = dispatch(
        { type: "mail_sent", mailKind, mailBody: currentMailDraft?.body || "" },
        mailModules,
        mailCtx,
      );
      if (mailResult.actions.length > 0) {
        applyModuleActions(mailResult.actions, next);
        setSession(next);
        return; // Module handled it — skip legacy code
      }
    }

    // ── LEGACY FALLBACK — generic send_advances_phase only ──
    if (phase?.mail_config?.send_advances_phase) {
      const rulesPass = checkCompletionRules(
        phase as any,
        (view?.conversation || []) as any,
        session.scores,
      );

      if (rulesPass) {
        completeCurrentPhaseAndAdvance(next);
        if (next.isFinished) {
          notifyCheckpointClear();
        } else {
          resolveDynamicActors(next);
          resolveEstablishmentPlaceholders(next);
          injectPhaseEntryEvents(next);
          dispatchEnterPhase(next);
          const newPhase = scenario.phases[next.currentPhaseIndex];
          if (newPhase?.mail_config?.defaults) {
            updateMailDraft(next, newPhase.phase_id, {
              to: "",
              cc: "",
              subject: newPhase.mail_config.defaults.subject || "",
              body: "", attachments: [],
            });
          }
        }
      }
    }

    setSession(next);
    setShowCompose(false);
  };
}
