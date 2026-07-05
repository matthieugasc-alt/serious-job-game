"use client";

/**
 * NegotiationDebrief — restitution post-scénario de la mécanique
 * Négociation. Présentationnel : issue, mouvements par terme (ouverture →
 * final), chronologie des propositions, objections (déterministe), puis
 * qualitatif (équilibre, intérêts, création de valeur, rapport de force…)
 * et synthèse (parties IA).
 */

import type { MoveDirection, NegotiationObservations, TermMove } from "@/app/lib/debrief/negotiation";

const STATUS: Record<string, { label: string; cls: string }> = {
  signed: { label: "Accord signé", cls: "bg-emerald-50 text-emerald-700" },
  rejected: { label: "Rompu / rejeté", cls: "bg-red-50 text-red-600" },
  open: { label: "Non conclu", cls: "bg-gray-100 text-gray-500" },
};
const DIR: Record<MoveDirection, string> = { hausse: "↑", baisse: "↓", inchangé: "=", "—": "•" };

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

function fmtVal(v: number | string | null, suffix?: string): string {
  if (v === null || v === "") return "—";
  const s = typeof v === "number" ? v.toLocaleString("fr-FR") : String(v);
  return suffix ? `${s} ${suffix}` : s;
}

function TermRow({ t }: { t: TermMove }) {
  const moved = t.direction !== "inchangé";
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-100 px-2.5 py-1.5 text-xs">
      <span className="min-w-0 flex-1 truncate font-medium text-gray-800">{t.label}</span>
      <span className="text-gray-400">{fmtVal(t.opening, t.suffix)}</span>
      <span aria-hidden className={moved ? "text-indigo-500" : "text-gray-300"}>{DIR[t.direction]}</span>
      <span className="font-semibold text-gray-900">{fmtVal(t.final, t.suffix)}</span>
      {t.delta !== null && t.delta !== 0 && (
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${t.delta < 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {t.delta > 0 ? "+" : ""}{t.delta.toLocaleString("fr-FR")}{t.suffix ? " " + t.suffix : ""}
        </span>
      )}
    </div>
  );
}

export function NegotiationDebrief({ observations: o }: { observations: NegotiationObservations }) {
  const st = STATUS[o.outcome.status] ?? STATUS.open;
  return (
    <div className="space-y-5">
      {/* Issue. */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-800">Issue de la négociation</h3>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Propositions" value={o.outcome.proposalsCount} />
          <Stat label="Concessions" value={o.outcome.concessionCount} />
          <Stat label="Objections reçues" value={o.objections.received} />
          <Stat label="Objections traitées" value={o.objections.answered} />
        </div>
      </section>

      {/* Mouvements par terme. */}
      {o.terms.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-800">Mouvements par terme (ouverture → final)</h3>
          <div className="space-y-1">{o.terms.map((t, i) => <TermRow key={i} t={t} />)}</div>
        </section>
      )}

      {/* Chronologie des propositions. */}
      {o.chronology.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-800">Chronologie des propositions</h3>
          <ol className="space-y-1">
            {o.chronology.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
                <span className="mt-0.5 shrink-0 rounded-full bg-indigo-50 px-1.5 text-[10px] font-semibold text-indigo-700">{i + 1}</span>
                <span className="min-w-0 flex-1">{c.label}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Qualitatif (IA). */}
      {(o.qualitative.balance || o.qualitative.interests || o.qualitative.valueCreation || o.qualitative.powerBalance || o.qualitative.coherence || o.qualitative.robustness || o.qualitative.objections) && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-800">Dynamique de la négociation</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <Qual label="Équilibre de l'accord" value={o.qualitative.balance} />
            <Qual label="Positions vs intérêts" value={o.qualitative.interests} />
            <Qual label="Gestion des objections" value={o.qualitative.objections} />
            <Qual label="Création de valeur" value={o.qualitative.valueCreation} />
            <Qual label="Rapport de force" value={o.qualitative.powerBalance} />
            <Qual label="Cohérence stratégique" value={o.qualitative.coherence} />
            <Qual label="Robustesse de l'accord" value={o.qualitative.robustness} />
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
        {o.synthesis.techniquesUnderused.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="mb-1.5 text-xs font-semibold text-gray-700">Techniques peu utilisées</p>
            <p className="flex flex-wrap gap-1">{o.synthesis.techniquesUnderused.map((t, i) => <span key={i} className="rounded-full bg-white px-2 py-0.5 text-[11px] text-gray-600 shadow-sm">{t}</span>)}</p>
          </div>
        )}
        {o.synthesis.recurringErrors.length > 0 && (
          <div className="rounded-xl border border-red-100 bg-red-50/40 p-3">
            <p className="mb-1.5 text-xs font-semibold text-red-700">Erreurs récurrentes</p>
            <ul className="list-disc space-y-1 pl-4 text-xs text-gray-700">{o.synthesis.recurringErrors.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        )}
        {o.synthesis.recommendations.length > 0 && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 sm:col-span-2">
            <p className="mb-1.5 text-xs font-semibold text-indigo-800">Recommandations</p>
            <ul className="list-disc space-y-1 pl-4 text-xs text-gray-700">{o.synthesis.recommendations.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        )}
      </section>
    </div>
  );
}
