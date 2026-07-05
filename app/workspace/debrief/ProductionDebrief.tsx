"use client";

/**
 * ProductionDebrief — restitution post-scénario de la mécanique
 * Production. Présentationnel : métriques du livrable, structure, sources
 * (déterministe), puis complétude, traçabilité, qualitatif et synthèse
 * (parties IA). Aucune logique d'analyse ici.
 */

import { structureRate, type ProductionObservations } from "@/app/lib/debrief/production";

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

export function ProductionDebrief({ observations: o }: { observations: ProductionObservations }) {
  const d = o.deliverable;
  const srcPct = o.sources.total > 0 ? Math.round((o.sources.opened / o.sources.total) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Métriques du livrable. */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-800">Le livrable {d.title && <span className="font-normal text-gray-400">— {d.title}</span>}</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Type" value={d.type} />
          <Stat label="Mots" value={d.wordCount} />
          <Stat label="Phrases" value={d.sentenceCount} />
          <Stat label="Mots / phrase" value={d.avgSentenceLen} />
        </div>
      </section>

      {/* Structure. */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-800">Structure ({Math.round(structureRate(o.structure) * 100)}%)</h3>
        <div className="flex flex-wrap gap-1.5">
          {o.structure.map((s) => (
            <span key={s.label} className={`rounded-full px-2.5 py-1 text-xs font-medium ${s.present ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-400 line-through"}`}>
              {s.present ? "✓ " : ""}{s.label}
            </span>
          ))}
        </div>
      </section>

      {/* Sources + support. */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-800">Sources mobilisées</h3>
          <div className="mb-1 flex items-center justify-between text-[11px] text-gray-500">
            <span>{o.sources.opened} / {o.sources.total} documents ouverts</span>
            <span>{srcPct}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full bg-indigo-400" style={{ width: `${srcPct}%` }} />
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-800">Travail préparatoire</h3>
          <div className="flex gap-2">
            <Stat label="Notes" value={o.supporting.notes} />
            <Stat label="Décisions" value={o.supporting.decisions} />
          </div>
        </div>
      </section>

      {/* Complétude (IA). */}
      {(o.completeness.present.length + o.completeness.missing.length + o.completeness.superfluous.length) > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-800">Complétude vs attendu</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-2.5">
              <p className="mb-1 text-[11px] font-semibold text-emerald-800">Présents</p>
              <p className="flex flex-wrap gap-1">{o.completeness.present.map((x, i) => <span key={i} className="rounded bg-white px-1.5 py-0.5 text-[11px] text-gray-700">{x}</span>)}</p>
            </div>
            <div className="rounded-lg border border-red-100 bg-red-50/50 p-2.5">
              <p className="mb-1 text-[11px] font-semibold text-red-700">Oubliés</p>
              <p className="flex flex-wrap gap-1">{o.completeness.missing.map((x, i) => <span key={i} className="rounded bg-white px-1.5 py-0.5 text-[11px] text-gray-700">{x}</span>)}</p>
            </div>
            <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-2.5">
              <p className="mb-1 text-[11px] font-semibold text-amber-800">Superflus</p>
              <p className="flex flex-wrap gap-1">{o.completeness.superfluous.map((x, i) => <span key={i} className="rounded bg-white px-1.5 py-0.5 text-[11px] text-gray-700">{x}</span>)}</p>
            </div>
          </div>
        </section>
      )}

      {/* Traçabilité (IA). */}
      {o.traceability.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-800">Traçabilité des affirmations</h3>
          <ul className="space-y-1.5">
            {o.traceability.map((t, i) => (
              <li key={i} className="rounded-lg border border-gray-100 px-2.5 py-2">
                <p className="text-xs font-medium text-gray-800">« {t.claim} »</p>
                <p className="mt-1 flex flex-wrap gap-1">
                  {t.basis.length === 0 ? (
                    <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-600">non sourcé</span>
                  ) : (
                    t.basis.map((b, j) => <span key={j} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">{b}</span>)
                  )}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Qualitatif (IA). */}
      {(o.qualitative.clarity || o.qualitative.argumentation || o.qualitative.coherence || o.qualitative.adequacy) && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-800">Qualité rédactionnelle</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <Qual label="Adéquation à la demande" value={o.qualitative.adequacy} />
            <Qual label="Clarté & organisation" value={o.qualitative.clarity} />
            <Qual label="Argumentation" value={o.qualitative.argumentation} />
            <Qual label="Cohérence avec le travail" value={o.qualitative.coherence} />
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
        {o.synthesis.skillsToWork.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="mb-1.5 text-xs font-semibold text-gray-700">Compétences à retravailler</p>
            <p className="flex flex-wrap gap-1">{o.synthesis.skillsToWork.map((t, i) => <span key={i} className="rounded-full bg-white px-2 py-0.5 text-[11px] text-gray-600 shadow-sm">{t}</span>)}</p>
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
