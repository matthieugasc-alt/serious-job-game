"use client";

/**
 * WorkspacePlayer — le player v3 (orchestrateur client, mince).
 *
 * Responsabilités (et rien d'autre) :
 *   1. valider le scénario v3 (composerV3) contre specs headless + tools
 *   2. init/reprise de session (deep-save localStorage, clé campagne)
 *   3. briefing simple puis WorkspaceShell
 *   4. dispatch = applyWorkspaceAction sur un clone + exécution des
 *      PendingEffects par l'orchestrateur (I/O IA) + persistance
 *   5. clock_tick toutes les 5 s si le step a des triggers/events temporels
 *   6. fin → POST /api/v2/complete (+ microDebrief en campagne founder)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ScenarioV3, ToolOpApplier, WorkspaceAction } from "@/app/lib/engine/workspace";
import {
  cloneSessionV3,
  initializeSessionV3,
  getCurrentStepV3,
  restoreSessionV3,
  serializeSessionV3,
  type SessionV3State,
} from "@/app/lib/engine/sessionV3";
import { applyWorkspaceAction, enterStep } from "@/app/lib/engine/workspaceReducer";
import { validateScenarioV3 } from "@/app/lib/engine/composerV3";
import {
  collectTimerTriggers,
  completionTriggerList,
  triggerMentions,
} from "@/app/lib/engine/triggers";
import { MECHANIC_SPECS, MECHANIC_SPEC_MANIFESTS } from "@/app/mechanics/specs";
import { ActorAvatar, PrimaryButton } from "@/app/workspace/primitives/ui";
import { WorkspaceShell } from "./WorkspaceShell";
import { TOOL_REGISTRY } from "./apps/registry";
import { buildCompletionPayload, runPendingEffects } from "./orchestrator";
import { useNavigationGuard, requestScenarioExit } from "@/app/workspace/useNavigationGuard";

interface Props {
  scenario: ScenarioV3;
  campaignId?: string;
}

interface MicroDebrief {
  decision: string;
  impact: string;
  strength: string;
  risk: string;
  advice?: string;
}

function parseMicroDebrief(value: unknown): MicroDebrief | null {
  if (!value || typeof value !== "object") return null;
  const d = value as Record<string, unknown>;
  if (
    typeof d.decision !== "string" || typeof d.impact !== "string" ||
    typeof d.strength !== "string" || typeof d.risk !== "string"
  ) return null;
  return { decision: d.decision, impact: d.impact, strength: d.strength, risk: d.risk,
    advice: typeof d.advice === "string" ? d.advice : undefined };
}

/** Clé historique (héritée du player v2) : la home lit ce marqueur (déverrouillage). */
function markCompletedLocally(scenarioId: string): void {
  try {
    const raw = localStorage.getItem("v2_completed_scenarios");
    const ids: string[] = raw ? JSON.parse(raw) : [];
    if (!ids.includes(scenarioId)) {
      ids.push(scenarioId);
      localStorage.setItem("v2_completed_scenarios", JSON.stringify(ids));
    }
  } catch { /* non bloquant */ }
}

// Reducers PURS des Tools (tool_op) : câblés depuis le TOOL_REGISTRY et
// injectés au moteur via ReducerOptions.toolAppliers — le reducer moteur
// reste pur/testable et 100 % ignorant des ops (TOOL_BLOC_NOTES.md §2).
const TOOL_APPLIERS: Record<string, ToolOpApplier> = Object.fromEntries(
  Object.values(TOOL_REGISTRY)
    .filter((t) => typeof t.applyOp === "function")
    .map((t) => [t.id, t.applyOp as ToolOpApplier]),
);

const OPTS = { specs: MECHANIC_SPECS, toolAppliers: TOOL_APPLIERS };
const CLOCK_MS = 5_000;

export function WorkspacePlayer({ scenario, campaignId }: Props) {
  const storageKey = `revealio_v3_${campaignId ? `${campaignId}::${scenario.scenario_id}` : scenario.scenario_id}`;
  const issues = useMemo(
    () => validateScenarioV3(scenario, MECHANIC_SPEC_MANIFESTS, Object.keys(TOOL_REGISTRY)),
    [scenario],
  );

  const sessionRef = useRef<SessionV3State | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const finishedRef = useRef(false);
  const [session, setSession] = useState<SessionV3State | null>(null);
  const [briefingDone, setBriefingDone] = useState(false);
  const [busyThreads, setBusyThreads] = useState<string[]>([]);
  const [microDebrief, setMicroDebrief] = useState<MicroDebrief | null>(null);
  const [savingOutcome, setSavingOutcome] = useState(false);

  // Retour arrière / refresh accidentels : garde tant que la partie est en cours.
  useNavigationGuard(session !== null && !session.isFinished && briefingDone);

  const persist = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    try { window.localStorage.setItem(storageKey, serializeSessionV3(s)); } catch { /* noop */ }
  }, [storageKey]);

  // Fin de partie : POST /api/v2/complete (campagne founder : microDebrief).
  const handleFinished = useCallback((s: SessionV3State) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    try { window.localStorage.removeItem(storageKey); } catch { /* noop */ }
    markCompletedLocally(scenario.scenario_id);
    const request = fetch("/api/v2/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildCompletionPayload(s, campaignId ?? null)),
      keepalive: true,
    });
    if (!campaignId) { void request.catch(() => { /* fire-and-forget */ }); return; }
    setSavingOutcome(true);
    void request
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data) setMicroDebrief(parseMicroDebrief(data.microDebrief)); })
      .catch(() => { /* non bloquant */ })
      .finally(() => setSavingOutcome(false));
  }, [campaignId, scenario.scenario_id, storageKey]);

  const refresh = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    setSession({ ...s });
    persist();
    if (s.isFinished) handleFinished(s);
  }, [persist, handleFinished]);

  const hooks = useMemo(
    () => ({
      onMutate: refresh,
      onThreadBusy: (threadId: string, busy: boolean) =>
        setBusyThreads((cur) =>
          busy ? [...new Set([...cur, threadId])] : cur.filter((t) => t !== threadId),
        ),
    }),
    [refresh],
  );

  /** Exécution séquentielle des lots d'effets (jamais deux en parallèle). */
  const schedule = useCallback(
    (effects: Parameters<typeof runPendingEffects>[1]) => {
      if (effects.length === 0) return;
      chainRef.current = chainRef.current
        .then(() => runPendingEffects(() => sessionRef.current, effects, hooks))
        .catch(() => { /* défensif : la chaîne ne casse jamais */ });
    },
    [hooks],
  );

  // Boot : reprise deep-save ou session neuve (briefing avant enterStep).
  useEffect(() => {
    if (issues.length > 0) return;
    let restored: SessionV3State | null = null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) restored = restoreSessionV3(raw);
    } catch { restored = null; }
    sessionRef.current = restored ?? initializeSessionV3(scenario);
    setBriefingDone(restored !== null);
    setSession({ ...sessionRef.current });
  }, [scenario, storageKey, issues.length]);

  const start = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    setBriefingDone(true);
    const entered = enterStep(s, OPTS);
    refresh();
    schedule(entered.effects);
  }, [refresh, schedule]);

  // dispatch : clone → applyWorkspaceAction → persistance → effets.
  const dispatch = useCallback(
    (action: WorkspaceAction) => {
      const cur = sessionRef.current;
      if (!cur || cur.isFinished) return;
      const next = cloneSessionV3(cur);
      const result = applyWorkspaceAction(next, action, OPTS);
      sessionRef.current = next;
      refresh();
      schedule(result.effects);
    },
    [refresh, schedule],
  );

  // Horloge : clock_tick toutes les 5 s si le step est temporel
  // (events delay OU timer_elapsed dans le trigger / les exits).
  const step = session ? getCurrentStepV3(session) : null;
  const stepTriggers = step ? completionTriggerList(step.completion) : [];
  const stepIsTemporal =
    !!step &&
    ((step.events ?? []).some((e) => e.when.type === "delay") ||
      stepTriggers.some((t) => triggerMentions(t, ["timer_elapsed"])));

  // Chantier D : échéance du chrono visible (premier timer_elapsed à
  // expirer). Le shell reste bête : il reçoit une échéance (ms epoch),
  // dérivée de stepStartedAt / scenarioStartedAt.
  const timers = collectTimerTriggers(stepTriggers);
  const timerDeadline =
    session && timers.length > 0
      ? Math.min(
          ...timers.map(
            (t) =>
              (t.from === "scenario_start"
                ? session.workspace.scenarioStartedAt
                : session.workspace.stepStartedAt) +
              t.seconds * 1000,
          ),
        )
      : undefined;
  useEffect(() => {
    if (!stepIsTemporal || session?.isFinished) return;
    const id = window.setInterval(
      () => dispatch({ type: "clock_tick", now: Date.now() }),
      CLOCK_MS,
    );
    return () => window.clearInterval(id);
  }, [stepIsTemporal, session?.isFinished, dispatch]);

  // ── Rendus d'état ──
  if (issues.length > 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-2xl rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
          <h1 className="text-lg font-semibold text-red-700">Scénario invalide</h1>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-gray-700">
            {issues.map((i, n) => (
              <li key={n}>[{i.code}{i.stepId ? ` · ${i.stepId}` : ""}] {i.message}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">Chargement…</p>
      </div>
    );
  }

  if (session.isFinished) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
        <div className="w-full max-w-2xl">
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm sm:p-10">
            <div aria-hidden className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50 text-2xl">🏁</div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600">Fin du scénario</p>
            <h1 className="mt-2 text-xl font-semibold text-gray-900">{session.ending?.label ?? "Terminé"}</h1>
            <p className="mx-auto mt-4 max-w-prose whitespace-pre-wrap text-left text-sm leading-relaxed text-gray-700">
              {session.ending?.content}
            </p>
          </div>
          {savingOutcome && (
            <p className="mt-6 text-center text-sm text-gray-500">Application des résultats à ta startup…</p>
          )}
          {microDebrief && (
            <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 text-left text-sm leading-relaxed shadow-sm">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-400">Debrief fondateur</p>
              <p className="mb-2"><span className="font-semibold">Décision — </span>{microDebrief.decision}</p>
              <p className="mb-2"><span className="font-semibold">Impact — </span>{microDebrief.impact}</p>
              <p className="mb-2"><span className="font-semibold">Point fort — </span>{microDebrief.strength}</p>
              <p className="mb-2"><span className="font-semibold">Risque — </span>{microDebrief.risk}</p>
              {microDebrief.advice && (
                <p className="text-gray-600"><span className="font-semibold">Conseil — </span>{microDebrief.advice}</p>
              )}
            </div>
          )}
          {!savingOutcome && (
            <div className="mt-6 text-center">
              <Link
                href={campaignId ? `/founder/${campaignId}` : "/"}
                className="inline-block rounded-lg border border-gray-300 px-6 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
              >
                {campaignId ? "Retour au tableau de bord" : "Retour à l'accueil"}
              </Link>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Briefing (session neuve) ──
  if (!briefingDone || !step) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
        <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-indigo-100 bg-indigo-50/60 px-8 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600">Scénario</p>
            <h1 className="mt-1 text-2xl font-bold text-gray-900">{scenario.meta.title}</h1>
            {typeof scenario.meta.estimated_minutes === "number" && (
              <span className="mt-3 inline-block rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                ⏱ ~{scenario.meta.estimated_minutes} min
              </span>
            )}
          </div>
          <div className="space-y-6 px-8 py-6">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{scenario.meta.description}</p>
            <div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Vos interlocuteurs</p>
              <ul className="space-y-3">
                {scenario.actors.map((a) => (
                  <li key={a.actor_id} className="flex items-center gap-3">
                    <ActorAvatar actorId={a.actor_id} name={a.name} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">{a.name}</p>
                      <p className="truncate text-xs text-gray-500">{a.role}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <PrimaryButton className="w-full !py-3 !text-base" onClick={start}>
              Ouvrir mon poste de travail
            </PrimaryButton>
          </div>
        </div>
      </div>
    );
  }

  // Tools du step + default_tools de sa mécanique (sans doublon).
  const declared = step.tools ?? [];
  const defaults = (MECHANIC_SPECS[step.mechanic]?.manifest.default_tools ?? [])
    .filter((t) => !declared.some((d) => d.tool === t))
    .map((t) => ({ tool: t }));

  return (
    <div className="h-screen">
      <WorkspaceShell
        workspace={session.workspace}
        actors={scenario.actors}
        documents={scenario.documents}
        activeTools={[...declared, ...defaults]}
        missionTitle={scenario.meta.title}
        objective={step.title}
        timerDeadline={timerDeadline}
        busyThreads={busyThreads}
        onQuit={() => requestScenarioExit(campaignId ? `/founder/${campaignId}` : "/")}
        dispatch={dispatch}
      />
    </div>
  );
}
