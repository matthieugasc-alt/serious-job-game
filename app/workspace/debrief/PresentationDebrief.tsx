"use client";

/**
 * PresentationDebrief — restitution post-scénario de la mécanique
 * Présentation. Présentationnel : métriques du discours, structure,
 * gestion du temps et des questions, usage des supports (déterministe),
 * puis impact / qualitatif / synthèse (parties IA).
 */

import { paceLabel, type PresentationObservations } from "@/app/lib/debrief/presentation";

function fmtDuration(s: number): string {
  if (s <= 0) return "—";
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2.5">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900">{value}</p>
      {hint && <p className="text-[10px] text-gray-400">{hint}</p>}
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

export function PresentationDebrief({ observations: o }: { observations: PresentationObservations }) {
  const sp = o.speech;
  return (
    <div className="space-y-5">
      {/* Métriques du discours. */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-800">Le discours</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Durée" value={fmtDuration(sp.durationS)} />
          <Stat label="Mots" value={sp.wordCount} />
          <Stat label="Débit" value={sp.wordsPerMinute > 0 ? `${sp.wordsPerMinute} mots/min` : "—"} hint={paceLabel(sp.wordsPerMinute) !== "—" ? `rythme ${paceLabel(sp.wordsPerMinute)}` : undefined} />
          <Stat label="Phrases" value={sp.sentenceCount} />
        </div>
      </section>

      {/* Structure. */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-800">Structure de l&apos;exposé</h3>
        <div className="flex flex-wrap gap-1.5">
          {o.structure.map((s) => (
            <span key={s.label} className={`rounded-full px-2.5 py-1 text-xs font-medium ${s.present ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-400 line-through"}`}>
              {s.present ? "✓ " : ""}{s.label}
            </span>
          ))}
        </div>
      </section>

      {/* Questions + supports. */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-800">Gestion des questions</h3>
          <div className="flex gap-2">
            <Stat label="Reçues" value={o.qa.received} />
            <Stat label="Répondues" value={o.qa.answered} hint={o.qa.received > o.qa.answered ? `${o.qa.received - o.qa.answered} éludée(s)` : undefined} />
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-800">Supports mobilisés</h3>
          <div className="flex gap-2">
            <Stat label="Documents" value={o.supporting.documents} />
            <Stat label="Notes" value={o.supporting.notes} />
            <Stat label="Décisions" value={o.supporting.decisions} />
          </div>
        </div>
      </section>

      {/* Impact du discours (IA). */}
      {o.impact.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-800">Impact sur l&apos;auditoire</h3>
          <ul className="space-y-1.5">
            {o.impact.map((im, i) => (
              <li key={i} className="flex items-start gap-2 rounded-lg border border-gray-100 px-2.5 py-1.5">
                <span className="mt-0.5 shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">{im.reaction}</span>
                <span className="min-w-0 flex-1 text-xs text-gray-700">{im.note}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Qualitatif (IA). */}
      {(o.clarity || o.argumentation || o.confidence || o.coherence) && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-800">Analyse du discours</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <Qual label="Clarté du message" value={o.clarity} />
            <Qual label="Argumentation" value={o.argumentation} />
            <Qual label="Confiance perçue" value={o.confidence} />
            <Qual label="Cohérence avec le travail" value={o.coherence} />
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
