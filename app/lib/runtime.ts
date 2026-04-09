export type MessageRole = "player" | "npc" | "system";

export type ChatMessage = {
  id: string;
  role: MessageRole;
  actor?: string;
  content: string;
  type?: string;
  phaseId?: string;
  timestamp: number;
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
};

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalize(value: string | undefined) {
  return (value || "").toLowerCase();
}

function looksLikeMailEvent(msg: any) {
  const actor = normalize(msg?.source_actor || msg?.actor);
  const type = normalize(msg?.channel || msg?.type);

  if (type.includes("mail") || type.includes("email")) return true;
  if (actor.includes("consulat")) return true;
  if (actor.includes("pilar")) return true;
  if (actor.includes("domínguez")) return true;
  if (actor.includes("dominguez")) return true;
  if (actor.includes("section visas")) return true;

  return false;
}

function pushAction(session: SessionState, action: SessionAction) {
  session.actionLog.push(action);
}

function addInboxMail(
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
    flags: {},
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
  };

  if (Array.isArray(scenario.initial_events)) {
    for (const event of scenario.initial_events) {
      addChatMessageInternal(state, {
        role: "npc",
        actor: event.actor,
        content: event.content,
        type: event.type,
        phaseId: firstPhaseId,
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

export function addPlayerMessage(session: SessionState, content: string) {
  const phaseId = getCurrentPhaseId(session);

  addChatMessageInternal(session, {
    role: "player",
    actor: "player",
    content,
    type: "chat",
    phaseId,
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

  for (const [key, value] of Object.entries(flagsToSet)) {
    if (value === true) {
      session.flags[key] = true;
    }
  }

  for (const criterionId of matchedCriteria) {
    session.flags[criterionId] = true;
  }

  if (isCurrentPhaseValidatedByRules(session)) {
    unlockCurrentPhase(session);
  }
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

function isCurrentPhaseValidatedByRules(session: SessionState) {
  const phase = getCurrentPhase(session);
  const phaseId = getCurrentPhaseId(session);

  if (!phase) return false;

  const phaseScore = session.scores[phaseId] || 0;

  if (phaseId === "phase_1_comprehension") {
    return phaseScore >= 2;
  }

  if (phaseId === "phase_2_strategy") {
    return (
      !!session.flags.named_consulate_madrid ||
      !!session.flags.chose_formal_email ||
      phaseScore >= 1
    );
  }

  if (phaseId === "phase_3_execution") {
    return (
      phaseScore >= 3 ||
      !!session.flags.mail_has_structure ||
      !!session.flags.mail_tone_diplomatic
    );
  }

  if (phaseId === "phase_4_rebound") {
    return (
      phaseScore >= 2 ||
      !!session.flags.proposed_hierarchy_note_later ||
      !!session.flags.responds_despite_uncertainty
    );
  }

  return phaseScore > 0;
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
  const successCoreFlags = [
    "identified_border_risk",
    "named_consulate_madrid",
    "mail_has_structure",
    "mail_tone_diplomatic",
    "proposed_hierarchy_note_later",
  ];

  const executionFlags = [
    "email_to_consulate_sent",
    "replied_to_consulate",
    "mail_sent",
    "response_sent",
  ];

  const coreCount = countTrueFlags(session, successCoreFlags);
  const executionCount = countTrueFlags(session, executionFlags);
  const sentMailCount = session.sentMails.length;

  const initialMail = session.sentMails.find(
    (mail) => mail.kind === "consulate_initial"
  );
  const replyMail = session.sentMails.find(
    (mail) => mail.kind === "consulate_reply"
  );

  const phase3HasBody = !!initialMail?.body?.trim();
  const phase4HasBody = !!replyMail?.body?.trim();
  const phase4HasAttachments = (replyMail?.attachments?.length || 0) > 0;

  if (
    session.totalScore >= 8 &&
    coreCount >= 3 &&
    executionCount >= 2 &&
    sentMailCount >= 2 &&
    phase3HasBody &&
    phase4HasBody &&
    phase4HasAttachments
  ) {
    return {
      id: "success",
      label: "FIN A — Succès",
      content:
        "La coordination a été suffisamment solide pour éviter le pire. Les bons interlocuteurs ont été activés, les échanges ont été formalisés à temps et la situation a pu être sécurisée à l’arrivée. La mission est sauvée, même si le climat est resté tendu.",
    };
  }

  if (
    session.totalScore >= 5 &&
    executionCount >= 1 &&
    sentMailCount >= 1 &&
    phase3HasBody
  ) {
    return {
      id: "partial_success",
      label: "FIN B — Succès partiel",
      content:
        "Tu as posé plusieurs bonnes actions et évité l’effondrement total de la situation, mais la coordination est restée partielle ou incomplète. La délégation poursuit difficilement la mission, avec une forte perte de temps et une tension institutionnelle réelle.",
    };
  }

  return {
    id: "failure",
    label: "FIN C — Échec",
    content:
      "La situation n’a pas été suffisamment sécurisée. Les interlocuteurs n’ont pas reçu des éléments exploitables à temps ou la coordination n’a pas permis d’anticiper correctement l’arrivée. L’incident devient politique et la gestion de crise prend le dessus sur la mission.",
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
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (
    session.flags.identified_visa_expiry ||
    session.flags.identified_border_risk
  ) {
    strengths.push(
      "Tu repères correctement les éléments critiques et les risques immédiats."
    );
  } else {
    weaknesses.push(
      "L’identification des signaux critiques reste trop tardive ou incomplète."
    );
  }

  if (session.flags.named_consulate_madrid) {
    strengths.push(
      "Tu identifies le bon interlocuteur institutionnel dans un contexte sous contrainte."
    );
  } else {
    weaknesses.push(
      "Le ciblage institutionnel n’est pas encore assez précis ni assez rapide."
    );
  }

  const professionallyWrittenMails = session.sentMails.filter((mail) => {
    const body = normalize(mail.body);
    return (
      body.length > 120 &&
      (body.includes("madame") || body.includes("bonjour")) &&
      (body.includes("cordialement") || body.includes("bien cordialement"))
    );
  });

  if (
    session.flags.mail_has_structure ||
    session.flags.mail_tone_diplomatic ||
    professionallyWrittenMails.length > 0
  ) {
    strengths.push(
      "Tu sais produire un écrit professionnel utile et diplomatiquement exploitable."
    );
  } else {
    weaknesses.push(
      "La qualité de rédaction opérationnelle sous pression doit encore progresser."
    );
  }

  if (
    session.flags.proposed_hierarchy_note_later ||
    session.flags.communication_romain_clear
  ) {
    strengths.push(
      "Tu gardes un cap opérationnel malgré l’incertitude et la pression temporelle."
    );
  } else {
    weaknesses.push(
      "La coordination en temps contraint et la hiérarchisation des actions restent fragiles."
    );
  }

  if (session.sentMails.length >= 2 && countRequiredAttachments(session.sentMails) > 0) {
    strengths.push(
      "Tu exploites la messagerie écrite et les pièces jointes comme de vrais leviers opérationnels."
    );
  } else {
    weaknesses.push(
      "La gestion documentaire et la transmission des pièces restent insuffisamment sécurisées."
    );
  }

  return {
    totalScore: session.totalScore,
    strengths,
    weaknesses,
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

function buildFallbackInterruptionsForPhase(phaseId: string) {
  if (phaseId === "phase_3_execution") {
    return [
      {
        interrupt_id: "fallback_phase3_romain_call",
        actor: "romain",
        content:
          "Bon, tu en es où ? J'ai trouvé le numéro de la PAF Mérignac. Est-ce que je les appelle maintenant pour les prévenir, ou j'attends que ton mail soit parti ?",
        kind: "chat",
      },
    ];
  }

  if (phaseId === "phase_4_rebound") {
    return [
      {
        interrupt_id: "fallback_phase4_romain_call",
        actor: "romain",
        content:
          "Je suis en route pour l'aéroport. T'as eu un retour du consulat ? Claudia a remis un WhatsApp, elle demande si c'est réglé.",
        kind: "chat",
      },
    ];
  }

  return [];
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

  const jsonInterruptions = getAllInterruptionsForPhase(phase);
  const interruptions =
    jsonInterruptions.length > 0
      ? jsonInterruptions
      : buildFallbackInterruptionsForPhase(phaseId);

  if (!interruptions.length) return;

  const nextInterruption = interruptions.find((interruption) => {
    const interruptId =
      interruption.interrupt_id || interruption.event_id || interruption.id;
    return (
      interruptId &&
      !session.triggeredInterruptions.includes(interruptId) &&
      !session.pendingTimedEvents.some((e) => e.id === interruptId)
    );
  });

  if (!nextInterruption) return;

  const interruptId =
    nextInterruption.interrupt_id || nextInterruption.event_id || nextInterruption.id;

  // Phase 3 : on attend un vrai échange puis on déclenche UNE interruption chat
  if (phaseId === "phase_3_execution") {
    if (playerMessagesInPhase >= 1 && npcChatMessagesInPhase >= 1) {
      session.pendingTimedEvents.push({
        id: interruptId,
        actor:
          nextInterruption.actor ||
          nextInterruption.source_actor ||
          "romain",
        content: nextInterruption.content || "Interruption",
        dueAt: Date.now() + 12000,
        phaseId,
        type: "chat",
      });
    }
    return;
  }

  if (phaseId === "phase_4_rebound") {
    return;
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

  const incomingMessages: any[] = [];

  if (Array.isArray(phase.system_messages)) {
    incomingMessages.push(...phase.system_messages);
  }

  if (Array.isArray(phase.incoming)) {
    incomingMessages.push(...phase.incoming);
  }

  if (Array.isArray(phase.trigger_events)) {
    incomingMessages.push(...phase.trigger_events);
  }

  if (phaseId === "phase_4_rebound" && incomingMessages.length > 0) {
    incomingMessages.forEach((msg, index) => {
      const msgId =
        msg.message_id || msg.event_id || msg.id || `${phaseId}::${index}`;
      const key = `${phaseId}::${msgId}`;

      if (session.injectedPhaseEntryEvents.includes(key)) return;

      const actor = msg.source_actor || msg.actor || "system";
      const content = msg.content || "Événement";
      const attachments = Array.isArray(msg.attachments)
        ? msg.attachments.map((a: any, idx: number) => ({
            id: a.id || `${msgId}_att_${idx}`,
            label: a.label || a.name || `Pièce jointe ${idx + 1}`,
          }))
        : [];
      const subject =
        msg.subject ||
        msg.title ||
        "Réponse du consulat";

      // Les messages type consulat arrivent en boîte mail
      if (looksLikeMailEvent(msg)) {
        if (index === 0) {
          addInboxMail(session, {
            from: actor,
            subject,
            body: content,
            attachments,
            phaseId,
          });
        } else {
          session.pendingTimedEvents.push({
            id: key,
            actor,
            content,
            dueAt: Date.now() + 3000,
            phaseId,
            type: "mail",
            subject,
            attachments,
          });
        }
      } else {
        if (index === 0) {
          addChatMessageInternal(session, {
            role: "npc",
            actor,
            content,
            type: msg.channel || msg.type || "incoming",
            phaseId,
          });

          pushAction(session, {
            type: "chat_message_received",
            phaseId,
            actor,
            content,
            timestamp: Date.now(),
          });
        } else {
          session.pendingTimedEvents.push({
            id: key,
            actor,
            content,
            dueAt: Date.now() + 3000,
            phaseId,
            type: "chat",
          });
        }
      }

      session.injectedPhaseEntryEvents.push(key);
    });

    return;
  }

  for (const msg of incomingMessages) {
    const msgId =
      msg.message_id || msg.event_id || msg.id || `${phaseId}::${msg.content}`;
    const key = `${phaseId}::${msgId}`;

    if (session.injectedPhaseEntryEvents.includes(key)) continue;

    const actor = msg.source_actor || msg.actor || "system";
    const content = msg.content || "Événement";
    const attachments = Array.isArray(msg.attachments)
      ? msg.attachments.map((a: any, idx: number) => ({
          id: a.id || `${msgId}_att_${idx}`,
          label: a.label || a.name || `Pièce jointe ${idx + 1}`,
        }))
      : [];
    const subject =
      msg.subject ||
      msg.title ||
      "Nouveau message";

    if (looksLikeMailEvent(msg)) {
      addInboxMail(session, {
        from: actor,
        subject,
        body: content,
        attachments,
        phaseId,
      });
    } else {
      addChatMessageInternal(session, {
        role: "npc",
        actor,
        content,
        type: msg.channel || msg.type || "incoming",
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
  kind: "consulate_initial" | "consulate_reply"
) {
  const phaseId = getCurrentPhaseId(session);
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
    kind,
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

  if (kind === "consulate_initial") {
    session.flags.email_to_consulate_sent = true;
    session.flags.mail_sent = true;
    session.flags.communication_romain_clear = true;
  }

  if (kind === "consulate_reply") {
    session.flags.replied_to_consulate = true;
    session.flags.response_sent = true;
    session.flags.proposed_hierarchy_note_later = true;
  }

  addSystemMessage(
    session,
    kind === "consulate_initial"
      ? "Mail envoyé au consulat."
      : "Réponse envoyée au consulat."
  );
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

  if (nextPhaseId === "phase_5_outcome") {
    finishScenario(session);
    addSystemMessage(
      session,
      "Le scénario est terminé. Consulte le dénouement."
    );
    return;
  }

  session.currentPhaseIndex = nextPhaseIndex;

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
    phasePrompt:
      phase?.player_input?.prompt ||
      phase?.player_inputs?.[0]?.prompt ||
      phase?.player_inputs?.[0]?.label ||
      "Réponds à la situation.",
    phaseId,
    criteria: phase?.scoring?.criteria || [],
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
    canSendMail:
      (phaseId === "phase_3_execution" &&
        isCurrentPhaseValidated(session) &&
        !session.flags.email_to_consulate_sent) ||
      (phaseId === "phase_4_rebound" &&
        !session.flags.replied_to_consulate),
    sendMailLabel:
      phaseId === "phase_3_execution"
        ? "Envoyer le mail au consulat"
        : phaseId === "phase_4_rebound"
        ? "Envoyer la réponse au consulat"
        : "",
  };
}