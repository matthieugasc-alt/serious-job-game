"use client";

import { useEffect, useRef } from "react";
import type { ScenarioDefinition } from "@/app/lib/types";
import {
  tickSimulatedTime,
  flushDueTimedEvents,
  completeCurrentPhaseAndAdvance,
  addAIMessage,
  finishScenario,
  injectPhaseEntryEvents,
  updateMailDraft,
} from "@/app/lib/runtime";
import { InterviewHandler } from "../handlers";

/**
 * Parameters for the usePhaseTimer hook.
 * Every value is passed from the parent — zero logic change.
 */
interface UsePhaseTimerParams {
  session: any;
  scenario: ScenarioDefinition | null;
  view: any;
  setSession: (updater: any) => void;
  interviewStarted: boolean;
  setInterviewStarted: (v: boolean) => void;
  setSelectedContact: (v: string) => void;
  isFounderScenario: boolean;
  chosenCtoId: string | null;
  phaseStartRealTimeRef: React.MutableRefObject<number>;
  phaseMaxDurationTriggeredRef: React.MutableRefObject<string | null>;
  /** Resolve "chosen_cto" placeholders in session phases */
  resolveDynamicActors: (sess: any) => void;
  /** Resolve {{establishment_*}} placeholders in session phases */
  resolveEstablishmentPlaceholders: (sess: any) => void;
  /** Inject only delay_ms=0 entry events (for manual_start phases) */
  injectIntroEventsOnly: (sess: any) => void;
  /** Notify server of phase advance (Founder anti-rollback) */
  notifyCheckpointAdvance: (phaseId: string, newIndex: number) => void;
  /** Deep-clone a session object */
  cloneSession: (prev: any) => any;
}

export function usePhaseTimer({
  session,
  scenario,
  view,
  setSession,
  interviewStarted,
  setInterviewStarted,
  setSelectedContact,
  isFounderScenario,
  chosenCtoId,
  phaseStartRealTimeRef,
  phaseMaxDurationTriggeredRef,
  resolveDynamicActors,
  resolveEstablishmentPlaceholders,
  injectIntroEventsOnly,
  notifyCheckpointAdvance,
  cloneSession,
}: UsePhaseTimerParams): void {
  // ── Internal refs (only used within these effects) ──
  const timeAdvanceTriggeredRef = useRef<string | null>(null);
  const prevPhaseIndexRef = useRef<number>(0);

  // ── Simulated clock ──
  useEffect(() => {
    if (!session || !scenario) return;
    const iv = setInterval(() => {
      setSession((prev: any) => {
        if (!prev) return prev;
        const next = cloneSession(prev);
        tickSimulatedTime(next, 1000);
        return next;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [!!session, !!scenario]);

  // ── Auto-advance ──
  useEffect(() => {
    if (!session || !scenario || !view) return;
    const phase = scenario.phases[session.currentPhaseIndex];
    if (phase?.auto_advance && view.canAdvance) {
      const next = cloneSession(session);
      completeCurrentPhaseAndAdvance(next);
      resolveDynamicActors(next);
      resolveEstablishmentPlaceholders(next);
      const newPhase = scenario.phases[next.currentPhaseIndex];
      // For interview phases, only inject Alexandre's intro (delay_ms=0)
      if (InterviewHandler.matches(newPhase)) {
        injectIntroEventsOnly(next);
        setInterviewStarted(false);
      } else {
        injectPhaseEntryEvents(next);
      }
      if (newPhase?.mail_config?.defaults) {
        updateMailDraft(next, newPhase.phase_id, {
          to: newPhase.mail_config.defaults.to || "",
          cc: newPhase.mail_config.defaults.cc || "",
          subject: newPhase.mail_config.defaults.subject || "",
          body: "", attachments: [],
        });
      }
      // Auto-select appropriate contact for the new phase
      // For interview phases, select the briefing actor (not the candidate)
      const briefingActor = InterviewHandler.getBriefingActor(newPhase);
      if (briefingActor) {
        setSelectedContact(briefingActor);
      } else {
        const newActors = (newPhase?.ai_actors || []).map((a: string) => a === "chosen_cto" && chosenCtoId ? chosenCtoId : a);
        if (newActors[0]) setSelectedContact(newActors[0]);
      }
      setSession(next);
    }
  }, [view?.canAdvance, view?.phaseId]);

  // ── Time-based auto-advance (e.g., phase 1 ends at 15:00) ──
  useEffect(() => {
    if (!session || !scenario || !view) return;
    const phase = scenario.phases[session.currentPhaseIndex];
    const advanceAtKey = (phase as any)?.auto_advance_at;
    if (!advanceAtKey) return;
    const timeline = (scenario as any).timeline;
    if (!timeline || !timeline[advanceAtKey]) return;
    const deadlineIso = timeline[advanceAtKey];
    const deadlineMs = new Date(deadlineIso).getTime();
    const simMs = new Date(session.simulatedTime).getTime();
    // Prevent re-triggering for same phase
    const phaseId = phase?.phase_id || `phase_${session.currentPhaseIndex}`;
    if (simMs >= deadlineMs && timeAdvanceTriggeredRef.current !== phaseId) {
      timeAdvanceTriggeredRef.current = phaseId;
      const next = cloneSession(session);
      // Set simulated time to the exact deadline
      next.simulatedTime = deadlineIso;
      completeCurrentPhaseAndAdvance(next);
      resolveDynamicActors(next);
      resolveEstablishmentPlaceholders(next);
      const newPhase = scenario.phases[next.currentPhaseIndex];
      injectPhaseEntryEvents(next);
      // For interview phases, select the briefing actor; otherwise first ai_actor
      const briefingActorTime = InterviewHandler.getBriefingActor(newPhase);
      const newPhaseActor = briefingActorTime || newPhase?.ai_actors?.[0];
      if (newPhaseActor) setSelectedContact(newPhaseActor);
      if (newPhase?.mail_config?.defaults) {
        updateMailDraft(next, newPhase.phase_id, {
          to: "", cc: "",
          subject: newPhase.mail_config.defaults.subject || "",
          body: "", attachments: [],
        });
      }
      setSession(next);
    }
  }, [session?.simulatedTime, session?.currentPhaseIndex]);

  // ── Reset phase start real time when phase changes + notify checkpoint ──
  useEffect(() => {
    if (!session || !scenario) return;
    phaseStartRealTimeRef.current = Date.now();
    // Reset manual interview gate on phase change
    setInterviewStarted(false);

    // Notify checkpoint on phase advance (not on initial load)
    const idx = session.currentPhaseIndex;
    if (idx > prevPhaseIndexRef.current && isFounderScenario) {
      const prevPhase = scenario.phases[prevPhaseIndexRef.current];
      const prevId = prevPhase?.phase_id || (prevPhase as any)?.id || `phase_${prevPhaseIndexRef.current}`;
      notifyCheckpointAdvance(prevId, idx);
    }
    prevPhaseIndexRef.current = idx;
  }, [session?.currentPhaseIndex]);

  // ── Auto-advance based on max_duration_sec (real wall-clock time) ──
  // CRITICAL: interviewStarted is in the dependency array so that when
  // the player clicks "Faire entrer le candidat", this effect re-runs
  // and actually creates the timer interval for manual_start phases.
  useEffect(() => {
    if (!session || !scenario) return;
    const phase = scenario.phases[session.currentPhaseIndex] as any;
    const maxSec = phase?.max_duration_sec;
    if (!maxSec || typeof maxSec !== "number") return;
    // Don't start timer for interview phases until interview has started
    if (InterviewHandler.isGateActive(phase, interviewStarted)) return;
    const phaseId = phase?.phase_id || `phase_${session.currentPhaseIndex}`;
    if (phaseMaxDurationTriggeredRef.current === phaseId) return;

    const iv = setInterval(() => {
      const elapsed = (Date.now() - phaseStartRealTimeRef.current) / 1000;
      if (elapsed >= maxSec && phaseMaxDurationTriggeredRef.current !== phaseId) {
        phaseMaxDurationTriggeredRef.current = phaseId;
        // Check if there's a next phase
        const isLastPhase = session.currentPhaseIndex >= scenario.phases.length - 1;
        if (isLastPhase) {
          // End the scenario — complete last phase + trigger finish
          setSession((prev: any) => {
            if (!prev) return prev;
            const next = cloneSession(prev);
            addAIMessage(next, "⏱ Le temps imparti est écoulé.", "system");
            // Mark last phase as completed
            const lastPhaseId = scenario.phases[next.currentPhaseIndex]?.phase_id;
            if (lastPhaseId && !next.completedPhases.includes(lastPhaseId)) {
              next.completedPhases.push(lastPhaseId);
            }
            finishScenario(next);
            return next;
          });
        } else {
          setSession((prev: any) => {
            if (!prev) return prev;
            const next = cloneSession(prev);
            addAIMessage(next, "⏱ Le temps imparti pour cette phase est écoulé. Passons à la suite.", "system");
            completeCurrentPhaseAndAdvance(next);
            // For manual_start phases, only inject intro events
            const newPhase = scenario.phases[next.currentPhaseIndex];
            if (InterviewHandler.matches(newPhase)) {
              injectIntroEventsOnly(next);
              setInterviewStarted(false);
            } else {
              injectPhaseEntryEvents(next);
            }
            // For interview phases, select the briefing actor; otherwise first ai_actor
            const briefingActorDur = InterviewHandler.getBriefingActor(newPhase);
            const durActor = briefingActorDur || newPhase?.ai_actors?.[0];
            if (durActor) setSelectedContact(durActor);
            return next;
          });
        }
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [session?.currentPhaseIndex, !!session, !!scenario, interviewStarted]);

  // ── Flush timed events ──
  useEffect(() => {
    if (!session || !scenario) return;
    const iv = setInterval(() => {
      setSession((prev: any) => {
        if (!prev) return prev;
        const next = cloneSession(prev);
        const changed = flushDueTimedEvents(next);
        return changed ? next : prev;
      });
    }, 500);
    return () => clearInterval(iv);
  }, [!!session, !!scenario]);
}
