/**
 * applyModuleActions — central dispatcher for ModuleAction items returned
 * by any PhaseModule. Extracted from page.tsx so the switch can grow
 * without the monolith doing the same.
 *
 * Most cases mutate the `next` session in place; a few trigger React
 * setState callbacks supplied via `deps`.
 *
 * Design notes
 * ────────────
 * - Pure-ish: side effects are delegated to the `deps` callbacks. The
 *   function never touches React directly.
 * - `delayed_actions` self-recurses via the same exported entry point so
 *   nested actions work.
 * - Logging helpers (firePhaseCompleted, fireScenarioCompleted,
 *   firePhaseStarted) are called inline because they're already pure
 *   network calls and would only add ceremony if abstracted.
 */

import type { ScenarioDefinition } from "@/app/lib/types";
import type { ModuleAction } from "./modules/types";
import {
  addAIMessage,
  addInboxMail,
  completeCurrentPhaseAndAdvance,
  finishScenario,
  injectPhaseEntryEvents,
  sendCurrentPhaseMail,
  updateMailDraft,
} from "@/app/lib/runtime";
import {
  firePhaseCompleted,
  firePhaseStarted,
  fireScenarioCompleted,
} from "@/app/lib/gameEvents/client";

type MainView = "chat" | "mail" | "docs" | "context" | "notes";

export type ApplyModuleActionsDeps = {
  scenario: ScenarioDefinition;
  scenarioId: string;
  /** Used by `delayed_actions` to clone before mutating in the timeout. */
  cloneSession: (s: any) => any;
  /** Setter exposed by page.tsx — invoked by `delayed_actions`. */
  setSession: (s: any) => void;
  /** Visual setters used by simple actions. */
  setSelectedContact: (id: string | null) => void;
  setMainView: (v: MainView) => void;
  setShowCompose: (b: boolean) => void;
  setContractVars: (vars: any) => void;
  /** Audio cue. */
  playNotificationSound: () => void;
  /** Phase-bookkeeping helpers owned by the page. */
  resolveDynamicActors: (sess: any) => void;
  resolveEstablishmentPlaceholders: (sess: any) => void;
  dispatchEnterPhase: (sess: any) => boolean;
  /** Founder checkpoint API helper. */
  notifyCheckpointClear: () => void;
  /** Async-effect runner (extracted in PRIO 1.1). */
  executeMailAsyncEffect: (effect: any, next: any) => void;
  /** Logging context — refs captured by page.tsx at module init. */
  authTokenRef: { current: string | null };
  gameSessionIdRef: { current: string };
  phaseStartRealTimeRef: { current: number | null };
  sessionStartTimeRef: { current: number };
};

export function applyModuleActions(
  actions: ModuleAction[],
  next: any,
  deps: ApplyModuleActionsDeps,
): void {
  const {
    scenario,
    scenarioId,
    cloneSession,
    setSession,
    setSelectedContact,
    setMainView,
    setShowCompose,
    setContractVars,
    playNotificationSound,
    resolveDynamicActors,
    resolveEstablishmentPlaceholders,
    dispatchEnterPhase,
    notifyCheckpointClear,
    executeMailAsyncEffect,
    authTokenRef,
    gameSessionIdRef,
    phaseStartRealTimeRef,
    sessionStartTimeRef,
  } = deps;

  for (const action of actions) {
    switch (action.type) {
      case "set_flags":
        Object.assign(next.flags, action.flags);
        break;
      case "add_ai_message":
        addAIMessage(next, action.content, action.actor);
        break;
      case "set_contact":
        setSelectedContact(action.actorId);
        break;
      case "set_view":
        setMainView(action.view as MainView);
        break;
      case "set_compose":
        setShowCompose(action.show);
        break;
      case "play_sound":
        playNotificationSound();
        break;
      case "set_contract_vars":
        setContractVars(action.vars as any);
        break;
      case "add_inbox_mail": {
        const mail = { ...action.mail };
        // Resolve __next_phase__ placeholder
        if (mail.phaseId === "__next_phase__") {
          const newPhase = scenario.phases[next.currentPhaseIndex];
          mail.phaseId = newPhase?.phase_id || mail.phaseId;
        }
        addInboxMail(next, mail);
        break;
      }
      case "complete_advance_phase": {
        const prevPhaseIdx = next.currentPhaseIndex;
        const prevPhase = scenario.phases[prevPhaseIdx];
        completeCurrentPhaseAndAdvance(next);
        // ── Passive logging: phase_completed ──
        try {
          const t = authTokenRef.current || "";
          const gSid = gameSessionIdRef.current;
          const dur = phaseStartRealTimeRef.current
            ? Date.now() - phaseStartRealTimeRef.current
            : 0;
          firePhaseCompleted(
            t,
            gSid,
            scenarioId,
            prevPhase?.phase_id || "",
            prevPhaseIdx,
            next.score || 0,
            dur,
          );
        } catch { /* never break */ }
        // If we just finished the scenario (last phase), skip phase-entry work
        // and clear checkpoint immediately to avoid race with redirect.
        if (next.isFinished) {
          try {
            const t = authTokenRef.current || "";
            const gSid = gameSessionIdRef.current;
            const totalDur = Date.now() - sessionStartTimeRef.current;
            fireScenarioCompleted(
              t,
              gSid,
              scenarioId,
              next.ending || "unknown",
              next.score || 0,
              next.completedPhases || [],
              totalDur,
            );
          } catch { /* never break */ }
          notifyCheckpointClear();
          break;
        }
        // ── Passive logging: phase_started (new phase) ──
        try {
          const t = authTokenRef.current || "";
          const gSid = gameSessionIdRef.current;
          const np = scenario.phases[next.currentPhaseIndex];
          firePhaseStarted(
            t,
            gSid,
            scenarioId,
            np?.phase_id || "",
            next.currentPhaseIndex,
            np?.title || "",
            (np as any)?.modules || [],
          );
        } catch { /* never break */ }
        resolveDynamicActors(next);
        resolveEstablishmentPlaceholders(next);
        injectPhaseEntryEvents(next);
        dispatchEnterPhase(next); // Module system: run enter_phase on new phase
        const newPhase = scenario.phases[next.currentPhaseIndex];
        if (newPhase?.mail_config?.defaults) {
          updateMailDraft(next, newPhase.phase_id, {
            to: "",
            cc: "",
            subject: newPhase.mail_config.defaults.subject || "",
            body: "",
            attachments: [],
          });
        }
        break;
      }
      case "schedule_timed_event": {
        const ev = { ...action.event } as any;
        // Resolve __next_phase__ placeholders
        if (ev.phaseId === "__next_phase__") {
          const newPhase = scenario.phases[next.currentPhaseIndex];
          ev.phaseId = newPhase?.phase_id || ev.phaseId;
        }
        if (typeof ev.id === "string" && ev.id.startsWith("__next_phase__::")) {
          const newPhase = scenario.phases[next.currentPhaseIndex];
          ev.id = ev.id.replace("__next_phase__", newPhase?.phase_id || "unknown");
        }
        next.pendingTimedEvents.push(ev);
        break;
      }
      case "delayed_actions":
        setTimeout(() => {
          const delayed = cloneSession(next);
          applyModuleActions(action.actions, delayed, deps);
          setSession(delayed);
        }, action.delayMs);
        break;
      case "async_effect":
        executeMailAsyncEffect(action.effect as any, next);
        break;
      case "advance_phase":
        completeCurrentPhaseAndAdvance(next);
        break;
      case "finish_scenario":
        finishScenario(next);
        try {
          const t = authTokenRef.current || "";
          const gSid = gameSessionIdRef.current;
          const totalDur = Date.now() - sessionStartTimeRef.current;
          fireScenarioCompleted(
            t,
            gSid,
            scenarioId,
            next.ending || "unknown",
            next.score || 0,
            next.completedPhases || [],
            totalDur,
          );
        } catch { /* never break */ }
        notifyCheckpointClear(); // Clear checkpoint immediately to avoid race with redirect
        break;
      // ── New actions for InterviewModule / ContractModule ──
      case "mark_unavailable":
        // Store unavailability as a session flag for downstream consumers
        next.flags[`unavailable_${action.actorId}`] = true;
        break;
      case "open_contract":
        // Signal to open the contract overlay for the given type.
        // Stored as a flag — the JSX reads it to show the overlay.
        next.flags[`pending_contract_open`] = action.contractType;
        break;
      case "set_mail_draft": {
        const phase = scenario.phases[next.currentPhaseIndex];
        const phaseId = phase?.phase_id || "unknown";
        updateMailDraft(next, phaseId, {
          to: action.draft.to,
          cc: action.draft.cc,
          subject: action.draft.subject,
          body: action.draft.body,
          attachments: action.draft.attachments,
        });
        break;
      }
      case "send_mail": {
        // Trigger the full mail send flow: record the mail in session
        // and set the flag so downstream logic knows mail was sent.
        // The draft should already be set via a preceding set_mail_draft action.
        sendCurrentPhaseMail(next, action.kind);
        next.flags[`mail_sent_${action.kind}`] = true;
        break;
      }
      case "inject_events":
        // Add timed events directly to the pending queue
        for (const ev of action.events) {
          next.pendingTimedEvents.push(ev);
        }
        break;
      default:
        // ⚠ GARDE-FOU AUTOMATIQUE — exhaustive check
        // Si un nouveau `type` est ajouté à ModuleAction sans être géré ici,
        // TypeScript FAIT ÉCHOUER LE BUILD sur cette ligne (l'action doit
        // être `never` pour que l'assignment passe). Remplace l'ancien
        // `default: break;` qui swallowait silencieusement les nouveaux cas.
        //
        // Comment fixer si tu vois l'erreur au build :
        //   1. Ajoute un `case "mon_nouveau_type":` juste au-dessus qui
        //      exécute le side effect voulu, puis `break`.
        //   2. Ou (rare) élargis explicitement le type ModuleAction.
        assertNeverModuleAction(action);
    }
  }
}

/**
 * Force TypeScript à vérifier qu'aucun variant de ModuleAction n'est
 * oublié dans le switch. Si un nouveau `type` est ajouté au union sans
 * un case correspondant, l'inférence donne `action: <variant>` au lieu
 * de `action: never` → le compilateur émet TS2345 sur cette ligne.
 *
 * En runtime (branche théoriquement inatteignable), on log + throw pour
 * ne PAS avoir de silent no-op comme l'ancien `default: break`.
 */
function assertNeverModuleAction(action: never): never {
  const type = (action as { type?: string })?.type ?? "<unknown>";
  console.error(
    `[applyModuleActions] Unhandled ModuleAction type: ${type}. ` +
    `This is a bug: the type union was extended without adding a case. ` +
    `Full payload:`,
    action,
  );
  throw new Error(
    `applyModuleActions: unhandled ModuleAction type "${type}". ` +
    `See handlers/modules/types.ts for the full union.`,
  );
}
