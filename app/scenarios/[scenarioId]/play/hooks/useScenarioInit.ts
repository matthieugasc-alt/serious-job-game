/**
 * useScenarioInit — owns the scenario boot sequence.
 *
 * Replaces the 240-line useEffect that used to live inline at the top of
 * page.tsx. Same execution order, same side effects, same external
 * surface — only the location changed.
 *
 * Responsibilities (in order)
 * ───────────────────────────
 *   1. Auth guard (validates token, redirects to /login if stale).
 *   2. Fetch the scenario JSON.
 *   3. Founder lock guard + active campaign discovery.
 *   4. initializeSession() and S3→S4 establishment carry-over.
 *   5. Initial mail draft setup for phase 0.
 *   6. Founder checkpoint resume (fast-forward, banner).
 *   7. Phase entry events injection (interview vs other).
 *   8. setSession + setLoading(false).
 *   9. Passive logging: session_started + phase_started.
 *  10. Auto-select first AI actor.
 *  11. Parallel fetch of every AI actor's roleplay prompt.
 *
 * Why a hook and not a pure function: the boot sequence calls several
 * React setters and depends on refs created by the page component. A
 * hook is the cleanest way to keep React invariants intact.
 */

import { useEffect } from "react";
import type { NextRouter } from "next/router";
import {
  initializeSession,
  injectPhaseEntryEvents,
  updateMailDraft,
} from "@/app/lib/runtime";
import type { ScenarioDefinition } from "@/app/lib/types";
import { InterviewHandler } from "../handlers";
import {
  fireSessionStarted,
  firePhaseStarted,
} from "@/app/lib/gameEvents/client";

type ResumeBanner = { penaltyMonths: number; phaseIndex: number };

export type UseScenarioInitDeps = {
  scenarioId: string;
  router: { push: (url: string) => void; replace: (url: string) => void } | NextRouter;
  /** Mutable refs owned by page.tsx. */
  authTokenRef: { current: string | null };
  gameSessionIdRef: { current: string };
  aiPromptsMapRef: { current: Record<string, string> };
  aiPromptRef: { current: string };
  checkpointDoneRef: { current: boolean };
  /** State setters. */
  setScenario: (s: ScenarioDefinition) => void;
  setSession: (s: any) => void;
  setLoading: (b: boolean) => void;
  setError: (msg: string | null) => void;
  setSelectedContact: (id: string | null) => void;
  setInterviewStarted: (b: boolean) => void;
  setResumeBanner: (b: ResumeBanner | null) => void;
  /** Helpers owned by the page. */
  apiHeaders: (extra?: Record<string, string>) => Record<string, string>;
  injectIntroEventsOnly: (sess: any) => void;
};

export function useScenarioInit(deps: UseScenarioInitDeps): void {
  const {
    scenarioId,
    router,
    authTokenRef,
    gameSessionIdRef,
    aiPromptsMapRef,
    aiPromptRef,
    checkpointDoneRef,
    setScenario,
    setSession,
    setLoading,
    setError,
    setSelectedContact,
    setInterviewStarted,
    setResumeBanner,
    apiHeaders,
    injectIntroEventsOnly,
  } = deps;

  useEffect(() => {
    async function init() {
      try {
        // ── Auth guard: un compte est requis pour jouer ──
        const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
        if (!token) {
          router.push("/login?redirect=" + encodeURIComponent(window.location.pathname));
          return;
        }

        // Validate the token is still valid server-side BEFORE starting the game.
        // This prevents the "dead chat" bug where a player has a stale token in
        // localStorage (from a previous session) and every API call fails silently.
        try {
          const authCheck = await fetch("/api/auth/session", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!authCheck.ok) {
            // Token is expired or invalid — force re-login
            localStorage.removeItem("auth_token");
            localStorage.removeItem("user_name");
            localStorage.removeItem("user_role");
            router.push("/login?redirect=" + encodeURIComponent(window.location.pathname));
            return;
          }
        } catch {
          // Network error — continue anyway, the retry logic in sendMessage will handle it
        }

        // Refresh the auth ref in case it was stale
        authTokenRef.current = token;

        const res = await fetch(`/api/scenarios/${scenarioId}`);
        if (!res.ok) throw new Error("Impossible de charger le scénario");
        const data: ScenarioDefinition = await res.json();

        // ── Founder lock guard (classic mode) ──
        const isFounderMeta = ((data.meta as any)?.job_family || "") === "founder";
        let activeCampaign: any = null;
        if (isFounderMeta) {
          try {
            const fRes = await fetch("/api/founder/campaigns", {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (fRes.ok) {
              const fData = await fRes.json();
              const campaigns = fData.campaigns || (fData.campaign ? [fData.campaign] : []);
              activeCampaign = campaigns.find((c: any) => c.status !== "completed");
              const hasActiveCampaign = !!activeCampaign;
              const hasCompletedScenario = campaigns.some((c: any) =>
                (c.completedScenarios || []).some((cs: any) => cs.scenarioId === scenarioId)
              );
              if (activeCampaign?.id) {
                localStorage.setItem("founder_campaign_id", activeCampaign.id);
              }
              if (!hasActiveCampaign && !hasCompletedScenario) {
                router.replace("/?locked=founder");
                return;
              }
            }
          } catch {
            // Non-blocking: allow play if check fails
          }
        }

        setScenario(data);

        const s = initializeSession(data);

        // ── Scenario 4: Import establishment choice from Scenario 3 outcome ──
        if (scenarioId?.startsWith("founder_04") && activeCampaign) {
          const s3Completion = (activeCampaign.completedScenarios || []).find(
            (cs: any) => cs.scenarioId === "founder_03_clinical"
          );
          if (s3Completion?.outcomeId) {
            if (s3Completion.outcomeId === "pilot_toxic") {
              s.flags.chose_chu = true; s.flags.chose_saint_martin = false; s.flags.chose_clinique = false;
            } else if (s3Completion.outcomeId === "pilot_slow") {
              s.flags.chose_saint_martin = true; s.flags.chose_chu = false; s.flags.chose_clinique = false;
            } else {
              s.flags.chose_clinique = true; s.flags.chose_chu = false; s.flags.chose_saint_martin = false;
            }
          }
        }

        const p1 = data.phases[0];
        if (p1?.mail_config?.defaults) {
          updateMailDraft(s, p1.phase_id, {
            to: "",
            cc: "",
            subject: p1.mail_config.defaults.subject || "",
            body: "",
            attachments: [],
          });
        }

        // ── Founder anti-rollback: check for resume ──
        if (scenarioId.startsWith("founder_") && !checkpointDoneRef.current) {
          checkpointDoneRef.current = true;
          try {
            const cpRes = await fetch("/api/founder/checkpoint", {
              method: "POST",
              headers: apiHeaders(),
              body: JSON.stringify({ scenarioId, action: "enter" }),
            });
            if (cpRes.ok) {
              const cpData = await cpRes.json();

              if (cpData.resetCampaign) {
                router.replace("/founder/intro");
                return;
              }

              if (cpData.isResume && cpData.resumePhaseIndex > 0) {
                for (let i = 0; i < cpData.resumePhaseIndex; i++) {
                  const ph = data.phases[i];
                  const phId = ph?.phase_id || (ph as any)?.id;
                  if (phId && !s.completedPhases.includes(phId)) {
                    s.completedPhases.push(phId);
                  }
                }
                s.currentPhaseIndex = cpData.resumePhaseIndex;
                injectPhaseEntryEvents(s);
                const resumePhase = data.phases[cpData.resumePhaseIndex];
                if (resumePhase?.mail_config?.defaults) {
                  updateMailDraft(s, resumePhase.phase_id, {
                    to: "",
                    cc: "",
                    subject: resumePhase.mail_config.defaults.subject || "",
                    body: "",
                    attachments: [],
                  });
                }
              }
              if (cpData.penaltyApplied) {
                setResumeBanner({
                  penaltyMonths: cpData.penaltyMonths,
                  phaseIndex: cpData.resumePhaseIndex,
                });
              }
            }
          } catch (e) {
            console.warn("[founder] checkpoint check failed:", e);
          }
        }

        // ── Inject entry_events for the active phase (critical for phase 0!) ──
        const activePhaseData = data.phases[s.currentPhaseIndex || 0];
        if (InterviewHandler.matches(activePhaseData)) {
          injectIntroEventsOnly(s);
          setInterviewStarted(false);
        } else {
          injectPhaseEntryEvents(s);
        }

        setSession(s);
        setLoading(false);

        // ── Passive logging: session_started + initial phase_started ──
        try {
          const t = authTokenRef.current || "";
          const gSid = gameSessionIdRef.current;
          const pName = (typeof window !== "undefined" ? localStorage.getItem("user_name") : null) || "";
          const campId = activeCampaign?.id || null;
          fireSessionStarted(t, gSid, scenarioId, pName, !!isFounderMeta, campId);
          const p0 = data.phases[s.currentPhaseIndex || 0];
          firePhaseStarted(
            t,
            gSid,
            scenarioId,
            p0?.phase_id || "phase_0",
            s.currentPhaseIndex || 0,
            p0?.title || "",
            (p0 as any)?.modules || [],
          );
        } catch { /* never break the game */ }

        // Auto-select the first AI actor of the active phase
        const initBriefing = InterviewHandler.getBriefingActor(activePhaseData);
        const activePhaseActor = initBriefing || activePhaseData?.ai_actors?.[0];
        if (activePhaseActor) setSelectedContact(activePhaseActor);

        // Load ALL AI actor prompts
        const aiActors = data.actors.filter((a: any) => a.controlled_by === "ai" && a.prompt_file);
        const promptMap: Record<string, string> = {};
        await Promise.all(
          aiActors.map(async (actor: any) => {
            try {
              const pr = await fetch(`/api/scenarios/${scenarioId}/prompts/${actor.actor_id}`);
              if (pr.ok) {
                const pd = await pr.json();
                promptMap[actor.actor_id] = pd.prompt || "";
              }
            } catch {}
          })
        );
        aiPromptsMapRef.current = promptMap;
        const firstPhaseActor = data.phases[0]?.ai_actors?.[0];
        if (firstPhaseActor && promptMap[firstPhaseActor]) {
          aiPromptRef.current = promptMap[firstPhaseActor];
        } else {
          const firstAI = aiActors[0];
          if (firstAI) aiPromptRef.current = promptMap[firstAI.actor_id] || "";
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
        setLoading(false);
      }
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioId]);
}
