/**
 * Chat Context Enrichment Helper
 *
 * Builds the operational context blocks injected into the system prompt
 * when the player chats with a colleague/cofounder that the scenario has
 * declared as "context-aware".
 *
 * Opt-in is per-phase, per-actor, via:
 *   phase.chat_context_enrichment[actorId] = ["sent_mails", "kol_profiles", "phase_state"]
 *
 * Available block keys:
 *  - "sent_mails"   — mails sent by the player in the current phase, with
 *                      their response status (replied / silence / pending).
 *  - "kol_profiles" — the contents of the scenario's KOL list document
 *                      (resources.documents[doc_id contains "kol"]).
 *  - "phase_state"  — phase id, title, mail counts.
 *
 * Design constraints:
 *  - Pure function. No fetch, no React, no mutation.
 *  - Returns null when nothing to inject (no opt-in, or no usable data).
 *  - Never invents knowledge — only surfaces what already lives in the
 *    scenario JSON or the live session. The prompt downstream tells the
 *    character to stay humble ("je crois que…", "à mon avis…").
 *  - No scenario-specific branching. Behaviour driven entirely by the
 *    declarative `chat_context_enrichment` map in scenario.json.
 */

import type {
  ActorDefinition,
  DocumentDefinition,
  PhaseDefinition,
  ScenarioDefinition,
  SessionState,
  SentMail,
  InboxMail,
} from "./types";

export type ChatContextBlocks = Record<string, unknown>;

export type BuildChatContextParams = {
  scenario: Pick<ScenarioDefinition, "actors"> & {
    resources?: { documents?: DocumentDefinition[] };
  };
  currentPhase:
    | (Pick<PhaseDefinition, "phase_id" | "title"> & {
        chat_context_enrichment?: Record<string, string[]>;
      })
    | undefined
    | null;
  session: Pick<SessionState, "sentMails" | "inboxMails"> | undefined | null;
  /** The contact the player is currently chatting with (e.g. "alexandre_morel"). */
  contactId: string | undefined | null;
};

/**
 * Build the chat-context blocks for a given contact in the current phase.
 *
 * Returns null when:
 *  - no current phase
 *  - no contact
 *  - the phase has no `chat_context_enrichment` map
 *  - the contact isn't listed in that map
 *  - all requested block keys produce empty data (e.g. "sent_mails"
 *    requested but no mail has been sent yet in this phase)
 */
export function buildChatContext(
  params: BuildChatContextParams
): ChatContextBlocks | null {
  const { scenario, currentPhase, session, contactId } = params;
  if (!currentPhase || !contactId) return null;

  const blockKeys = currentPhase.chat_context_enrichment?.[contactId];
  if (!Array.isArray(blockKeys) || blockKeys.length === 0) return null;

  const blocks: ChatContextBlocks = {};
  const actors: ActorDefinition[] = scenario.actors ?? [];

  // Build a quick id → actor lookup for name resolution in mail blocks.
  const actorById = new Map<string, ActorDefinition>();
  for (const a of actors) actorById.set(a.actor_id, a);

  for (const key of blockKeys) {
    switch (key) {
      case "sent_mails": {
        const block = buildSentMailsBlock({
          sentMails: session?.sentMails ?? [],
          inboxMails: session?.inboxMails ?? [],
          phaseId: currentPhase.phase_id,
          actorById,
        });
        if (block.length > 0) blocks.sent_mails = block;
        break;
      }
      case "kol_profiles": {
        const block = buildKolProfilesBlock({
          documents: scenario.resources?.documents ?? [],
        });
        if (block.length > 0) blocks.kol_profiles = block;
        break;
      }
      case "phase_state": {
        const block = buildPhaseStateBlock({
          phaseId: currentPhase.phase_id,
          phaseTitle: currentPhase.title,
          sentMails: session?.sentMails ?? [],
          inboxMails: session?.inboxMails ?? [],
        });
        if (block) blocks.phase_state = block;
        break;
      }
      default:
        // Unknown key — silently ignore. Allows new keys to be added
        // server-side first without breaking older clients.
        break;
    }
  }

  if (Object.keys(blocks).length === 0) return null;
  return blocks;
}

// ── Block builders ──────────────────────────────────────────────────

type SentMailContextEntry = {
  to_actor_id: string;
  to_name: string;
  to: string;
  subject: string;
  body: string;
  sent_at: number;
  response_status: "replied" | "silence" | "pending";
  response_summary?: string;
};

function buildSentMailsBlock(args: {
  sentMails: SentMail[];
  inboxMails: InboxMail[];
  phaseId: string;
  actorById: Map<string, ActorDefinition>;
}): SentMailContextEntry[] {
  const { sentMails, inboxMails, phaseId, actorById } = args;
  const phaseSent = sentMails.filter((m) => m.phaseId === phaseId);
  if (phaseSent.length === 0) return [];

  // Index inbox mails by their `from` actor for lookup.
  const inboxByFrom = new Map<string, InboxMail[]>();
  for (const m of inboxMails) {
    const list = inboxByFrom.get(m.from) || [];
    list.push(m);
    inboxByFrom.set(m.from, list);
  }

  return phaseSent.map((sent) => {
    // Resolve recipient → actor (the "to" field can be actor_id, email, or name).
    const toRaw = (sent.to || "").trim();
    const toLower = toRaw.toLowerCase();
    const matched =
      [...actorById.values()].find(
        (a) =>
          a.actor_id === toRaw ||
          a.actor_id === toRaw.split("@")[0] ||
          ((a as any).email && String((a as any).email).toLowerCase() === toLower) ||
          (a.name && a.name.toLowerCase() === toLower)
      ) || null;

    const toActorId = matched?.actor_id || toRaw;
    const toName = matched?.name || toRaw;

    // Did this recipient reply after the mail was sent ?
    const replies = (inboxByFrom.get(toActorId) || []).filter((m) => {
      // Inbox mails don't carry a strong sentAt link; we use phaseId equality
      // and the fact the player has only one outbound mail per recipient per
      // phase as a workable proxy. Wrong-shape data here just degrades to
      // "pending" which is safe.
      return m.phaseId === phaseId;
    });

    let response_status: SentMailContextEntry["response_status"] = "pending";
    let response_summary: string | undefined;
    if (replies.length > 0) {
      response_status = "replied";
      const lastReply = replies[replies.length - 1];
      response_summary = (lastReply.body || "").slice(0, 600);
    }

    return {
      to_actor_id: toActorId,
      to_name: toName,
      to: sent.to,
      subject: sent.subject,
      body: sent.body,
      sent_at: sent.sentAt,
      response_status,
      response_summary,
    };
  });
}

type KolProfileEntry = {
  source: string;
  summary: string;
};

function buildKolProfilesBlock(args: {
  documents: DocumentDefinition[];
}): KolProfileEntry[] {
  const { documents } = args;
  // Find any document whose id or label hints at "KOL list".
  const kolDocs = documents.filter((d) => {
    const id = d.doc_id?.toLowerCase() || "";
    const label = d.label?.toLowerCase() || "";
    return id.includes("kol") || label.includes("kol");
  });
  if (kolDocs.length === 0) return [];

  return kolDocs
    .filter((d) => typeof (d as any).content === "string" && (d as any).content.trim().length > 0)
    .map((d) => ({
      source: d.label || d.doc_id,
      // Cap at ~3000 chars so we don't blow the prompt budget. The KOL
      // list document is typically structured per-KOL with section headers,
      // so keeping a generous head still surfaces all relevant profiles.
      summary: ((d as any).content as string).slice(0, 3000),
    }));
}

type PhaseStateEntry = {
  phase_id: string;
  phase_title?: string;
  mails_sent_count: number;
  mails_with_response: number;
};

function buildPhaseStateBlock(args: {
  phaseId: string;
  phaseTitle?: string;
  sentMails: SentMail[];
  inboxMails: InboxMail[];
}): PhaseStateEntry | null {
  const { phaseId, phaseTitle, sentMails, inboxMails } = args;
  const phaseSent = sentMails.filter((m) => m.phaseId === phaseId);
  const phaseInbox = inboxMails.filter((m) => m.phaseId === phaseId);

  // Count distinct senders that replied in-phase.
  const repliedFrom = new Set<string>();
  for (const m of phaseInbox) repliedFrom.add(m.from);

  return {
    phase_id: phaseId,
    phase_title: phaseTitle,
    mails_sent_count: phaseSent.length,
    mails_with_response: repliedFrom.size,
  };
}
