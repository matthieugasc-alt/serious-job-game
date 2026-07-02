"use client";

/**
 * ChatPanel — primitive de conversation générique.
 * Aucune connaissance métier : affiche un transcript, envoie du texte.
 * Utilisée par entretien, qa, negociation.
 */

import { useEffect, useRef, useState } from "react";
import type { TranscriptEvent, ActorDef } from "@/app/lib/engine/mechanics";

interface Props {
  transcript: TranscriptEvent[];
  actors: ActorDef[];
  onSend: (text: string) => void | Promise<void>;
  busy?: boolean;
  placeholder?: string;
  /** Canaux affichés (défaut : chat + system). */
  channels?: TranscriptEvent["channel"][];
}

export function ChatPanel({
  transcript,
  actors,
  onSend,
  busy,
  placeholder,
  channels = ["chat", "system"],
}: Props) {
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const visible = transcript.filter((e) => channels.includes(e.channel));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visible.length, busy]);

  const nameOf = (e: TranscriptEvent) =>
    e.role === "player"
      ? "Vous"
      : actors.find((a) => a.actor_id === e.actor_id)?.name ?? "Système";

  const submit = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    await onSend(text);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {visible.map((e, i) => (
          <div
            key={i}
            className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
              e.role === "player"
                ? "ml-auto bg-blue-600 text-white"
                : e.role === "system"
                  ? "mx-auto bg-amber-50 text-amber-900"
                  : "bg-gray-100"
            }`}
          >
            <p className="mb-0.5 text-xs font-medium opacity-60">{nameOf(e)}</p>
            <p className="whitespace-pre-wrap">{e.content}</p>
          </div>
        ))}
        {busy && <p className="text-xs italic opacity-50">… en train d'écrire</p>}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 border-t p-3">
        <textarea
          className="min-h-[44px] flex-1 resize-none rounded border px-3 py-2 text-sm"
          value={draft}
          placeholder={placeholder ?? "Votre message…"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <button
          className="rounded bg-black px-4 text-sm text-white disabled:opacity-40"
          disabled={busy || draft.trim().length === 0}
          onClick={() => void submit()}
        >
          Envoyer
        </button>
      </div>
    </div>
  );
}
