"use client";

/**
 * DebriefView — rendu PRÉSENTATIONNEL du bilan unifié du joueur (graphe
 * araignée des compétences, résumé, ce qui a bien / moins bien marché avec
 * exemples, recommandations). Réutilisé par la page de fin de scénario ET
 * par l'espace personnel (réouverture d'un bilan sauvegardé).
 *
 * Aucune logique : ne connaît ni la session, ni le moteur. Ne montre
 * jamais de vocabulaire de mécanique.
 */

export interface Competency {
  label: string;
  score: number;
}
export interface DebriefPoint {
  point: string;
  example: string;
}
import { VERDICT_LABEL, type Verdict } from "@/app/lib/debrief/verdict";
export type { Verdict };

export interface FinalDebrief {
  /** Verdict 3 niveaux du juge unique (optionnel : bilans d'avant l'ajout). */
  verdict?: Verdict;
  /** Notes 0-100 des deux dimensions jugées (démarche prioritaire). */
  noteDemarche?: number;
  noteResultat?: number;
  competencies: Competency[];
  summary: string;
  wentWell: DebriefPoint[];
  wentLess: DebriefPoint[];
  recommendations: string[];
}

const VERDICT_CLASSES: Record<Verdict, string> = {
  victoire_complete: "border-emerald-200 bg-emerald-50 text-emerald-800",
  victoire_partielle: "border-amber-200 bg-amber-50 text-amber-800",
  defaite: "border-rose-200 bg-rose-50 text-rose-800",
};

function Note({ label, value }: { label: string; value?: number }) {
  if (typeof value !== "number") return null;
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-[11px] uppercase tracking-wide text-gray-500">{label}</span>
      <span className="text-base font-bold tabular-nums text-gray-900">{value}</span>
    </span>
  );
}

function VerdictBanner({ debrief }: { debrief: FinalDebrief }) {
  if (!debrief.verdict) return null;
  const m = VERDICT_LABEL[debrief.verdict];
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${VERDICT_CLASSES[debrief.verdict]}`}>
      <span className="inline-flex items-center gap-2 text-base font-bold">
        <span aria-hidden>{m.icon}</span>
        {m.label}
      </span>
      <span className="flex items-center gap-4">
        <Note label="Démarche" value={debrief.noteDemarche} />
        <Note label="Résultat" value={debrief.noteResultat} />
      </span>
    </div>
  );
}

function Radar({ data }: { data: Competency[] }) {
  const n = data.length;
  if (n < 3) return null;
  const cx = 150;
  const cy = 140;
  const R = 100;
  const pt = (i: number, r: number) => {
    const a = (-90 + (i * 360) / n) * (Math.PI / 180);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  };
  const valuePts = data.map((d, i) => pt(i, R * (Math.max(0, Math.min(100, d.score)) / 100)).join(",")).join(" ");
  return (
    <svg viewBox="0 0 300 280" className="w-full max-w-[340px]" role="img" aria-label="Graphe des compétences">
      {[0.25, 0.5, 0.75, 1].map((r) => (
        <polygon key={r} points={data.map((_, i) => pt(i, R * r).join(",")).join(" ")} fill="none" stroke="#eef1f6" strokeWidth={1} />
      ))}
      {data.map((d, i) => {
        const [x, y] = pt(i, R);
        const [lx, ly] = pt(i, R + 22);
        return (
          <g key={d.label}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="#eef1f6" strokeWidth={1} />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize={9.5} className="fill-gray-500">{d.label}</text>
          </g>
        );
      })}
      <polygon points={valuePts} fill="rgba(79,70,229,0.16)" stroke="#4f46e5" strokeWidth={1.5} />
      {data.map((d, i) => {
        const [x, y] = pt(i, R * (Math.max(0, Math.min(100, d.score)) / 100));
        return <circle key={i} cx={x} cy={y} r={2.5} fill="#4f46e5" />;
      })}
    </svg>
  );
}

function PointsCard({ title, tone, points }: { title: string; tone: "good" | "less"; points: DebriefPoint[] }) {
  if (points.length === 0) return null;
  const border = tone === "good" ? "border-emerald-100 bg-emerald-50/40" : "border-amber-100 bg-amber-50/40";
  const head = tone === "good" ? "text-emerald-800" : "text-amber-800";
  return (
    <div className={`rounded-xl border p-4 ${border}`}>
      <p className={`mb-2 text-sm font-semibold ${head}`}>{title}</p>
      <ul className="space-y-2.5">
        {points.map((p, i) => (
          <li key={i} className="text-sm text-gray-800">
            {p.point}
            {p.example && <span className="mt-0.5 block border-l-2 border-gray-200 pl-2 text-[12px] italic text-gray-500">{p.example}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DebriefView({ debrief }: { debrief: FinalDebrief }) {
  return (
    <div className="space-y-5">
      <VerdictBanner debrief={debrief} />
      {debrief.summary && <p className="text-sm leading-relaxed text-gray-700">{debrief.summary}</p>}

      {debrief.competencies.length > 0 && (
        <div className="grid items-center gap-4 md:grid-cols-[auto_1fr]">
          {debrief.competencies.length >= 3 ? (
            <Radar data={debrief.competencies} />
          ) : (
            <div className="space-y-1.5">
              {debrief.competencies.map((c) => (
                <div key={c.label} className="flex items-center gap-2 text-xs">
                  <span className="w-28 shrink-0 text-gray-600">{c.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100"><div className="h-full bg-indigo-400" style={{ width: `${c.score}%` }} /></div>
                  <span className="w-8 text-right tabular-nums text-gray-500">{c.score}</span>
                </div>
              ))}
            </div>
          )}
          {debrief.competencies.length >= 3 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              {debrief.competencies.map((c) => (
                <span key={c.label} className="inline-flex items-center gap-1.5">
                  <span className="tabular-nums font-semibold text-gray-800">{c.score}</span>{c.label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <PointsCard title="Ce qui a bien fonctionné" tone="good" points={debrief.wentWell} />
        <PointsCard title="Ce qui peut progresser" tone="less" points={debrief.wentLess} />
      </div>

      {debrief.recommendations.length > 0 && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
          <p className="mb-1.5 text-sm font-semibold text-indigo-800">Pour aller plus loin</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
            {debrief.recommendations.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
