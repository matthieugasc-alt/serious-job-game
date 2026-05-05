// ══════════════════════════════════════════════════════════════════
// MailModule — PhaseModule wrapper for handleSendMail logic
// ══════════════════════════════════════════════════════════════════
//
// Dispatches mail events to pure branch functions:
//   1. handleRuptureCtoMail()       — S0 bad leaver logic
//   2. handleChoiceConfirmationMail() — S3 Phase 1 establishment choice
//   3. handleNegotiationProposalMail() — S2 Phase 2 price extraction + contract vars
//   4. handleScopeProposalMail()    — S2 Phase 1 Thomas auto-reply via async_effect
//   5. handleNegotiationChatReply() — S2 Phase 2 Thomas chat reply via async_effect
//   6. handleAnalyseRdvMail()       — Fourvière dynamic mail generation
//   7. handlePilotPitchMail()       — S3 Phase 2 pitch evaluation (accept/reject/pivot)
//
// Async operations use { type: "async_effect", effect: {...} }
// setTimeout chains use { type: "delayed_actions", delayMs, actions }
// page.tsx EXECUTES these effects — the module only DESCRIBES them.
// ══════════════════════════════════════════════════════════════════

import type {
  PhaseModule,
  ModuleContext,
  ModuleResult,
  ModuleAction,
  InboxMailAction,
} from "./types";
import { EMPTY_RESULT } from "./types";

// ── Types ───────────────────────────────────────────────────────

/** All known mail_config.kind values across scenarios. */
export type MailKind =
  | "rupture_cto"
  | "scope_proposal"
  | "choice_confirmation"
  | "negotiation_proposal"
  | "analyse_rdv"
  | "pilot_pitch"
  | "cold_email"
  | "dsi_response"
  | "implementation_plan"
  | "recap_vente"
  | "exceptions_response";

/** Return value of each branch handler. */
export interface MailBranchResult {
  /** Actions to execute (in order). */
  actions: ModuleAction[];
  /** If true, the caller should return early (branch handled everything). */
  earlyReturn: boolean;
  /** If true, this branch triggered a phase advance via send_advances_phase. */
  didAdvance: boolean;
}

/** Empty branch result — no actions, no early return. */
const EMPTY_BRANCH: Readonly<MailBranchResult> = Object.freeze({
  actions: [],
  earlyReturn: false,
  didAdvance: false,
});

/** Extended context for mail operations. page.tsx passes these via (ctx as any).extra. */
export interface MailModuleContext {
  /** The mail body the player wrote */
  mailBody: string;
  /** The mail "to" field */
  mailTo: string;
  /** The current mail kind from phase.mail_config.kind */
  mailKind: string;
  /** Is this a founder scenario? */
  isFounderScenario: boolean;
  /** Chosen CTO actor_id (S0) */
  chosenCtoId: string;
  /** All actors in the scenario */
  actors: Array<{ actor_id: string; name: string; [key: string]: unknown }>;
  /** Current phase conversation */
  conversation: Array<{ role: string; content: string; [key: string]: unknown }>;
  /** Current phase scores */
  scores: Record<string, number>;
  /** Scenario constraints (e.g. plancher_novadev) */
  constraints: Record<string, unknown>;
  /** Current mail draft (full object) */
  currentMailDraft: { to: string; cc?: string; subject: string; body: string; attachments?: { id: string; label: string }[] };
  /** Runtime view data for API calls */
  runtimeView: Record<string, unknown>;
  /** Active AI prompt for the current actor */
  activePromptMap: Record<string, string>;
  /** Default AI prompt */
  defaultPrompt: string;
  /** Player display name */
  displayPlayerName: string;
}

// Keep backward-compat alias for any code importing MailModuleExtra
export type MailModuleExtra = MailModuleContext;

// ══════════════════════════════════════════════════════════════════
// Branch handlers — pure functions, no side effects
// ══════════════════════════════════════════════════════════════════

// ── BRANCH 1: rupture_cto ───────────────────────────────────────
// ⚠️ RISKY: S0 — two possible outcomes (bad leaver vs. paid to leave).
//    Outcome depends on pacte_signed_clean flag from S0 Phase 2.
//    If flag logic changes upstream, both branches break silently.

function handleRuptureCtoMail(
  flags: Record<string, unknown>,
  extra: MailModuleContext,
): MailBranchResult {
  if (!extra.isFounderScenario) return EMPTY_BRANCH;

  const actions: ModuleAction[] = [];
  const hasExclusivity = !!flags.pacte_signed_clean;
  const ctoId = extra.chosenCtoId || "sofia_renault";
  const ctoActor = extra.actors.find((a) => a.actor_id === ctoId);
  const ctoName = ctoActor?.name || "le CTO";

  if (hasExclusivity) {
    // CAS 1: clause présente → bad leaver, CTO sort avec 0 €
    actions.push({ type: "set_flags", flags: { bad_leaver_triggered: true } });
    actions.push({
      type: "add_ai_message",
      actor: ctoId,
      content: `La clause d'exclusivité est claire. Je ne peux pas la contester. Je quitte Orisio, sans compensation. Bonne continuation.`,
    });
    actions.push({
      type: "add_ai_message",
      actor: "alexandre_morel",
      content: `C'est réglé. ${ctoName} sort en bad leaver — 0 € d'indemnité, equity récupérée. Le pacte t'a protégé. Maintenant il faut retrouver un CTO.`,
    });
  } else {
    // CAS 2: clause absente → CTO en position de force, indemnité 2 500 €
    actions.push({ type: "set_flags", flags: { cto_paid_to_leave: true } });
    actions.push({
      type: "add_ai_message",
      actor: ctoId,
      content: `J'ai vérifié avec mon avocat : le pacte ne mentionne aucune clause d'exclusivité me concernant. Juridiquement, je n'ai rien violé. Si tu veux que je parte, on peut s'arranger : 2 500 € et on n'en parle plus.`,
    });
    actions.push({
      type: "add_ai_message",
      actor: "alexandre_morel",
      content: `Merde. Le pacte n'avait pas de clause d'exclusivité côté CTO. On est obligés de payer pour qu'il parte — 2 500 € de trésorerie en moins. La leçon est claire : un pacte d'associés se lit ligne par ligne.`,
    });
  }

  return { actions, earlyReturn: false, didAdvance: false };
}

// ── BRANCH 2a: choice_confirmation (S3 Phase 1) ────────────────

function handleChoiceConfirmationMail(
  extra: MailModuleContext,
): MailBranchResult {
  const actions: ModuleAction[] = [];
  const bodyLower = (extra.currentMailDraft?.body || "").toLowerCase();

  if (bodyLower.includes("chu") || bodyLower.includes("pellegrin") || bodyLower.includes("bordeaux")) {
    actions.push({ type: "set_flags", flags: { chose_chu: true } });
  } else if (bodyLower.includes("saint-martin") || bodyLower.includes("saint martin") || bodyLower.includes("ramsay")) {
    actions.push({ type: "set_flags", flags: { chose_saint_martin: true } });
  } else if (bodyLower.includes("saint-augustin") || bodyLower.includes("saint augustin") || bodyLower.includes("clinique")) {
    actions.push({ type: "set_flags", flags: { chose_clinique: true } });
  } else {
    // Default: fallback to clinique
    actions.push({ type: "set_flags", flags: { chose_clinique: true } });
  }

  return { actions, earlyReturn: false, didAdvance: false };
}

// ── BRANCH 2b: negotiation_proposal extraction (S2 Phase 2) ────
// ⚠️ RISKY: S2 — price extraction via regex from freeform player text.
//    If the player writes an ambiguous price format, extraction may fail
//    or extract the wrong value. The plancher_novadev reject path returns
//    early and BLOCKS the phase advance — verify constraints.plancher_novadev exists.

function handleNegotiationProposalExtraction(
  phase: Record<string, unknown>,
  flags: Record<string, unknown>,
  extra: MailModuleContext,
): MailBranchResult {
  const phaseId = (phase as any).phase_id || "";
  if (phaseId !== "phase_2_negotiation") return EMPTY_BRANCH;

  const actions: ModuleAction[] = [];
  const body = extra.currentMailDraft?.body || "";

  // Extract price: look for numbers followed by €, k€, euros
  const priceMatch = body.match(/(\d[\d\s.,]*)\s*(?:€|euros?|k€|k\s*€)/i);
  let extractedPrice = "";
  if (priceMatch) {
    const raw = priceMatch[1].replace(/\s/g, "").replace(",", ".");
    // Handle "11k€" → "11000", "12 000 €" → "12000"
    if (body.toLowerCase().includes("k€") || body.toLowerCase().includes("k €")) {
      extractedPrice = String(Math.round(parseFloat(raw) * 1000));
    } else {
      extractedPrice = String(Math.round(parseFloat(raw)));
    }
  }

  // Validate price against NovaDev floor (11 000 €)
  // If below floor → BLOCK the phase, Thomas rejects in chat
  const plancherNovadev = (extra.constraints as any)?.plancher_novadev || 11000;
  const priceNum = extractedPrice ? parseInt(extractedPrice, 10) : 0;

  if (priceNum > 0 && priceNum < plancherNovadev) {
    // Price is below Thomas's floor — reject and DON'T advance
    actions.push({ type: "set_compose", show: false });
    actions.push({ type: "set_view", view: "chat" });
    actions.push({ type: "set_contact", actorId: "thomas_novadev" });
    actions.push({
      type: "delayed_actions",
      delayMs: 800,
      actions: [
        {
          type: "add_ai_message",
          actor: "thomas_novadev",
          content: `Non. ${priceNum.toLocaleString("fr-FR")} € c'est en dessous de mon plancher. Je vous l'ai dit : en dessous de ${plancherNovadev.toLocaleString("fr-FR")} €, c'est non. Revoyez votre proposition.`,
        },
      ],
    });
    // EXIT: don't advance, don't extract contract vars
    return { actions, earlyReturn: true, didAdvance: false };
  }

  // Price is valid — set novadev_negotiated flag
  actions.push({ type: "set_flags", flags: { novadev_negotiated: true } });

  // Extract equity: look for X%
  const equityMatch = body.match(/(\d+)\s*%/);
  const extractedEquity = equityMatch ? equityMatch[1] + "%" : null;

  // Extract features: look for known module keywords
  const featureKeywords: Record<string, string> = {
    "planning": "Planning du bloc opératoire",
    "annulation": "Gestion des annulations et remplacements",
    "scoring": "Scoring des chirurgiens",
    "salle": "Gestion des salles et du matériel",
    "suivi patient": "Suivi patient pré/post-opératoire",
    "suivi": "Suivi patient pré/post-opératoire",
    "équipe": "Gestion des équipes",
    "rapport": "Rapport post-opératoire",
    "post-op": "Rapport post-opératoire",
    "matériel": "Gestion des salles et du matériel",
    "notification": "Notifications (email)",
    "créneau": "Gestion des annulations et remplacements",
    "remplacement": "Gestion des annulations et remplacements",
  };
  const bodyLower = body.toLowerCase();
  const extractedFeatures: string[] = [];
  const seen = new Set<string>();
  for (const [kw, label] of Object.entries(featureKeywords)) {
    if (bodyLower.includes(kw) && !seen.has(label)) {
      extractedFeatures.push(label);
      seen.add(label);
    }
  }
  if (extractedFeatures.length === 0) {
    extractedFeatures.push("Fonctionnalités selon accord verbal");
  }

  actions.push({
    type: "set_contract_vars",
    vars: {
      price: extractedPrice || "À définir",
      features: extractedFeatures,
      equity: extractedEquity,
      rawMailBody: body,
    },
  });

  return { actions, earlyReturn: false, didAdvance: false };
}

// ── S3 Phase 1→2 transition: Alexandre sends contact mail ───────

function buildS3TransitionActions(
  flags: Record<string, unknown>,
  extra: MailModuleContext,
): ModuleAction[] {
  const actions: ModuleAction[] = [];
  const contactMap: Record<string, { name: string; email: string; label: string }> = {
    chose_chu: { name: "Dr. Pierre Lemaire", email: "p.lemaire@chu-bordeaux.fr", label: "le CHU de Bordeaux" },
    chose_saint_martin: { name: "Laurent Castex", email: "l.castex@hp-saintmartin.fr", label: "l'Hôpital Saint-Martin" },
    chose_clinique: { name: "Dr. Claire Renaud-Picard", email: "c.renaud-picard@clinique-saint-augustin.fr", label: "la Clinique Saint-Augustin" },
  };

  // Derive choice from mail body
  const bodyLower = (extra.currentMailDraft?.body || "").toLowerCase();
  let choiceKey = "chose_clinique";
  if (bodyLower.includes("chu") || bodyLower.includes("pellegrin") || bodyLower.includes("bordeaux")) {
    choiceKey = "chose_chu";
  } else if (bodyLower.includes("saint-martin") || bodyLower.includes("saint martin") || bodyLower.includes("ramsay")) {
    choiceKey = "chose_saint_martin";
  } else if (bodyLower.includes("saint-augustin") || bodyLower.includes("saint augustin") || bodyLower.includes("clinique")) {
    choiceKey = "chose_clinique";
  }
  // Also check pre-existing flags from context
  if (flags.chose_chu) choiceKey = "chose_chu";
  else if (flags.chose_saint_martin) choiceKey = "chose_saint_martin";
  else if (flags.chose_clinique) choiceKey = "chose_clinique";

  const contact = contactMap[choiceKey];
  actions.push({
    type: "add_inbox_mail",
    mail: {
      from: "alexandre_morel",
      subject: "Contact pour le test pilote",
      body: `OK c'est acté, on part sur ${contact.label}. Le contact c'est ${contact.name} — ${contact.email}. Envoie-lui un mail propre pour proposer le test : gratuit, 8 semaines, sans engagement. Sois clair et pro, c'est notre premier contact officiel.`,
      phaseId: "__next_phase__",
    },
  });
  actions.push({ type: "set_view", view: "mail" });

  return actions;
}

// ── Fourvière: analyse_rdv dynamic mail generation ──────────────

function handleAnalyseRdvMail(
  extra: MailModuleContext,
): MailBranchResult {
  const analyseBody = extra.currentMailDraft?.body || "";
  if (!analyseBody.trim()) return EMPTY_BRANCH;

  const actions: ModuleAction[] = [];
  const truncatedAnalyse = analyseBody.length > 800 ? analyseBody.slice(0, 800) + "..." : analyseBody;
  actions.push({
    type: "async_effect",
    effect: {
      kind: "fourviere_dynamic_mail",
      analyseBody: truncatedAnalyse,
      fullAnalyseBody: analyseBody,
      displayPlayerName: extra.displayPlayerName,
    },
  });
  actions.push({ type: "set_compose", show: false });
  return { actions, earlyReturn: true, didAdvance: false };
}

// ── BRANCH 3: scope_proposal auto-reply (Thomas) ────────────────

function handleScopeProposalMail(
  ctx: ModuleContext,
  extra: MailModuleContext,
  phase1MailBody: string,
): MailBranchResult {
  const actions: ModuleAction[] = [];
  const activePrompt = extra.activePromptMap["thomas_novadev"] || extra.defaultPrompt;

  actions.push({ type: "set_compose", show: false });
  actions.push({ type: "set_view", view: "chat" });
  actions.push({ type: "set_contact", actorId: "thomas_novadev" });
  actions.push({
    type: "async_effect",
    effect: {
      kind: "mail_auto_reply",
      actorId: "thomas_novadev",
      mailBody: phase1MailBody,
      playerMessageSummary: `[Mail envoyé à NovaDev] ${phase1MailBody.substring(0, 200)}...`,
      mailSummary: `[Le joueur a envoyé un mail de proposition de scope MVP avec le contenu suivant : ${phase1MailBody}]`,
      displayPlayerName: extra.displayPlayerName,
      narrative: (ctx.scenario as any).narrative,
      runtimeView: extra.runtimeView,
      roleplayPrompt: activePrompt,
    },
  });

  return { actions, earlyReturn: true, didAdvance: false };
}

// ── BRANCH 3b: cold_email auto-reply ────────────────────────────
// S5 Phase 1: player sends a cold email to a KOL. The KOL responds
// in chat. We trigger a mail_auto_reply async effect so the AI KOL
// can react to the email content and potentially express interest
// (which triggers the success_rules keyword detection in page.tsx).

function handleColdEmailReply(
  ctx: ModuleContext,
  extra: MailModuleContext,
): MailBranchResult {
  const actions: ModuleAction[] = [];
  const mailDraft = extra.currentMailDraft;
  if (!mailDraft) return { actions, earlyReturn: false, didAdvance: false };

  // Determine which KOL actor was targeted by the mail
  const toField = (mailDraft.to || "").trim();
  if (!toField) return { actions, earlyReturn: false, didAdvance: false };

  // Resolve actor ID: the "to" field might be the actor_id or an email address
  const actors = extra.actors || [];
  const targetActor = actors.find(
    (a: any) => a.actor_id === toField || a.actor_id === toField.split("@")[0]
  );
  const actorId = targetActor?.actor_id || toField;

  // Find the actor's prompt file
  const activePrompt = extra.activePromptMap[actorId] || extra.defaultPrompt;

  actions.push({ type: "set_compose", show: false });
  actions.push({ type: "set_view", view: "chat" });
  actions.push({ type: "set_contact", actorId });
  actions.push({
    type: "async_effect",
    effect: {
      kind: "mail_auto_reply",
      actorId,
      mailBody: mailDraft.body || "",
      playerMessageSummary: `[Cold email envoyé à ${targetActor?.name || actorId}] ${(mailDraft.body || "").substring(0, 200)}...`,
      mailSummary: `[Le joueur a envoyé un cold email de prospection avec le contenu suivant : ${mailDraft.body || ""}]`,
      displayPlayerName: extra.displayPlayerName,
      narrative: (ctx.scenario as any).narrative,
      runtimeView: extra.runtimeView,
      roleplayPrompt: activePrompt,
    },
  });

  return { actions, earlyReturn: true, didAdvance: false };
}

// ── BRANCH 3c: dsi_response auto-reply ─────────────────────────
// S5 Phase 2: player sends a mail to the DSI (Eric Moreau).
// The DSI replies via mail_auto_reply async effect to evaluate
// the player's answers on HDS, RGPD, interop, pricing.

function handleDsiResponseReply(
  ctx: ModuleContext,
  extra: MailModuleContext,
): MailBranchResult {
  const actions: ModuleAction[] = [];
  const mailDraft = extra.currentMailDraft;
  if (!mailDraft) return { actions, earlyReturn: false, didAdvance: false };

  const actorId = "eric_moreau";
  const activePrompt = extra.activePromptMap[actorId] || extra.defaultPrompt;

  actions.push({ type: "set_compose", show: false });
  actions.push({ type: "set_view", view: "chat" });
  actions.push({ type: "set_contact", actorId });
  actions.push({
    type: "async_effect",
    effect: {
      kind: "mail_auto_reply",
      actorId,
      mailBody: mailDraft.body || "",
      playerMessageSummary: `[Réponse envoyée à la DSI] ${(mailDraft.body || "").substring(0, 200)}...`,
      mailSummary: `[Le joueur a envoyé sa réponse à la DSI avec le contenu suivant : ${mailDraft.body || ""}]`,
      displayPlayerName: extra.displayPlayerName,
      narrative: (ctx.scenario as any).narrative,
      runtimeView: extra.runtimeView,
      roleplayPrompt: activePrompt,
    },
  });

  return { actions, earlyReturn: true, didAdvance: false };
}

// ── BRANCH 4: negotiation_proposal chat reply ───────────────────
// ⚠️ RISKY: S2 — this branch fires ONLY when send_advances_phase
//    did NOT trigger (rulesPass was false or negotiation_proposal
//    was not in phase_2_negotiation for the extraction branch).
//    If completion_rules keywords change, this branch may fire
//    unexpectedly or not at all.

function handleNegotiationChatReply(
  ctx: ModuleContext,
  phase: Record<string, unknown>,
  extra: MailModuleContext,
): MailBranchResult {
  const phaseId = (phase as any).phase_id || "";
  if (phaseId !== "phase_2_negotiation") return EMPTY_BRANCH;

  const actions: ModuleAction[] = [];
  const mailBodyForReply = extra.currentMailDraft?.body || "";

  actions.push({ type: "set_compose", show: false });
  actions.push({ type: "set_view", view: "chat" });
  actions.push({ type: "set_contact", actorId: "thomas_novadev" });

  const activePrompt = extra.activePromptMap["thomas_novadev"] || extra.defaultPrompt;
  const convNow = (extra.runtimeView as any)?.conversation || [];
  const recentConv = convNow.slice(-10).map((m: any) => ({
    role: m.role === "player" ? "user" : "assistant",
    content: m.content,
  }));
  const playerOnlyMsgs = convNow
    .filter((m: any) => m.role === "player")
    .slice(-6)
    .map((m: any) => m.content);
  const mailSummary = `[Le joueur a envoyé un mail avec le contenu suivant : ${mailBodyForReply}]`;

  actions.push({
    type: "async_effect",
    effect: {
      kind: "negotiation_chat_reply",
      actorId: "thomas_novadev",
      playerMessageSummary: `[Mail envoyé à NovaDev] ${mailBodyForReply.substring(0, 200)}...`,
      displayPlayerName: extra.displayPlayerName,
      mailSummary,
      narrative: (ctx.scenario as any).narrative,
      runtimeView: extra.runtimeView,
      roleplayPrompt: activePrompt,
      recentConversation: recentConv,
      playerMessages: [...playerOnlyMsgs, mailBodyForReply],
    },
  });

  return { actions, earlyReturn: true, didAdvance: false };
}

// ── BRANCH 5: pilot_pitch S3 — pitch evaluation ────────────────
// ⚠️ RISKY: S3 — pitch scoring is heuristic (keyword matching).
//    pitchScore >= 4 = accepted, < 4 = rejected with fallback pivot.
//    Changing keywords or thresholds directly impacts scenario flow.
//    The reject path has nested delayed_actions with complete_advance_phase
//    inside — timing-sensitive.

function handlePilotPitchMail(
  phase: Record<string, unknown>,
  flags: Record<string, unknown>,
  extra: MailModuleContext,
): MailBranchResult {
  const actions: ModuleAction[] = [];
  const pitchMailBody = extra.currentMailDraft?.body || "";
  const bodyLower = pitchMailBody.toLowerCase();
  const toField = (extra.currentMailDraft?.to || "").toLowerCase();

  // Detect establishment from "to" email address (primary detection)
  if (toField.includes("chu-bordeaux") || toField.includes("lemaire")) {
    actions.push({ type: "set_flags", flags: { chose_chu: true, chose_saint_martin: false, chose_clinique: false } });
  } else if (toField.includes("saintmartin") || toField.includes("hp-saintmartin") || toField.includes("castex")) {
    actions.push({ type: "set_flags", flags: { chose_saint_martin: true, chose_chu: false, chose_clinique: false } });
  } else if (toField.includes("saint-augustin") || toField.includes("renaud-picard")) {
    actions.push({ type: "set_flags", flags: { chose_clinique: true, chose_chu: false, chose_saint_martin: false } });
  }
  // If no email match, Phase 1 flags remain as fallback

  // Evaluate pitch quality based on concrete criteria
  let pitchScore = 0;
  const gratuitKeywords = ["gratuit", "sans engagement", "offert", "sans frais", "aucun coût", "0 €", "0€"];
  if (gratuitKeywords.some(k => bodyLower.includes(k))) pitchScore += 2;
  const valuePropKeywords = ["planning", "bloc", "opératoire", "annulation", "créneau", "optimis", "gestion"];
  if (valuePropKeywords.filter(k => bodyLower.includes(k)).length >= 2) pitchScore += 2;
  const dataKeywords = ["données", "hds", "hébergement", "certifié", "patient", "sécurité", "rgpd", "confidentiel"];
  if (dataKeywords.some(k => bodyLower.includes(k))) pitchScore += 2;
  const durationKeywords = ["8 semaines", "deux mois", "2 mois", "semaines", "durée"];
  if (durationKeywords.some(k => bodyLower.includes(k))) pitchScore += 1;
  // Professional tone: at least 3 sentences, not too short
  if (pitchMailBody.length > 150) pitchScore += 1;

  const pitchIsGood = pitchScore >= 4;

  // Determine establishment from toField (flags may not be applied yet)
  let choseCHU = !!flags.chose_chu;
  let choseSM = !!flags.chose_saint_martin;
  let choseClinique = !!flags.chose_clinique;
  // Override with toField detection if matched
  if (toField.includes("chu-bordeaux") || toField.includes("lemaire")) {
    choseCHU = true; choseSM = false; choseClinique = false;
  } else if (toField.includes("saintmartin") || toField.includes("hp-saintmartin") || toField.includes("castex")) {
    choseSM = true; choseCHU = false; choseClinique = false;
  } else if (toField.includes("saint-augustin") || toField.includes("renaud-picard")) {
    choseClinique = true; choseCHU = false; choseSM = false;
  }

  const resolveContactActor = (chu: boolean, sm: boolean) =>
    chu ? "contact_chu" : sm ? "contact_saint_martin" : "contact_clinique";

  const buildContractEvent = (contactActor: string, contrat: { id: string; label: string }) => ({
    type: "schedule_timed_event" as const,
    event: {
      id: "__next_phase__::contrat_mail",
      actor: contactActor,
      content: "Suite à votre demande de test pilote, veuillez trouver ci-joint la convention type applicable. Merci de retourner le document signé ou de transmettre vos observations sous 10 jours ouvrés.",
      dueAt: Date.now() + 5000,
      phaseId: "__next_phase__",
      type: "mail",
      subject: "Re: Orisio — Proposition de test pilote gratuit",
      attachments: [contrat],
    },
  });

  if (pitchIsGood) {
    // ── PITCH ACCEPTED → advance to Phase 3 ──
    actions.push({ type: "set_flags", flags: { pitch_accepted: true } });
    actions.push({ type: "complete_advance_phase" });

    const choiceKey = choseCHU ? "chose_chu" : choseSM ? "chose_saint_martin" : "chose_clinique";
    const contratMap: Record<string, { id: string; label: string }> = {
      chose_chu: { id: "contrat_chu", label: "Convention de test — CHU de Bordeaux" },
      chose_saint_martin: { id: "contrat_saint_martin", label: "Convention de test — Hôpital Saint-Martin" },
      chose_clinique: { id: "contrat_clinique", label: "Convention de test — Clinique Saint-Augustin" },
    };
    const contrat = contratMap[choiceKey];
    const contactActor = resolveContactActor(choseCHU, choseSM);
    actions.push(buildContractEvent(contactActor, contrat));
    actions.push({ type: "set_compose", show: false });
    return { actions, earlyReturn: true, didAdvance: false };
  }

  // ── PITCH REJECTED → fallback mechanism ──
  actions.push({ type: "set_flags", flags: { pitch_rejected: true } });
  actions.push({ type: "set_compose", show: false });

  if (!choseClinique) {
    // CHU or Saint-Martin refused → Alexandre intervenes, switches to clinique
    const rejectionActor = resolveContactActor(choseCHU, choseSM);
    const etablissement = choseCHU ? "le CHU" : "Saint-Martin";
    const currentPhaseId = (phase as any).phase_id || "";

    actions.push({
      type: "delayed_actions",
      delayMs: 1500,
      actions: [
        {
          type: "add_inbox_mail",
          mail: {
            from: rejectionActor,
            subject: "Re: Orisio — Proposition de test pilote gratuit",
            body: `Votre proposition ne nous paraît pas suffisamment aboutie en l'état. Nous vous invitons à revenir vers nous ultérieurement avec un dossier plus complet.`,
            phaseId: currentPhaseId,
          },
        },
        { type: "play_sound" },
        {
          type: "delayed_actions",
          delayMs: 2000,
          actions: [
            {
              type: "add_ai_message",
              actor: "alexandre_morel",
              content: `Aïe… ${etablissement} a refusé. Bon écoute, on se rabat sur ma clinique. C'est du tout cuit — je connais tout le monde là-bas, je les appelle et c'est réglé en 24h. C'est pas prestigieux mais au moins on avance.`,
            },
            {
              type: "set_flags",
              flags: {
                switched_to_clinique: true,
                chose_chu: false,
                chose_saint_martin: false,
                chose_clinique: true,
                pitch_accepted: true,
              },
            },
            { type: "complete_advance_phase" },
            buildContractEvent("contact_clinique", { id: "contrat_clinique", label: "Convention de test — Clinique Saint-Augustin" }),
            { type: "set_view", view: "chat" },
            { type: "set_contact", actorId: "alexandre_morel" },
          ],
        },
      ],
    });
  } else {
    // Already chose clinique → Alexandre smooths things over
    actions.push({
      type: "delayed_actions",
      delayMs: 1500,
      actions: [
        {
          type: "add_ai_message",
          actor: "alexandre_morel",
          content: `T'as envoyé quoi comme mail ?! C'est MA clinique, c'est MA réputation ! Laisse, je vais appeler Renaud-Picard directement et arranger le coup. Mais la prochaine fois, fais-moi relire avant d'envoyer n'importe quoi.`,
        },
        { type: "set_flags", flags: { pitch_accepted: true } },
        { type: "complete_advance_phase" },
        buildContractEvent("contact_clinique", { id: "contrat_clinique", label: "Convention de test — Clinique Saint-Augustin" }),
        { type: "set_view", view: "chat" },
        { type: "set_contact", actorId: "alexandre_morel" },
      ],
    });
  }

  return { actions, earlyReturn: true, didAdvance: false };
}

// ══════════════════════════════════════════════════════════════════
// Completion rules checker (extracted from send_advances_phase)
// ══════════════════════════════════════════════════════════════════

function checkCompletionRules(
  phase: Record<string, unknown>,
  extra: MailModuleContext,
): boolean {
  const rules = (phase as any).completion_rules;
  if (!rules) return true;

  // Check required_npc_evidence
  if (Array.isArray(rules.required_npc_evidence) && rules.required_npc_evidence.length > 0) {
    const phaseConv = extra.conversation || [];
    const npcText = phaseConv
      .filter((m: any) => m.role === "npc")
      .map((m: any) => (m.content || "").toLowerCase())
      .join(" ");
    const allMet = rules.required_npc_evidence.every((ev: any) => {
      const matched = (ev.keywords || []).filter((kw: string) => npcText.includes(kw.toLowerCase()));
      return matched.length >= (ev.min_matches || 1);
    });
    if (!allMet) return false;
  }

  // Check required_player_evidence
  if (Array.isArray(rules.required_player_evidence) && rules.required_player_evidence.length > 0) {
    const phaseConv = extra.conversation || [];
    const playerText = phaseConv
      .filter((m: any) => m.role === "player")
      .map((m: any) => (m.content || "").toLowerCase())
      .join(" ");
    const allMet = rules.required_player_evidence.every((ev: any) => {
      const matched = (ev.keywords || []).filter((kw: string) => playerText.includes(kw.toLowerCase()));
      return matched.length >= (ev.min_matches || 1);
    });
    if (!allMet) return false;
  }

  // Check min_score
  if (rules.min_score !== undefined) {
    const phaseId = (phase as any).phase_id || "";
    const phaseScore = extra.scores[phaseId] || 0;
    if (phaseScore < rules.min_score) return false;
  }

  return true;
}

// ══════════════════════════════════════════════════════════════════
// Module implementation
// ══════════════════════════════════════════════════════════════════

export const MailModule: PhaseModule = {
  type: "mail",

  // ── Detection ──────────────────────────────────────────────────

  canHandle(phase: Record<string, unknown>): boolean {
    const mailConfig = phase.mail_config as Record<string, unknown> | undefined;
    return !!mailConfig;
  },

  // ── Phase enter: no special init ──────────────────────────────

  onEnterPhase(): ModuleResult {
    return EMPTY_RESULT;
  },

  // ── Chat message: not handled by mail module ──────────────────

  onPlayerMessage(): ModuleResult {
    return EMPTY_RESULT;
  },

  // ── Mail sent: dispatches to branch handlers ──────────────────
  // Execution order is preserved EXACTLY as the original monolith:
  //   1. rupture_cto (unconditional if mailKind matches)
  //   2. send_advances_phase gate:
  //      a. completion rules check
  //      b. choice_confirmation flag extraction
  //      c. negotiation_proposal price extraction + contract vars
  //      d. phase advance
  //      e. S3 transition mail
  //      f. Fourvière dynamic mail
  //   3. scope_proposal auto-reply (post-advance, uses wasPhase1ScopeProposal)
  //   4. negotiation_proposal chat reply (when NOT in send_advances_phase)
  //   5. pilot_pitch S3 evaluation
  //   6. Default: EMPTY_RESULT or close compose

  onMailSent(ctx: ModuleContext, mailKind: string, mailBody: string): ModuleResult {
    const extra = (ctx as any).extra as MailModuleContext | undefined;
    if (!extra) return EMPTY_RESULT;

    const actions: ModuleAction[] = [];
    const phase = ctx.phase;
    const flags = ctx.flags;
    const scenarioId = ctx.scenarioId;

    // ── 1. rupture_cto ──────────────────────────────────────────
    if (mailKind === "rupture_cto") {
      const result = handleRuptureCtoMail(flags, extra);
      actions.push(...result.actions);
    }

    // ── 2. send_advances_phase ──────────────────────────────────
    let wasPhase1ScopeProposal = false;
    let phase1MailBody = "";

    const mailConfig = phase.mail_config as Record<string, unknown> | undefined;
    if (mailConfig?.send_advances_phase) {
      const rulesPass = checkCompletionRules(phase, extra);

      // Track scope_proposal for auto-reply after advancing
      wasPhase1ScopeProposal = mailKind === "scope_proposal";
      phase1MailBody = wasPhase1ScopeProposal ? (extra.currentMailDraft?.body || "") : "";

      // 2a. choice_confirmation (S3 Phase 1)
      if (mailKind === "choice_confirmation") {
        const result = handleChoiceConfirmationMail(extra);
        actions.push(...result.actions);
      }

      // 2b. negotiation_proposal extraction (S2 Phase 2)
      if (rulesPass && mailKind === "negotiation_proposal") {
        const result = handleNegotiationProposalExtraction(phase, flags, extra);
        actions.push(...result.actions);
        if (result.earlyReturn) {
          return { actions, advance: false, finish: false };
        }
      }

      if (rulesPass) {
        // 2c. Advance phase
        actions.push({ type: "complete_advance_phase" });

        // 2d. S3 Phase 1→2 transition
        if (mailKind === "choice_confirmation" && scenarioId?.startsWith("founder_03")) {
          const transitionActions = buildS3TransitionActions(flags, extra);
          actions.push(...transitionActions);
        }

        // 2e. Fourvière: analyse_rdv dynamic mail
        if (mailKind === "analyse_rdv" && scenarioId === "heritage_fourviere") {
          const result = handleAnalyseRdvMail(extra);
          actions.push(...result.actions);
          if (result.earlyReturn) {
            return { actions, advance: false, finish: false };
          }
        }
      }
    }

    // ── 3. scope_proposal auto-reply ────────────────────────────
    if (wasPhase1ScopeProposal && phase1MailBody && mailKind === "scope_proposal") {
      const result = handleScopeProposalMail(ctx, extra, phase1MailBody);
      actions.push(...result.actions);
      if (result.earlyReturn) {
        return { actions, advance: false, finish: false };
      }
    }

    // ── 4. negotiation_proposal chat reply ──────────────────────
    if (mailKind === "negotiation_proposal") {
      const result = handleNegotiationChatReply(ctx, phase, extra);
      if (result.earlyReturn) {
        actions.push(...result.actions);
        return { actions, advance: false, finish: false };
      }
    }

    // ── 5. pilot_pitch S3 ───────────────────────────────────────
    if (mailKind === "pilot_pitch" && scenarioId?.startsWith("founder_03")) {
      const result = handlePilotPitchMail(phase, flags, extra);
      actions.push(...result.actions);
      if (result.earlyReturn) {
        return { actions, advance: false, finish: false };
      }
    }

    // ── 6. cold_email auto-reply: KOL responds in chat ────────
    if (mailKind === "cold_email") {
      const result = handleColdEmailReply(ctx, extra);
      actions.push(...result.actions);
      if (result.earlyReturn) {
        return { actions, advance: false, finish: false };
      }
    }

    // ── 7. dsi_response auto-reply: DSI responds in chat ────────
    if (mailKind === "dsi_response") {
      const result = handleDsiResponseReply(ctx, extra);
      actions.push(...result.actions);
      if (result.earlyReturn) {
        return { actions, advance: false, finish: false };
      }
    }

    // ── 8. Default ──────────────────────────────────────────────
    if (actions.length === 0) {
      return EMPTY_RESULT;
    }

    actions.push({ type: "set_compose", show: false });
    return { actions, advance: false, finish: false };
  },

  // ── Contract signed: not handled by mail module ───────────────

  onContractSigned(): ModuleResult {
    return EMPTY_RESULT;
  },

  // ── Clause action: not handled by mail module ─────────────────

  onClauseAction(): ModuleResult {
    return EMPTY_RESULT;
  },

  // ── Timer tick: not relevant ──────────────────────────────────

  onTick(): ModuleResult {
    return EMPTY_RESULT;
  },

  // ── Advance: mail module doesn't independently trigger advance ─

  shouldAdvance(): boolean {
    return false;
  },
};
