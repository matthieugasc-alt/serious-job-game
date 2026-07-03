"use client";

/**
 * PlayerClient — monte le Shell générique v2 pour un scénario donné.
 *
 * Ne connaît aucune mécanique : il branche uniquement la persistence
 * de fin de partie (POST /api/v2/complete) et l'écran post-ending.
 *
 * Sans campagne : POST fire-and-forget + bouton "Retour à l'accueil".
 * Avec campagne founder : le POST est attendu — la réponse contient
 * { microDebrief, campaign } (outcome économique appliqué côté serveur)
 * qu'on affiche avant le retour au tableau de bord.
 */

import { useCallback, useState } from "react";
import Link from "next/link";
import type { ScenarioV2 } from "@/app/lib/engine/mechanics";
import type { SessionV2State } from "@/app/lib/engine/sessionV2";
import { Shell } from "@/app/player/Shell";

interface Props {
  scenario: ScenarioV2;
  campaignId?: string;
}

/** Copie locale de FounderMicroDebrief — ne pas importer app/lib/founder
 *  (module node:fs) dans un client component. */
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
    typeof d.decision !== "string" ||
    typeof d.impact !== "string" ||
    typeof d.strength !== "string" ||
    typeof d.risk !== "string"
  ) {
    return null;
  }
  return {
    decision: d.decision,
    impact: d.impact,
    strength: d.strength,
    risk: d.risk,
    advice: typeof d.advice === "string" ? d.advice : undefined,
  };
}

/**
 * Complétions v2 côté navigateur — clé lue par la home (app/page.tsx) pour
 * le déverrouillage progressif (prerequisites de scenario_config.json).
 * Le POST /api/v2/complete est anonyme (pas de Bearer token, cf.
 * TODO-DEBT(founder-auth)) : ce marqueur local est la seule source
 * par-joueur en attendant une session authentifiée du player v2.
 */
const V2_COMPLETED_KEY = "v2_completed_scenarios";

function markScenarioCompletedLocally(scenarioId: string): void {
  try {
    const raw = localStorage.getItem(V2_COMPLETED_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(ids)) throw new Error("corrupted");
    if (!ids.includes(scenarioId)) {
      ids.push(scenarioId);
      localStorage.setItem(V2_COMPLETED_KEY, JSON.stringify(ids));
    }
  } catch {
    // Stockage corrompu ou indisponible : on repart d'une liste saine.
    try {
      localStorage.setItem(V2_COMPLETED_KEY, JSON.stringify([scenarioId]));
    } catch {
      /* non bloquant */
    }
  }
}

export function PlayerClient({ scenario, campaignId }: Props) {
  const [finished, setFinished] = useState(false);
  const [microDebrief, setMicroDebrief] = useState<MicroDebrief | null>(null);
  const [savingOutcome, setSavingOutcome] = useState(false);

  const handleFinished = useCallback(
    (session: SessionV2State) => {
      setFinished(true);
      markScenarioCompletedLocally(scenario.scenario_id);

      const payload = {
        scenario_id: scenario.scenario_id,
        campaign_id: campaignId ?? null,
        ending_id: session.ending?.id ?? null,
        finished_at: new Date().toISOString(),
        duration_min: Math.max(
          0,
          Math.round((Date.now() - session.realStartTime) / 60000),
        ),
        step_results: Object.values(session.stepResults).map((r) => ({
          step_id: r.stepId,
          mechanic: r.mechanic,
          passed: r.passed,
          attempts: r.attempts,
          applied_rule: r.evaluation.appliedRule,
          matched: r.evaluation.matched,
          missing: r.evaluation.missing,
          critical_failures: r.evaluation.criticalFailures,
          bonus_matched: r.evaluation.bonusMatched,
          // Output brut de la mécanique — exploité côté serveur pour les
          // deltas founder dynamiques (ex : agreement de `negociation`).
          output: r.output,
        })),
      };

      const request = fetch("/api/v2/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      });

      if (!campaignId) {
        // Fire-and-forget : l'ending est déjà rendu par le Shell, un échec
        // du POST ne doit jamais bloquer le joueur.
        void request.catch(() => {
          /* fire-and-forget */
        });
        return;
      }

      // Campagne founder : la réponse contient le microDebrief interpolé
      // et la campagne mise à jour. Un échec n'est pas bloquant — le
      // joueur garde le bouton "Retour au tableau de bord".
      setSavingOutcome(true);
      void request
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setMicroDebrief(parseMicroDebrief(data.microDebrief));
        })
        .catch(() => {
          /* non bloquant */
        })
        .finally(() => setSavingOutcome(false));
    },
    [scenario.scenario_id, campaignId],
  );

  return (
    <div>
      <Shell
        scenario={scenario}
        saveKey={
          campaignId ? `${campaignId}::${scenario.scenario_id}` : undefined
        }
        onFinished={handleFinished}
      />
      {finished && !campaignId && (
        <div className="mx-auto max-w-2xl px-8 pb-12 text-center">
          <Link
            href="/"
            className="inline-block rounded-lg border border-current/20 px-6 py-2 text-sm font-medium transition-opacity hover:opacity-70"
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      )}
      {finished && campaignId && (
        <div className="mx-auto max-w-2xl px-8 pb-12">
          {savingOutcome && (
            <p className="text-center text-sm opacity-60">
              Application des résultats à ta startup…
            </p>
          )}
          {microDebrief && (
            <div className="mb-8 rounded-xl border border-current/15 p-6 text-left text-sm leading-relaxed">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest opacity-50">
                Debrief fondateur
              </p>
              <p className="mb-2">
                <span className="font-semibold">Décision — </span>
                {microDebrief.decision}
              </p>
              <p className="mb-2">
                <span className="font-semibold">Impact — </span>
                {microDebrief.impact}
              </p>
              <p className="mb-2">
                <span className="font-semibold">Point fort — </span>
                {microDebrief.strength}
              </p>
              <p className="mb-2">
                <span className="font-semibold">Risque — </span>
                {microDebrief.risk}
              </p>
              {microDebrief.advice && (
                <p className="opacity-80">
                  <span className="font-semibold">Conseil — </span>
                  {microDebrief.advice}
                </p>
              )}
            </div>
          )}
          {!savingOutcome && (
            <div className="text-center">
              <Link
                href={`/founder/${campaignId}`}
                className="inline-block rounded-lg border border-current/20 px-6 py-2 text-sm font-medium transition-opacity hover:opacity-70"
              >
                Retour au tableau de bord
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
