"use client";

/**
 * DocSynthesisDebrief — restitution post-scénario de la mécanique
 * Analyse / Synthèse documentaire. Présentationnel : carte des sources,
 * entonnoir de transformation, utilisation des outils, chronologie,
 * carte des preuves + raisonnement + synthèse (parties IA). Aucune logique
 * d'analyse ici.
 */

import type {
  Confidence,
  DocSynthObservations,
  EventCategory,
  ReadDepth,
} from "@/app/lib/debrief/docSynthesis";

const DEPTH_STYLE: Record<ReadDepth, string> = {
  profond: "bg-emerald-100 text-emerald-800 border-emerald-200",
  parcouru: "bg-amber-100 text-amber-800 border-amber-200",
  ignoré: "bg-gray-100 text-gray-500 border-gray-200",
};
const DEPTH_LABEL: Record<ReadDepth, string> = { profond: "Lu en profondeur", parcouru: "Parcouru", ignoré: "Ignoré" };

const CAT_ICON: Record<EventCategory, string> = {
  lecture: "📄",
  annotation: "🖍",
  note: "📝",
  décision: "🧭",
  livrable: "📤",
  tag: "🏷",
  collection: "🗂",
  comparaison: "⇋",
};

const CONF_STYLE: Record<Confidence, string> = {
  faible: "bg-red-50 text-red-600",
  moyenne: "bg-amber-50 text-amber-700",
  forte: "bg-emerald-50 text-emerald-700",
};

function ToolStat({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 ${muted ? "bg-gray-50" : "bg-indigo-50/60"}`}>
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className={`text-lg font-semibold ${value === 0 ? "text-gray-300" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}

export function DocSynthesisDebrief({ observations: o }: { observations: DocSynthObservations }) {
  const f = o.transformation;
  const funnel: [string, number][] = [
    ["Documents ouverts", f.documentsOpened],
    ["Annotations", f.annotations],
    ["Notes", f.notes],
    ["Décisions", f.decisions],
  ];
  const funnelMax = Math.max(1, ...funnel.map(([, v]) => v));

  return (
    <div className="space-y-5">
      {/* Carte des sources. */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-800">Sources consultées</h3>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {o.sources.map((s) => (
            <div key={s.id} className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 ${DEPTH_STYLE[s.readDepth]}`}>
              <span className="min-w-0 flex-1 truncate text-xs font-medium">{s.title}</span>
              <span className="shrink-0 text-[10px] font-medium">
                {DEPTH_LABEL[s.readDepth]}
                {s.annotationCount > 0 && ` · ${s.annotationCount} annot.`}
              </span>
            </div>
          ))}
          {o.sources.length === 0 && <p className="text-[11px] text-gray-400">Aucun document dans ce scénario.</p>}
        </div>
      </section>

      {/* Entonnoir de transformation. */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-800">Transformation de l&apos;information</h3>
        <div className="space-y-1.5">
          {funnel.map(([label, v]) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-36 shrink-0 text-[11px] text-gray-500">{label}</span>
              <div className="h-5 flex-1 overflow-hidden rounded bg-gray-100">
                <div className="flex h-full items-center justify-end rounded bg-indigo-400 px-2 text-[10px] font-semibold text-white" style={{ width: `${Math.max(8, (v / funnelMax) * 100)}%` }}>
                  {v}
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-gray-400">Document → annotation → note → décision : où l&apos;information s&apos;est-elle perdue ?</p>
      </section>

      {/* Utilisation des outils. */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-800">Utilisation des outils</h3>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          <ToolStat label="Notes" value={o.toolUsage.notes} />
          <ToolStat label="Annotations" value={o.toolUsage.annotations} />
          <ToolStat label="Tags" value={o.toolUsage.tags} />
          <ToolStat label="Collections" value={o.toolUsage.collections} />
          <ToolStat label="Décisions" value={o.toolUsage.decisions} />
          <ToolStat label="Comparateur" value={o.toolUsage.comparateur} muted={o.toolUsage.comparateur === 0} />
        </div>
      </section>

      {/* Chronologie. */}
      {o.chronology.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-800">Chronologie de travail</h3>
          <ul className="space-y-1">
            {o.chronology.slice(0, 40).map((e, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-gray-700">
                <span aria-hidden className="shrink-0">{CAT_ICON[e.category]}</span>
                <span className="capitalize text-gray-400">{e.category}</span>
                <span className="text-gray-300">·</span>
                <span className="min-w-0 flex-1 truncate">{e.label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Carte des preuves (IA). */}
      {o.evidence.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-800">Carte des preuves</h3>
          <ul className="space-y-1.5">
            {o.evidence.map((ev, i) => (
              <li key={i} className="rounded-lg border border-gray-100 px-2.5 py-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-xs font-medium text-gray-800">{ev.conclusion}</p>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${CONF_STYLE[ev.confidence]}`}>{ev.confidence}</span>
                </div>
                {ev.sources.length > 0 && (
                  <p className="mt-1 flex flex-wrap gap-1">
                    {ev.sources.map((s, j) => (
                      <span key={j} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">📄 {s}</span>
                    ))}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Carte du raisonnement (IA). */}
      {o.reasoning && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-800">Chemin de raisonnement</h3>
          <p className="whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-xs leading-relaxed text-gray-700">{o.reasoning}</p>
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
        {o.synthesis.underusedTools.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="mb-1.5 text-xs font-semibold text-gray-700">Outils sous-utilisés</p>
            <p className="flex flex-wrap gap-1">
              {o.synthesis.underusedTools.map((t, i) => (
                <span key={i} className="rounded-full bg-white px-2 py-0.5 text-[11px] text-gray-600 shadow-sm">{t}</span>
              ))}
            </p>
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
