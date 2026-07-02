"use client";

/**
 * UI de la mécanique "entretien" : bandeau objectif + ChatPanel.
 * Chaque message joueur → record → actorRespond → record.
 * "Terminer l'entretien" → io.observe → onComplete (le moteur décide).
 */

import { useEffect, useRef, useState } from "react";
import type { MechanicProps, TranscriptEvent } from "@/app/lib/engine/mechanics";
import { ChatPanel } from "@/app/player/primitives/ChatPanel";
import {
  buildOutput,
  countPlayerMessages,
  resolveMinExchanges,
} from "./Runtime";

export function EntretienComponent({ context, onComplete }: MechanicProps) {
  const params = context.params;
  const actor = context.actors.find((a) => a.actor_id === params.actor_id);
  const minExchanges = resolveMinExchanges(params);
  const objective = typeof params.objective === "string" ? params.objective : "";

  // Le transcript local est la source de vérité UI ; chaque événement est
  // aussi poussé dans l'audit moteur via io.record (reprise via context.transcript).
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

  // Boot : message d'ouverture de l'acteur (uniquement au premier lancement).
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

  const handleSend = async (text: string) => {
    if (!actor || busy || finishing) return;
    setError(null);
    setBusy(true);
    push({ channel: "chat", role: "player", content: text });
    try {
      const reply = await context.io.actorRespond({
        actor,
        transcript: [...transcriptRef.current],
        directive:
          typeof params.directive === "string" ? params.directive : undefined,
      });
      push({
        channel: "chat",
        role: "actor",
        actor_id: actor.actor_id,
        content: reply,
      });
    } catch {
      setError("L'interlocuteur n'a pas pu répondre. Renvoyez un message pour réessayer.");
    } finally {
      setBusy(false);
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
      setError("L'observation a échoué. Cliquez à nouveau sur « Terminer l'entretien ».");
    }
  };

  if (!actor) {
    return (
      <div className="p-8 text-center text-sm text-red-700">
        Acteur introuvable pour ce step (params.actor_id invalide).
      </div>
    );
  }

  const playerCount = countPlayerMessages(transcript);
  const canFinish = playerCount >= minExchanges && !busy && !finishing;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-4 border-b bg-gray-50 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide opacity-50">
            Objectif de l'entretien
          </p>
          <p className="truncate text-sm font-medium">{objective}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs opacity-60">
            {playerCount}/{minExchanges} message{minExchanges > 1 ? "s" : ""} min.
          </span>
          <button
            className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
            disabled={!canFinish}
            onClick={() => void handleFinish()}
          >
            {finishing ? "Observation…" : "Terminer l'entretien"}
          </button>
        </div>
      </div>
      {error && (
        <p className="border-b bg-red-50 px-4 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
      <div className="min-h-0 flex-1">
        <ChatPanel
          transcript={transcript}
          actors={context.actors}
          onSend={handleSend}
          busy={busy || finishing}
          placeholder={`Votre message à ${actor.name}…`}
        />
      </div>
    </div>
  );
}
