"use client";

/**
 * production/Component — UI : éditeur de livrable (mail ou document),
 * inputs des steps précédents repliables, DocumentViewer si documents.
 * Brouillon persisté en scratch. L'IA observe, le moteur décide.
 */

import { useState } from "react";
import type { MechanicProps, TranscriptEvent } from "@/app/lib/engine/mechanics";
import { DocumentViewer } from "@/app/player/primitives/DocumentViewer";
import {
  parseDeliverableType,
  validateDraft,
  buildDeliverable,
  formatDeliverableContent,
  buildOutput,
  restoreDraft,
  type DeliverableDraft,
} from "./Runtime";

export function ProductionComponent({ context, onComplete }: MechanicProps) {
  const type = parseDeliverableType(context.params) ?? "document";
  const recipientId =
    typeof context.params.recipient_actor === "string"
      ? context.params.recipient_actor
      : null;
  const recipient = recipientId
    ? context.actors.find((a) => a.actor_id === recipientId)
    : undefined;
  const recipientName = recipient?.name ?? recipientId ?? "";
  const template =
    typeof context.params.template === "string" ? context.params.template : "";
  const subjectHint =
    typeof context.params.subject_hint === "string"
      ? context.params.subject_hint
      : undefined;

  const [draft, setDraft] = useState<DeliverableDraft>(() => {
    const saved = restoreDraft(context.scratch);
    return {
      subject: saved.subject ?? "",
      title: saved.title ?? "",
      body: saved.body ?? template,
    };
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missing = validateDraft(type, draft);
  const instructions = String(context.params.instructions ?? "");
  const inputEntries = Object.entries(context.inputs);

  const setField = (patch: Partial<DeliverableDraft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    context.io.saveScratch({
      subject: next.subject ?? "",
      title: next.title ?? "",
      body: next.body,
    });
  };

  const submit = async () => {
    if (missing.length > 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const deliverable = buildDeliverable(type, { ...draft, to: recipientName });
      const event: Omit<TranscriptEvent, "at"> = {
        channel: type === "mail" ? "mail" : "editor",
        role: "player",
        content: formatDeliverableContent(deliverable),
      };
      // Snapshot AVANT record (context.transcript peut être muté en place).
      const transcript = [...context.transcript, { at: Date.now(), ...event }];
      context.io.record(event);
      const observation = await context.io.observe({
        criteria: context.criteria,
        transcript,
        artifacts: { deliverable },
      });
      onComplete({ observation, output: buildOutput(deliverable) });
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
          <div className="min-h-0 w-1/3 border-r">
            <DocumentViewer documents={context.documents} />
          </div>
        )}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
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
          {type === "mail" && (
            <>
              <label className="block">
                <span className="text-xs font-medium opacity-60">À</span>
                <input
                  className="mt-1 w-full rounded border bg-gray-100 px-3 py-2 text-sm"
                  value={recipientName}
                  disabled
                  readOnly
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium opacity-60">Objet</span>
                <input
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  value={draft.subject ?? ""}
                  placeholder={subjectHint}
                  onChange={(e) => setField({ subject: e.target.value })}
                />
              </label>
            </>
          )}
          {type === "document" && (
            <label className="block">
              <span className="text-xs font-medium opacity-60">Titre</span>
              <input
                className="mt-1 w-full rounded border px-3 py-2 text-sm"
                value={draft.title ?? ""}
                onChange={(e) => setField({ title: e.target.value })}
              />
            </label>
          )}
          <label className="block">
            <span className="text-xs font-medium opacity-60">Corps</span>
            <textarea
              className="mt-1 min-h-[240px] w-full resize-y rounded border px-3 py-2 text-sm"
              value={draft.body}
              onChange={(e) => setField({ body: e.target.value })}
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
            disabled={missing.length > 0 || submitting}
            onClick={() => void submit()}
          >
            {submitting
              ? "Observation en cours…"
              : type === "mail"
                ? "Envoyer"
                : "Rendre"}
          </button>
        </div>
      </div>
    </div>
  );
}
