"use client";

/**
 * DecisionEditor — l'éditeur d'un Decision Object : contexte, matrice
 * multicritère (options × critères pondérés, score DÉRIVÉ jamais présenté
 * comme vérité), risques (proba × impact, criticité colorée), tableaux
 * d'arbitrage liés (Impact/Effort, Probabilité/Impact), finalisation.
 * Tout passe par l'API publique.
 */

import { useState } from "react";
import type { WorkspaceAction } from "@/app/lib/engine/workspace";
import {
  addCriterion,
  addOption,
  createRisk,
  finalizeDecision,
  openPreset,
  rankedOptions,
  removeCriterion,
  removeOption,
  riskLevel,
  scoreOption,
  updateCriterion,
  updateCriterionWeight,
  updateDecision,
  updateOption,
  updateRisk,
  weightedScoreOf,
} from "../api";
import { PRESETS } from "../presets";
import { reviseDecision } from "../integrations";
import type { Json } from "@/app/lib/engine/mechanics";
import type { Board, DecisionObject, RiskEntry } from "../spec";
import { DependencyPanel } from "./DependencyPanel";
import { RiskMatrix } from "./RiskMatrix";

type Dispatch = (action: WorkspaceAction) => void;

const BAND_COLOR: Record<string, string> = { low: "#bbf7d0", moderate: "#fde68a", high: "#fecaca" };
const PI_SCALE = [1, 2, 3, 4, 5];

export function DecisionEditor({
  decision,
  boards,
  engineState,
  dispatch,
  onOpenBoard,
  onSelectDecision,
}: {
  decision: DecisionObject;
  boards: Board[];
  engineState: Json;
  dispatch: Dispatch;
  onOpenBoard: (boardId: string) => void;
  onSelectDecision: (decisionId: string) => void;
}) {
  const [riskView, setRiskView] = useState<"registre" | "matrice">("registre");
  // État local initialisé aux props ; le parent remonte le composant
  // (key={decision.id}) au changement de décision — pas d'effet de synchro.
  const [context, setContext] = useState(decision.context);
  const [final, setFinal] = useState(decision.final_decision ?? "");

  const ranked = rankedOptions(decision);
  const bestId = ranked[0]?.score ? ranked[0].option.id : null;

  const loadDefaultCriteria = () => {
    const preset = PRESETS["matrix.weighted"];
    const crits = (preset.config as { criteria?: { label: string; weight: number }[] }).criteria ?? [];
    for (const c of crits) dispatch(addCriterion(decision.id, { label: c.label, weight: c.weight }));
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      {/* Contexte. */}
      <section className="border-b border-gray-100 px-4 py-3">
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">Contexte</label>
        <textarea
          rows={2}
          value={context}
          onChange={(e) => setContext(e.target.value)}
          onBlur={() => context !== decision.context && dispatch(updateDecision(decision.id, { context }))}
          placeholder="Quel est le problème à trancher ? Quelles contraintes ?"
          className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none"
        />
      </section>

      {/* Matrice multicritère. */}
      <section className="border-b border-gray-100 px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-700">Matrice multicritère</h3>
          <div className="flex gap-1.5">
            {decision.criteria.length === 0 && (
              <button type="button" className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-700" onClick={loadDefaultCriteria}>
                Charger critères par défaut
              </button>
            )}
            <button type="button" className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-700" onClick={() => dispatch(addCriterion(decision.id, { label: "", weight: 1 }))}>
              + Critère
            </button>
            <button type="button" className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-700" onClick={() => dispatch(addOption(decision.id, ""))}>
              + Option
            </button>
          </div>
        </div>

        {decision.options.length === 0 && decision.criteria.length === 0 ? (
          <p className="text-[11px] text-gray-400">Ajoutez des options (les choix possibles) et des critères (ce qui compte) pour arbitrer.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left font-medium text-gray-500">Option</th>
                  {decision.criteria.map((c) => (
                    <th key={c.id} className="px-1 py-1 text-center font-medium text-gray-500">
                      <div className="flex flex-col items-center gap-0.5">
                        <input
                          value={c.label}
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) => dispatch(updateCriterion(decision.id, c.id, { label: e.target.value }))}
                          className="w-[92px] rounded border border-transparent bg-transparent px-1 text-center text-gray-700 hover:border-gray-200 focus:border-indigo-300 focus:outline-none"
                          placeholder="Critère…"
                          title={c.label}
                        />
                        <span className="inline-flex items-center gap-0.5">
                          <span className="text-[9px] text-gray-400">poids</span>
                          <input
                            type="number"
                            min={0}
                            max={9}
                            value={c.weight}
                            onChange={(e) => dispatch(updateCriterionWeight(decision.id, c.id, Number(e.target.value) || 0))}
                            className="w-9 rounded border border-gray-200 px-1 py-0.5 text-center"
                          />
                          <button type="button" title="Retirer le critère" className="text-gray-300 hover:text-red-500" onClick={() => dispatch(removeCriterion(decision.id, c.id))}>✕</button>
                        </span>
                      </div>
                    </th>
                  ))}
                  <th className="px-2 py-1 text-center font-semibold text-gray-600">Score</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map(({ option, score }) => (
                  <tr key={option.id} className={option.id === bestId ? "bg-emerald-50/60" : ""}>
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-1">
                        <input
                          value={option.label}
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) => dispatch(updateOption(decision.id, option.id, { label: e.target.value }))}
                          className="w-full min-w-[140px] rounded border border-transparent bg-transparent px-1 font-medium text-gray-800 hover:border-gray-200 focus:border-indigo-300 focus:outline-none"
                          placeholder="Nommer l'option…"
                          title={option.label}
                        />
                        <button type="button" title="Retirer l'option" className="shrink-0 text-gray-300 hover:text-red-500" onClick={() => dispatch(removeOption(decision.id, option.id))}>✕</button>
                      </div>
                    </td>
                    {decision.criteria.map((c) => {
                      const cell = decision.scores[option.id]?.[c.id];
                      return (
                        <td key={c.id} className="px-1 py-1 text-center">
                          <input
                            type="number"
                            min={0}
                            max={5}
                            value={cell?.value ?? ""}
                            onChange={(e) => dispatch(scoreOption(decision.id, option.id, c.id, Math.max(0, Math.min(5, Number(e.target.value) || 0))))}
                            className="w-10 rounded border border-gray-200 px-1 py-0.5 text-center"
                            placeholder="–"
                          />
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-center font-semibold text-gray-900">{score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {decision.options.length === 0 && (
              <p className="mt-1.5 text-[11px] text-amber-600">Ajoutez au moins une option (bouton « + Option ») pour pouvoir noter.</p>
            )}
            {decision.criteria.length === 0 && decision.options.length > 0 && (
              <p className="mt-1.5 text-[11px] text-amber-600">Ajoutez au moins un critère (bouton « + Critère ») pour arbitrer.</p>
            )}
            {bestId && (
              <p className="mt-1.5 text-[11px] text-gray-500">
                En tête de <em>votre</em> pondération : « {ranked[0].option.label} ». Le score classe, il ne décide pas — vérifiez les dépendances et testez la sensibilité des poids.
              </p>
            )}
          </div>
        )}
      </section>

      {/* Risques — registre ↔ matrice (conversion sur le même decision.risks). */}
      <section className="border-b border-gray-100 px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-700">Risques</h3>
          <div className="flex items-center gap-1.5">
            <div className="flex rounded-lg border border-gray-200 p-0.5 text-[11px]">
              {(["registre", "matrice"] as const).map((v) => (
                <button key={v} type="button" aria-pressed={riskView === v} className={`rounded px-1.5 py-0.5 font-medium transition ${riskView === v ? "bg-indigo-100 text-indigo-700" : "text-gray-500 hover:bg-gray-100"}`} onClick={() => setRiskView(v)}>
                  {v === "registre" ? "Registre" : "Matrice"}
                </button>
              ))}
            </div>
            <button type="button" className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-700" onClick={() => { setRiskView("registre"); dispatch(createRisk(decision.id, { label: "", probability: 3, impact: 3 })); }}>
              + Risque
            </button>
          </div>
        </div>
        {riskView === "matrice" ? (
          <div className="h-72"><RiskMatrix decision={decision} dispatch={dispatch} /></div>
        ) : decision.risks.length === 0 ? (
          <p className="text-[11px] text-gray-400">Aucun risque identifié. « + Risque » pour en documenter un.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-[10px] text-gray-400">Cotez 1 (faible) à 5 (fort). Documentez les mesures, puis recotez le risque <em>résiduel</em> après mesures.</p>
            {decision.risks.map((r) => (
              <RiskCard key={r.id} decisionId={decision.id} risk={r} dispatch={dispatch} />
            ))}
          </div>
        )}
      </section>

      {/* Tableaux d'arbitrage liés. */}
      <section className="border-b border-gray-100 px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-700">Tableaux d’arbitrage</h3>
          <div className="flex flex-wrap gap-1.5">
            {(["matrix.impact_effort", "swot", "registry.decisions"] as const).map((pid) => (
              <button key={pid} type="button" className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-700" onClick={() => { const o = openPreset(pid, { decision_id: decision.id }); if (o) dispatch(o); }}>
                + {PRESETS[pid].title}
              </button>
            ))}
          </div>
        </div>
        {boards.length === 0 ? (
          <p className="text-[11px] text-gray-400">Aucun tableau lié.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {boards.map((b) => (
              <button key={b.id} type="button" className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700 hover:border-indigo-300 hover:text-indigo-700" onClick={() => onOpenBoard(b.id)}>
                📊 {b.title || b.engine}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Décisions liées (les tableaux passent par « Tableaux d'arbitrage »). */}
      <section className="border-b border-gray-100 px-4 py-3">
        <DependencyPanel
          state={engineState}
          node={{ type: "decision", id: decision.id }}
          dispatch={dispatch}
          restrictTo="decision"
          title="Décisions liées"
        />
      </section>

      {/* Décision finale. */}
      <section className="px-4 py-3">
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">Décision retenue</label>
        <textarea
          rows={2}
          value={final}
          onChange={(e) => setFinal(e.target.value)}
          onBlur={() => final !== (decision.final_decision ?? "") && dispatch(updateDecision(decision.id, { final_decision: final || null }))}
          placeholder="Dans le contexte de…, nous décidons… pour…, en acceptant…"
          className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={`text-[11px] font-medium ${decision.status === "finalized" ? "text-emerald-600" : "text-gray-400"}`}>
            {decision.status === "finalized" ? "✓ Décision actée" : "Brouillon"}
          </span>
          <div className="ml-auto flex flex-wrap gap-1.5">
            {decision.status === "finalized" ? (
              <button
                type="button"
                className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
                onClick={() => { const { newId, actions } = reviseDecision(decision); actions.forEach((a) => dispatch(a)); onSelectDecision(newId); }}
              >
                Réviser (nouvelle version)
              </button>
            ) : (
              <button
                type="button"
                disabled={final.trim().length === 0}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-40"
                onClick={() => dispatch(finalizeDecision(decision.id, { final_decision: final }))}
              >
                Acter la décision
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Carte de risque : brut → mesures (prévenir / guérir) → résiduel ──

function CritBadge({ score, band, title }: { score: number; band: string; title: string }) {
  return (
    <span
      title={title}
      className="inline-flex h-5 min-w-6 items-center justify-center rounded px-1 text-[11px] font-bold text-gray-800"
      style={{ backgroundColor: BAND_COLOR[band] }}
    >
      {score}
    </span>
  );
}

function PISelect({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <label className="flex items-center justify-between gap-1.5 rounded-lg border border-gray-200 px-2 py-1 text-[11px] text-gray-600">
      <span className="truncate">{label}</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} className="bg-transparent font-semibold text-gray-800 focus:outline-none">
        {PI_SCALE.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    </label>
  );
}

function RiskCard({ decisionId, risk, dispatch }: { decisionId: string; risk: RiskEntry; dispatch: Dispatch }) {
  const set = (patch: Parameters<typeof updateRisk>[2]) => dispatch(updateRisk(decisionId, risk.id, patch));
  const brut = riskLevel(risk.probability, risk.impact);
  const rp = risk.residual_probability ?? risk.probability;
  const ri = risk.residual_impact ?? risk.impact;
  const resid = riskLevel(rp, ri);
  const recoted = risk.residual_probability !== undefined || risk.residual_impact !== undefined;
  const closed = risk.status === "closed";

  return (
    <div className={`rounded-xl border p-2.5 transition ${closed ? "border-gray-100 bg-gray-50 opacity-60" : "border-gray-200 bg-white"}`}>
      {/* Titre + criticité (brut → résiduel). */}
      <div className="flex items-center gap-2">
        <input
          value={risk.label}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => set({ label: e.target.value })}
          placeholder="Nommer le risque…"
          className="min-w-0 flex-1 bg-transparent text-sm font-medium text-gray-800 placeholder:text-gray-300 focus:outline-none"
        />
        <div className="flex shrink-0 items-center gap-1">
          <CritBadge score={brut.score} band={brut.band} title="Criticité brute (avant mesures)" />
          {recoted && (
            <>
              <span aria-hidden className="text-[11px] text-gray-400">→</span>
              <CritBadge score={resid.score} band={resid.band} title="Criticité résiduelle (après mesures)" />
            </>
          )}
        </div>
        <button
          type="button"
          title={closed ? "Rouvrir le risque" : "Marquer comme traité"}
          className="shrink-0 rounded px-1 text-xs text-gray-300 transition hover:text-indigo-600"
          onClick={() => set({ status: closed ? "open" : "closed" })}
        >
          {closed ? "↺" : "✓"}
        </button>
      </div>

      {/* Avant mesures. */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <PISelect label="Probabilité" value={risk.probability} onChange={(n) => set({ probability: n })} />
        <PISelect label="Impact" value={risk.impact} onChange={(n) => set({ impact: n })} />
      </div>

      {/* Mesures : prévenir (↓ proba) / guérir (↓ impact). */}
      <div className="mt-2 space-y-1.5">
        <input
          value={risk.prevention ?? ""}
          onChange={(e) => set({ prevention: e.target.value })}
          placeholder="🛡 Prévenir — comment réduire la probabilité ?"
          className="w-full rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 placeholder:text-gray-400 focus:border-indigo-300 focus:outline-none"
        />
        <input
          value={risk.cure ?? ""}
          onChange={(e) => set({ cure: e.target.value })}
          placeholder="🩹 Guérir — comment réduire l'impact si ça survient ?"
          className="w-full rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 placeholder:text-gray-400 focus:border-indigo-300 focus:outline-none"
        />
      </div>

      {/* Après mesures : re-cotation résiduelle. */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <PISelect label="Proba. résiduelle" value={rp} onChange={(n) => set({ residual_probability: n })} />
        <PISelect label="Impact résiduel" value={ri} onChange={(n) => set({ residual_impact: n })} />
      </div>
    </div>
  );
}

export { weightedScoreOf };
