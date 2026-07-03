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
  ErrorText,
  InstructionBanner,
  PreviousInputs,
  PrimaryButton,
} from "@/app/player/primitives/ui";
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

  const bodyLength = draft.body.trim().length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <InstructionBanner text={instructions} />
      <div className="flex min-h-0 flex-1">
        {/* Documents en CONTENU (viewer markdown/PDF) à gauche. */}
        {context.documents.length > 0 && (
          <div className="min-h-0 w-[45%] border-r border-gray-200">
            <DocumentViewer documents={context.documents} />
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50/60">
          <div className="space-y-4 p-4 sm:p-5">
            <PreviousInputs inputs={context.inputs} />

            {/* Éditeur façon client mail / éditeur de document. */}
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50/80 px-4 py-2.5">
                <span aria-hidden>{type === "mail" ? "✉️" : "📝"}</span>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {type === "mail" ? "Nouveau message" : "Votre document"}
                </p>
              </div>

              {type === "mail" && (
                <div className="divide-y divide-gray-100 border-b border-gray-100">
                  <div className="flex items-center gap-3 px-4 py-2">
                    <span className="w-12 shrink-0 text-xs font-semibold text-gray-500">
                      À
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-800">
                      {recipientName}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-1.5">
                    <span className="w-12 shrink-0 text-xs font-semibold text-gray-500">
                      Objet
                    </span>
                    <input
                      className="w-full border-0 bg-transparent py-1 text-sm font-medium text-gray-900 placeholder:font-normal placeholder:text-gray-400 focus:outline-none"
                      value={draft.subject ?? ""}
                      placeholder={subjectHint ?? "Objet du message…"}
                      onChange={(e) => setField({ subject: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {type === "document" && (
                <div className="border-b border-gray-100 px-4 py-2">
                  <input
                    className="w-full border-0 bg-transparent py-1 text-base font-semibold text-gray-900 placeholder:font-normal placeholder:text-gray-400 focus:outline-none"
                    value={draft.title ?? ""}
                    placeholder="Titre du document…"
                    onChange={(e) => setField({ title: e.target.value })}
                  />
                </div>
              )}

              <textarea
                className="block min-h-[300px] w-full resize-y border-0 px-4 py-3 text-sm leading-relaxed text-gray-900 placeholder:text-gray-400 focus:outline-none"
                value={draft.body}
                placeholder={
                  type === "mail"
                    ? "Rédigez votre message…"
                    : "Rédigez le corps du document…"
                }
                onChange={(e) => setField({ body: e.target.value })}
              />
              <div className="flex items-center justify-end border-t border-gray-100 px-4 py-1.5">
                <span className="text-[11px] tabular-nums text-gray-400">
                  {bodyLength} caractère{bodyLength > 1 ? "s" : ""}
                </span>
              </div>
            </div>

            <ErrorText>{error}</ErrorText>
            <PrimaryButton
              className="w-full sm:w-auto"
              disabled={missing.length > 0 || submitting}
              onClick={() => void submit()}
            >
              {submitting
                ? "Observation en cours…"
                : type === "mail"
                  ? "Envoyer"
                  : "Rendre"}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}
