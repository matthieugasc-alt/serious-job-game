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
  ActorIdentity,
  CounterChip,
  InstructionBanner,
  PrimaryButton,
} from "@/app/player/primitives/ui";
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

  const inputClass =
    "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <InstructionBanner
        label="Situation à diagnostiquer"
        text={situation}
        icon="🔍"
      />
      {error && (
        <p className="shrink-0 border-b border-red-100 bg-red-50 px-4 py-2 text-xs font-medium text-red-700">
          {error}
        </p>
      )}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col border-r border-gray-200">
          <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-2.5">
            <ActorIdentity actor={actor} />
          </div>
          <div className="min-h-0 flex-1">
            <ChatPanel
              transcript={transcript}
              actors={context.actors}
              onSend={handleSend}
              busy={busy || finishing}
              placeholder={`Votre question à ${actor.name}…`}
            />
          </div>
        </div>
        {context.documents.length > 0 && (
          <div className="min-h-0 w-80 border-r border-gray-200">
            <DocumentViewer documents={context.documents} />
          </div>
        )}
        <div className="min-h-0 w-80 space-y-3 overflow-y-auto bg-gray-50/60 p-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900">
              🩺 Mon diagnostic
            </h3>
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="text-xs font-semibold text-gray-600">
                  Cause retenue
                </span>
                {hypotheses.length > 0 ? (
                  <select
                    className={inputClass}
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
                    className={inputClass}
                    value={cause}
                    onChange={(e) => {
                      setCause(e.target.value);
                      persist(e.target.value, evidence, eliminated);
                    }}
                  />
                )}
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-gray-600">
                  Éléments à l&apos;appui
                </span>
                <textarea
                  className={`${inputClass} min-h-[90px] resize-y`}
                  value={evidence}
                  onChange={(e) => {
                    setEvidence(e.target.value);
                    persist(cause, e.target.value, eliminated);
                  }}
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-gray-600">
                  Causes écartées et pourquoi
                </span>
                <textarea
                  className={`${inputClass} min-h-[90px] resize-y`}
                  value={eliminated}
                  onChange={(e) => {
                    setEliminated(e.target.value);
                    persist(cause, evidence, e.target.value);
                  }}
                />
              </label>
            </div>
            <div className="mt-3">
              <CounterChip done={playerCount >= minExchanges}>
                {playerCount}/{minExchanges} échange{minExchanges > 1 ? "s" : ""} min.
                avec le témoin
              </CounterChip>
            </div>
            <PrimaryButton
              className="mt-3 w-full"
              disabled={!canSubmit}
              onClick={() => void submit()}
            >
              {finishing ? "Observation en cours…" : "Rendre mon diagnostic"}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}
