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
  ActorIdentity,
  DangerButton,
  ErrorText,
  InstructionBanner,
  PreviousInputs,
  PrimaryButton,
  SecondaryButton,
} from "@/app/player/primitives/ui";
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

  /** Historique lisible d'une proposition (labels des termes). */
  const proposalSummary = (p: JsonObject): string => {
    const t = (p.terms ?? {}) as Record<string, unknown>;
    return terms
      .map((term) => `${term.label} : ${String(t[term.id] ?? "—")}`)
      .join(" · ");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <InstructionBanner text={instructions} />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col border-r border-gray-200">
          {actor && (
            <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-2.5">
              <ActorIdentity actor={actor} />
            </div>
          )}
          {actor ? (
            <div className="min-h-0 flex-1">
              <ChatPanel
                transcript={events}
                actors={context.actors}
                onSend={exchange}
                busy={busy || closing}
              />
            </div>
          ) : (
            <p className="p-4 text-sm text-red-600">
              Acteur introuvable pour ce step (actor_id : {actorId}).
            </p>
          )}
        </div>
        <div className="min-h-0 w-96 space-y-4 overflow-y-auto bg-gray-50/60 p-4">
          <PreviousInputs inputs={context.inputs} />

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900">
              🤝 Termes de l&apos;accord
            </h3>
            <div className="mt-3 space-y-3">
              {terms.map((t) => (
                <label key={t.id} className="block">
                  <span className="text-xs font-semibold text-gray-600">
                    {t.label}
                  </span>
                  <input
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    type={t.type === "number" ? "number" : "text"}
                    value={values[t.id] ?? ""}
                    onChange={(e) => setTerm(t.id, e.target.value)}
                  />
                </label>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              <PrimaryButton
                className="w-full"
                disabled={!actor || termErrors.length > 0 || busy || closing}
                onClick={() => void propose()}
              >
                Proposer ces termes
              </PrimaryButton>
              <SecondaryButton
                className="w-full"
                disabled={
                  proposals.length === 0 || termErrors.length > 0 || busy || closing
                }
                onClick={() => void close(true)}
              >
                {closing
                  ? "Observation en cours…"
                  : "Conclure l'accord aux termes affichés"}
              </SecondaryButton>
              <DangerButton
                className="w-full"
                disabled={busy || closing}
                onClick={() => void close(false)}
              >
                Rompre la négociation
              </DangerButton>
            </div>
          </div>

          {/* Historique des propositions formulées. */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900">
              Historique des propositions
            </h3>
            {proposals.length === 0 ? (
              <p className="mt-2 text-xs text-gray-400">
                Aucune proposition formulée pour l&apos;instant.
              </p>
            ) : (
              <ol className="mt-3 space-y-2">
                {proposals.map((p, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
                      Proposition {i + 1}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-gray-700">
                      {proposalSummary(p)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <ErrorText>{error}</ErrorText>
        </div>
      </div>
    </div>
  );
}
