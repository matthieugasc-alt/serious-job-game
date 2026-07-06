"use client";

/**
 * MailApp — boîte mail façon Gmail.
 * Conversations regroupées par objet normalisé (les mails ENVOYÉS et REÇUS
 * du même fil apparaissent ensemble, dans l'ordre), volet de lecture qui
 * empile les messages (repliables), actions Répondre / Répondre à tous /
 * Transférer, raccourcis clavier (c, Entrée=répondre, r, a, f, j/k, Échap),
 * pièces jointes simplifiées (documents + artefacts de Tools). Tout passe
 * par dispatch : mail_opened, mail_draft_saved, mail_sent.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ArtifactAttachment, ArtifactRef, WorkspaceState, WsMail } from "@/app/lib/engine/workspace";
import { artifactLinkMarkdown, buildArtifactHref, type ParsedArtifactHref } from "@/app/lib/engine/artifactLink";
import { serializeArtifact } from "@/app/workspace/artifacts/serialize";
import { Markdown } from "@/app/workspace/primitives/Markdown";
import { ActorAvatar, PrimaryButton, SecondaryButton } from "@/app/workspace/primitives/ui";
import { AnnotateButton, SelectionAnnotate } from "@/app/workspace/tools/bloc-notes/AnnotateButton";
import { NoteMarker } from "@/app/workspace/tools/bloc-notes/NoteMarker";
import { ArchiveButton } from "@/app/workspace/tools/bibliotheque/ArchiveButton";
import { fmtWhen } from "../format";
import type { AppNavContext, WorkspaceAppProps, WorkspaceDispatch } from "../types";

const DRAFT_ID = "compose";
const DRAFT_DEBOUNCE_MS = 800;

type ComposeMode = "new" | "reply" | "replyall" | "forward";
type Draft = {
  to: string[];
  subject: string;
  body: string;
  attachments: string[];
  artifactRefs: ArtifactRef[];
};

const EMPTY_DRAFT: Draft = { to: [], subject: "", body: "", attachments: [], artifactRefs: [] };
const refKey = (r: Pick<ArtifactRef, "tool" | "id">) => `${r.tool}:${r.id}`;

/** Clé de conversation : objet sans les préfixes Re:/Tr:/Fwd: répétés. */
function convKey(subject: string): string {
  let s = (subject ?? "").trim();
  let prev: string;
  do {
    prev = s;
    s = s.replace(/^\s*(re|r[ée]p|fwd|fw|tr|tf)\s*:\s*/i, "");
  } while (s !== prev);
  return s.trim().toLowerCase() || "(sans objet)";
}
function baseSubject(subject: string): string {
  let s = (subject ?? "").trim();
  let prev: string;
  do {
    prev = s;
    s = s.replace(/^\s*(re|r[ée]p|fwd|fw|tr|tf)\s*:\s*/i, "");
  } while (s !== prev);
  return s.trim() || "(sans objet)";
}

interface Conversation {
  key: string;
  subject: string;
  messages: WsMail[]; // ordre chronologique croissant
  latest: WsMail;
  participants: string[]; // acteurs (hors "player")
  unread: number;
  lastAt: number;
}

const isReceived = (m: WsMail) => m.from !== "player";
const firstLine = (s: string) => s.replace(/[#>*_`]/g, "").split("\n").find((l) => l.trim()) ?? "";

export function MailApp({ workspace, actors, documents, dispatch, openApp, context }: WorkspaceAppProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [composeMode, setComposeMode] = useState<ComposeMode | null>(null);
  const [query, setQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showAttach, setShowAttach] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => {
    const saved = workspace.mailbox.drafts[DRAFT_ID];
    return saved
      ? { to: saved.to, subject: saved.subject, body: saved.body, attachments: [], artifactRefs: saved.artifact_refs ?? [] }
      : EMPTY_DRAFT;
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Refs pour flusher le brouillon AU DÉMONTAGE (changement d'app) : sinon
  // le debounce en attente est annulé et les dernières frappes sont perdues.
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  useEffect(
    () => () => {
      if (!timer.current) return; // rien en attente : déjà persisté
      clearTimeout(timer.current);
      const d = latestDraft.current;
      dispatchRef.current({
        type: "mail_draft_saved",
        draft_id: DRAFT_ID,
        to: d.to,
        subject: d.subject,
        body: d.body,
        artifact_refs: d.artifactRefs.length > 0 ? d.artifactRefs : undefined,
      });
    },
    [],
  );

  const nameOf = (id: string) => (id === "player" ? "Vous" : actors.find((a) => a.actor_id === id)?.name ?? id);

  // ── Regroupement en conversations ────────────────────────────────
  const conversations = useMemo<Conversation[]>(() => {
    const all = [...workspace.mailbox.inbox, ...workspace.mailbox.sent];
    const map = new Map<string, WsMail[]>();
    for (const m of all) {
      const k = convKey(m.subject);
      const arr = map.get(k);
      if (arr) arr.push(m);
      else map.set(k, [m]);
    }
    const convs: Conversation[] = [];
    for (const [key, msgs] of map) {
      msgs.sort((a, b) => a.at - b.at);
      const latest = msgs[msgs.length - 1];
      const participants = [...new Set(msgs.flatMap((m) => [m.from, ...m.to]))].filter((x) => x !== "player");
      const unread = msgs.filter((m) => isReceived(m) && !m.read).length;
      convs.push({ key, subject: baseSubject(latest.subject), messages: msgs, latest, participants, unread, lastAt: latest.at });
    }
    return convs.sort((a, b) => b.lastAt - a.lastAt);
  }, [workspace.mailbox.inbox, workspace.mailbox.sent]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.subject.toLowerCase().includes(q) ||
        c.participants.some((p) => nameOf(p).toLowerCase().includes(q)) ||
        c.messages.some((m) => m.body.toLowerCase().includes(q)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, query]);

  const selected = conversations.find((c) => c.key === selectedKey) ?? null;

  const openConversation = (c: Conversation) => {
    setSelectedKey(c.key);
    setComposeMode(null);
    setExpandedIds(new Set([c.latest.mail_id]));
    for (const m of c.messages) if (isReceived(m) && !m.read) dispatch({ type: "mail_opened", mail_id: m.mail_id });
  };

  // Navigation entrante (« remonter à la source » d'une annotation).
  const requestedMail = context?.mail_id;
  useEffect(() => {
    if (!requestedMail) return;
    const all = [...workspace.mailbox.inbox, ...workspace.mailbox.sent];
    const m = all.find((x) => x.mail_id === requestedMail);
    if (!m) return;
    const c = conversations.find((cv) => cv.key === convKey(m.subject));
    if (c) openConversation(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedMail]);

  // ── Brouillon ────────────────────────────────────────────────────
  const editDraft = (patch: Partial<Draft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        dispatch({
          type: "mail_draft_saved",
          draft_id: DRAFT_ID,
          to: next.to,
          subject: next.subject,
          body: next.body,
          artifact_refs: next.artifactRefs.length > 0 ? next.artifactRefs : undefined,
        });
      }, DRAFT_DEBOUNCE_MS);
      return next;
    });
  };

  // Réconciliation d'un artefact joint depuis un Tool.
  const persistedRefs = workspace.mailbox.drafts[DRAFT_ID]?.artifact_refs ?? [];
  const persistedRefsSig = persistedRefs.map(refKey).join("|");
  useEffect(() => {
    if (persistedRefs.length === 0) return;
    let added = false;
    setDraft((prev) => {
      const have = new Set(prev.artifactRefs.map(refKey));
      const missing = persistedRefs.filter((r) => !have.has(refKey(r)));
      if (missing.length === 0) return prev;
      added = true;
      let body = prev.body;
      for (const r of missing) if (!body.includes(buildArtifactHref(r))) body = `${body}${body.trim() ? "\n\n" : ""}${artifactLinkMarkdown(r)}`;
      return { ...prev, body, artifactRefs: [...prev.artifactRefs, ...missing] };
    });
    if (added) setComposeMode((m) => m ?? "new");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistedRefsSig]);

  const openArtifact = (ref: ParsedArtifactHref) => {
    if (ref.tool === "bloc-notes") openApp("bloc-notes", { note_id: ref.id });
    else if (ref.tool === "decision-engine") openApp("decision", ref.kind === "board" ? { board_id: ref.id } : { decision_id: ref.id });
  };

  const toggleIn = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const canSend = draft.to.length > 0 && draft.subject.trim().length > 0 && draft.body.trim().length > 0;

  // ── Composer : nouveau / répondre / répondre à tous / transférer ──
  const startCompose = (mode: ComposeMode, conv?: Conversation | null) => {
    if (mode === "new" || !conv) {
      setDraft(EMPTY_DRAFT);
    } else {
      const last = conv.latest;
      const base = baseSubject(conv.subject);
      if (mode === "reply") {
        const to = last.from === "player" ? last.to : [last.from];
        setDraft({ ...EMPTY_DRAFT, to: to.filter((x) => x !== "player"), subject: `Re: ${base}` });
      } else if (mode === "replyall") {
        const to = [...new Set([...conv.participants])];
        setDraft({ ...EMPTY_DRAFT, to, subject: `Re: ${base}` });
      } else {
        const quote = `\n\n---------- Message transféré ----------\nDe : ${nameOf(last.from)}\nObjet : ${last.subject}\n\n${last.body}`;
        setDraft({ ...EMPTY_DRAFT, subject: `Tr: ${base}`, body: quote });
      }
    }
    setShowAttach(false);
    setComposeMode(mode);
  };

  const send = () => {
    if (!canSend) return;
    if (timer.current) clearTimeout(timer.current);
    const artifacts: ArtifactAttachment[] = [];
    for (const r of draft.artifactRefs) {
      const snapshot = serializeArtifact(r.tool, r.kind, workspace.toolStates[r.tool], r.id);
      if (snapshot != null) artifacts.push({ ...r, snapshot });
    }
    dispatch({
      type: "mail_sent",
      to: draft.to,
      subject: draft.subject.trim(),
      body: draft.body,
      attachment_document_ids: draft.attachments.length > 0 ? draft.attachments : undefined,
      attachment_artifacts: artifacts.length > 0 ? artifacts : undefined,
    });
    dispatch({ type: "mail_draft_saved", draft_id: DRAFT_ID, to: [], subject: "", body: "" });
    setDraft(EMPTY_DRAFT);
    setComposeMode(null);
    // Rester sur la conversation pour VOIR le mail envoyé s'ajouter au fil.
    setSelectedKey(convKey(draft.subject));
    setExpandedIds(new Set());
  };

  // ── Raccourcis clavier (façon Gmail) ─────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (composeMode) {
        if (e.key === "Escape" && !typing) setComposeMode(null);
        return;
      }
      if (typing) return;
      const idx = selected ? filtered.findIndex((c) => c.key === selected.key) : -1;
      switch (e.key) {
        case "c":
          e.preventDefault();
          startCompose("new");
          break;
        case "Enter":
        case "r":
          if (selected) { e.preventDefault(); startCompose("reply", selected); }
          break;
        case "a":
          if (selected) { e.preventDefault(); startCompose("replyall", selected); }
          break;
        case "f":
          if (selected) { e.preventDefault(); startCompose("forward", selected); }
          break;
        case "j":
          if (filtered.length) { e.preventDefault(); openConversation(filtered[Math.min(filtered.length - 1, idx + 1) < 0 ? 0 : Math.min(filtered.length - 1, idx + 1)]); }
          break;
        case "k":
          if (filtered.length) { e.preventDefault(); openConversation(filtered[Math.max(0, idx - 1)]); }
          break;
        case "Escape":
          setSelectedKey(null);
          break;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composeMode, selected, filtered]);

  return (
    <div className="flex h-full min-h-0">
      {/* Colonne liste des conversations. */}
      <aside className="flex w-80 shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="flex shrink-0 flex-col gap-2 border-b border-gray-100 px-3 py-2.5">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 self-start rounded-full bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            onClick={() => startCompose("new")}
            title="Nouveau message (c)"
          >
            ✏️ Nouveau message
          </button>
          <input
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-800 placeholder:text-gray-400 focus:border-indigo-300 focus:bg-white focus:outline-none"
            placeholder="🔍 Rechercher dans les mails"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-gray-400">{query ? "Aucun résultat." : "Aucun mail."}</li>
          )}
          {filtered.map((c) => {
            const unread = c.unread > 0;
            const active = selectedKey === c.key && !composeMode;
            const who = c.participants.length ? c.participants.map(nameOf).join(", ") : "Vous";
            return (
              <li key={c.key}>
                <button
                  type="button"
                  aria-pressed={active}
                  className={`block w-full border-b border-gray-50 px-4 py-3 text-left transition ${active ? "bg-indigo-50/70" : "hover:bg-gray-50"}`}
                  onClick={() => openConversation(c)}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-xs ${unread ? "font-bold text-gray-900" : "text-gray-600"}`}>
                      {unread && <span aria-hidden className="mr-1.5 inline-block h-2 w-2 rounded-full bg-indigo-600" />}
                      {who}
                      {c.messages.length > 1 && <span className="ml-1 text-[10px] font-medium text-gray-400">({c.messages.length})</span>}
                    </span>
                    <span className="shrink-0 text-[10px] text-gray-400">{fmtWhen(c.lastAt)}</span>
                  </span>
                  <span className={`mt-0.5 block truncate text-sm ${unread ? "font-semibold text-gray-900" : "text-gray-700"}`}>{c.subject}</span>
                  <span className="mt-0.5 block truncate text-xs text-gray-400">
                    {c.latest.from === "player" && <span className="text-gray-400">Vous : </span>}
                    {firstLine(c.latest.body)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Volet lecture / composeur. */}
      <section className="flex min-w-0 flex-1 flex-col bg-gray-50/60">
        {composeMode === "new" ? (
          <Composer
            draft={draft}
            actors={actors}
            documents={documents}
            showAttach={showAttach}
            setShowAttach={setShowAttach}
            editDraft={editDraft}
            toggleIn={toggleIn}
            canSend={canSend}
            send={send}
            onClose={() => setComposeMode(null)}
          />
        ) : selected ? (
          <article className="flex min-h-0 flex-1 flex-col bg-white">
            <header className="flex shrink-0 items-center gap-2 border-b border-gray-200 px-5 py-3">
              <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-gray-900">{selected.subject}</h2>
              <span className="shrink-0 text-[11px] text-gray-400">{selected.messages.length} message{selected.messages.length > 1 ? "s" : ""}</span>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="mx-auto flex w-full max-w-[76ch] flex-col gap-2">
                {selected.messages.map((m) => (
                  <MessageCard
                    key={m.mail_id}
                    mail={m}
                    isLatest={m.mail_id === selected.latest.mail_id}
                    expanded={expandedIds.has(m.mail_id)}
                    onToggle={() =>
                      setExpandedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(m.mail_id)) next.delete(m.mail_id);
                        else next.add(m.mail_id);
                        return next;
                      })
                    }
                    nameOf={nameOf}
                    workspace={workspace}
                    documents={documents}
                    dispatch={dispatch}
                    openApp={openApp}
                    openArtifact={openArtifact}
                  />
                ))}

                {/* Réponse INLINE (bas du fil, façon Gmail) : le fil reste
                    visible au-dessus. Barre d'actions sinon. */}
                {composeMode ? (
                  <Composer
                    inline
                    draft={draft}
                    actors={actors}
                    documents={documents}
                    showAttach={showAttach}
                    setShowAttach={setShowAttach}
                    editDraft={editDraft}
                    toggleIn={toggleIn}
                    canSend={canSend}
                    send={send}
                    onClose={() => setComposeMode(null)}
                  />
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <PrimaryButton className="!px-3 !py-1.5 !text-xs" onClick={() => startCompose("reply", selected)}>↩ Répondre</PrimaryButton>
                    {selected.participants.length > 1 && (
                      <SecondaryButton className="!px-3 !py-1.5 !text-xs" onClick={() => startCompose("replyall", selected)}>↩ Répondre à tous</SecondaryButton>
                    )}
                    <SecondaryButton className="!px-3 !py-1.5 !text-xs" onClick={() => startCompose("forward", selected)}>➡ Transférer</SecondaryButton>
                  </div>
                )}
              </div>
            </div>
          </article>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm text-gray-400">Sélectionnez une conversation ou rédigez un nouveau message.</p>
            <p className="text-[11px] text-gray-300">Raccourcis : <b>c</b> nouveau · <b>Entrée/r</b> répondre · <b>a</b> répondre à tous · <b>f</b> transférer · <b>j/k</b> naviguer · <b>Échap</b> fermer</p>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Carte d'un message dans le fil (repliable) ────────────────────

function MessageCard({
  mail,
  isLatest,
  expanded,
  onToggle,
  nameOf,
  workspace,
  documents,
  dispatch,
  openApp,
  openArtifact,
}: {
  mail: WsMail;
  isLatest: boolean;
  expanded: boolean;
  onToggle: () => void;
  nameOf: (id: string) => string;
  workspace: WorkspaceState;
  documents: WorkspaceAppProps["documents"];
  dispatch: WorkspaceDispatch;
  openApp: (appId: string, ctx?: AppNavContext) => void;
  openArtifact: (ref: ParsedArtifactHref) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const mailSource = (excerpt: string) =>
    ({ kind: "mail", mail_id: mail.mail_id, subject: mail.subject, from: mail.from, at: mail.at, excerpt }) as const;
  const mine = mail.from === "player";

  const body = useMemo(
    () => <Markdown onArtifactClick={openArtifact}>{mail.body}</Markdown>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mail.mail_id, mail.body],
  );

  return (
    <div className={`rounded-xl border bg-white ${isLatest ? "border-gray-200 shadow-sm" : "border-gray-100"}`}>
      <button
        type="button"
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <ActorAvatar actorId={mail.from} name={nameOf(mail.from)} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-gray-800">
            {nameOf(mail.from)} <span className="font-normal text-gray-400">à {mail.to.map(nameOf).join(", ") || "?"}</span>
          </p>
          {!expanded && <p className="truncate text-[11px] text-gray-400">{firstLine(mail.body)}</p>}
        </div>
        <span className="shrink-0 text-[10px] text-gray-400">{fmtWhen(mail.at)}</span>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-3 pb-3">
          <div className="flex items-center justify-end gap-1 py-1.5">
            <NoteMarker workspace={workspace} source={{ kind: "mail", mail_id: mail.mail_id }} side="below" align="right" />
            <AnnotateButton
              source={mailSource(mail.subject)}
              sourceTitle={`Mail : ${mail.subject}`}
              dispatch={dispatch}
              side="below"
              align="right"
              title="Annoter ce mail dans le bloc-notes"
            />
            {!mine && (
              <ArchiveButton
                target={{ kind: "mail", mail_id: mail.mail_id, title: mail.subject, snapshot: { from: mail.from, to: mail.to, subject: mail.subject, body: mail.body, at: mail.at } }}
                libraryState={workspace.toolStates.bibliotheque ?? null}
                dispatch={dispatch}
                side="below"
                align="right"
              />
            )}
          </div>

          {(mail.attachment_document_ids?.length ?? 0) > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {mail.attachment_document_ids!.map((id) => {
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
          {(mail.attachment_artifacts?.length ?? 0) > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {mail.attachment_artifacts!.map((a) => (
                <button
                  key={refKey(a)}
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 transition hover:border-amber-400 hover:bg-amber-100"
                  onClick={() => openArtifact({ tool: a.tool, id: a.id, kind: a.kind })}
                >
                  📎 {a.title}
                </button>
              ))}
            </div>
          )}

          <div ref={bodyRef} className="relative">
            {body}
            <SelectionAnnotate
              containerRef={bodyRef}
              dispatch={dispatch}
              sourceTitle={`Mail : ${mail.subject}`}
              makeSource={(excerpt) => mailSource(excerpt)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Composeur (nouveau / réponse / transfert) ─────────────────────

function Composer({
  draft,
  actors,
  documents,
  showAttach,
  setShowAttach,
  editDraft,
  toggleIn,
  canSend,
  send,
  onClose,
  inline = false,
}: {
  draft: Draft;
  actors: WorkspaceAppProps["actors"];
  documents: WorkspaceAppProps["documents"];
  showAttach: boolean;
  setShowAttach: (v: boolean) => void;
  editDraft: (patch: Partial<Draft>) => void;
  toggleIn: (list: string[], id: string) => string[];
  canSend: boolean;
  send: () => void;
  onClose: () => void;
  /** Rendu carte compacte au bas d'un fil (réponse Gmail) vs plein écran. */
  inline?: boolean;
}) {
  // ⌘/Ctrl + Entrée = Envoyer (depuis l'objet ou le corps).
  const onComposeKey = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (canSend) send();
    }
  };
  return (
    <div className={inline ? "mt-3 flex flex-col rounded-xl border border-indigo-200 bg-white shadow-sm" : "flex min-h-0 flex-1 flex-col bg-white"}>
      <header className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-gray-900">{inline ? "Votre réponse" : draft.subject || "Nouveau message"}</h2>
        <p className="text-[11px] text-gray-400">Brouillon enregistré automatiquement</p>
      </header>
      <div className={inline ? "flex flex-col gap-3 p-4" : "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"}>
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
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${on ? "border-indigo-300 bg-indigo-50 text-indigo-800" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}
                  onClick={() => editDraft({ to: toggleIn(draft.to, a.actor_id) })}
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
          onKeyDown={onComposeKey}
        />
        <textarea
          autoFocus
          className={`${inline ? "min-h-[140px]" : "min-h-[200px] flex-1"} resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm leading-relaxed text-gray-900 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100`}
          placeholder="Rédigez votre mail… (⌘/Ctrl + Entrée pour envoyer)"
          value={draft.body}
          onChange={(e) => editDraft({ body: e.target.value })}
          onKeyDown={onComposeKey}
        />

        {/* Pièces jointes déjà attachées (documents + artefacts). */}
        {(draft.attachments.length > 0 || draft.artifactRefs.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {draft.attachments.map((id) => {
              const doc = documents.find((d) => d.id === id);
              return (
                <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700">
                  📎 {doc?.title ?? id}
                  <button type="button" aria-label="Retirer" className="text-gray-400 hover:text-gray-700" onClick={() => editDraft({ attachments: draft.attachments.filter((x) => x !== id) })}>✕</button>
                </span>
              );
            })}
            {draft.artifactRefs.map((r) => (
              <span key={refKey(r)} className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800" title="Contenu analysé par l'IA">
                📎 {r.title}
                <button
                  type="button"
                  aria-label={`Retirer ${r.title}`}
                  className="text-amber-400 hover:text-amber-700"
                  onClick={() => editDraft({ artifactRefs: draft.artifactRefs.filter((x) => refKey(x) !== refKey(r)), body: draft.body.split("\n").filter((l) => !l.includes(buildArtifactHref(r))).join("\n") })}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-gray-200 px-4 py-3">
        <PrimaryButton disabled={!canSend} onClick={send}>
          Envoyer
          <span className="ml-1.5 rounded bg-white/20 px-1 py-0.5 text-[10px] font-normal">⌘⏎</span>
        </PrimaryButton>
        <SecondaryButton onClick={onClose}>Fermer</SecondaryButton>
        {/* Joindre un document (menu simple). */}
        {documents.length > 0 && (
          <div className="relative ml-auto">
            <button
              type="button"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
              onClick={() => setShowAttach(!showAttach)}
              title="Joindre un document"
            >
              📎 Joindre
            </button>
            {showAttach && (
              <div className="absolute bottom-full right-0 mb-1 max-h-64 w-64 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl">
                <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Documents</p>
                {documents.map((d) => {
                  const on = draft.attachments.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition ${on ? "bg-indigo-50 text-indigo-800" : "text-gray-700 hover:bg-gray-100"}`}
                      onClick={() => editDraft({ attachments: toggleIn(draft.attachments, d.id) })}
                    >
                      <span>{on ? "✓" : "📄"}</span>
                      <span className="truncate">{d.title}</span>
                    </button>
                  );
                })}
                <p className="px-2 pb-0.5 pt-1 text-[10px] text-gray-400">Astuce : depuis une note, un tableau ou une décision, cliquez « 📎 Joindre à l&apos;email ».</p>
              </div>
            )}
          </div>
        )}
      </footer>
    </div>
  );
}
