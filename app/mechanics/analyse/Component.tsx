"use client";

/**
 * analyse/Component — UI : DocumentViewer + formulaire de findings.
 * Aucune connaissance métier : tout arrive via context.params.
 * L'IA observe (io.observe), le moteur décide — jamais de verdict ici.
 */

import { useMemo, useState } from "react";
import type { MechanicProps, TranscriptEvent } from "@/app/lib/engine/mechanics";
import { DocumentViewer } from "@/app/player/primitives/DocumentViewer";
import {
  CounterChip,
  ErrorText,
  InstructionBanner,
  PreviousInputs,
  PrimaryButton,
} from "@/app/player/primitives/ui";
import {
  parseFindingsPrompts,
  validateFindings,
  buildSummary,
  buildOutput,
  restoreFindings,
} from "./Runtime";

export function AnalyseComponent({ context, onComplete }: MechanicProps) {
  const prompts = useMemo(
    () => parseFindingsPrompts(context.params),
    [context.params],
  );
  const [findings, setFindings] = useState<Record<string, string>>(() =>
    restoreFindings(context.scratch),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missing = validateFindings(prompts, findings);
  const instructions = String(context.params.instructions ?? "");

  const filledCount = prompts.filter(
    (p) => (findings[p.id] ?? "").trim().length > 0,
  ).length;

  const setField = (id: string, value: string) => {
    const next = { ...findings, [id]: value };
    setFindings(next);
    context.io.saveScratch({ findings: next });
  };

  const submit = async () => {
    if (missing.length > 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const event: Omit<TranscriptEvent, "at"> = {
        channel: "editor",
        role: "player",
        content: buildSummary(prompts, findings),
      };
      // Snapshot AVANT record : context.transcript peut être la même
      // référence que la session (record ferait doublon dans le spread).
      const transcript = [...context.transcript, { at: Date.now(), ...event }];
      context.io.record(event);
      const output = buildOutput(prompts, findings);
      const observation = await context.io.observe({
        criteria: context.criteria,
        transcript,
        artifacts: { findings: output.findings },
      });
      onComplete({ observation, output });
    } catch {
      setError("L'observation a échoué. Réessayez.");
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <InstructionBanner text={instructions} />
      <div className="flex min-h-0 flex-1">
        {/* Split 55/45 : documents à gauche, formulaire à droite. */}
        {context.documents.length > 0 && (
          <div className="min-h-0 w-[55%] border-r border-gray-200">
            <DocumentViewer documents={context.documents} />
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50/60">
          <div className="space-y-4 p-4 sm:p-5">
            <PreviousInputs inputs={context.inputs} defaultOpen />
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-gray-900">
                Votre analyse
              </h2>
              <CounterChip done={filledCount >= prompts.length && prompts.length > 0}>
                {filledCount}/{prompts.length} champ
                {prompts.length > 1 ? "s" : ""} rempli
                {filledCount > 1 ? "s" : ""}
              </CounterChip>
            </div>
            {prompts.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <label className="block">
                  <span className="text-sm font-semibold text-gray-900">
                    {p.label}
                  </span>
                  {p.placeholder && (
                    <span className="mt-0.5 block text-xs text-gray-500">
                      {p.placeholder}
                    </span>
                  )}
                  <textarea
                    className="mt-2.5 min-h-[90px] w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    value={findings[p.id] ?? ""}
                    placeholder="Votre réponse…"
                    onChange={(e) => setField(p.id, e.target.value)}
                  />
                </label>
              </div>
            ))}
            <ErrorText>{error}</ErrorText>
            <PrimaryButton
              className="w-full sm:w-auto"
              disabled={missing.length > 0 || submitting}
              onClick={() => void submit()}
            >
              {submitting ? "Observation en cours…" : "Valider mon analyse"}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}
