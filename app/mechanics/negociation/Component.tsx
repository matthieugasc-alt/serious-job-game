"use client";

/**
 * negociation/Component — UI : ChatPanel (dialogue libre avec l'acteur)
 * + panneau "Termes de l'accord". Le joueur propose des termes, puis
 * conclut ou rompt. Tout échange passe par io.record ; les réponses
 * d'acteur par io.actorRespond. L'IA observe, le moteur décide.
 */

import { useEffect, useRef, useState } from "react";
import type {
  JsonObject,
  MechanicProps,
  TranscriptEvent,
} from "@/app/lib/engine/mechanics";
import { ChatPanel } from "@/app/player/primitives/ChatPanel";
import {
  parseTerms,
  validateTermValues,
  formatProposal,
  buildAgreement,
  buildOutput,
  restoreNegotiation,
} from "./Runtime";

export function NegociationComponent({ context, onComplete }: MechanicProps) {
  const actorId = String(context.params.actor_id ?? "");
  const actor = context.actors.find((a) => a.actor_id === actorId);
  const directive =
    typeof context.params.directive === "string"
      ? context.params.directive
      : undefined;
  const terms = parseTerms(context.params);

  // Transcript miroir : context.transcript peut être une référence
  // détachée de la session — on tient notre propre copie à jour.
  const eventsRef = useRef<TranscriptEvent[]>([...context.transcript]);
  const [events, setEvents] = useState<TranscriptEvent[]>(eventsRef.current);
  const record = (e: Omit<TranscriptEvent, "at">): TranscriptEvent[] => {
    context.io.record(e);
    eventsRef.current = [...eventsRef.current, { at: Date.now(), ...e }];
    setEvents(eventsRef.current);
    return eventsRef.current;
  };

  const restored = restoreNegotiation(context.scratch, terms);
  const [values, setValues] = useState<Record<string, string>>(restored.values);
  const [proposals, setProposals] = useState<JsonObject[]>(restored.proposals);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const termErrors = validateTermValues(terms, values);
  const instructions = String(context.params.instructions ?? "");
  const inputEntries = Object.entries(context.inputs);

  // Message d'ouverture de l'acteur (contenu scénario, via params).
  const openedRef = useRef(false);
  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    const opening = context.params.opening_message;
    if (
      typeof opening === "string" &&
      opening.trim().length > 0 &&
      eventsRef.current.length === 0
    ) {
      record({ channel: "chat", role: "actor", actor_id: actorId, content: opening });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = (nextValues: Record<string, string>, nextProposals: JsonObject[]) => {
    context.io.saveScratch({ terms: nextValues, proposals: nextProposals });
  };

  const setTerm = (id: string, value: string) => {
    const next = { ...values, [id]: value };
    setValues(next);
    persist(next, proposals);
  };

  /** Envoie un message joueur et fait répondre l'acteur. */
  const exchange = async (content: string) => {
    if (!actor || busy || closing) return;
    setBusy(true);
    setError(null);
    try {
      const transcript = record({ channel: "chat", role: "player", content });
      const reply = await context.io.actorRespond({ actor, transcript, directive });
      record({ channel: "chat", role: "actor", actor_id: actor.actor_id, content: reply });
    } catch {
      setError("L'acteur n'a pas pu répondre. Réessayez.");
    } finally {
      setBusy(false);
    }
  };

  const propose = async () => {
    if (termErrors.length > 0 || busy || closing) return;
    const proposal: JsonObject = { at: Date.now(), terms: { ...values } };
    const nextProposals = [...proposals, proposal];
    setProposals(nextProposals);
    persist(values, nextProposals);
    await exchange(formatProposal(terms, values));
  };

  /** Conclusion ou rupture → observation IA puis onComplete. */
  const close = async (concluded: boolean) => {
    if (closing || busy) return;
    if (concluded && termErrors.length > 0) return;
    setClosing(true);
    setError(null);
    try {
      const transcript = record({
        channel: "system",
        role: "system",
        content: concluded ? "Accord conclu." : "Négociation rompue.",
      });
      const agreement = buildAgreement(concluded, terms, values);
      const observation = await context.io.observe({
        criteria: context.criteria,
        transcript,
        artifacts: { agreement, proposals },
      });
      onComplete({ observation, output: buildOutput(agreement, proposals.length) });
    } catch {
      setError("L'observation a échoué. Réessayez.");
      setClosing(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b bg-gray-50 p-3 text-sm">{instructions}</div>
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1 border-r">
          {actor ? (
            <ChatPanel
              transcript={events}
              actors={context.actors}
              onSend={exchange}
              busy={busy || closing}
            />
          ) : (
            <p className="p-4 text-sm text-red-600">
              Acteur introuvable pour ce step (actor_id : {actorId}).
            </p>
          )}
        </div>
        <div className="min-h-0 w-80 space-y-3 overflow-y-auto p-4">
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
          <h3 className="text-sm font-semibold">Termes de l'accord</h3>
          {terms.map((t) => (
            <label key={t.id} className="block">
              <span className="text-xs font-medium opacity-60">{t.label}</span>
              <input
                className="mt-1 w-full rounded border px-3 py-2 text-sm"
                type={t.type === "number" ? "number" : "text"}
                value={values[t.id] ?? ""}
                onChange={(e) => setTerm(t.id, e.target.value)}
              />
            </label>
          ))}
          <p className="text-xs opacity-50">
            {proposals.length} proposition(s) formulée(s)
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="space-y-2">
            <button
              className="w-full rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
              disabled={!actor || termErrors.length > 0 || busy || closing}
              onClick={() => void propose()}
            >
              Proposer ces termes
            </button>
            <button
              className="w-full rounded border border-black px-4 py-2 text-sm disabled:opacity-40"
              disabled={
                proposals.length === 0 || termErrors.length > 0 || busy || closing
              }
              onClick={() => void close(true)}
            >
              {closing ? "Observation en cours…" : "Conclure l'accord aux termes affichés"}
            </button>
            <button
              className="w-full rounded border border-red-600 px-4 py-2 text-sm text-red-600 disabled:opacity-40"
              disabled={busy || closing}
              onClick={() => void close(false)}
            >
              Rompre la négociation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
