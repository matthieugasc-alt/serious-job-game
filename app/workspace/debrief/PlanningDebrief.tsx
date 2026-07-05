"use client";

/**
 * PlanningDebrief — restitution post-scénario de la mécanique
 * Planification / Organisation. Présentationnel : volume du plan,
 * répartition des tâches, dépendances, risques, outils (déterministe),
 * puis cohérence / réalisme / priorités / robustesse / adaptabilité et
 * synthèse (parties IA).
 */

import { completionRate, type PlanningObservations } from "@/app/lib/debrief/planning";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2.5">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function Qual({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="rounded-lg border border-gray-100 px-2.5 py-2">
      <p className="text-[11px] font-semibold text-gray-500">{label}</p>
      <p className="text-xs text-gray-700">{value}</p>
    </div>
  );
}

function crit(score: number): string {
  return score >= 15 ? "#fecaca" : score >= 7 ? "#fde68a" : "#bbf7d0";
}

export function PlanningDebrief({ observations: o }: { observations: PlanningObservations }) {
  const t = o.planning.tasksByStatus;
  const total = t.todo + t.doing + t.done;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  return (
    <div className="space-y-5">
      {/* Volume du plan. */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-800">Le plan construit</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Étapes / items" value={o.planning.steps} />
          <Stat label="Jalons" value={o.planning.milestones} />
          <Stat label="Dépendances" value={o.planning.dependencies} />
          <Stat label="Risques" value={o.planning.risks} />
        </div>
      </section>

      {/* Répartition des tâches. */}
      {total > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-800">Avancement ({Math.round(completionRate(t) * 100)}% terminé)</h3>
          <div className="flex h-5 overflow-hidden rounded-full bg-gray-100 text-[10px] font-semibold text-white">
            {t.done > 0 && <div className="flex items-center justify-center bg-emerald-500" style={{ width: `${pct(t.done)}%` }}>{t.done}</div>}
            {t.doing > 0 && <div className="flex items-center justify-center bg-amber-400" style={{ width: `${pct(t.doing)}%` }}>{t.doing}</div>}
            {t.todo > 0 && <div className="flex items-center justify-center bg-gray-300 text-gray-700" style={{ width: `${pct(t.todo)}%` }}>{t.todo}</div>}
          </div>
          <div className="mt-1 flex gap-3 text-[10px] text-gray-400">
            <span>■ Terminé</span><span className="text-amber-500">■ En cours</span><span className="text-gray-400">■ À faire</span>
          </div>
        </section>
      )}

      {/* Outils de planification. */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-800">Outils mobilisés</h3>
        {o.toolUsage.length === 0 ? (
          <p className="text-[11px] text-gray-400">Aucun outil de planification identifié.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {o.toolUsage.map((u, i) => <span key={i} className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700">{u.label} · {u.count}</span>)}
          </div>
        )}
      </section>

      {/* Dépendances + risques. */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-800">Dépendances</h3>
          {o.dependencyList.length === 0 ? <p className="text-[11px] text-gray-400">Aucune dépendance déclarée.</p> : (
            <ul className="space-y-0.5 text-[11px] text-gray-700">
              {o.dependencyList.slice(0, 12).map((l, i) => <li key={i} className="truncate">{l.fromLabel} <span className="text-gray-400">→</span> {l.toLabel}</li>)}
            </ul>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-800">Risques du plan</h3>
          {o.riskList.length === 0 ? <p className="text-[11px] text-gray-400">Aucun risque identifié.</p> : (
            <ul className="space-y-0.5">
              {o.riskList.slice(0, 12).map((r, i) => (
                <li key={i} className="flex items-center gap-1.5 text-[11px] text-gray-700">
                  <span className="inline-flex h-4 min-w-5 items-center justify-center rounded px-1 text-[9px] font-bold text-gray-800" style={{ backgroundColor: crit(r.probability * r.impact) }}>{r.probability * r.impact}</span>
                  <span className="min-w-0 flex-1 truncate">{r.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Qualitatif (IA). */}
      {(o.coherence || o.realism || o.priorities || o.robustness || o.adaptability) && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-800">Analyse du plan</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <Qual label="Cohérence & séquencement" value={o.coherence} />
            <Qual label="Réalisme temporel" value={o.realism} />
            <Qual label="Priorités" value={o.priorities} />
            <Qual label="Robustesse aux imprévus" value={o.robustness} />
            <Qual label="Adaptabilité" value={o.adaptability} />
          </div>
        </section>
      )}

      {/* Synthèse (IA). */}
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
          <p className="mb-1.5 text-xs font-semibold text-emerald-800">Points forts</p>
          {o.synthesis.strengths.length === 0 ? <p className="text-[11px] text-gray-400">—</p> : (
            <ul className="list-disc space-y-1 pl-4 text-xs text-gray-700">{o.synthesis.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul>
          )}
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
          <p className="mb-1.5 text-xs font-semibold text-amber-800">Axes de progression</p>
          {o.synthesis.improvements.length === 0 ? <p className="text-[11px] text-gray-400">—</p> : (
            <ul className="list-disc space-y-1 pl-4 text-xs text-gray-700">{o.synthesis.improvements.map((x, i) => <li key={i}>{x}</li>)}</ul>
          )}
        </div>
        {o.synthesis.recurringErrors.length > 0 && (
          <div className="rounded-xl border border-red-100 bg-red-50/40 p-3">
            <p className="mb-1.5 text-xs font-semibold text-red-700">Erreurs récurrentes</p>
            <ul className="list-disc space-y-1 pl-4 text-xs text-gray-700">{o.synthesis.recurringErrors.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        )}
        {o.synthesis.recommendations.length > 0 && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
            <p className="mb-1.5 text-xs font-semibold text-indigo-800">Recommandations</p>
            <ul className="list-disc space-y-1 pl-4 text-xs text-gray-700">{o.synthesis.recommendations.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        )}
      </section>
    </div>
  );
}
