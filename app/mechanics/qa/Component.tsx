"use client";

/**
 * UI de la mécanique "qa" : l'acteur IA a l'initiative.
 * Boot → l'acteur pose la question 1 (directive universelle construite
 * par la mécanique). Le joueur répond → l'acteur enchaîne. Après
 * question_count réponses, "Terminer" → io.observe → onComplete.
 */

import { useEffect, useRef, useState } from "react";
import type {
  ActorDef,
  MechanicProps,
  TranscriptEvent,
} from "@/app/lib/engine/mechanics";
import { ChatPanel } from "@/app/player/primitives/ChatPanel";
import {
  buildOutput,
  buildQaDirective,
  countActorMessages,
  countPlayerAnswers,
  resolveQuestionCount,
} from "./Runtime";

export function QaComponent({ context, onComplete }: MechanicProps) {
  const params = context.params;
  const actor = context.actors.find((a) => a.actor_id === params.actor_id);
  const total = resolveQuestionCount(params);
  const extra = typeof params.directive === "string" ? params.directive : undefined;
  const contextHint =
    typeof params.context_hint === "string" ? params.context_hint : "";

  const transcriptRef = useRef<TranscriptEvent[]>([...context.transcript]);
  const [transcript, setTranscript] = useState<TranscriptEvent[]>(
    transcriptRef.current,
  );
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

  /** Fait poser à l'acteur la question n (directive universelle). */
  const askQuestion = async (target: ActorDef, n: number) => {
    setError(null);
    setBusy(true);
    try {
      const reply = await context.io.actorRespond({
        actor: target,
        transcript: [...transcriptRef.current],
        directive: buildQaDirective(n, total, extra),
      });
      push({
        channel: "chat",
        role: "actor",
        actor_id: target.actor_id,
        content: reply,
      });
    } catch {
      setError("L'interlocuteur n'a pas pu poser sa question.");
    } finally {
      setBusy(false);
    }
  };

  // Boot : première question si l'acteur n'a encore rien posé (reprise safe).
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    if (!actor || total < 1) return;
    if (countActorMessages(transcriptRef.current) === 0) {
      void askQuestion(actor, 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = async (text: string) => {
    if (!actor || busy || finishing) return;
    const answeredBefore = countPlayerAnswers(transcriptRef.current);
    if (answeredBefore >= total) return; // toutes les questions ont une réponse
    push({ channel: "chat", role: "player", content: text });
    const answered = answeredBefore + 1;
    if (answered < total) {
      await askQuestion(actor, answered + 1);
    }
  };

  const handleFinish = async () => {
    if (doneRef.current || busy) return;
    doneRef.current = true;
    setError(null);
    setFinishing(true);
    try {
      const observation = await context.io.observe({
        criteria: context.criteria,
        transcript: [...transcriptRef.current],
      });
      onComplete({
        observation,
        output: buildOutput(transcriptRef.current, context.actors),
      });
    } catch {
      doneRef.current = false;
      setFinishing(false);
      setError("L'observation a échoué. Cliquez à nouveau sur « Terminer ».");
    }
  };

  if (!actor || total < 1) {
    return (
      <div className="p-8 text-center text-sm text-red-700">
        Step mal configuré (params.actor_id ou params.question_count invalide).
      </div>
    );
  }

  const answered = countPlayerAnswers(transcript);
  const allAnswered = answered >= total;
  // Relance possible si l'acteur n'a pas de question en attente (erreur réseau).
  const needsQuestion =
    !allAnswered &&
    countActorMessages(transcript) <= answered &&
    !busy &&
    !finishing;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-4 border-b bg-gray-50 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide opacity-50">
            {actor.name} vous interroge
          </p>
          {contextHint && (
            <p className="truncate text-sm font-medium">{contextHint}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs opacity-60">
            Réponses : {Math.min(answered, total)}/{total}
          </span>
          <button
            className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
            disabled={!allAnswered || busy || finishing}
            onClick={() => void handleFinish()}
          >
            {finishing ? "Observation…" : "Terminer"}
          </button>
        </div>
      </div>
      {error && (
        <div className="flex items-center gap-3 border-b bg-red-50 px-4 py-2">
          <p className="text-xs text-red-700">{error}</p>
          {needsQuestion && (
            <button
              className="rounded border border-red-300 px-2 py-0.5 text-xs text-red-700"
              onClick={() => void askQuestion(actor, answered + 1)}
            >
              Relancer
            </button>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1">
        <ChatPanel
          transcript={transcript}
          actors={context.actors}
          onSend={handleSend}
          busy={busy || finishing}
          placeholder={
            allAnswered
              ? "Toutes les questions ont une réponse — terminez le step."
              : `Votre réponse à ${actor.name}…`
          }
        />
      </div>
    </div>
  );
}
