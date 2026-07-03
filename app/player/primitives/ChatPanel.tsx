"use client";

/**
 * ChatPanel — primitive de conversation générique.
 * Aucune connaissance métier : affiche un transcript, envoie du texte.
 * Utilisée par entretien, qa, negociation, diagnostic, feedback,
 * formation, mediation. Avatars initiales colorées par acteur,
 * bulles arrondies, zone de saisie propre.
 */

import { useEffect, useRef, useState } from "react";
import type { TranscriptEvent, ActorDef } from "@/app/lib/engine/mechanics";
import { ActorAvatar } from "./ui";

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
    <div className="flex h-full min-h-0 flex-col bg-gray-50/60">
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {visible.map((e, i) => {
          if (e.role === "system") {
            return (
              <div key={i} className="flex justify-center">
                <p className="max-w-[85%] rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs font-medium text-amber-900">
                  {e.content}
                </p>
              </div>
            );
          }
          if (e.role === "player") {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[78%]">
                  <p className="mb-1 pr-1 text-right text-[11px] font-medium text-gray-400">
                    Vous
                  </p>
                  <div className="rounded-2xl rounded-br-md bg-indigo-600 px-3.5 py-2.5 text-sm text-white shadow-sm">
                    <p className="whitespace-pre-wrap leading-relaxed">{e.content}</p>
                  </div>
                </div>
              </div>
            );
          }
          // Message acteur : avatar initiales colorées + bulle blanche.
          return (
            <div key={i} className="flex items-end gap-2">
              <ActorAvatar
                actorId={e.actor_id ?? "system"}
                name={nameOf(e)}
                size="sm"
              />
              <div className="max-w-[78%]">
                <p className="mb-1 pl-1 text-[11px] font-medium text-gray-400">
                  {nameOf(e)}
                </p>
                <div className="rounded-2xl rounded-bl-md border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-800 shadow-sm">
                  <p className="whitespace-pre-wrap leading-relaxed">{e.content}</p>
                </div>
              </div>
            </div>
          );
        })}
        {busy && (
          <div className="flex items-center gap-2 pl-9">
            <span className="inline-flex gap-1 rounded-2xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" />
            </span>
            <p className="text-xs italic text-gray-400">en train d&apos;écrire…</p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="flex shrink-0 items-end gap-2 border-t border-gray-200 bg-white p-3">
        <textarea
          className="min-h-[44px] flex-1 resize-none rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
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
          className="inline-flex h-[44px] items-center justify-center rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:pointer-events-none disabled:opacity-40"
          disabled={busy || draft.trim().length === 0}
          onClick={() => void submit()}
        >
          Envoyer
        </button>
      </div>
    </div>
  );
}
