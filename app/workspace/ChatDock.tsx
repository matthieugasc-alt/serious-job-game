"use client";

/**
 * ChatDock — mini-bulles de chat flottantes (exigence PO forte).
 * Où qu'on soit dans le workspace (app ou outil), une pastille avatar
 * par fil actif en bas à droite, style Messenger : badge non-lu,
 * indicateur « écrit… » (busyThreads) ; clic → mini-fenêtre de chat
 * (~340×480), plusieurs fenêtres côte à côte, réductibles d'un clic.
 *
 * Le fil complet reste dans l'app Messages : MÊME état
 * (workspace.threads), MÊME dispatch `message_sent`, rendu de
 * conversation PARTAGÉ (ThreadConversation) — aucune logique dupliquée.
 * Monté par le WorkspaceShell, qui le masque quand Messages est ouvert.
 * Les fenêtres ouvertes (openIds) sont contrôlées par le shell : les
 * Toasts s'en servent pour ne pas notifier un fil déjà sous les yeux.
 */

import type { ActorDef } from "@/app/lib/engine/mechanics";
import type { Thread, WorkspaceAction, WorkspaceState } from "@/app/lib/engine/workspace";
import { ActorAvatar } from "@/app/player/primitives/ui";
import { ThreadConversation } from "./apps/messages/ThreadConversation";

/** Fenêtres ouvertes simultanément (les plus anciennes se réduisent). */
const MAX_OPEN = 2;

interface Props {
  workspace: WorkspaceState;
  actors: ActorDef[];
  busyThreads?: string[];
  /** Fils ouverts en mini-fenêtre — état détenu par le shell. */
  openIds: string[];
  onOpenIdsChange: (ids: string[]) => void;
  dispatch: (action: WorkspaceAction) => void;
}

function lastAt(t: Thread): number {
  return t.messages[t.messages.length - 1]?.at ?? 0;
}

export function ChatDock({ workspace, actors, busyThreads, openIds, onOpenIdsChange, dispatch }: Props) {
  const threads = Object.values(workspace.threads).sort((a, b) => lastAt(b) - lastAt(a));

  if (threads.length === 0) return null;

  const actorOf = (id: string): ActorDef | undefined =>
    actors.find((a) => a.actor_id === id);
  const titleOf = (t: Thread) =>
    t.title ?? t.participants.map((p) => actorOf(p)?.name ?? p).join(", ");

  const toggle = (threadId: string) =>
    onOpenIdsChange(
      openIds.includes(threadId)
        ? openIds.filter((id) => id !== threadId)
        : [...openIds.slice(-(MAX_OPEN - 1)), threadId],
    );

  const open = openIds
    .map((id) => threads.find((t) => t.thread_id === id))
    .filter((t): t is Thread => Boolean(t));

  return (
    <div className="fixed bottom-4 right-4 z-40 flex items-end gap-3">
      {/* Mini-fenêtres de chat, côte à côte. */}
      {open.map((t) => {
        const first = t.participants[0];
        return (
          <section
            key={t.thread_id}
            aria-label={`Conversation avec ${titleOf(t)}`}
            className="flex h-[480px] max-h-[70vh] w-[340px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
          >
            <header className="flex shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 py-2">
              <ActorAvatar
                actorId={first ?? t.thread_id}
                name={actorOf(first)?.name ?? titleOf(t)}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">{titleOf(t)}</p>
                <p className="truncate text-[11px] text-gray-500">
                  {busyThreads?.includes(t.thread_id)
                    ? "écrit…"
                    : t.participants
                        .map((p) => actorOf(p)?.role ?? p)
                        .join(" · ")}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Réduire la conversation avec ${titleOf(t)}`}
                className="rounded-md px-1.5 py-0.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                onClick={() => toggle(t.thread_id)}
              >
                —
              </button>
            </header>
            <div className="min-h-0 flex-1">
              <ThreadConversation
                thread={t}
                actors={actors}
                busy={busyThreads?.includes(t.thread_id)}
                dispatch={dispatch}
                placeholder={`Message à ${titleOf(t)}…`}
              />
            </div>
          </section>
        );
      })}

      {/* Pastilles — une par fil actif, badge non-lu + « écrit… ». */}
      <div className="flex flex-col items-center gap-2">
        {threads.map((t) => {
          const first = t.participants[0];
          const isOpen = openIds.includes(t.thread_id);
          const busy = busyThreads?.includes(t.thread_id);
          return (
            <button
              key={t.thread_id}
              type="button"
              title={titleOf(t)}
              aria-pressed={isOpen}
              aria-label={`${isOpen ? "Réduire" : "Ouvrir"} la conversation avec ${titleOf(t)}`}
              className={`relative rounded-full shadow-lg transition hover:scale-105 ${
                isOpen ? "ring-2 ring-indigo-500 ring-offset-2" : ""
              }`}
              onClick={() => toggle(t.thread_id)}
            >
              <ActorAvatar
                actorId={first ?? t.thread_id}
                name={actorOf(first)?.name ?? titleOf(t)}
              />
              {t.unread > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {t.unread > 9 ? "9+" : t.unread}
                </span>
              )}
              {busy && (
                <span
                  aria-label="en train d'écrire"
                  className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white bg-emerald-500"
                >
                  <span className="h-1.5 w-1.5 animate-ping rounded-full bg-white" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
