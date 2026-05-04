// ══════════════════════════════════════════════════════════════════
// InterviewHandler — Phases with manual_start (e.g. Founder S0 CTO interviews)
// ══════════════════════════════════════════════════════════════════
//
// Pure function handler. No React hooks, no owned state.
// page.tsx owns `interviewStarted` + `phaseStartRealTimeRef`.
// usePhaseTimer owns the countdown timer (reads interviewStarted via props).
//
// This handler provides:
//   - Detection: does a phase require manual interview start?
//   - Gate: is the "Faire entrer le candidat" gate blocking?
//   - Config: reads manual_start_config for routing (briefing actor, etc.)
//   - Candidate name / button label resolution
//   - Start action: session mutation for entering the candidate
//   - Intro injection: delay_ms=0 events only (briefing actor's transition msg)
//
// All routing decisions (which contact to show, which actor to return to)
// are driven by the declarative manual_start_config in scenario.json.
// ══════════════════════════════════════════════════════════════════

import type { InterviewPhaseHandler, ManualStartConfig } from "./types";

export const InterviewHandler: InterviewPhaseHandler = {
  type: "interview",

  // ── Detection ──────────────────────────────────────────────────

  matches(phase: any): boolean {
    return !!(phase as any)?.manual_start;
  },

  // ── Gate state ─────────────────────────────────────────────────

  isGateActive(phase: any, interviewStarted: boolean): boolean {
    return this.matches(phase) && !interviewStarted;
  },

  // ── Candidate resolution (legacy — used when no config) ────────

  getCandidateFirstName(phase: any, actors: any[]): string {
    const candidateId = (phase as any)?.ai_actors?.[0];
    if (!candidateId) return "le candidat";
    const actor = actors.find((a: any) => a.actor_id === candidateId);
    return actor?.name?.split(" ")[0] || "le candidat";
  },

  // ── Config readers ─────────────────────────────────────────────

  getConfig(phase: any): ManualStartConfig | null {
    const cfg = (phase as any)?.manual_start_config;
    if (!cfg || typeof cfg !== "object") return null;
    return cfg as ManualStartConfig;
  },

  getBriefingActor(phase: any): string | null {
    return this.getConfig(phase)?.briefing_actor ?? null;
  },

  getTargetActor(phase: any): string {
    return this.getConfig(phase)?.target_actor ?? (phase as any)?.ai_actors?.[0] ?? "";
  },

  getButtonLabel(phase: any): string {
    return this.getConfig(phase)?.button_label ?? "Faire entrer le candidat";
  },

  getReturnActor(phase: any): string | null {
    return this.getConfig(phase)?.return_to_actor ?? null;
  },

  shouldMarkUnavailable(phase: any): boolean {
    return this.getConfig(phase)?.mark_target_unavailable ?? false;
  },

  // ── Start interview action ─────────────────────────────────────
  // Returns a cloned + mutated session with remaining entry_events
  // scheduled as timed events. Caller is responsible for:
  //   1. setInterviewStarted(true)
  //   2. phaseStartRealTimeRef.current = Date.now()
  //   3. setSession(returnedSession)
  //   4. setSelectedContact(targetActor) — if config has target_actor

  startInterview(
    session: any,
    scenario: any,
    cloneSession: (s: any) => any,
  ): any {
    const next = cloneSession(session);
    const phase = scenario.phases[next.currentPhaseIndex];
    if (!phase?.entry_events) return next;

    const phId = phase.phase_id || `phase_${next.currentPhaseIndex}`;
    for (const ev of phase.entry_events) {
      const evKey = `${phId}__${ev.event_id}`;
      if (next.injectedPhaseEntryEvents.includes(evKey)) continue;
      // Schedule as timed event (candidate hello, etc.)
      next.injectedPhaseEntryEvents.push(evKey);
      next.pendingTimedEvents.push({
        fireAt: new Date(Date.now() + (ev.delay_ms || 0)).toISOString(),
        actor: ev.actor,
        content: ev.content,
        channel: ev.channel || "chat",
        eventId: ev.event_id,
        attachments: ev.attachments,
      });
    }
    return next;
  },

  // ── Intro injection (delay_ms=0 only) ──────────────────────────
  // For manual_start phases on initial load or auto-advance:
  // inject briefing actor's transition message but NOT the candidate's hello.
  // Mutates session in place (caller already cloned).

  injectIntroEventsOnly(
    session: any,
    addAIMessage: (sess: any, content: string, actor: string) => void,
  ): void {
    const phase = session.scenario?.phases?.[session.currentPhaseIndex];
    if (!phase?.entry_events) return;

    const phId = phase.phase_id || `phase_${session.currentPhaseIndex}`;
    for (const ev of phase.entry_events) {
      const evKey = `${phId}__${ev.event_id}`;
      if (session.injectedPhaseEntryEvents.includes(evKey)) continue;
      if (ev.delay_ms === 0) {
        // Inject immediately (briefing actor's transition message)
        session.injectedPhaseEntryEvents.push(evKey);
        addAIMessage(session, ev.content, ev.actor);
        if (ev.attachments) {
          const lastMsg = session.chatMessages[session.chatMessages.length - 1];
          if (lastMsg) lastMsg.attachments = ev.attachments;
        }
      }
      // Skip non-zero delay events — injected when player clicks "Faire entrer"
    }
  },
};
