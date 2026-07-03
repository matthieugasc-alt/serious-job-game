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
import { DocumentViewer } from "@/app/player/primitives/DocumentViewer";
import {
  CounterChip,
  ErrorText,
  InstructionBanner,
  PreviousInputs,
  PrimaryButton,
} from "@/app/player/primitives/ui";
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

  const justificationLength = justification.trim().length;
  const justificationOk =
    !config.requireJustification ||
    justificationLength >= config.minJustificationChars;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <InstructionBanner text={instructions} />
      <div className="flex min-h-0 flex-1">
        {context.documents.length > 0 && (
          <div className="min-h-0 w-[42%] border-r border-gray-200">
            <DocumentViewer documents={context.documents} />
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50/60">
          <div className="space-y-4 p-4 sm:p-5">
            <PreviousInputs inputs={context.inputs} />

            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-gray-900">
                {config.maxChoices === 1
                  ? "Choisissez une option"
                  : `Choisissez jusqu'à ${config.maxChoices} options`}
              </h2>
              {config.maxChoices > 1 && (
                <CounterChip done={choices.length === config.maxChoices}>
                  {choices.length}/{config.maxChoices} option
                  {config.maxChoices > 1 ? "s" : ""}
                </CounterChip>
              )}
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {options.map((o) => {
                const selected = choices.includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    aria-pressed={selected}
                    className={`relative rounded-xl border-2 p-4 pr-10 text-left shadow-sm transition ${
                      selected
                        ? "border-indigo-600 bg-indigo-50/60 ring-1 ring-indigo-200"
                        : "border-gray-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/20"
                    }`}
                    onClick={() => toggle(o.id)}
                  >
                    <span
                      aria-hidden
                      className={`absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold transition ${
                        selected
                          ? "bg-indigo-600 text-white"
                          : "border-2 border-gray-300 bg-white text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                    <p
                      className={`text-sm font-semibold ${
                        selected ? "text-indigo-900" : "text-gray-900"
                      }`}
                    >
                      {o.label}
                    </p>
                    <p
                      className={`mt-1.5 text-xs leading-relaxed ${
                        selected ? "text-indigo-800/80" : "text-gray-500"
                      }`}
                    >
                      {o.description}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-gray-900">
                  Justification
                  {!config.requireJustification && (
                    <span className="ml-1.5 text-xs font-normal text-gray-400">
                      (facultative)
                    </span>
                  )}
                </span>
                {config.requireJustification && (
                  <CounterChip done={justificationOk}>
                    {justificationLength}/{config.minJustificationChars} caractères
                    min.
                  </CounterChip>
                )}
              </div>
              <textarea
                className="mt-2.5 min-h-[120px] w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
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
            </div>

            <ErrorText>{error}</ErrorText>
            <PrimaryButton
              className="w-full sm:w-auto"
              disabled={blocking.length > 0 || submitting}
              onClick={() => void submit()}
            >
              {submitting ? "Observation en cours…" : "Trancher"}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}
