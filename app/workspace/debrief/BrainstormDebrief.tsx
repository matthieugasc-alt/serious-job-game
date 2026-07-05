"use client";

/**
 * BrainstormDebrief — restitution post-scénario de la mécanique Créativité
 * / Brainstorming. Présentationnel : volume, familles, temps de
 * génération, convergence, outils (déterministe), puis diversité /
 * originalité / pertinence / exploration / regroupement (parties IA).
 */

import type { BrainstormObservations } from "@/app/lib/debrief/brainstorm";

const COLOR_HEX: Record<string, string> = { yellow: "#fde68a", pink: "#fbcfe8", blue: "#bfdbfe", green: "#bbf7d0", orange: "#fed7aa" };

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

function fmtSpan(ms: number): string {
  if (ms <= 0) return "—";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min`;
}

export function BrainstormDebrief({ observations: o }: { observations: BrainstormObservations }) {
  const c = o.convergence;
  return (
    <div className="space-y-5">
      {/* Volume. */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-800">Volume d&apos;idées</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Idées produites" value={o.volume.total} />
          <Stat label="Par vous" value={o.volume.byPlayer} />
          <Stat label="Par l'équipe IA" value={o.volume.byOthers} />
          <Stat label="Temps de génération" value={fmtSpan(o.generationSpanMs)} />
        </div>
        <p className="mt-1 text-[11px] text-gray-400">Plus d&apos;idées ≠ meilleure performance : on observe la capacité à ouvrir le champ des possibles.</p>
      </section>

      {/* Familles (couleurs). */}
      {o.families.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-800">Regroupement par couleur</h3>
          <div className="flex flex-wrap gap-1.5">
            {o.families.map((f) => (
              <span key={f.color} className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-700">
                <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: COLOR_HEX[f.color] ?? "#e5e7eb" }} />
                {f.count}
              </span>
            ))}
          </div>
          {o.families.length === 1 && o.volume.total > 2 && <p className="mt-1 text-[11px] text-amber-600">Toutes les idées dans une seule famille : peu de structuration.</p>}
        </section>
      )}

      {/* Convergence. */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-800">
          Divergence → convergence {c.converted ? <span className="text-emerald-600">— idées exploitées</span> : <span className="text-amber-600">— idées non converties</span>}
        </h3>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="→ Tâches" value={c.tasks} />
          <Stat label="→ Options" value={c.options} />
          <Stat label="→ Décisions" value={c.decisions} />
        </div>
      </section>

      {/* Outils créatifs. */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-800">Outils créatifs mobilisés</h3>
        <div className="flex flex-wrap gap-1.5">
          {o.toolUsage.map((t, i) => (
            <span key={i} className={`rounded-full px-2.5 py-1 text-xs font-medium ${t.used ? "bg-indigo-50 text-indigo-700" : "bg-gray-100 text-gray-400 line-through"}`}>
              {t.used ? "✓ " : ""}{t.label}
            </span>
          ))}
        </div>
      </section>

      {/* Qualitatif (IA). */}
      {(o.qualitative.diversity || o.qualitative.originality || o.qualitative.relevance || o.qualitative.exploration || o.qualitative.grouping || o.qualitative.convergenceQuality) && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-800">Analyse de la créativité</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <Qual label="Diversité des idées" value={o.qualitative.diversity} />
            <Qual label="Originalité" value={o.qualitative.originality} />
            <Qual label="Pertinence vs problème" value={o.qualitative.relevance} />
            <Qual label="Exploration vs fixation" value={o.qualitative.exploration} />
            <Qual label="Qualité du regroupement" value={o.qualitative.grouping} />
            <Qual label="Passage à la convergence" value={o.qualitative.convergenceQuality} />
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
        {o.synthesis.methodsToTry.length > 0 && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
            <p className="mb-1.5 text-xs font-semibold text-indigo-800">Méthodes créatives à tester</p>
            <p className="flex flex-wrap gap-1">{o.synthesis.methodsToTry.map((t, i) => <span key={i} className="rounded-full bg-white px-2 py-0.5 text-[11px] text-gray-600 shadow-sm">{t}</span>)}</p>
          </div>
        )}
        {o.synthesis.underusedTools.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="mb-1.5 text-xs font-semibold text-gray-700">Outils sous-utilisés</p>
            <p className="flex flex-wrap gap-1">{o.synthesis.underusedTools.map((t, i) => <span key={i} className="rounded-full bg-white px-2 py-0.5 text-[11px] text-gray-600 shadow-sm">{t}</span>)}</p>
          </div>
        )}
      </section>
    </div>
  );
}
