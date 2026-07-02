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
 *   4. afficher transitions, échec/retry, et l'ending
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
import { createLiveIO } from "./liveIO";

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

export function Shell({ scenario, saveKey, onFinished }: Props) {
  const storageKey = `revealio_v2_${saveKey ?? scenario.scenario_id}`;

  const issues = useMemo(
    () => validateScenarioV2(scenario, MECHANIC_MANIFESTS),
    [scenario],
  );

  const [session, setSession] = useState<SessionV2State | null>(null);
  const [banner, setBanner] = useState<Banner>(null);

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
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="text-lg font-semibold">Scénario invalide</h1>
        <ul className="mt-4 list-disc pl-5 text-sm">
          {issues.map((i, n) => (
            <li key={n}>
              [{i.code}
              {i.stepId ? ` · ${i.stepId}` : ""}] {i.message}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (!session) return <div className="p-8 text-center opacity-60">Chargement…</div>;

  if (session.isFinished) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center">
        <h1 className="text-xl font-semibold">{session.ending?.label ?? "Terminé"}</h1>
        <p className="mt-4 whitespace-pre-wrap text-sm">{session.ending?.content}</p>
      </div>
    );
  }

  if (!step) return null;

  const module = MECHANIC_MODULES[step.mechanic];
  if (!module || !io) {
    return (
      <div className="p-8 text-center text-sm">
        Mécanique « {step.mechanic} » absente du registre client.
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {banner && (
        <TransitionOverlay banner={banner} onDismiss={() => setBanner(null)} />
      )}
      <MechanicRunner
        key={`${step.step_id}_${session.stepResults[step.step_id]?.attempts ?? 0}`}
        module={module}
        scenario={scenario}
        session={session}
        step={step}
        io={io}
        onComplete={handleComplete}
      />
    </div>
  );
}
