"use client";

/**
 * Shell — le player générique v2.
 *
 * Il ne connaît AUCUNE mécanique, AUCUN scénario, AUCUN contenu.
 * Responsabilités (et rien d'autre) :
 *   1. charger le scénario v2 + valider contre les manifests
 *   2. initialiser ou reprendre la session (deep-save localStorage + API)
 *   3. boucler sur la séquence : résoudre la mécanique, la monter,
 *      appliquer son résultat au moteur (le moteur décide), avancer
 *   4. afficher briefing, transitions, échec/retry, et l'ending
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  MechanicResult,
  ScenarioV2,
} from "@/app/lib/engine/mechanics";
import {
  initializeSessionV2,
  cloneSessionV2,
  getCurrentStep,
  completeCurrentStep,
  serializeSessionV2,
  restoreSessionV2,
  type SessionV2State,
} from "@/app/lib/engine/sessionV2";
import { validateScenarioV2 } from "@/app/lib/engine/composer";
import { MECHANIC_MODULES, MECHANIC_MANIFESTS } from "@/app/mechanics";
import { MechanicRunner } from "./MechanicRunner";
import { TransitionOverlay } from "./TransitionOverlay";
import { StepChrome } from "./StepChrome";
import { ActorAvatar, PrimaryButton } from "./primitives/ui";
import { createLiveIO } from "./liveIO";
import { useNavigationGuard } from "./useNavigationGuard";

interface Props {
  scenario: ScenarioV2;
  /** Clé de persistence (par défaut scenario_id) — le founder passe campaignId::scenarioId. */
  saveKey?: string;
  /** Callback de fin (le founder y accroche apply-outcome). */
  onFinished?: (session: SessionV2State) => void;
}

type Banner =
  | { kind: "transition"; title: string }
  | { kind: "retry"; reason: string }
  | null;

/** Libellés/couleurs de difficulté — purement affichage. */
const DIFFICULTY_DISPLAY: Record<string, { label: string; cls: string }> = {
  junior: { label: "Débutant", cls: "bg-sky-50 text-sky-700" },
  debutant: { label: "Débutant", cls: "bg-sky-50 text-sky-700" },
  intermediate: { label: "Intermédiaire", cls: "bg-amber-50 text-amber-700" },
  intermediaire: { label: "Intermédiaire", cls: "bg-amber-50 text-amber-700" },
  senior: { label: "Avancé", cls: "bg-red-50 text-red-700" },
  avance: { label: "Avancé", cls: "bg-red-50 text-red-700" },
  expert: { label: "Expert", cls: "bg-violet-50 text-violet-700" },
};

export function Shell({ scenario, saveKey, onFinished }: Props) {
  const storageKey = `revealio_v2_${saveKey ?? scenario.scenario_id}`;

  const issues = useMemo(
    () => validateScenarioV2(scenario, MECHANIC_MANIFESTS),
    [scenario],
  );

  const [session, setSession] = useState<SessionV2State | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  /** true : session restaurée d'un deep-save (bandeau reprise, pas de briefing). */
  const [resumed, setResumed] = useState(false);
  /** Écran de présentation du scénario avant le premier step (session neuve). */
  const [briefingDone, setBriefingDone] = useState(false);

  // Retour arrière / refresh accidentels : garde tant que la partie est en cours.
  useNavigationGuard(session !== null && !session.isFinished && briefingDone);

  // Boot : reprise deep-save ou session neuve.
  useEffect(() => {
    if (issues.length > 0) return;
    let restored: SessionV2State | null = null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) restored = restoreSessionV2(raw);
    } catch {
      restored = null;
    }
    setResumed(restored !== null);
    setBriefingDone(restored !== null);
    setSession(restored ?? initializeSessionV2(scenario));
  }, [scenario, storageKey, issues.length]);

  const persist = useCallback(
    (s: SessionV2State) => {
      try {
        window.localStorage.setItem(storageKey, serializeSessionV2(s));
      } catch {
        /* stockage indisponible : la partie continue sans deep-save */
      }
    },
    [storageKey],
  );

  const step = session ? getCurrentStep(session) : null;

  const io = useMemo(() => {
    if (!session || !step) return null;
    return createLiveIO({
      session,
      stepId: step.step_id,
      onMutate: () => {
        setSession((cur) => (cur ? { ...cur } : cur));
        persist(session);
      },
    });
  }, [session, step?.step_id, persist]);

  const handleComplete = useCallback(
    (result: MechanicResult) => {
      if (!session) return;
      const next = cloneSessionV2(session);
      const action = completeCurrentStep(next, result.observation, result.output);
      persist(next);
      setSession(next);

      if (action === "retry") {
        const last = next.evaluationHistory[next.evaluationHistory.length - 1];
        setBanner({ kind: "retry", reason: last?.reason ?? "Step non validé." });
      } else if (action === "advanced") {
        const upcoming = getCurrentStep(next);
        setBanner({
          kind: "transition",
          title: upcoming?.title ?? upcoming?.step_id ?? "",
        });
      } else if (action === "ended") {
        try {
          window.localStorage.removeItem(storageKey);
        } catch {
          /* noop */
        }
        onFinished?.(next);
      }
    },
    [session, persist, storageKey, onFinished],
  );

  // ── Rendus d'état ──
  if (issues.length > 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-2xl rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
          <h1 className="text-lg font-semibold text-red-700">Scénario invalide</h1>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-gray-700">
            {issues.map((i, n) => (
              <li key={n}>
                [{i.code}
                {i.stepId ? ` · ${i.stepId}` : ""}] {i.message}
              </li>
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
      <div className="flex min-h-[80vh] items-center justify-center bg-gray-50 px-4 py-10">
        <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm sm:p-10">
          <div
            aria-hidden
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50 text-2xl"
          >
            🏁
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600">
            Fin du scénario
          </p>
          <h1 className="mt-2 text-xl font-semibold text-gray-900">
            {session.ending?.label ?? "Terminé"}
          </h1>
          <p className="mx-auto mt-4 max-w-prose whitespace-pre-wrap text-left text-sm leading-relaxed text-gray-700">
            {session.ending?.content}
          </p>
        </div>
      </div>
    );
  }

  if (!step) return null;

  // ── Briefing : présentation du scénario avant le premier step ──
  if (!briefingDone) {
    const difficulty = scenario.meta.difficulty
      ? DIFFICULTY_DISPLAY[scenario.meta.difficulty.toLowerCase()] ?? {
          label: scenario.meta.difficulty,
          cls: "bg-gray-100 text-gray-700",
        }
      : null;
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
        <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-indigo-100 bg-indigo-50/60 px-8 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600">
              Scénario
            </p>
            <h1 className="mt-1 text-2xl font-bold text-gray-900">
              {scenario.meta.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {difficulty && (
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${difficulty.cls}`}
                >
                  {difficulty.label}
                </span>
              )}
              {typeof scenario.meta.estimated_minutes === "number" && (
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                  ⏱ ~{scenario.meta.estimated_minutes} min
                </span>
              )}
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                {scenario.sequence.length} étape
                {scenario.sequence.length > 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <div className="space-y-6 px-8 py-6">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
              {scenario.meta.description}
            </p>
            {scenario.actors.length > 0 && (
              <div>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Vos interlocuteurs
                </p>
                <ul className="space-y-3">
                  {scenario.actors.map((a) => (
                    <li key={a.actor_id} className="flex items-center gap-3">
                      <ActorAvatar actorId={a.actor_id} name={a.name} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {a.name}
                        </p>
                        <p className="truncate text-xs text-gray-500">{a.role}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <PrimaryButton
              className="w-full !py-3 !text-base"
              onClick={() => setBriefingDone(true)}
            >
              Commencer
            </PrimaryButton>
          </div>
        </div>
      </div>
    );
  }

  const module = MECHANIC_MODULES[step.mechanic];
  if (!module || !io) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
        <p className="text-sm text-gray-600">
          Mécanique « {step.mechanic} » absente du registre client.
        </p>
      </div>
    );
  }

  return (
    <>
      {banner && (
        <TransitionOverlay banner={banner} onDismiss={() => setBanner(null)} />
      )}
      <StepChrome
        scenarioTitle={scenario.meta.title}
        stepTitle={step.title ?? step.step_id}
        stepIndex={session.currentStepIndex}
        stepCount={scenario.sequence.length}
        timeLimitS={step.time_limit_s}
        resumed={resumed}
      >
        <MechanicRunner
          key={`${step.step_id}_${session.stepResults[step.step_id]?.attempts ?? 0}`}
          module={module}
          scenario={scenario}
          session={session}
          step={step}
          io={io}
          onComplete={handleComplete}
        />
      </StepChrome>
    </>
  );
}
