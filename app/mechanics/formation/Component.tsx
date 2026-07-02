"use client";

/**
 * formation/Component — UI : bandeau topic + checklist des objectifs
 * (lecture pendant la session) + ChatPanel. Le joueur explique, l'acteur
 * apprend (directive universelle LEARNER_DIRECTIVE + params.directive).
 * "Terminer la session" active la checklist : le joueur coche les
 * objectifs qu'il estime couverts → record editor →
 * io.observe(artifacts:{objectives_covered}) → onComplete.
 */

import { useEffect, useRef, useState } from "react";
import type { MechanicProps, TranscriptEvent } from "@/app/lib/engine/mechanics";
import { ChatPanel } from "@/app/player/primitives/ChatPanel";
import {
  parseObjectives,
  resolveMinExchanges,
  buildDirective,
  countPlayerMessages,
  buildSummary,
  buildOutput,
  restoreCovered,
} from "./Runtime";

export function FormationComponent({ context, onComplete }: MechanicProps) {
  const params = context.params;
  const actor = context.actors.find((a) => a.actor_id === params.actor_id);
  const topic = typeof params.topic === "string" ? params.topic : "";
  const objectives = parseObjectives(params);
  const minExchanges = resolveMinExchanges(params);
  const directive = buildDirective(params);

  const transcriptRef = useRef<TranscriptEvent[]>([...context.transcript]);
  const [transcript, setTranscript] = useState<TranscriptEvent[]>(
    transcriptRef.current,
  );
  const [covered, setCovered] = useState<string[]>(() =>
    restoreCovered(context.scratch),
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

  // Boot : message d'ouverture de l'apprenant (idempotent sous StrictMode).
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
        directive,
      });
      push({
        channel: "chat",
        role: "actor",
        actor_id: actor.actor_id,
        content: reply,
      });
    } catch {
      setError("L'apprenant n'a pas pu répondre. Renvoyez un message pour réessayer.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) => {
    const next = covered.includes(id)
      ? covered.filter((c) => c !== id)
      : [...covered, id];
    setCovered(next);
    context.io.saveScratch({ objectives_covered: next });
  };

  const playerCount = countPlayerMessages(transcript);
  const canClose = playerCount >= minExchanges && !busy && !finishing;

  const submit = async () => {
    if (doneRef.current || busy) return;
    doneRef.current = true;
    setError(null);
    setFinishing(true);
    try {
      const output = buildOutput(
        transcriptRef.current,
        context.actors,
        objectives,
        covered,
      );
      const event: Omit<TranscriptEvent, "at"> = {
        channel: "editor",
        role: "player",
        content: `Objectifs déclarés couverts :\n${buildSummary(objectives, covered)}`,
      };
      // Snapshot AVANT record (context.transcript peut être la référence session).
      const snapshot = [...transcriptRef.current, { at: Date.now(), ...event }];
      push(event);
      const observation = await context.io.observe({
        criteria: context.criteria,
        transcript: snapshot,
        artifacts: { objectives_covered: output.objectives_covered },
      });
      onComplete({ observation, output });
    } catch {
      doneRef.current = false;
      setFinishing(false);
      setError("L'observation a échoué. Cliquez à nouveau sur « Valider la session ».");
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
            Sujet de la formation
          </p>
          <p className="text-sm font-medium">{topic}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs opacity-60">
            {playerCount}/{minExchanges} message{minExchanges > 1 ? "s" : ""} min.
          </span>
          {!closingOpen && (
            <button
              className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
              disabled={!canClose}
              onClick={() => setClosingOpen(true)}
            >
              Terminer la session
            </button>
          )}
        </div>
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
            placeholder={`Votre explication à ${actor.name}…`}
          />
        </div>
        <div className="min-h-0 w-80 space-y-3 overflow-y-auto p-4">
          <h3 className="text-sm font-semibold">
            {closingOpen
              ? "Objectifs couverts (à cocher)"
              : "Objectifs de la session"}
          </h3>
          <ul className="space-y-2">
            {objectives.map((o) => (
              <li key={o.id} className="text-sm">
                {closingOpen ? (
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={covered.includes(o.id)}
                      onChange={() => toggle(o.id)}
                    />
                    <span>{o.label}</span>
                  </label>
                ) : (
                  <span className="flex items-start gap-2">
                    <span className="opacity-40">•</span>
                    <span>{o.label}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {closingOpen && (
            <>
              <button
                className="w-full rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
                disabled={finishing || busy}
                onClick={() => void submit()}
              >
                {finishing ? "Observation en cours…" : "Valider la session"}
              </button>
              <button
                className="w-full rounded border px-4 py-2 text-sm disabled:opacity-40"
                disabled={finishing}
                onClick={() => setClosingOpen(false)}
              >
                Reprendre la session
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
