"use client";

/**
 * MailApp — boîte mail type Outlook épuré.
 * Onglets Réception/Envoyés, lecture (corps markdown, PJ cliquables →
 * app Documents), composeur (destinataires, objet, corps, PJ) avec
 * brouillon auto débouncé. Tout passe par dispatch : mail_opened,
 * mail_draft_saved, mail_sent.
 */

import { useEffect, useRef, useState } from "react";
import type { WsMail } from "@/app/lib/engine/workspace";
import { Markdown } from "@/app/workspace/primitives/Markdown";
import { ActorAvatar, PrimaryButton, SecondaryButton } from "@/app/workspace/primitives/ui";
import { fmtWhen } from "../format";
import type { WorkspaceAppProps } from "../types";

const DRAFT_ID = "compose";
const DRAFT_DEBOUNCE_MS = 800;

type Tab = "inbox" | "sent";
type Draft = { to: string[]; subject: string; body: string; attachments: string[] };

const EMPTY_DRAFT: Draft = { to: [], subject: "", body: "", attachments: [] };

export function MailApp({ workspace, actors, documents, dispatch, openApp }: WorkspaceAppProps) {
  const [tab, setTab] = useState<Tab>("inbox");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => {
    const saved = workspace.mailbox.drafts[DRAFT_ID];
    return saved ? { ...EMPTY_DRAFT, ...saved, attachments: [] } : EMPTY_DRAFT;
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const list = [...(tab === "inbox" ? workspace.mailbox.inbox : workspace.mailbox.sent)].sort(
    (a, b) => b.at - a.at,
  );
  const selected = list.find((m) => m.mail_id === selectedId) ?? null;

  const nameOf = (id: string) =>
    id === "player" ? "Vous" : actors.find((a) => a.actor_id === id)?.name ?? id;

  const openMail = (m: WsMail) => {
    setSelectedId(m.mail_id);
    setComposing(false);
    if (!m.read) dispatch({ type: "mail_opened", mail_id: m.mail_id });
  };

  const editDraft = (patch: Partial<Draft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        dispatch({ type: "mail_draft_saved", draft_id: DRAFT_ID, to: next.to, subject: next.subject, body: next.body });
      }, DRAFT_DEBOUNCE_MS);
      return next;
    });
  };

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  const canSend = draft.to.length > 0 && draft.subject.trim().length > 0 && draft.body.trim().length > 0;

  const send = () => {
    if (!canSend) return;
    if (timer.current) clearTimeout(timer.current);
    dispatch({
      type: "mail_sent",
      to: draft.to,
      subject: draft.subject.trim(),
      body: draft.body,
      attachment_document_ids: draft.attachments.length > 0 ? draft.attachments : undefined,
    });
    setDraft(EMPTY_DRAFT);
    setComposing(false);
    setTab("sent");
    setSelectedId(null);
  };

  const reply = (m: WsMail) => {
    setDraft({
      to: m.from === "player" ? m.to : [m.from],
      subject: m.subject.startsWith("Re:") ? m.subject : `Re: ${m.subject}`,
      body: "",
      attachments: [],
    });
    setComposing(true);
  };

  return (
    <div className="flex h-full min-h-0">
      {/* Liste. */}
      <aside className="flex w-80 shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-100 px-3 py-2.5">
          <div className="flex gap-1" role="tablist">
            {(["inbox", "sent"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  tab === t ? "bg-indigo-50 text-indigo-700" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                }`}
                onClick={() => { setTab(t); setSelectedId(null); }}
              >
                {t === "inbox" ? "Boîte de réception" : "Envoyés"}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            onClick={() => { setComposing(true); setSelectedId(null); }}
          >
            ✏️ Nouveau
          </button>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {list.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-gray-400">
              {tab === "inbox" ? "Aucun mail reçu." : "Aucun mail envoyé."}
            </li>
          )}
          {list.map((m) => {
            const unread = tab === "inbox" && !m.read;
            const active = selectedId === m.mail_id && !composing;
            const who = tab === "inbox" ? nameOf(m.from) : `À : ${m.to.map(nameOf).join(", ")}`;
            return (
              <li key={m.mail_id}>
                <button
                  type="button"
                  aria-pressed={active}
                  className={`block w-full border-b border-gray-50 px-4 py-3 text-left transition ${
                    active ? "bg-indigo-50/70" : "hover:bg-gray-50"
                  }`}
                  onClick={() => openMail(m)}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-xs ${unread ? "font-bold text-gray-900" : "text-gray-600"}`}>
                      {unread && <span aria-hidden className="mr-1.5 inline-block h-2 w-2 rounded-full bg-indigo-600" />}
                      {who}
                    </span>
                    <span className="shrink-0 text-[10px] text-gray-400">{fmtWhen(m.at)}</span>
                  </span>
                  <span className={`mt-0.5 block truncate text-sm ${unread ? "font-semibold text-gray-900" : "text-gray-700"}`}>
                    {m.subject}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-gray-400">{m.body}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Lecture / composeur. */}
      <section className="flex min-w-0 flex-1 flex-col bg-gray-50/60">
        {composing ? (
          <div className="flex min-h-0 flex-1 flex-col bg-white">
            <header className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-gray-900">Nouveau message</h2>
              <p className="text-[11px] text-gray-400">Brouillon enregistré automatiquement</p>
            </header>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
              <div>
                <p className="mb-1 text-xs font-medium text-gray-600">À :</p>
                <div className="flex flex-wrap gap-1.5">
                  {actors.map((a) => {
                    const on = draft.to.includes(a.actor_id);
                    return (
                      <button
                        key={a.actor_id}
                        type="button"
                        aria-pressed={on}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                          on
                            ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                            : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                        }`}
                        onClick={() => editDraft({ to: toggle(draft.to, a.actor_id) })}
                      >
                        {on ? "✓" : "+"} {a.name}
                        <span className="text-[10px] text-gray-400">({a.role})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                placeholder="Objet"
                value={draft.subject}
                onChange={(e) => editDraft({ subject: e.target.value })}
              />
              <textarea
                className="min-h-[180px] flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm leading-relaxed text-gray-900 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                placeholder="Rédigez votre mail…"
                value={draft.body}
                onChange={(e) => editDraft({ body: e.target.value })}
              />
              {documents.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-600">Pièces jointes :</p>
                  <div className="flex flex-wrap gap-1.5">
                    {documents.map((d) => {
                      const on = draft.attachments.includes(d.id);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          aria-pressed={on}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                            on
                              ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                              : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                          }`}
                          onClick={() => editDraft({ attachments: toggle(draft.attachments, d.id) })}
                        >
                          📎 {d.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <footer className="flex shrink-0 items-center gap-2 border-t border-gray-200 px-4 py-3">
              <PrimaryButton disabled={!canSend} onClick={send}>Envoyer</PrimaryButton>
              <SecondaryButton onClick={() => setComposing(false)}>Fermer</SecondaryButton>
            </footer>
          </div>
        ) : selected ? (
          <article className="flex min-h-0 flex-1 flex-col bg-white">
            <header className="shrink-0 border-b border-gray-200 px-5 py-4">
              <h2 className="text-base font-semibold text-gray-900">{selected.subject}</h2>
              <div className="mt-2 flex items-center gap-2.5">
                <ActorAvatar actorId={selected.from} name={nameOf(selected.from)} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-gray-800">{nameOf(selected.from)}</p>
                  <p className="truncate text-[11px] text-gray-500">
                    À : {selected.to.map(nameOf).join(", ")} · {fmtWhen(selected.at)}
                  </p>
                </div>
                <SecondaryButton className="!px-3 !py-1.5 !text-xs" onClick={() => reply(selected)}>
                  ↩ Répondre
                </SecondaryButton>
              </div>
              {(selected.attachment_document_ids?.length ?? 0) > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {selected.attachment_document_ids!.map((id) => {
                    const doc = documents.find((d) => d.id === id);
                    return (
                      <button
                        key={id}
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-800"
                        onClick={() => openApp("documents", { document_id: id })}
                      >
                        📎 {doc?.title ?? id}
                      </button>
                    );
                  })}
                </div>
              )}
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="mx-auto w-full max-w-[72ch]">
                <Markdown>{selected.body}</Markdown>
              </div>
            </div>
          </article>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-gray-400">Sélectionnez un mail ou rédigez-en un nouveau.</p>
          </div>
        )}
      </section>
    </div>
  );
}
