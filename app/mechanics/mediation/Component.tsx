"use client";

/**
 * mediation/Component — UI : bandeau conflict_brief + ChatPanel trois
 * voix + sélecteur de destinataire (Partie A / Partie B / Les deux).
 * Chaque message joueur → record → io.actorRespond pour CHAQUE partie
 * adressée (directive universelle MEDIATION_DIRECTIVE + params.directive),
 * chaque réponse enregistrée avec son actor_id. "Conclure la médiation"
 * (après min_exchanges) : accord oui/non + termes → record editor →
 * io.observe(artifacts:{resolution}) → onComplete.
 */

import { useEffect, useRef, useState } from "react";
import type {
  ActorDef,
  MechanicProps,
  TranscriptEvent,
} from "@/app/lib/engine/mechanics";
import { ChatPanel } from "@/app/player/primitives/ChatPanel";
import {
  type Recipient,
  resolveMinExchanges,
  buildDirective,
  recipientsFor,
  formatAddressedMessage,
  countPlayerMessages,
  validateResolution,
  buildResolution,
  buildOutput,
  restoreResolution,
} from "./Runtime";

export function MediationComponent({ context, onComplete }: MechanicProps) {
  const params = context.params;
  const partyA = context.actors.find((a) => a.actor_id === params.party_a_actor);
  const partyB = context.actors.find((a) => a.actor_id === params.party_b_actor);
  const conflictBrief =
    typeof params.conflict_brief === "string" ? params.conflict_brief : "";
  const minExchanges = resolveMinExchanges(params);
  const directive = buildDirective(params);

  const transcriptRef = useRef<TranscriptEvent[]>([...context.transcript]);
  const [transcript, setTranscript] = useState<TranscriptEvent[]>(
    transcriptRef.current,
  );
  const [recipient, setRecipient] = useState<Recipient>("both");
  const restored = restoreResolution(context.scratch);
  const [reached, setReached] = useState<boolean>(restored.reached);
  const [terms, setTerms] = useState(restored.terms);
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

  // Boot : messages d'ouverture des deux parties (idempotent StrictMode).
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    const hasActorMessage = transcriptRef.current.some(
      (e) => e.channel === "chat" && e.role === "actor",
    );
    if (hasActorMessage) return;
    const openings: [ActorDef | undefined, unknown][] = [
      [partyA, params.opening_message_a],
      [partyB, params.opening_message_b],
    ];
    for (const [actor, opening] of openings) {
      if (actor && typeof opening === "string" && opening.trim().length > 0) {
        push({
          channel: "chat",
          role: "actor",
          actor_id: actor.actor_id,
          content: opening,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = (r: boolean, t: string) => {
    context.io.saveScratch({ resolution: { reached: r, terms: t } });
  };

  const handleSend = async (text: string) => {
    if (!partyA || !partyB || busy || finishing) return;
    setError(null);
    setBusy(true);
    const targets = recipientsFor(recipient).map((side) =>
      side === "a" ? partyA : partyB,
    );
    push({
      channel: "chat",
      role: "player",
      content: formatAddressedMessage(
        text,
        targets.map((a) => a.name),
      ),
    });
    try {
      // Réponses séquentielles : chaque partie voit ce que l'autre vient
      // de répondre (le transcript grandit entre les deux appels).
      for (const actor of targets) {
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
      }
    } catch {
      setError("Une des parties n'a pas pu répondre. Renvoyez un message pour réessayer.");
    } finally {
      setBusy(false);
    }
  };

  const playerCount = countPlayerMessages(transcript);
  const canClose = playerCount >= minExchanges && !busy && !finishing;
  const resolution = buildResolution(reached, terms);
  const resolutionErrors = validateResolution(resolution);

  const submit = async () => {
    if (doneRef.current || resolutionErrors.length > 0 || busy) return;
    doneRef.current = true;
    setError(null);
    setFinishing(true);
    try {
      const event: Omit<TranscriptEvent, "at"> = {
        channel: "editor",
        role: "player",
        content:
          `Conclusion de la médiation — accord ${resolution.reached ? "trouvé" : "non trouvé"}.\n` +
          `Termes / constat : ${resolution.terms}`,
      };
      // Snapshot AVANT record (context.transcript peut être la référence session).
      const snapshot = [...transcriptRef.current, { at: Date.now(), ...event }];
      push(event);
      const observation = await context.io.observe({
        criteria: context.criteria,
        transcript: snapshot,
        artifacts: { resolution: { ...resolution } },
      });
      onComplete({
        observation,
        output: buildOutput(snapshot, context.actors, resolution),
      });
    } catch {
      doneRef.current = false;
      setFinishing(false);
      setError("L'observation a échoué. Cliquez à nouveau sur « Conclure la médiation ».");
    }
  };

  if (!partyA || !partyB) {
    return (
      <div className="p-8 text-center text-sm text-red-700">
        Partie introuvable pour ce step (params.party_a_actor / party_b_actor invalide).
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-4 border-b bg-gray-50 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide opacity-50">
            Conflit à réguler
          </p>
          <p className="text-sm font-medium">{conflictBrief}</p>
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
              Conclure la médiation
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="border-b bg-red-50 px-4 py-2 text-xs text-red-700">{error}</p>
      )}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b px-4 py-2 text-xs">
            <span className="font-medium opacity-60">À :</span>
            {(
              [
                ["a", partyA.name],
                ["b", partyB.name],
                ["both", "Les deux"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className={`rounded px-2 py-1 ${
                  recipient === value ? "bg-black text-white" : "bg-gray-100"
                }`}
                onClick={() => setRecipient(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            <ChatPanel
              transcript={transcript}
              actors={context.actors}
              onSend={handleSend}
              busy={busy || finishing}
              placeholder="Votre message de médiation…"
            />
          </div>
        </div>
        {closingOpen && (
          <div className="min-h-0 w-80 space-y-3 overflow-y-auto border-l p-4">
            <h3 className="text-sm font-semibold">Conclure la médiation</h3>
            <label className="block">
              <span className="text-xs font-medium opacity-60">Accord trouvé ?</span>
              <select
                className="mt-1 w-full rounded border px-3 py-2 text-sm"
                value={reached ? "oui" : "non"}
                onChange={(e) => {
                  const r = e.target.value === "oui";
                  setReached(r);
                  persist(r, terms);
                }}
              >
                <option value="oui">Oui</option>
                <option value="non">Non</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium opacity-60">Termes / constat</span>
              <textarea
                className="mt-1 min-h-[120px] w-full resize-y rounded border px-3 py-2 text-sm"
                value={terms}
                onChange={(e) => {
                  setTerms(e.target.value);
                  persist(reached, e.target.value);
                }}
                placeholder="Les termes de l'accord, ou le constat de désaccord…"
              />
            </label>
            <button
              className="w-full rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
              disabled={resolutionErrors.length > 0 || finishing || busy}
              onClick={() => void submit()}
            >
              {finishing ? "Observation en cours…" : "Valider la conclusion"}
            </button>
            <button
              className="w-full rounded border px-4 py-2 text-sm disabled:opacity-40"
              disabled={finishing}
              onClick={() => setClosingOpen(false)}
            >
              Reprendre la médiation
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
