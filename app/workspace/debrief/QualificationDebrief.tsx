"use client";

/**
 * QualificationDebrief — restitution PÉDAGOGIQUE post-scénario de la
 * mécanique Qualification / Entretien. Purement présentationnel : reçoit
 * des observations (déterministes, éventuellement enrichies IA) et les
 * rend en vues (stats, couverture + radar, questions, découverte,
 * hypothèses, synthèse). Aucune logique d'analyse ici.
 */

import { coverageScore, type CoverageLevel, type QualificationObservations, type QuestionType } from "@/app/lib/debrief/qualification";

const COVERAGE_STYLE: Record<CoverageLevel, string> = {
  oui: "bg-emerald-100 text-emerald-800 border-emerald-200",
  partiel: "bg-amber-100 text-amber-800 border-amber-200",
  non: "bg-red-100 text-red-800 border-red-200",
};
const COVERAGE_LABEL: Record<CoverageLevel, string> = { oui: "Couvert", partiel: "Partiel", non: "Angle mort" };

const QTYPE_STYLE: Record<QuestionType, string> = {
  ouverte: "bg-indigo-50 text-indigo-700",
  fermée: "bg-gray-100 text-gray-600",
  relance: "bg-sky-50 text-sky-700",
  clarification: "bg-violet-50 text-violet-700",
  orientée: "bg-amber-50 text-amber-700",
};

function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function Stat({ label, value, tone = "text-gray-900" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2.5">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className={`text-lg font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

// ─── Radar SVG (couverture par dimension) ─────────────────────────

function CoverageRadar({ obs }: { obs: QualificationObservations }) {
  const dims = obs.coverage;
  const n = dims.length;
  if (n < 3) return null;
  const cx = 130;
  const cy = 120;
  const R = 92;
  const pt = (i: number, r: number) => {
    const a = (-90 + (i * 360) / n) * (Math.PI / 180);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  };
  const rings = [0.5, 1];
  const valuePts = dims.map((d, i) => pt(i, R * coverageScore(d.covered)).join(",")).join(" ");
  return (
    <svg viewBox="0 0 260 240" className="w-full max-w-[300px]" role="img" aria-label="Radar de couverture des dimensions">
      {rings.map((r) => (
        <polygon
          key={r}
          points={dims.map((_, i) => pt(i, R * r).join(",")).join(" ")}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={1}
        />
      ))}
      {dims.map((d, i) => {
        const [x, y] = pt(i, R);
        const [lx, ly] = pt(i, R + 16);
        return (
          <g key={d.dimension}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="#e5e7eb" strokeWidth={1} />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="fill-gray-500" fontSize={8.5}>
              {d.label}
            </text>
          </g>
        );
      })}
      <polygon points={valuePts} fill="rgba(79,70,229,0.18)" stroke="#4f46e5" strokeWidth={1.5} />
    </svg>
  );
}

// ─── Composant principal ───────────────────────────────────────────

export function QualificationDebrief({ observations: o }: { observations: QualificationObservations }) {
  const s = o.stats;
  const pct = Math.round(s.talkRatioPlayer * 100);

  return (
    <div className="space-y-5">
      {/* Statistiques d'entretien. */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-800">Conduite de l&apos;entretien</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Questions posées" value={String(s.questionCount)} />
          <Stat label="Sans réponse" value={String(s.unansweredCount)} tone={s.unansweredCount > 0 ? "text-amber-600" : "text-emerald-600"} />
          <Stat label="Tours enchaînés" value={String(s.interruptions)} tone={s.interruptions > 1 ? "text-amber-600" : "text-gray-900"} />
          <Stat label="Durée" value={fmtDuration(s.durationMs)} />
        </div>
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[11px] text-gray-500">
            <span>Temps de parole — vous {pct}%</span>
            <span>interlocuteur {100 - pct}%</span>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-gray-100">
            <div className="bg-indigo-500" style={{ width: `${pct}%` }} />
            <div className="bg-gray-300" style={{ width: `${100 - pct}%` }} />
          </div>
        </div>
      </section>

      {/* Couverture + radar. */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-800">Couverture des dimensions</h3>
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {o.coverage.map((c) => (
              <div key={c.dimension} className={`rounded-lg border px-2.5 py-1.5 ${COVERAGE_STYLE[c.covered]}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{c.label}</span>
                  <span className="text-[10px] font-medium">{COVERAGE_LABEL[c.covered]}</span>
                </div>
                {c.evidence && <p className="mt-0.5 text-[11px] opacity-80">{c.evidence}</p>}
              </div>
            ))}
          </div>
          <CoverageRadar obs={o} />
        </div>
      </section>

      {/* Questions. */}
      {o.questions.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-800">Fil des questions</h3>
          <ul className="space-y-1.5">
            {o.questions.map((q, i) => (
              <li key={i} className="flex items-start gap-2 rounded-lg border border-gray-100 px-2.5 py-1.5">
                <span className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${q.type ? QTYPE_STYLE[q.type] : "bg-gray-100 text-gray-400"}`}>
                  {q.type ?? "—"}
                </span>
                <span className="min-w-0 flex-1 text-xs text-gray-700">{q.content}</span>
                {!q.answered && <span className="shrink-0 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">sans réponse</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Chronologie de découverte. */}
      {o.discovery.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-800">Chronologie de découverte</h3>
          <ul className="space-y-1">
            {o.discovery.map((d, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span
                  className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                    d.status === "à temps" ? "bg-emerald-500" : d.status === "tard" ? "bg-amber-500" : "bg-red-400"
                  }`}
                />
                <span className="font-medium text-gray-700">{d.label}</span>
                <span className="text-gray-400">·</span>
                <span className={d.status === "manquée" ? "text-red-500" : "text-gray-500"}>{d.status}</span>
                {d.excerpt && <span className="truncate text-gray-400">— {d.excerpt}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Hypothèses. */}
      {o.hypotheses.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-800">Hypothèses formulées</h3>
          <ul className="space-y-1">
            {o.hypotheses.map((h, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-gray-700">
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    h.status === "confirmée" ? "bg-emerald-50 text-emerald-700" : h.status === "infirmée" ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {h.status}
                </span>
                {h.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Synthèse. */}
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
          <p className="mb-1.5 text-xs font-semibold text-emerald-800">Points forts</p>
          {o.synthesis.strengths.length === 0 ? (
            <p className="text-[11px] text-gray-400">—</p>
          ) : (
            <ul className="list-disc space-y-1 pl-4 text-xs text-gray-700">
              {o.synthesis.strengths.map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
          <p className="mb-1.5 text-xs font-semibold text-amber-800">Axes de progression</p>
          {o.synthesis.improvements.length === 0 ? (
            <p className="text-[11px] text-gray-400">—</p>
          ) : (
            <ul className="list-disc space-y-1 pl-4 text-xs text-gray-700">
              {o.synthesis.improvements.map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          )}
        </div>
        {o.synthesis.recommendations.length > 0 && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 sm:col-span-2">
            <p className="mb-1.5 text-xs font-semibold text-indigo-800">Recommandations</p>
            <ul className="list-disc space-y-1 pl-4 text-xs text-gray-700">
              {o.synthesis.recommendations.map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
