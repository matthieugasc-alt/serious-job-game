"use client";

/**
 * diagnostic/Component — UI : bandeau situation + ChatPanel (investigation
 * auprès du témoin) + DocumentViewer si documents + panneau "Mon diagnostic"
 * (cause retenue, éléments à l'appui, causes écartées).
 * "Rendre mon diagnostic" → record editor → io.observe(artifacts:{diagnosis})
 * → onComplete. L'IA observe, le moteur décide — jamais de verdict ici.
 */

import { useEffect, useRef, useState } from "react";
import type { MechanicProps, TranscriptEvent } from "@/app/lib/engine/mechanics";
import { ChatPanel } from "@/app/player/primitives/ChatPanel";
import { DocumentViewer } from "@/app/player/primitives/DocumentViewer";
import {
  WITNESS_DIRECTIVE,
  parseHypotheses,
  resolveMinExchanges,
  countPlayerMessages,
  validateDiagnosis,
  buildDiagnosis,
  buildSummary,
  buildOutput,
  restoreDiagnosis,
} from "./Runtime";

export function DiagnosticComponent({ context, onComplete }: MechanicProps) {
  const params = context.params;
  const actor = context.actors.find((a) => a.actor_id === params.actor_id);
  const situation = typeof params.situation === "string" ? params.situation : "";
  const hypotheses = parseHypotheses(params);
  const minExchanges = resolveMinExchanges(params);

  // Transcript miroir : context.transcript peut être une référence
  // détachée de la session — on tient notre propre copie à jour.
  const transcriptRef = useRef<TranscriptEvent[]>([...context.transcript]);
  const [transcript, setTranscript] = useState<TranscriptEvent[]>(
    transcriptRef.current,
  );
  const restored = restoreDiagnosis(context.scratch);
  const [cause, setCause] = useState(restored.cause);
  const [evidence, setEvidence] = useState(restored.evidence);
  const [eliminated, setEliminated] = useState(restored.eliminated);
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bootedRef = useRef(false);
  const doneRef = useRef(false);

  const push = (event: Omit<TranscriptEvent, "at">) => {
    context.io.record(event);
    transcriptRef.current = [
      ...transcriptRef.current,
      { ...event, at: Date.now() },
    ];
    setTranscript(transcriptRef.current);
  };

  // Boot : message d'ouverture du témoin (uniquement au premier lancement,
  // idempotent sous StrictMode grâce à bootedRef + hasActorMessage).
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    const opening =
      typeof params.opening_message === "string" ? params.opening_message : "";
    const hasActorMessage = transcriptRef.current.some(
      (e) => e.channel === "chat" && e.role === "actor",
    );
    if (opening && !hasActorMessage && actor) {
      push({
        channel: "chat",
        role: "actor",
        actor_id: actor.actor_id,
        content: opening,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = (c: string, ev: string, el: string) => {
    context.io.saveScratch({ diagnosis: { cause: c, evidence: ev, eliminated: el } });
  };

  const handleSend = async (text: string) => {
    if (!actor || busy || finishing) return;
    setError(null);
    setBusy(true);
    push({ channel: "chat", role: "player", content: text });
    try {
      const reply = await context.io.actorRespond({
        actor,
        transcript: [...transcriptRef.current],
        directive: WITNESS_DIRECTIVE,
      });
      push({
        channel: "chat",
        role: "actor",
        actor_id: actor.actor_id,
        content: reply,
      });
    } catch {
      setError("Le témoin n'a pas pu répondre. Renvoyez un message pour réessayer.");
    } finally {
      setBusy(false);
    }
  };

  const diagnosis = buildDiagnosis(cause, evidence, eliminated);
  const diagErrors = validateDiagnosis(hypotheses, diagnosis);
  const playerCount = countPlayerMessages(transcript);
  const canSubmit =
    playerCount >= minExchanges && diagErrors.length === 0 && !busy && !finishing;

  const submit = async () => {
    if (doneRef.current || !canSubmit) return;
    doneRef.current = true;
    setError(null);
    setFinishing(true);
    try {
      const event: Omit<TranscriptEvent, "at"> = {
        channel: "editor",
        role: "player",
        content: buildSummary(diagnosis, hypotheses),
      };
      // Snapshot AVANT record : context.transcript peut être la même
      // référence que la session (record ferait doublon dans le spread).
      const snapshot = [...transcriptRef.current, { at: Date.now(), ...event }];
      push(event);
      const observation = await context.io.observe({
        criteria: context.criteria,
        transcript: snapshot,
        artifacts: { diagnosis: { ...diagnosis } },
      });
      onComplete({
        observation,
        output: buildOutput(snapshot, context.actors, diagnosis),
      });
    } catch {
      doneRef.current = false;
      setFinishing(false);
      setError("L'observation a échoué. Cliquez à nouveau sur « Rendre mon diagnostic ».");
    }
  };

  if (!actor) {
    return (
      <div className="p-8 text-center text-sm text-red-700">
        Acteur introuvable pour ce step (params.actor_id invalide).
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b bg-gray-50 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide opacity-50">
          Situation à diagnostiquer
        </p>
        <p className="text-sm font-medium">{situation}</p>
      </div>
      {error && (
        <p className="border-b bg-red-50 px-4 py-2 text-xs text-red-700">{error}</p>
      )}
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1 border-r">
          <ChatPanel
            transcript={transcript}
            actors={context.actors}
            onSend={handleSend}
            busy={busy || finishing}
            placeholder={`Votre question à ${actor.name}…`}
          />
        </div>
        {context.documents.length > 0 && (
          <div className="min-h-0 w-72 border-r">
            <DocumentViewer documents={context.documents} />
          </div>
        )}
        <div className="min-h-0 w-80 space-y-3 overflow-y-auto p-4">
          <h3 className="text-sm font-semibold">Mon diagnostic</h3>
          <label className="block">
            <span className="text-xs font-medium opacity-60">Cause retenue</span>
            {hypotheses.length > 0 ? (
              <select
                className="mt-1 w-full rounded border px-3 py-2 text-sm"
                value={cause}
                onChange={(e) => {
                  setCause(e.target.value);
                  persist(e.target.value, evidence, eliminated);
                }}
              >
                <option value="">— Sélectionner —</option>
                {hypotheses.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="mt-1 w-full rounded border px-3 py-2 text-sm"
                value={cause}
                onChange={(e) => {
                  setCause(e.target.value);
                  persist(e.target.value, evidence, eliminated);
                }}
              />
            )}
          </label>
          <label className="block">
            <span className="text-xs font-medium opacity-60">
              Éléments à l&apos;appui
            </span>
            <textarea
              className="mt-1 min-h-[90px] w-full resize-y rounded border px-3 py-2 text-sm"
              value={evidence}
              onChange={(e) => {
                setEvidence(e.target.value);
                persist(cause, e.target.value, eliminated);
              }}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium opacity-60">
              Causes écartées et pourquoi
            </span>
            <textarea
              className="mt-1 min-h-[90px] w-full resize-y rounded border px-3 py-2 text-sm"
              value={eliminated}
              onChange={(e) => {
                setEliminated(e.target.value);
                persist(cause, evidence, e.target.value);
              }}
            />
          </label>
          <p className="text-xs opacity-50">
            {playerCount}/{minExchanges} échange{minExchanges > 1 ? "s" : ""} min.
            avec le témoin
          </p>
          <button
            className="w-full rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            {finishing ? "Observation en cours…" : "Rendre mon diagnostic"}
          </button>
        </div>
      </div>
    </div>
  );
}
