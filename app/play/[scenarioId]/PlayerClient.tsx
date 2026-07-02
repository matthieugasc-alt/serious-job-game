"use client";

/**
 * PlayerClient — monte le Shell générique v2 pour un scénario donné.
 *
 * Ne connaît aucune mécanique : il branche uniquement la persistence
 * de fin de partie (POST /api/v2/complete, fire-and-forget) et le
 * bouton "Retour à l'accueil" une fois l'ending affiché par le Shell.
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

export function PlayerClient({ scenario, campaignId }: Props) {
  const [finished, setFinished] = useState(false);

  const handleFinished = useCallback(
    (session: SessionV2State) => {
      setFinished(true);

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
        })),
      };

      // Fire-and-forget : l'ending est déjà rendu par le Shell, un échec
      // du POST ne doit jamais bloquer le joueur.
      void fetch("/api/v2/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {
        /* fire-and-forget */
      });
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
      {finished && (
        <div className="mx-auto max-w-2xl px-8 pb-12 text-center">
          <Link
            href="/"
            className="inline-block rounded-lg border border-current/20 px-6 py-2 text-sm font-medium transition-opacity hover:opacity-70"
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      )}
    </div>
  );
}
