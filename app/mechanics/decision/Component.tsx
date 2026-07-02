"use client";

/**
 * decision/Component — UI : cartes d'options sélectionnables + textarea
 * de justification. Au "Trancher" : observation déterministe des
 * critères choice_* + observation IA du reste, fusionnées. Le moteur
 * décide toujours.
 */

import { useMemo, useState } from "react";
import type { MechanicProps, TranscriptEvent } from "@/app/lib/engine/mechanics";
import type { StepObservation } from "@/app/lib/engine/criteria";
import {
  parseOptions,
  parseConfig,
  validateDecision,
  splitCriteria,
  buildDeterministicObservation,
  mergeObservations,
  buildSummary,
  buildOutput,
  restoreDecision,
} from "./Runtime";

export function DecisionComponent({ context, onComplete }: MechanicProps) {
  const options = useMemo(() => parseOptions(context.params), [context.params]);
  const config = useMemo(() => parseConfig(context.params), [context.params]);
  const restored = useMemo(() => restoreDecision(context.scratch), [context.scratch]);

  const [choices, setChoices] = useState<string[]>(restored.choices);
  const [justification, setJustification] = useState(restored.justification);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocking = validateDecision(choices, justification, config);
  const instructions = String(context.params.instructions ?? "");
  const inputEntries = Object.entries(context.inputs);

  const persist = (nextChoices: string[], nextJustification: string) => {
    context.io.saveScratch({
      choices: nextChoices,
      justification: nextJustification,
    });
  };

  const toggle = (id: string) => {
    let next: string[];
    if (config.maxChoices === 1) {
      next = choices.includes(id) ? [] : [id];
    } else if (choices.includes(id)) {
      next = choices.filter((c) => c !== id);
    } else if (choices.length < config.maxChoices) {
      next = [...choices, id];
    } else {
      return; // plafond atteint
    }
    setChoices(next);
    persist(next, justification);
  };

  const submit = async () => {
    if (blocking.length > 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const event: Omit<TranscriptEvent, "at"> = {
        channel: "editor",
        role: "player",
        content: buildSummary(options, choices, justification),
      };
      // Snapshot AVANT record (context.transcript peut être muté en place).
      const transcript = [...context.transcript, { at: Date.now(), ...event }];
      context.io.record(event);

      const { structural, observed } = splitCriteria(context.criteria);
      const artifacts = {
        choices: [...choices],
        justification: justification.trim(),
      };

      let observation: StepObservation;
      if (structural.length === 0) {
        // Aucun critère choice_* : tout passe par l'observation IA.
        observation = await context.io.observe({
          criteria: context.criteria,
          transcript,
          artifacts,
        });
      } else {
        const deterministic = buildDeterministicObservation(structural, choices);
        const ai =
          observed.length > 0
            ? await context.io.observe({ criteria: observed, transcript, artifacts })
            : null;
        observation = mergeObservations(deterministic, ai);
      }

      onComplete({ observation, output: buildOutput(choices, justification) });
    } catch {
      setError("L'observation a échoué. Réessayez.");
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b bg-gray-50 p-3 text-sm">{instructions}</div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {inputEntries.length > 0 && (
          <details className="rounded border bg-gray-50 p-3 text-sm">
            <summary className="cursor-pointer font-medium">
              Éléments des étapes précédentes
            </summary>
            <div className="mt-2 space-y-2">
              {inputEntries.map(([k, v]) => (
                <div key={k}>
                  <p className="text-xs font-medium opacity-60">{k}</p>
                  <pre className="whitespace-pre-wrap font-sans">
                    {typeof v === "string" ? v : JSON.stringify(v, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </details>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {options.map((o) => {
            const selected = choices.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={selected}
                className={`rounded-lg border p-4 text-left transition ${
                  selected
                    ? "border-black bg-black text-white"
                    : "border-gray-200 bg-white hover:border-gray-400"
                }`}
                onClick={() => toggle(o.id)}
              >
                <p className="text-sm font-semibold">{o.label}</p>
                <p className={`mt-1 text-xs ${selected ? "opacity-80" : "opacity-60"}`}>
                  {o.description}
                </p>
              </button>
            );
          })}
        </div>
        {config.maxChoices > 1 && (
          <p className="text-xs opacity-60">
            {choices.length}/{config.maxChoices} option(s) sélectionnée(s)
          </p>
        )}
        <label className="block">
          <span className="text-sm font-medium">Justification</span>
          <textarea
            className="mt-1 min-h-[120px] w-full resize-y rounded border px-3 py-2 text-sm"
            value={justification}
            placeholder={
              config.requireJustification
                ? `Justifiez votre décision (${config.minJustificationChars} caractères minimum)…`
                : "Justifiez votre décision (facultatif)…"
            }
            onChange={(e) => {
              setJustification(e.target.value);
              persist(choices, e.target.value);
            }}
          />
          {config.requireJustification && (
            <span className="text-xs opacity-50">
              {justification.trim().length}/{config.minJustificationChars} caractères
            </span>
          )}
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
          disabled={blocking.length > 0 || submitting}
          onClick={() => void submit()}
        >
          {submitting ? "Observation en cours…" : "Trancher"}
        </button>
      </div>
    </div>
  );
}
