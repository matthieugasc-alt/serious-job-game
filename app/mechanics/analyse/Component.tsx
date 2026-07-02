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
  const inputEntries = Object.entries(context.inputs);

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
      <div className="border-b bg-gray-50 p-3 text-sm">{instructions}</div>
      <div className="flex min-h-0 flex-1">
        {context.documents.length > 0 && (
          <div className="min-h-0 w-1/2 border-r">
            <DocumentViewer documents={context.documents} />
          </div>
        )}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {inputEntries.length > 0 && (
            <details className="rounded border bg-gray-50 p-3 text-sm" open>
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
          {prompts.map((p) => (
            <label key={p.id} className="block">
              <span className="text-sm font-medium">{p.label}</span>
              <textarea
                className="mt-1 min-h-[90px] w-full resize-y rounded border px-3 py-2 text-sm"
                value={findings[p.id] ?? ""}
                placeholder={p.placeholder}
                onChange={(e) => setField(p.id, e.target.value)}
              />
            </label>
          ))}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
            disabled={missing.length > 0 || submitting}
            onClick={() => void submit()}
          >
            {submitting ? "Observation en cours…" : "Valider mon analyse"}
          </button>
        </div>
      </div>
    </div>
  );
}
