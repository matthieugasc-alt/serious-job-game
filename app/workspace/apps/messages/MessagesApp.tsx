"use client";

/**
 * MessagesApp — messagerie interne type Teams.
 * Liste des fils à gauche, conversation à droite (réutilise ChatPanel :
 * bulles, avatars initiales, indicateur de frappe). Envoyer un message
 * dispatch `message_sent` — le moteur fait tout le reste.
 */

import { useState } from "react";
import type { ActorDef, TranscriptEvent } from "@/app/lib/engine/mechanics";
import type { Thread } from "@/app/lib/engine/workspace";
import { ChatPanel } from "@/app/player/primitives/ChatPanel";
import { ActorAvatar } from "@/app/player/primitives/ui";
import { fmtWhen } from "../format";
import type { WorkspaceAppProps } from "../types";

function lastAt(t: Thread): number {
  return t.messages[t.messages.length - 1]?.at ?? 0;
}

function toTranscript(t: Thread): TranscriptEvent[] {
  return t.messages.map((m) => ({
    at: m.at,
    channel: "chat" as const,
    role: m.from === "player" ? ("player" as const) : m.from === "system" ? ("system" as const) : ("actor" as const),
    actor_id: m.actor_id,
    content: m.content,
  }));
}

export function MessagesApp({ workspace, actors, dispatch, busyThreads }: WorkspaceAppProps) {
  const threads = Object.values(workspace.threads).sort((a, b) => lastAt(b) - lastAt(a));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = threads.find((t) => t.thread_id === selectedId) ?? threads[0] ?? null;

  const actorOf = (id: string): ActorDef | undefined => actors.find((a) => a.actor_id === id);
  const titleOf = (t: Thread) =>
    t.title ?? t.participants.map((p) => actorOf(p)?.name ?? p).join(", ");

  if (threads.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50/60">
        <p className="text-sm text-gray-400">Aucune conversation pour le moment.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Liste des fils. */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="shrink-0 border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Conversations</h2>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {threads.map((t) => {
            const active = selected?.thread_id === t.thread_id;
            const last = t.messages[t.messages.length - 1];
            const firstActor = actorOf(t.participants[0]);
            return (
              <li key={t.thread_id}>
                <button
                  type="button"
                  aria-pressed={active}
                  className={`flex w-full items-start gap-2.5 border-b border-gray-50 px-3 py-3 text-left transition ${
                    active ? "bg-indigo-50/70" : "hover:bg-gray-50"
                  }`}
                  onClick={() => setSelectedId(t.thread_id)}
                >
                  <ActorAvatar
                    actorId={t.participants[0] ?? t.thread_id}
                    name={firstActor?.name ?? titleOf(t)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-sm ${t.unread > 0 ? "font-semibold text-gray-900" : "font-medium text-gray-800"}`}>
                        {titleOf(t)}
                      </span>
                      {last && <span className="shrink-0 text-[10px] text-gray-400">{fmtWhen(last.at)}</span>}
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className={`truncate text-xs ${t.unread > 0 ? "text-gray-700" : "text-gray-500"}`}>
                        {last ? last.content : "Nouvelle conversation"}
                      </span>
                      {t.unread > 0 && (
                        <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white">
                          {t.unread > 9 ? "9+" : t.unread}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Conversation. */}
      <section className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <>
            <header className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 py-2.5">
              <div className="flex -space-x-2">
                {selected.participants.slice(0, 3).map((p) => (
                  <ActorAvatar key={p} actorId={p} name={actorOf(p)?.name ?? p} size="sm" />
                ))}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{titleOf(selected)}</p>
                <p className="truncate text-xs text-gray-500">
                  {selected.participants
                    .map((p) => {
                      const a = actorOf(p);
                      return a ? `${a.name} — ${a.role}` : p;
                    })
                    .join(" · ")}
                </p>
              </div>
            </header>
            <div className="min-h-0 flex-1">
              <ChatPanel
                key={selected.thread_id}
                transcript={toTranscript(selected)}
                actors={actors}
                busy={busyThreads?.includes(selected.thread_id)}
                placeholder="Écrivez votre message…"
                onSend={(text) =>
                  dispatch({ type: "message_sent", thread_id: selected.thread_id, content: text })
                }
              />
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center bg-gray-50/60">
            <p className="text-sm text-gray-400">Sélectionnez une conversation.</p>
          </div>
        )}
      </section>
    </div>
  );
}
