"use client";

/**
 * EntretienReplay — rejoue le transcript d'un entretien avec des
 * commentaires pédagogiques ponctuels (relance manquée, info déjà
 * disponible, clarification utile). Les commentaires n'existent qu'après
 * la partie ; sans eux, c'est un simple relecteur de conversation.
 */

import type { ThreadMessage } from "@/app/lib/engine/workspace";

export interface ReplayComment {
  index: number;
  text: string;
}

export function EntretienReplay({
  messages,
  comments = [],
  nameOf,
}: {
  messages: ThreadMessage[];
  comments?: ReplayComment[];
  nameOf?: (actorId: string) => string;
}) {
  const byIndex = new Map(comments.map((c) => [c.index, c.text]));
  const conv = messages.filter((m) => m.from !== "system");

  return (
    <div className="space-y-2">
      {conv.map((m, i) => {
        const player = m.from === "player";
        const comment = byIndex.get(i);
        return (
          <div key={i}>
            <div className={`flex ${player ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${player ? "rounded-br-md bg-indigo-600 text-white" : "rounded-bl-md border border-gray-200 bg-white text-gray-800"}`}>
                <p className="mb-0.5 text-[10px] font-medium opacity-70">{player ? "Vous" : nameOf && m.actor_id ? nameOf(m.actor_id) : "Interlocuteur"}</p>
                <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
              </div>
            </div>
            {comment && (
              <div className={`mt-1 flex ${player ? "justify-end" : "justify-start"}`}>
                <p className="max-w-[80%] rounded-lg border-l-2 border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] italic text-amber-900">
                  <span aria-hidden className="mr-1">💡</span>
                  {comment}
                </p>
              </div>
            )}
          </div>
        );
      })}
      {conv.length === 0 && <p className="text-sm text-gray-400">Aucun échange à rejouer.</p>}
    </div>
  );
}
