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
  ActorIdentity,
  CounterChip,
  InstructionBanner,
  PrimaryButton,
  SecondaryButton,
} from "@/app/player/primitives/ui";
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

  const bannerText = frameworkHint
    ? `${contextBrief}\nCadre suggéré : ${frameworkHint}`
    : contextBrief;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <InstructionBanner label="Situation à débriefer" text={bannerText} />
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-200 bg-white px-4 py-2.5">
        <ActorIdentity actor={actor} />
        <div className="flex shrink-0 items-center gap-3">
          <CounterChip done={playerCount >= minRounds}>
            {playerCount}/{minRounds} message{minRounds > 1 ? "s" : ""} min.
          </CounterChip>
          {!closingOpen && (
            <PrimaryButton disabled={!canClose} onClick={() => setClosingOpen(true)}>
              Clore l&apos;échange
            </PrimaryButton>
          )}
        </div>
      </div>
      {error && (
        <p className="shrink-0 border-b border-red-100 bg-red-50 px-4 py-2 text-xs font-medium text-red-700">
          {error}
        </p>
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
          <div className="min-h-0 w-80 space-y-3 overflow-y-auto border-l border-gray-200 bg-gray-50/60 p-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900">
                ✅ Engagements convenus
              </h3>
              <textarea
                className="mt-3 min-h-[140px] w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                value={commitments}
                onChange={(e) => {
                  setCommitments(e.target.value);
                  context.io.saveScratch({ commitments: e.target.value });
                }}
                placeholder="Ce qui a été convenu à l'issue de l'échange…"
              />
              <div className="mt-3 space-y-2">
                <PrimaryButton
                  className="w-full"
                  disabled={commitmentErrors.length > 0 || finishing || busy}
                  onClick={() => void submit()}
                >
                  {finishing ? "Observation en cours…" : "Valider les engagements"}
                </PrimaryButton>
                <SecondaryButton
                  className="w-full"
                  disabled={finishing}
                  onClick={() => setClosingOpen(false)}
                >
                  Reprendre l&apos;échange
                </SecondaryButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
