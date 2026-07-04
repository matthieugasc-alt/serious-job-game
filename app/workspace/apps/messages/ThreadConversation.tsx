"use client";

/**
 * ThreadConversation — rendu de conversation d'un fil Messages,
 * PARTAGÉ par l'app Messages et le ChatDock (mini-fenêtres flottantes).
 * Même état (workspace.threads), même dispatch `message_sent` :
 * AUCUNE logique dupliquée — le moteur fait tout le reste.
 */

import type { ActorDef, TranscriptEvent } from "@/app/lib/engine/mechanics";
import type { Thread, WorkspaceAction } from "@/app/lib/engine/workspace";
import { ChatPanel } from "@/app/workspace/primitives/ChatPanel";
import { AnnotateButton } from "@/app/workspace/tools/bloc-notes/AnnotateButton";

/** Projection d'un fil workspace vers le transcript du ChatPanel. */
export function threadToTranscript(t: Thread): TranscriptEvent[] {
  return t.messages.map((m) => ({
    at: m.at,
    channel: "chat" as const,
    role:
      m.from === "player"
        ? ("player" as const)
        : m.from === "system"
          ? ("system" as const)
          : ("actor" as const),
    actor_id: m.actor_id,
    content: m.content,
  }));
}

interface Props {
  thread: Thread;
  actors: ActorDef[];
  busy?: boolean;
  dispatch: (action: WorkspaceAction) => void;
  placeholder?: string;
}

export function ThreadConversation({
  thread,
  actors,
  busy,
  dispatch,
  placeholder,
}: Props) {
  // Libellé de la source : toutes les annotations du fil vont dans la
  // même note « Messages de … ».
  const threadLabel =
    thread.title ??
    thread.participants.map((p) => actors.find((a) => a.actor_id === p)?.name ?? p).join(", ");
  return (
    <ChatPanel
      key={thread.thread_id}
      transcript={threadToTranscript(thread)}
      actors={actors}
      busy={busy}
      placeholder={placeholder ?? "Écrivez votre message…"}
      onSend={(text) =>
        dispatch({ type: "message_sent", thread_id: thread.thread_id, content: text })
      }
      // Icône 📓 au survol de chaque bulle → annotation vers le Bloc-notes
      // (SourceRef message complète : fil, auteur, heure, extrait).
      bubbleExtra={(e) =>
        e.role === "system" ? null : (
          <AnnotateButton
            source={{
              kind: "message",
              thread_id: thread.thread_id,
              actor_id: e.actor_id,
              at: e.at,
              excerpt: e.content,
            }}
            sourceTitle={`Messages de ${threadLabel}`}
            dispatch={dispatch}
            side="above"
            align="right"
            className="mb-2 opacity-0 group-hover:opacity-100"
          />
        )
      }
    />
  );
}
