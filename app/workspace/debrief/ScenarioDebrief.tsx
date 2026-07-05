"use client";

/**
 * ScenarioDebrief — LE bilan post-scénario, unifié, présenté au joueur.
 *
 * Le joueur voit UNE seule analyse d'un bloc : aucune mention de
 * mécanique/phase/outil. Sous le capot, on collecte les pré-analyses de
 * toute la session (collect.ts) et une passe IA (/api/v2/debrief-final)
 * rédige le bilan + note les compétences (graphe araignée).
 *
 * Persistance : le bilan est SAUVEGARDÉ (gameHistory) pour être rouvert à
 * tout moment depuis l'espace personnel. S'il existe déjà pour ce
 * scénario, on le recharge tel quel (pas de nouvel appel IA).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { LoggedAction, ScenarioV3, WorkspaceState } from "@/app/lib/engine/workspace";
import { collectDebrief } from "@/app/lib/debrief/collect";
import { getLatestForScenario, saveGameRecord } from "@/app/lib/gameHistory";
import { DebriefView, type FinalDebrief } from "./DebriefView";

function endingFromScore(avg: number): "success" | "partial_success" | "failure" {
  return avg >= 70 ? "success" : avg >= 45 ? "partial_success" : "failure";
}

export function ScenarioDebrief({
  scenario,
  workspace,
  actionLog,
  playerName = "",
}: {
  scenario: ScenarioV3;
  workspace: WorkspaceState;
  actionLog: LoggedAction[];
  playerName?: string;
}) {
  const bundle = useMemo(() => collectDebrief(scenario, workspace, actionLog), [scenario, workspace, actionLog]);
  const hasData = Object.keys(bundle.signals).length > 0;

  // Déjà généré pour ce scénario → réouverture instantanée, sans IA
  // (lu à l'initialisation pour éviter un setState dans l'effet).
  const [debrief, setDebrief] = useState<FinalDebrief | null>(() => {
    if (typeof window === "undefined" || !hasData) return null;
    return (getLatestForScenario(scenario.scenario_id)?.debrief as FinalDebrief) ?? null;
  });
  const [phase, setPhase] = useState<"idle" | "loading" | "error">("idle");
  const started = useRef(false);

  /** Persistance SERVEUR (par utilisateur, durable, visible côté coach/
   *  admin). Fire-and-forget, ne bloque jamais l'affichage. N'a lieu que
   *  si l'utilisateur a une session (Bearer) ; sinon on garde le
   *  localStorage comme filet pour les joueurs anonymes. */
  const persistServer = (d: FinalDebrief, avg: number) => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("auth_token");
    if (!token) return;
    const totalPhases = scenario.sequence?.length ?? 1;
    const startedAt = workspace.scenarioStartedAt ?? 0;
    const durationMin = startedAt > 0 ? Math.max(0, Math.round((Date.now() - startedAt) / 60000)) : 0;
    const orgId = localStorage.getItem("active_org_id") || undefined;
    void fetch("/api/profile/save-game", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        scenarioId: scenario.scenario_id,
        scenarioTitle: scenario.meta?.title ?? scenario.scenario_id,
        playerName: playerName || localStorage.getItem("player_name") || "",
        ending: endingFromScore(avg),
        avgScore: avg,
        durationMin,
        phasesCompleted: totalPhases,
        totalPhases,
        debrief: d,
        organizationId: orgId,
      }),
    }).catch(() => {
      /* réseau/serveur indisponible — le localStorage reste le filet */
    });
  };

  const persist = (d: FinalDebrief) => {
    const avg = d.competencies.length > 0 ? Math.round(d.competencies.reduce((s, c) => s + c.score, 0) / d.competencies.length) : 0;
    try {
      saveGameRecord({
        scenarioId: scenario.scenario_id,
        scenarioTitle: scenario.meta?.title ?? scenario.scenario_id,
        playerName: playerName || (typeof window !== "undefined" ? localStorage.getItem("player_name") || "" : ""),
        ending: endingFromScore(avg),
        avgScore: avg,
        debrief: d,
      });
    } catch {
      /* stockage local indisponible — le bilan reste affiché */
    }
    persistServer(d, avg);
  };

  const run = async () => {
    setPhase("loading");
    try {
      const res = await fetch("/api/v2/debrief-final", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bundle),
      });
      if (!res.ok) throw new Error("ai");
      const d = (await res.json()) as FinalDebrief;
      setDebrief(d);
      persist(d);
      setPhase("idle");
    } catch {
      setPhase("error");
    }
  };

  useEffect(() => {
    if (!hasData || debrief || started.current) return;
    started.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasData]);

  if (!hasData) {
    return (
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
        Pas assez d&apos;éléments pour établir un bilan détaillé sur cette mission.
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm sm:p-7">
      <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-400">Votre bilan</p>
      <h2 className="mt-1 text-lg font-semibold text-gray-900">Analyse de votre performance</h2>

      {phase === "loading" && !debrief && (
        <div className="flex items-center gap-3 py-10 text-sm text-gray-500">
          <span className="inline-flex gap-1">
            <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400 [animation-delay:-0.3s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400 [animation-delay:-0.15s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400" />
          </span>
          Analyse de votre performance en cours…
        </div>
      )}

      {phase === "error" && !debrief && (
        <div className="py-8 text-center">
          <p className="mb-3 text-sm text-gray-500">Le bilan n&apos;a pas pu être généré.</p>
          <button type="button" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700" onClick={() => void run()}>
            Réessayer
          </button>
        </div>
      )}

      {debrief && (
        <div className="mt-4">
          <DebriefView debrief={debrief} />
        </div>
      )}
    </div>
  );
}
