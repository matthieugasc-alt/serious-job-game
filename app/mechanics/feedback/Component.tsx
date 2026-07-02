"use client";

/**
 * feedback/Component — UI : bandeau context_brief (+framework_hint) +
 * ChatPanel. Le joueur délivre son feedback, l'acteur réagit (selon son
 * prompt scénario, cadré par params.directive), le joueur ajuste.
 * Après min_rounds, "Clore l'échange" ouvre le champ "Engagements
 * convenus" → record editor → io.observe(artifacts:{commitments}) →
 * onComplete. L'IA observe, le moteur décide.
 */

import { useEffect, useRef, useState } from "react";
import type { MechanicProps, TranscriptEvent } from "@/app/lib/engine/mechanics";
import { ChatPanel } from "@/app/player/primitives/ChatPanel";
import {
  resolveMinRounds,
  countPlayerMessages,
  validateCommitments,
  buildOutput,
  restoreCommitments,
} from "./Runtime";

export function FeedbackComponent({ context, onComplete }: MechanicProps) {
  const params = context.params;
  const actor = context.actors.find((a) => a.actor_id === params.actor_id);
  const contextBrief =
    typeof params.context_brief === "string" ? params.context_brief : "";
  const frameworkHint =
    typeof params.framework_hint === "string" ? params.framework_hint : "";
  const minRounds = resolveMinRounds(params);

  const transcriptRef = useRef<TranscriptEvent[]>([...context.transcript]);
  const [transcript, setTranscript] = useState<TranscriptEvent[]>(
    transcriptRef.current,
  );
  const [commitments, setCommitments] = useState(() =>
    restoreCommitments(context.scratch),
  );
  const [closingOpen, setClosingOpen] = useState(false);
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

  // Boot : message d'ouverture de l'acteur (idempotent sous StrictMode).
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

  const playerCount = countPlayerMessages(transcript);
  const canClose = playerCount >= minRounds && !busy && !finishing;
  const commitmentErrors = validateCommitments(commitments);

  const submit = async () => {
    if (doneRef.current || commitmentErrors.length > 0 || busy) return;
    doneRef.current = true;
    setError(null);
    setFinishing(true);
    try {
      const event: Omit<TranscriptEvent, "at"> = {
        channel: "editor",
        role: "player",
        content: `Engagements convenus :\n${commitments.trim()}`,
      };
      // Snapshot AVANT record (context.transcript peut être la référence session).
      const snapshot = [...transcriptRef.current, { at: Date.now(), ...event }];
      push(event);
      const observation = await context.io.observe({
        criteria: context.criteria,
        transcript: snapshot,
        artifacts: { commitments: commitments.trim() },
      });
      onComplete({
        observation,
        output: buildOutput(snapshot, context.actors, commitments),
      });
    } catch {
      doneRef.current = false;
      setFinishing(false);
      setError("L'observation a échoué. Cliquez à nouveau sur « Valider les engagements ».");
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
      <div className="flex items-center justify-between gap-4 border-b bg-gray-50 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide opacity-50">
            Situation à débriefer
          </p>
          <p className="text-sm font-medium">{contextBrief}</p>
          {frameworkHint && (
            <p className="text-xs opacity-60">Cadre suggéré : {frameworkHint}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs opacity-60">
            {playerCount}/{minRounds} message{minRounds > 1 ? "s" : ""} min.
          </span>
          {!closingOpen && (
            <button
              className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
              disabled={!canClose}
              onClick={() => setClosingOpen(true)}
            >
              Clore l&apos;échange
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="border-b bg-red-50 px-4 py-2 text-xs text-red-700">{error}</p>
      )}
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1">
          <ChatPanel
            transcript={transcript}
            actors={context.actors}
            onSend={handleSend}
            busy={busy || finishing}
            placeholder={`Votre feedback à ${actor.name}…`}
          />
        </div>
        {closingOpen && (
          <div className="min-h-0 w-80 space-y-3 overflow-y-auto border-l p-4">
            <h3 className="text-sm font-semibold">Engagements convenus</h3>
            <textarea
              className="min-h-[140px] w-full resize-y rounded border px-3 py-2 text-sm"
              value={commitments}
              onChange={(e) => {
                setCommitments(e.target.value);
                context.io.saveScratch({ commitments: e.target.value });
              }}
              placeholder="Ce qui a été convenu à l'issue de l'échange…"
            />
            <button
              className="w-full rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
              disabled={commitmentErrors.length > 0 || finishing || busy}
              onClick={() => void submit()}
            >
              {finishing ? "Observation en cours…" : "Valider les engagements"}
            </button>
            <button
              className="w-full rounded border px-4 py-2 text-sm disabled:opacity-40"
              disabled={finishing}
              onClick={() => setClosingOpen(false)}
            >
              Reprendre l&apos;échange
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
