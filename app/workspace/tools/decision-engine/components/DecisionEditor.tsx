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
  updateCriterionWeight,
  updateDecision,
  weightedScoreOf,
} from "../api";
import { PRESETS } from "../presets";
import type { Board, DecisionObject } from "../spec";

type Dispatch = (action: WorkspaceAction) => void;

const BAND_COLOR: Record<string, string> = { low: "#bbf7d0", moderate: "#fde68a", high: "#fecaca" };

export function DecisionEditor({
  decision,
  boards,
  dispatch,
  onOpenBoard,
}: {
  decision: DecisionObject;
  boards: Board[];
  dispatch: Dispatch;
  onOpenBoard: (boardId: string) => void;
}) {
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
            <button type="button" className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-700" onClick={() => dispatch(addCriterion(decision.id, { label: "Nouveau critère", weight: 1 }))}>
              + Critère
            </button>
            <button type="button" className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-700" onClick={() => dispatch(addOption(decision.id, "Nouvelle option"))}>
              + Option
            </button>
          </div>
        </div>

        {decision.options.length === 0 ? (
          <p className="text-[11px] text-gray-400">Ajoutez des options et des critères pour arbitrer.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left font-medium text-gray-500">Option</th>
                  {decision.criteria.map((c) => (
                    <th key={c.id} className="px-1 py-1 text-center font-medium text-gray-500">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="max-w-[90px] truncate" title={c.label}>{c.label}</span>
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
                        <span className="max-w-[160px] truncate font-medium text-gray-800" title={option.label}>{option.label}</span>
                        <button type="button" title="Retirer l'option" className="text-gray-300 hover:text-red-500" onClick={() => dispatch(removeOption(decision.id, option.id))}>✕</button>
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
            {bestId && (
              <p className="mt-1.5 text-[11px] text-gray-500">
                En tête de <em>votre</em> pondération : « {ranked[0].option.label} ». Le score classe, il ne décide pas — vérifiez les dépendances et testez la sensibilité des poids.
              </p>
            )}
          </div>
        )}
      </section>

      {/* Risques. */}
      <section className="border-b border-gray-100 px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-700">Risques</h3>
          <button type="button" className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-700" onClick={() => dispatch(createRisk(decision.id, { label: "Nouveau risque", probability: 3, impact: 3 }))}>
            + Risque
          </button>
        </div>
        {decision.risks.length === 0 ? (
          <p className="text-[11px] text-gray-400">Aucun risque identifié.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {decision.risks.map((r) => {
              const { score, band } = riskLevel(r.probability, r.impact);
              return (
                <li key={r.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-2 py-1 text-xs">
                  <span className="inline-flex h-4 w-6 items-center justify-center rounded text-[10px] font-bold text-gray-800" style={{ backgroundColor: BAND_COLOR[band] }}>{score}</span>
                  <span className="min-w-0 flex-1 truncate text-gray-800">{r.label}</span>
                  <span className="shrink-0 text-[10px] text-gray-400">P{r.probability}·I{r.impact}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Tableaux d'arbitrage liés. */}
      <section className="border-b border-gray-100 px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-700">Tableaux d’arbitrage</h3>
          <div className="flex gap-1.5">
            <button type="button" className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-700" onClick={() => { const o = openPreset("matrix.impact_effort", { decision_id: decision.id }); if (o) dispatch(o); }}>
              + Impact / Effort
            </button>
            <button type="button" className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-700" onClick={() => { const o = openPreset("matrix.prob_impact", { decision_id: decision.id }); if (o) dispatch(o); }}>
              + Probabilité / Impact
            </button>
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
        <div className="mt-2 flex items-center justify-between">
          <span className={`text-[11px] font-medium ${decision.status === "finalized" ? "text-emerald-600" : "text-gray-400"}`}>
            {decision.status === "finalized" ? "✓ Décision actée" : "Brouillon"}
          </span>
          {decision.status !== "finalized" && (
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
      </section>
    </div>
  );
}

export { weightedScoreOf };
