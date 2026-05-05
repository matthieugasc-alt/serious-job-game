export type MessageRole = "player" | "npc" | "system";

export type ChatMessage = {
  id: string;
  role: MessageRole;
  actor?: string;
  content: string;
  type?: string;
  channel?: string;
  toActor?: string;
  phaseId?: string;
  timestamp: number;
  attachments?: MailAttachment[];
};

export type MailAttachment = {
  id: string;
  label: string;
};

export type InboxMail = {
  id: string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  body: string;
  attachments: MailAttachment[];
  phaseId: string;
  receivedAt: number;
};

export type MailDraft = {
  to: string;
  cc: string;
  subject: string;
  body: string;
  attachments: MailAttachment[];
};

export type SentMail = {
  id: string;
  phaseId: string;
  to: string;
  cc: string;
  subject: string;
  body: string;
  attachments: MailAttachment[];
  sentAt: number;
  kind: "consulate_initial" | "consulate_reply" | "other";
};

export type SessionAction =
  | {
      type: "chat_message_sent";
      phaseId: string;
      content: string;
      timestamp: number;
    }
  | {
      type: "chat_message_received";
      phaseId: string;
      actor: string;
      content: string;
      timestamp: number;
    }
  | {
      type: "mail_received";
      phaseId: string;
      from: string;
      subject: string;
      attachmentIds: string[];
      timestamp: number;
    }
  | {
      type: "mail_sent";
      phaseId: string;
      mailId: string;
      to: string;
      cc: string;
      subject: string;
      attachmentIds: string[];
      timestamp: number;
    }
  | {
      type: "phase_completed";
      phaseId: string;
      timestamp: number;
    }
  | {
      type: "phase_entered";
      phaseId: string;
      timestamp: number;
    }
  | {
      type: "interruption_triggered";
      phaseId: string;
      eventId: string;
      timestamp: number;
    };

export type AdaptiveMode = "autonomy" | "standard" | "guided" | null;

export type TimedEvent = {
  id: string;
  actor: string;
  content: string;
  dueAt: number;
  phaseId: string;
  type: "chat" | "mail";
  subject?: string;
  attachments?: MailAttachment[];
};

export type EndingResult = {
  id: string;
  label: string;
  content: string;
};

export type SessionState = {
  scenario: any;
  currentPhaseIndex: number;
  scores: Record<string, number>;
  totalScore: number;
  flags: Record<string, boolean>;
  adaptiveMode: AdaptiveMode;

  chatMessages: ChatMessage[];
  inboxMails: InboxMail[];
  sentMails: SentMail[];
  actionLog: SessionAction[];

  completedPhases: string[];
  unlockedPhases: string[];

  isFinished: boolean;
  ending: EndingResult | null;
  showDebrief: boolean;

  triggeredInterruptions: string[];
  injectedPhaseEntryEvents: string[];
  pendingTimedEvents: TimedEvent[];

  mailDrafts: Record<string, MailDraft>;
  /** Per-recipient saved drafts, keyed by "phaseId::to" */
  savedDrafts: Record<string, MailDraft>;

  /** Simulated in-game time (ISO string from scenario_start, advanced by sim_speed_multiplier) */
  simulatedTime: string;
  /** Speed multiplier for time progression */
  simSpeedMultiplier: number;
  /** Real wall-clock timestamp (ms since epoch) when session was created */
  realStartTime: number;
};

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalize(value: string | undefined) {
  return (value || "").toLowerCase();
}

function looksLikeMailEvent(msg: any) {
  return normalize(msg?.channel || msg?.type).includes("mail");
}

function pushAction(session: SessionState, action: SessionAction) {
  session.actionLog.push(action);
}

export function addInboxMail(
  session: SessionState,
  {
    from,
    to,
    cc,
    subject,
    body,
    attachments,
    phaseId,
  }: {
    from: string;
    to?: string;
    cc?: string;
    subject?: string;
    body: string;
    attachments?: MailAttachment[];
    phaseId: string;
  }
) {
  const mail: InboxMail = {
    id: makeId("inbox"),
    from,
    to: to || "",
    cc: cc || "",
    subject: subject || "(Sans objet)",
    body,
    attachments: attachments || [],
    phaseId,
    receivedAt: Date.now(),
  };

  session.inboxMails.push(mail);

  pushAction(session, {
    type: "mail_received",
    phaseId,
    from: mail.from,
    subject: mail.subject,
    attachmentIds: mail.attachments.map((a) => a.id),
    timestamp: mail.receivedAt,
  });
}

function addChatMessageInternal(
  session: SessionState,
  message: Omit<ChatMessage, "id" | "timestamp">
) {
  session.chatMessages.push({
    ...message,
    id: makeId("msg"),
    timestamp: Date.now(),
  });
}

export function initializeSession(scenario: any): SessionState {
  const firstPhaseId =
    scenario?.phases?.[0]?.phase_id || scenario?.phases?.[0]?.id || "";

  const state: SessionState = {
    scenario,
    currentPhaseIndex: 0,
    scores: {},
    totalScore: 0,
    flags: { ...(scenario?.state?.flags || {}) },
    adaptiveMode: "guided",

    chatMessages: [],
    inboxMails: [],
    sentMails: [],
    actionLog: [],

    completedPhases: [],
    unlockedPhases: [],
    isFinished: false,
    ending: null,
    showDebrief: false,

    triggeredInterruptions: [],
    injectedPhaseEntryEvents: [],
    pendingTimedEvents: [],
    mailDrafts: {},
    savedDrafts: {},

    simulatedTime: scenario?.timeline?.scenario_start || new Date().toISOString(),
    simSpeedMultiplier: scenario?.timeline?.sim_speed_multiplier || 1,
    realStartTime: Date.now(),
  };

  if (Array.isArray(scenario.initial_events)) {
    for (const event of scenario.initial_events) {
      const eventAttachments = Array.isArray(event.attachments)
        ? event.attachments.map((a: any, idx: number) => ({
            id: a.id || `init_att_${idx}`,
            label: a.label || a.name || `Pièce jointe ${idx + 1}`,
          }))
        : [];
      addChatMessageInternal(state, {
        role: "npc",
        actor: event.actor,
        content: event.content,
        type: event.type,
        phaseId: firstPhaseId,
        ...(eventAttachments.length > 0 ? { attachments: eventAttachments } : {}),
      });

      pushAction(state, {
        type: "chat_message_received",
        phaseId: firstPhaseId,
        actor: event.actor || "npc",
        content: event.content,
        timestamp: Date.now(),
      });
    }
  }

  if (firstPhaseId) {
    pushAction(state, {
      type: "phase_entered",
      phaseId: firstPhaseId,
      timestamp: Date.now(),
    });
  }

  return state;
}

export function getCurrentPhase(session: SessionState) {
  return session.scenario.phases[session.currentPhaseIndex];
}

export function getCurrentPhaseId(session: SessionState) {
  const phase = getCurrentPhase(session);
  return phase?.phase_id || phase?.id;
}

export function getCurrentPhaseCriteria(session: SessionState) {
  const phase = getCurrentPhase(session);
  return phase?.scoring?.criteria || [];
}

export function getPhaseIndexById(scenario: any, phaseId: string) {
  return scenario.phases.findIndex(
    (phase: any) => (phase.phase_id || phase.id) === phaseId
  );
}

export function getNextPhaseIndex(session: SessionState) {
  const currentPhase = getCurrentPhase(session);
  if (!currentPhase) return -1;

  const nextPhaseId = currentPhase.next_phase || currentPhase.next_phase_id;

  if (nextPhaseId) {
    return getPhaseIndexById(session.scenario, nextPhaseId);
  }

  if (session.currentPhaseIndex < session.scenario.phases.length - 1) {
    return session.currentPhaseIndex + 1;
  }

  return -1;
}

export function getScenarioDocuments(session: SessionState) {
  return session.scenario.resources?.documents || [];
}

/**
 * Filter documents by phase availability.
 *
 * @param phases      - ordered array of phase definitions from scenario.phases
 * @param documents   - full array of documents from scenario.resources.documents
 * @param currentPhaseId - ID of the current phase, or null if game hasn't started
 *
 * When currentPhaseId is null (preview / before game start), only globally
 * available documents are returned (those without available_from_phase).
 */
export function filterDocumentsByPhase(
  phases: Array<{ phase_id: string; next_phase?: string }>,
  documents: any[],
  currentPhaseId: string | null
): any[] {
  // Build progression map by walking the next_phase chain
  const byId: Record<string, { phase_id: string; next_phase?: string }> = {};
  for (const p of phases) byId[p.phase_id] = p;
  const targets = new Set(phases.map((p) => p.next_phase).filter(Boolean));
  let head = phases.find((p) => !targets.has(p.phase_id)) || phases[0];
  const progressionMap: Record<string, number> = {};
  let rank = 0;
  let cur: { phase_id: string; next_phase?: string } | undefined = head;
  const visited = new Set<string>();
  while (cur && !visited.has(cur.phase_id)) {
    progressionMap[cur.phase_id] = rank++;
    visited.add(cur.phase_id);
    cur = cur.next_phase ? byId[cur.next_phase] : undefined;
  }
  // Orphan phases get appended at the end
  for (const p of phases) {
    if (!(p.phase_id in progressionMap)) progressionMap[p.phase_id] = rank++;
  }

  const currentRank = currentPhaseId != null
    ? (progressionMap[currentPhaseId] ?? -1)
    : -1; // no phase = before game start → only globals

  return documents.filter((d: any) => {
    // Support hidden_until_phase: hide doc until player reaches that phase
    if (d.hidden_until_phase) {
      const requiredRank = progressionMap[d.hidden_until_phase];
      if (requiredRank != null && currentRank < requiredRank) return false;
    }
    if (!d.available_from_phase) return true; // globally available
    const requiredRank = progressionMap[d.available_from_phase];
    if (requiredRank == null) return true; // unknown phase → show by default
    return currentRank >= requiredRank;
  });
}

export function addPlayerMessage(session: SessionState, content: string, toActor?: string) {
  const phaseId = getCurrentPhaseId(session);

  addChatMessageInternal(session, {
    role: "player",
    actor: "player",
    content,
    type: "chat",
    phaseId,
    toActor,
  });

  pushAction(session, {
    type: "chat_message_sent",
    phaseId,
    content,
    timestamp: Date.now(),
  });
}

export function addAIMessage(
  session: SessionState,
  content: string,
  actor: string
) {
  const phaseId = getCurrentPhaseId(session);

  addChatMessageInternal(session, {
    role: "npc",
    actor,
    content,
    type: "chat",
    phaseId,
  });

  pushAction(session, {
    type: "chat_message_received",
    phaseId,
    actor,
    content,
    timestamp: Date.now(),
  });
}

export function addSystemMessage(session: SessionState, content: string) {
  const phaseId = getCurrentPhaseId(session);

  addChatMessageInternal(session, {
    role: "system",
    actor: "system",
    content,
    type: "system",
    phaseId,
  });
}

export function applyEvaluation(
  session: SessionState,
  matchedCriteria: string[] = [],
  scoreDelta: number = 0,
  flagsToSet: Record<string, boolean> = {}
) {
  const phaseId = getCurrentPhaseId(session);
  const previousPhaseScore = session.scores[phaseId] || 0;

  session.scores[phaseId] = previousPhaseScore + scoreDelta;
  session.totalScore += scoreDelta;

  // Build set of flags reserved for mail_config (cannot be set by chat evaluation)
  const mailReservedFlags = getMailReservedFlags(session);

  for (const [key, value] of Object.entries(flagsToSet)) {
    if (value === true) {
      if (mailReservedFlags.has(key)) continue; // blocked: only mail send can set this
      session.flags[key] = true;
    }
  }

  for (const criterionId of matchedCriteria) {
    if (mailReservedFlags.has(criterionId)) continue; // blocked: only mail send can set this
    session.flags[criterionId] = true;
  }

  if (isCurrentPhaseValidatedByRules(session)) {
    unlockCurrentPhase(session);
  }
}

/**
 * Check if an NPC response contains failure keywords defined in the current phase's failure_rules.
 * Used for loop-back mechanics (e.g., DSI refuses → player goes back to prospection).
 */
export function checkNpcFailureKeywords(session: SessionState, npcMessage: string): boolean {
  const phase = getCurrentPhase(session);
  const rules = (phase as any)?.failure_rules;
  if (!rules?.npc_keywords || !Array.isArray(rules.npc_keywords)) return false;
  const lower = npcMessage.toLowerCase();
  return rules.npc_keywords.some((kw: string) => lower.includes(kw.toLowerCase()));
}

/**
 * Check if an NPC response contains success keywords defined in the current phase's success_rules.
 * Used for mechanics where an NPC response triggers flag-setting (e.g., KOL interested → set kol_interested).
 * Returns the flags to set if keywords matched, or null if no match.
 */
export function checkNpcSuccessKeywords(session: SessionState, npcMessage: string): Record<string, boolean> | null {
  const phase = getCurrentPhase(session);
  const rules = (phase as any)?.success_rules;
  if (!rules?.npc_keywords || !Array.isArray(rules.npc_keywords)) return null;
  const lower = npcMessage.toLowerCase();
  const matched = rules.npc_keywords.some((kw: string) => lower.includes(kw.toLowerCase()));
  if (!matched) return null;
  return rules.set_flags && typeof rules.set_flags === "object" ? rules.set_flags : null;
}

/**
 * Handle phase failure: reset flags, navigate to failure phase, inject failure events.
 * Returns true if failure was handled, false if no failure_rules exist.
 */
export function handlePhaseFailure(session: SessionState): boolean {
  const phase = getCurrentPhase(session);
  const rules = (phase as any)?.failure_rules;
  if (!rules?.next_phase) return false;

  // Reset specified flags
  if (Array.isArray(rules.reset_flags)) {
    for (const flag of rules.reset_flags) {
      session.flags[flag] = false;
    }
  }

  // Navigate to failure phase
  const idx = getPhaseIndexById(session.scenario, rules.next_phase);
  if (idx === -1) return false;

  session.currentPhaseIndex = idx;
  addSystemMessage(session, rules.message || "Retour à la phase précédente.");

  pushAction(session, {
    type: "phase_entered",
    phaseId: rules.next_phase,
    timestamp: Date.now(),
  });

  // Inject failure-specific entry events (if provided)
  if (Array.isArray(rules.entry_events) && rules.entry_events.length > 0) {
    for (const evt of rules.entry_events) {
      if (evt.channel === "mail" && evt.subject) {
        addInboxMail(session, {
          from: evt.actor,
          subject: evt.subject,
          body: evt.content,
          phaseId: rules.next_phase,
        });
      } else {
        addAIMessage(session, evt.content, evt.actor);
      }
    }
  } else {
    // Fall back to destination phase entry events
    injectPhaseEntryEvents(session);
  }

  return true;
}

/**
 * Returns the set of flag names that are reserved for mail_config.on_send_flags
 * across ALL phases. These flags can only be set by handleSendMail, never by chat evaluation.
 */
function getMailReservedFlags(session: SessionState): Set<string> {
  const reserved = new Set<string>();
  const phases = session.scenario?.phases || [];
  for (const phase of phases) {
    const onSendFlags = phase?.mail_config?.on_send_flags;
    if (onSendFlags && typeof onSendFlags === "object") {
      for (const key of Object.keys(onSendFlags)) {
        reserved.add(key);
      }
    }
  }
  return reserved;
}

export function updateAdaptiveMode(session: SessionState) {
  const phaseId = getCurrentPhaseId(session);
  const phaseScore = session.scores[phaseId] || 0;

  if (phaseScore >= 4) {
    session.adaptiveMode = "autonomy";
  } else if (phaseScore >= 2) {
    session.adaptiveMode = "standard";
  } else {
    session.adaptiveMode = "guided";
  }
}

function isCurrentPhaseValidatedByRules(session: SessionState): boolean {
  const phase = getCurrentPhase(session);
  const phaseId = getCurrentPhaseId(session);

  if (!phase || !phaseId) return false;

  const completionRules = phase.completion_rules;

  // If completion_rules are defined, use them
  if (completionRules) {
    // Check required_player_evidence FIRST — hard gate on player's own messages
    // This ensures the player has actually mentioned key concepts, not just received them from NPCs
    if (Array.isArray(completionRules.required_player_evidence) && completionRules.required_player_evidence.length > 0) {
      const phaseConv = getPhaseConversation(session);
      const playerText = phaseConv
        .filter((m) => m.role === "player")
        .map((m) => m.content.toLowerCase())
        .join(" ");
      const allEvidenceMet = completionRules.required_player_evidence.every(
        (evidence: { keywords: string[]; min_matches: number }) => {
          const matched = evidence.keywords.filter((kw: string) => playerText.includes(kw.toLowerCase()));
          return matched.length >= (evidence.min_matches || 1);
        }
      );
      if (!allEvidenceMet) {
        return false; // Hard block: player hasn't demonstrated required knowledge
      }
    }

    // Check required_npc_evidence — hard gate on NPC/AI messages
    // This ensures the AI character has actually confirmed something
    // (e.g., Thomas says "I'll send the contract" before the phase can advance)
    if (Array.isArray(completionRules.required_npc_evidence) && completionRules.required_npc_evidence.length > 0) {
      const phaseConv = getPhaseConversation(session);
      const npcText = phaseConv
        .filter((m) => (m as any).role === "npc" || (m as any).role === "assistant")
        .map((m) => m.content.toLowerCase())
        .join(" ");
      const allNpcEvidenceMet = completionRules.required_npc_evidence.every(
        (evidence: { keywords: string[]; min_matches: number }) => {
          const matched = evidence.keywords.filter((kw: string) => npcText.includes(kw.toLowerCase()));
          return matched.length >= (evidence.min_matches || 1);
        }
      );
      if (!allNpcEvidenceMet) {
        return false; // Hard block: NPC hasn't confirmed the expected outcome
      }
    }

    // Check min_score: validate if phase score >= threshold
    if (completionRules.min_score !== undefined) {
      const phaseScore = session.scores[phaseId] || 0;
      if (phaseScore >= completionRules.min_score) {
        return true;
      }
    }

    // Check any_flags: validate if any of the listed flags are true
    if (Array.isArray(completionRules.any_flags)) {
      if (completionRules.any_flags.some((flag: string) => !!session.flags[flag])) {
        return true;
      }
    }

    // Check all_flags: validate if all listed flags are true
    if (Array.isArray(completionRules.all_flags)) {
      if (
        completionRules.all_flags.length > 0 &&
        completionRules.all_flags.every((flag: string) => !!session.flags[flag])
      ) {
        return true;
      }
    }

    // Check max_exchanges: validate if message count exceeds threshold
    // NOTE: max_exchanges does NOT bypass required_player_evidence.
    // If the player never said the right things, the phase doesn't advance
    // just because they sent enough messages. This prevents brute-forcing.
    // max_exchanges only acts as a gate when combined with OTHER passing
    // conditions (min_score, flags) — or as a standalone if there's no
    // required_player_evidence defined.
    if (completionRules.max_exchanges !== undefined) {
      const phaseConversation = getPhaseConversation(session);
      const exchangeCount = phaseConversation.length;
      if (exchangeCount >= completionRules.max_exchanges) {
        // If required_player_evidence was already checked and PASSED above
        // (the function didn't return false at that check), then we can advance.
        // If it FAILED, we already returned false earlier, so we won't reach here.
        return true;
      }
    }

    return false;
  }

  // No completion_rules defined: auto-validate after player has sent enough messages
  // (for phases that rely on AI evaluation at the end rather than flag-based progression)
  const phaseConversation = getPhaseConversation(session);
  const playerMessages = phaseConversation.filter((m) => m.role === "player").length;
  const minPlayerMessages = phase.min_player_messages || 2;
  return playerMessages >= minPlayerMessages;
}

export function unlockCurrentPhase(session: SessionState) {
  const phaseId = getCurrentPhaseId(session);
  if (!session.unlockedPhases.includes(phaseId)) {
    session.unlockedPhases.push(phaseId);
  }
}

export function isCurrentPhaseValidated(session: SessionState) {
  const phaseId = getCurrentPhaseId(session);
  return session.unlockedPhases.includes(phaseId);
}

export function markCurrentPhaseCompleted(session: SessionState) {
  const phaseId = getCurrentPhaseId(session);
  if (!session.completedPhases.includes(phaseId)) {
    session.completedPhases.push(phaseId);

    pushAction(session, {
      type: "phase_completed",
      phaseId,
      timestamp: Date.now(),
    });
  }
}

function countTrueFlags(session: SessionState, names: string[]) {
  return names.filter((name) => !!session.flags[name]).length;
}

function countRequiredAttachments(sentMails: SentMail[]) {
  return sentMails.reduce((acc, mail) => acc + (mail.attachments?.length || 0), 0);
}

export function computeEnding(session: SessionState): EndingResult {
  const scenario = session.scenario;

  // If no endings defined, return default
  if (!Array.isArray(scenario.endings)) {
    return {
      id: "default",
      label: "Fin",
      content: "Scénario terminé.",
    };
  }

  // Sort endings by priority (descending), then check each ending's conditions
  const sortedEndings = [...scenario.endings].sort(
    (a: any, b: any) => (b.priority ?? 0) - (a.priority ?? 0)
  );

  for (const ending of sortedEndings) {
    const conditions = ending.conditions;
    if (!conditions) continue;

    let conditionsMet = true;

    // Check min_score
    if (conditions.min_score !== undefined) {
      if (session.totalScore < conditions.min_score) {
        conditionsMet = false;
      }
    }

    // Check min_core_flags: count of true flags from core_flags list >= value
    // core_flags list can be on the conditions object or at scenario level
    if (
      conditionsMet &&
      conditions.min_core_flags !== undefined
    ) {
      const coreFlagsList = Array.isArray(conditions.core_flags)
        ? conditions.core_flags
        : Array.isArray(scenario.core_flags)
          ? scenario.core_flags
          : [];
      if (coreFlagsList.length > 0) {
        const coreFlagCount = countTrueFlags(session, coreFlagsList);
        if (coreFlagCount < conditions.min_core_flags) {
          conditionsMet = false;
        }
      }
    }

    // Check min_execution_flags: count of true flags from execution_flags list >= value
    // execution_flags list can be on the conditions object or at scenario level
    if (
      conditionsMet &&
      conditions.min_execution_flags !== undefined
    ) {
      const execFlagsList = Array.isArray(conditions.execution_flags)
        ? conditions.execution_flags
        : Array.isArray(scenario.execution_flags)
          ? scenario.execution_flags
          : [];
      if (execFlagsList.length > 0) {
        const executionFlagCount = countTrueFlags(session, execFlagsList);
        if (executionFlagCount < conditions.min_execution_flags) {
          conditionsMet = false;
        }
      }
    }

    // Check min_mails_sent
    if (
      conditionsMet &&
      conditions.min_mails_sent !== undefined
    ) {
      if (session.sentMails.length < conditions.min_mails_sent) {
        conditionsMet = false;
      }
    }

    // Check mail_checks: array of checks like {type: "mail_has_body", mail_kind: "consulate_initial"}
    if (
      conditionsMet &&
      Array.isArray(conditions.mail_checks)
    ) {
      for (const check of conditions.mail_checks) {
        const mail = session.sentMails.find(
          (m) => m.kind === check.mail_kind
        );

        if (check.type === "mail_has_body") {
          if (!mail || !mail.body?.trim()) {
            conditionsMet = false;
            break;
          }
        } else if (check.type === "mail_has_attachments") {
          if (!mail || !mail.attachments || mail.attachments.length === 0) {
            conditionsMet = false;
            break;
          }
        }
      }
    }

    // If all conditions pass, that's the ending
    if (conditionsMet) {
      return {
        id: ending.id || "ending",
        label: ending.label || "Fin",
        content: ending.content || "Scénario terminé.",
      };
    }
  }

  // If none match, use scenario.default_ending
  if (scenario.default_ending) {
    return {
      id: scenario.default_ending.id || "default",
      label: scenario.default_ending.label || "Fin",
      content: scenario.default_ending.content || "Scénario terminé.",
    };
  }

  // Fallback ending
  return {
    id: "default",
    label: "Fin",
    content: "Scénario terminé.",
  };
}

export function finishScenario(session: SessionState) {
  session.isFinished = true;
  session.ending = computeEnding(session);
  session.showDebrief = false;
}

export function openDebrief(session: SessionState) {
  session.showDebrief = true;
}

export function buildDebrief(session: SessionState) {
  return {
    totalScore: session.totalScore,
    strengths: [],
    weaknesses: [],
  };
}

function getAllInterruptionsForPhase(phase: any) {
  const interruptions: any[] = [];

  if (Array.isArray(phase?.interruptions)) {
    interruptions.push(...phase.interruptions);
  }

  if (Array.isArray(phase?.trigger_events)) {
    interruptions.push(...phase.trigger_events);
  }

  if (Array.isArray(phase?.subphases)) {
    for (const subphase of phase.subphases) {
      if (Array.isArray(subphase?.interruptions)) {
        interruptions.push(...subphase.interruptions);
      }
      if (Array.isArray(subphase?.trigger_events)) {
        interruptions.push(...subphase.trigger_events);
      }
    }
  }

  return interruptions;
}

function getPhaseConversation(session: SessionState) {
  const phaseId = getCurrentPhaseId(session);
  return session.chatMessages.filter((msg) => msg.phaseId === phaseId);
}

export function scheduleInterruption(session: SessionState) {
  const phase = getCurrentPhase(session);
  const phaseId = getCurrentPhaseId(session);

  if (!phase || !phaseId) return;

  const phaseConversation = getPhaseConversation(session);

  const playerMessagesInPhase = phaseConversation.filter(
    (msg) => msg.role === "player"
  ).length;

  const npcChatMessagesInPhase = phaseConversation.filter(
    (msg) => msg.role === "npc" && msg.type === "chat"
  ).length;

  const interruptions = getAllInterruptionsForPhase(phase);

  if (!interruptions.length) return;

  const nextInterruption = interruptions.find((interruption) => {
    const interruptId =
      interruption.interrupt_id || interruption.event_id || interruption.id;
    // Skip interruptions with no content or no ID — they would produce empty/generic messages
    if (!interruptId || !interruption.content?.trim()) return false;
    return (
      !session.triggeredInterruptions.includes(interruptId) &&
      !session.pendingTimedEvents.some((e) => e.id === interruptId)
    );
  });

  if (!nextInterruption) return;

  const interruptId =
    nextInterruption.interrupt_id ||
    nextInterruption.event_id ||
    nextInterruption.id;

  // Read trigger from interruption definition
  const trigger = nextInterruption.trigger;

  if (!trigger) return;

  // after_exchanges: schedule when min_player_messages AND min_npc_messages met, with delay_ms
  if (trigger.type === "after_exchanges") {
    const minPlayerMessages = trigger.min_player_messages || 1;
    const minNpcMessages = trigger.min_npc_messages || 1;
    const delayMs = trigger.delay_ms || 0;

    if (
      playerMessagesInPhase >= minPlayerMessages &&
      npcChatMessagesInPhase >= minNpcMessages
    ) {
      session.pendingTimedEvents.push({
        id: interruptId,
        actor:
          nextInterruption.actor ||
          nextInterruption.source_actor ||
          "unknown",
        content: nextInterruption.content || "",
        dueAt: Date.now() + delayMs,
        phaseId,
        type: nextInterruption.type || "chat",
      });
    }
  }
  // after_delay: schedule with delay_ms from phase entry
  else if (trigger.type === "after_delay") {
    const delayMs = trigger.delay_ms || 0;
    session.pendingTimedEvents.push({
      id: interruptId,
      actor:
        nextInterruption.actor ||
        nextInterruption.source_actor ||
        "unknown",
      content: nextInterruption.content || "",
      dueAt: Date.now() + delayMs,
      phaseId,
      type: nextInterruption.type || "chat",
    });
  }
  // on_phase_entry: immediate
  else if (trigger.type === "on_phase_entry") {
    session.pendingTimedEvents.push({
      id: interruptId,
      actor:
        nextInterruption.actor ||
        nextInterruption.source_actor ||
        "unknown",
      content: nextInterruption.content || "",
      dueAt: Date.now(),
      phaseId,
      type: nextInterruption.type || "chat",
    });
  }
}

export function flushDueTimedEvents(session: SessionState) {
  if (!session.pendingTimedEvents.length) return false;

  const now = Date.now();
  const dueEvents = session.pendingTimedEvents.filter((e) => e.dueAt <= now);
  if (!dueEvents.length) return false;

  session.pendingTimedEvents = session.pendingTimedEvents.filter(
    (e) => e.dueAt > now
  );

  for (const event of dueEvents) {
    if (session.triggeredInterruptions.includes(event.id)) {
      continue;
    }

    session.triggeredInterruptions.push(event.id);

    // Skip events with no meaningful content — prevents generic/empty messages
    if (!event.content?.trim()) continue;

    // Skip events whose phase no longer matches the current phase — prevents stale interruptions
    const currentPhaseId = getCurrentPhaseId(session);
    if (event.phaseId && currentPhaseId && event.phaseId !== currentPhaseId) continue;

    pushAction(session, {
      type: "interruption_triggered",
      phaseId: event.phaseId,
      eventId: event.id,
      timestamp: Date.now(),
    });

    if (event.type === "mail") {
      addInboxMail(session, {
        from: event.actor,
        subject: event.subject,
        body: event.content,
        attachments: event.attachments || [],
        phaseId: event.phaseId,
      });
    } else {
      addChatMessageInternal(session, {
        role: "npc",
        actor: event.actor,
        content: event.content,
        type: "interruption",
        phaseId: event.phaseId,
        ...(event.attachments && event.attachments.length > 0 ? { attachments: event.attachments } : {}),
      });

      pushAction(session, {
        type: "chat_message_received",
        phaseId: event.phaseId,
        actor: event.actor,
        content: event.content,
        timestamp: Date.now(),
      });
    }
  }

  return true;
}

export function injectPhaseEntryEvents(session: SessionState) {
  const phase = getCurrentPhase(session);
  const phaseId = getCurrentPhaseId(session);

  if (!phase || !phaseId) return;

  const introKey = `${phaseId}::intro`;
  if (
    phase.intro_message &&
    !session.injectedPhaseEntryEvents.includes(introKey)
  ) {
    addChatMessageInternal(session, {
      role: "system",
      actor: "system",
      content: phase.intro_message,
      type: "phase_intro",
      phaseId,
    });
    session.injectedPhaseEntryEvents.push(introKey);
  }

  const entryEvents: any[] = [];

  if (Array.isArray(phase.entry_events)) {
    entryEvents.push(...phase.entry_events);
  }

  if (Array.isArray(phase.system_messages)) {
    entryEvents.push(...phase.system_messages);
  }

  if (Array.isArray(phase.incoming)) {
    entryEvents.push(...phase.incoming);
  }

  if (Array.isArray(phase.trigger_events)) {
    entryEvents.push(...phase.trigger_events);
  }

  for (const event of entryEvents) {
    const eventId =
      event.message_id || event.event_id || event.id || `${phaseId}::${event.content}`;
    const key = `${phaseId}::${eventId}`;

    if (session.injectedPhaseEntryEvents.includes(key)) continue;

    const actor = event.source_actor || event.actor || "system";
    const content = event.content || "";
    const attachments = Array.isArray(event.attachments)
      ? event.attachments.map((a: any, idx: number) => ({
          id: a.id || `${eventId}_att_${idx}`,
          label: a.label || a.name || `Pièce jointe ${idx + 1}`,
        }))
      : [];
    const subject =
      event.subject || event.title || "Nouveau message";

    const delayMs = event.delay_ms || 0;
    const useDelay = delayMs > 0;

    // Skip chat events with no meaningful content — prevents empty/generic messages
    if (!looksLikeMailEvent(event) && !content.trim()) {
      session.injectedPhaseEntryEvents.push(key);
      continue;
    }

    // Determine if this is a mail or chat event
    if (looksLikeMailEvent(event)) {
      if (useDelay) {
        session.pendingTimedEvents.push({
          id: key,
          actor,
          content,
          dueAt: Date.now() + delayMs,
          phaseId,
          type: "mail",
          subject,
          attachments,
        });
      } else {
        addInboxMail(session, {
          from: actor,
          subject,
          body: content,
          attachments,
          phaseId,
        });
      }
    } else {
      if (useDelay) {
        session.pendingTimedEvents.push({
          id: key,
          actor,
          content,
          dueAt: Date.now() + delayMs,
          phaseId,
          type: "chat",
          attachments: attachments.length > 0 ? attachments : undefined,
        });
      } else {
        addChatMessageInternal(session, {
          role: "npc",
          actor,
          content,
          type: event.channel || event.type || "incoming",
          phaseId,
          ...(attachments.length > 0 ? { attachments } : {}),
        });

        pushAction(session, {
          type: "chat_message_received",
          phaseId,
          actor,
          content,
          timestamp: Date.now(),
        });
      }
    }

    session.injectedPhaseEntryEvents.push(key);
  }
}

export function updateMailDraft(
  session: SessionState,
  phaseId: string,
  patch: Partial<MailDraft>
) {
  const previous = session.mailDrafts[phaseId] || {
    to: "",
    cc: "",
    subject: "",
    body: "",
    attachments: [],
  };

  session.mailDrafts[phaseId] = {
    ...previous,
    ...patch,
  };
}

export function toggleMailAttachment(
  session: SessionState,
  phaseId: string,
  attachment: MailAttachment
) {
  const draft = session.mailDrafts[phaseId] || {
    to: "",
    cc: "",
    subject: "",
    body: "",
    attachments: [],
  };

  const exists = draft.attachments.some((a) => a.id === attachment.id);

  session.mailDrafts[phaseId] = {
    ...draft,
    attachments: exists
      ? draft.attachments.filter((a) => a.id !== attachment.id)
      : [...draft.attachments, attachment],
  };
}

export function sendCurrentPhaseMail(
  session: SessionState,
  kind: string
) {
  const phaseId = getCurrentPhaseId(session);
  const phase = getCurrentPhase(session);
  const draft = session.mailDrafts[phaseId] || {
    to: "",
    cc: "",
    subject: "",
    body: "",
    attachments: [],
  };

  const mail: SentMail = {
    id: makeId("mail"),
    phaseId,
    to: draft.to,
    cc: draft.cc,
    subject: draft.subject,
    body: draft.body,
    attachments: draft.attachments,
    sentAt: Date.now(),
    kind: (kind as any) || "other",
  };

  session.sentMails.push(mail);

  pushAction(session, {
    type: "mail_sent",
    phaseId,
    mailId: mail.id,
    to: mail.to,
    cc: mail.cc,
    subject: mail.subject,
    attachmentIds: mail.attachments.map((a) => a.id),
    timestamp: mail.sentAt,
  });

  // Apply flags from mail_config if available
  const mailConfig = phase?.mail_config;
  if (mailConfig && mailConfig.on_send_flags) {
    // on_send_flags is Record<string, boolean>
    for (const [flag, value] of Object.entries(mailConfig.on_send_flags)) {
      session.flags[flag] = value as boolean;
    }
  }

  // Generic system message
  addSystemMessage(session, `Mail envoyé.`);
}

export function completeCurrentPhaseAndAdvance(session: SessionState) {
  const currentPhaseId = getCurrentPhaseId(session);

  if (
    currentPhaseId &&
    !session.completedPhases.includes(currentPhaseId)
  ) {
    session.completedPhases.push(currentPhaseId);

    pushAction(session, {
      type: "phase_completed",
      phaseId: currentPhaseId,
      timestamp: Date.now(),
    });
  }

  const nextPhaseIndex = getNextPhaseIndex(session);

  if (nextPhaseIndex === -1) {
    finishScenario(session);
    addSystemMessage(
      session,
      "Le scénario est terminé. Consulte le dénouement."
    );
    return;
  }

  const nextPhase = session.scenario.phases[nextPhaseIndex];
  const nextPhaseId = nextPhase?.phase_id || nextPhase?.id;

  session.currentPhaseIndex = nextPhaseIndex;

  // Apply time_jump_minutes if defined on the new phase
  if (nextPhase?.time_jump_minutes) {
    const jumpMs = nextPhase.time_jump_minutes * 60 * 1000;
    const current = new Date(session.simulatedTime);
    session.simulatedTime = new Date(current.getTime() + jumpMs).toISOString();
  }

  addSystemMessage(
    session,
    `Passage à la phase suivante : ${nextPhase?.title || "phase suivante"}`
  );

  pushAction(session, {
    type: "phase_entered",
    phaseId: nextPhaseId,
    timestamp: Date.now(),
  });

  injectPhaseEntryEvents(session);
}

export function buildRuntimeView(session: SessionState) {
  const phase = getCurrentPhase(session);
  const phaseId = getCurrentPhaseId(session);
  const draft =
    session.mailDrafts[phaseId] || {
      to: "",
      cc: "",
      subject: "",
      body: "",
      attachments: [],
    };

  const mailConfig = phase?.mail_config;
  // Mail is always composable when the scenario has any mail phase — no lock mechanism
  const scenarioUsesMail = (session.scenario?.phases || []).some(
    (p: any) => p.mail_config?.enabled
  );
  const canSendMail = scenarioUsesMail;
  const sendMailLabel = mailConfig?.send_label || "";

  return {
    title:
      session.scenario.meta?.title ||
      session.scenario.title ||
      "Scénario",
    subtitle: session.scenario.meta?.subtitle || "",
    narrative: session.scenario.narrative || {},
    initialEvents: session.scenario.initial_events || [],
    phaseTitle: phase?.title || "Fin",
    phaseObjective: phase?.objective || "",
    phaseFocus: phase?.phase_focus || "",
    phasePrompt:
      phase?.player_input?.prompt ||
      phase?.player_inputs?.[0]?.prompt ||
      phase?.player_inputs?.[0]?.label ||
      "Réponds à la situation.",
    phaseId,
    criteria: phase?.competencies || phase?.scoring?.criteria || [],
    conversation: session.chatMessages,
    inboxMails: session.inboxMails,
    documents: getScenarioDocuments(session),
    sentMails: session.sentMails,
    currentMailDraft: draft,
    phaseScore: session.scores[phaseId] || 0,
    totalScore: session.totalScore,
    flags: session.flags,
    adaptiveMode: session.adaptiveMode,
    canAdvance: isCurrentPhaseValidated(session),
    isFinished: session.isFinished,
    ending: session.ending,
    debrief: buildDebrief(session),
    showDebrief: session.showDebrief,
    pendingTimedEvents: session.pendingTimedEvents,
    canSendMail,
    sendMailLabel,
    /** True if any phase in the scenario has mail_config.enabled */
    scenarioHasMail: (session.scenario?.phases || []).some(
      (p: any) => p.mail_config?.enabled
    ),
    simulatedTime: session.simulatedTime,
    simSpeedMultiplier: session.simSpeedMultiplier,
  };
}

/**
 * Advance simulated clock by the given real-time delta (in ms).
 * Call this from a setInterval on the client side.
 */
export function tickSimulatedTime(session: SessionState, realDeltaMs: number) {
  const simDelta = realDeltaMs * session.simSpeedMultiplier;
  const current = new Date(session.simulatedTime);
  session.simulatedTime = new Date(current.getTime() + simDelta).toISOString();
}
