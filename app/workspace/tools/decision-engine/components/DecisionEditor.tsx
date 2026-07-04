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
  updateRisk,
  weightedScoreOf,
} from "../api";
import { PRESETS } from "../presets";
import { createTaskFromDecision, exportDecisionToNotebook, reviseDecision } from "../integrations";
import type { Board, DecisionObject } from "../spec";
import { RiskMatrix } from "./RiskMatrix";

type Dispatch = (action: WorkspaceAction) => void;

const BAND_COLOR: Record<string, string> = { low: "#bbf7d0", moderate: "#fde68a", high: "#fecaca" };
const PI_SCALE = [1, 2, 3, 4, 5];

export function DecisionEditor({
  decision,
  boards,
  dispatch,
  onOpenBoard,
  onSelectDecision,
}: {
  decision: DecisionObject;
  boards: Board[];
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
            <button type="button" className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-700" onClick={() => dispatch(createRisk(decision.id, { label: "Nouveau risque", probability: 3, impact: 3 }))}>
              + Risque
            </button>
          </div>
        </div>
        {riskView === "matrice" ? (
          <div className="h-72"><RiskMatrix decision={decision} dispatch={dispatch} /></div>
        ) : decision.risks.length === 0 ? (
          <p className="text-[11px] text-gray-400">Aucun risque identifié.</p>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-gray-500">
                <th className="px-1 py-1 text-left font-medium">Risque</th>
                <th className="px-1 py-1 font-medium">P</th>
                <th className="px-1 py-1 font-medium">I</th>
                <th className="px-1 py-1 text-left font-medium">Mitigation</th>
                <th className="px-1 py-1 font-medium">Crit.</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {decision.risks.map((r) => {
                const { score, band } = riskLevel(r.probability, r.impact);
                return (
                  <tr key={r.id} className="group border-t border-gray-100">
                    <td className="px-1 py-1">
                      <input value={r.label} onChange={(e) => dispatch(updateRisk(decision.id, r.id, { label: e.target.value }))} className="w-full min-w-[120px] bg-transparent text-gray-800 focus:outline-none" placeholder="Risque…" />
                    </td>
                    {(["probability", "impact"] as const).map((k) => (
                      <td key={k} className="px-1 py-1 text-center">
                        <select value={r[k]} onChange={(e) => dispatch(updateRisk(decision.id, r.id, { [k]: Number(e.target.value) }))} className="bg-transparent text-center focus:outline-none">
                          {PI_SCALE.map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </td>
                    ))}
                    <td className="px-1 py-1">
                      <input value={r.mitigation ?? ""} onChange={(e) => dispatch(updateRisk(decision.id, r.id, { mitigation: e.target.value }))} className="w-full min-w-[100px] bg-transparent text-gray-700 focus:outline-none" placeholder="—" />
                    </td>
                    <td className="px-1 py-1 text-center">
                      <span className="inline-flex h-4 w-6 items-center justify-center rounded text-[10px] font-bold text-gray-800" style={{ backgroundColor: BAND_COLOR[band] }}>{score}</span>
                    </td>
                    <td className="px-1 py-1 text-center">
                      <button type="button" title="Retirer" className="text-gray-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100" onClick={() => dispatch(updateRisk(decision.id, r.id, { status: "closed" }))}>✓</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
            <button
              type="button"
              className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:border-indigo-300 hover:text-indigo-700"
              onClick={() => exportDecisionToNotebook(decision).forEach((a) => dispatch(a))}
            >
              → Bloc-notes
            </button>
            <button
              type="button"
              className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:border-indigo-300 hover:text-indigo-700"
              onClick={() => dispatch(createTaskFromDecision(decision))}
            >
              → Tâche
            </button>
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

export { weightedScoreOf };
