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
import { jaccardSimilarity } from "@/app/lib/mailSimilarity";

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

/**
 * Resolve a free-form "to" field into a known scenario actor.
 *
 * Accepted forms (in priority order):
 *   1. exact actor_id ("isabelle_fontaine")
 *   2. local-part of an email ("isabelle.fontaine" / "isabelle_fontaine")
 *   3. canonical email registered on the actor
 *   4. full display name ("Dr. Isabelle Fontaine")
 *   5. tolerant match: if the local-part splits into ≥2 tokens (e.g.
 *      "i.fontaine" → ["i","fontaine"]), AND at least one substantial
 *      token (>2 chars) is a substring of the actor's name, AND a
 *      character of the short token matches a first-name initial,
 *      the actor is considered matched. This keeps the resolver
 *      forgiving across small data drifts between the KOL list document
 *      and scenario.json — without ever silently falling back to the
 *      wrong actor.
 *
 * Returns `undefined` when no actor matches — the caller MUST treat
 * that as a hard error (no `defaultPrompt` fallback).
 */
function resolveRecipientActor(
  toField: string,
  actors: Array<{ actor_id: string; name?: string; [key: string]: unknown }>,
): typeof actors[number] | undefined {
  if (!toField) return undefined;
  const raw = toField.trim();
  const lower = raw.toLowerCase();
  const localPart = lower.split("@")[0]; // "i.fontaine" or "isabelle_fontaine"

  // Pass 1: strict matches
  for (const a of actors) {
    if (a.actor_id === raw) return a;
    if (a.actor_id === localPart) return a;
    const email = (a as any).email;
    if (typeof email === "string" && email.toLowerCase() === lower) return a;
    if (a.name && a.name.toLowerCase() === lower) return a;
  }

  // Pass 2: tolerant match on local-part tokens.
  const tokens = localPart.split(/[._-]+/).filter(Boolean);
  if (tokens.length < 2) return undefined;
  const longTokens = tokens.filter((t) => t.length > 2);
  const shortTokens = tokens.filter((t) => t.length <= 2);
  if (longTokens.length === 0) return undefined;

  for (const a of actors) {
    const name = (a.name || "").toLowerCase();
    if (!name) continue;
    // Every long token must appear in the name (e.g. "fontaine" must be in "dr. isabelle fontaine").
    const allLongMatch = longTokens.every((t) => name.includes(t));
    if (!allLongMatch) continue;
    // If there's a short token (initial like "i"), it must match the first
    // letter of one of the name words — otherwise "j.delacroix" could match
    // any actor whose name contains "delacroix".
    if (shortTokens.length > 0) {
      const nameWords = name.split(/\s+/).filter(Boolean);
      const initialOk = shortTokens.every((s) =>
        nameWords.some((w) => w.startsWith(s)),
      );
      if (!initialOk) continue;
    }
    return a;
  }

  return undefined;
}

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

  const actors = extra.actors || [];
  const targetActor = resolveRecipientActor(toField, actors);

  // ── Strict routing guard (Bug C fix) ──
  // If the recipient cannot be resolved into a known scenario actor,
  // we MUST NOT fall back to `defaultPrompt` (which is the first AI actor
  // of phase 0 — typically the cofounder Alexandre). Doing so used to
  // cause "Alexandre answers the mail addressed to a KOL" bugs.
  //
  // Instead: drop a system inbox mail telling the player the address is
  // unknown, and don't dispatch the AI reply effect at all. No NPC pretends
  // to be the recipient. No silent Alex fallback.
  if (!targetActor) {
    const phaseId = (extra.runtimeView as any)?.phaseId || "";
    actions.push({ type: "set_compose", show: false });
    actions.push({
      type: "add_inbox_mail",
      mail: {
        from: "system",
        subject: "Adresse inconnue — mail non distribué",
        body: `Votre mail à « ${toField} » n'a pas pu être distribué : ce destinataire n'est pas identifié dans vos contacts. Vérifiez l'adresse et réessayez. Aucune réponse ne sera générée pour cet envoi.`,
        phaseId,
      },
    });
    return { actions, earlyReturn: true, didAdvance: false };
  }

  const actorId = targetActor.actor_id;

  // ── Burned KOL guard ──
  // When a DSI_HARD_REJECT regression fires (phase 2), the engine pushes
  // the offending KOL into `flags.burned_kol_ids` (string[]). That contact
  // cannot be re-cold-emailed for the rest of the run — narratively the
  // DSI won't reconsider, and the player must find another prospect.
  const sessionFlags = ((ctx.session as any)?.flags ?? {}) as Record<string, unknown>;
  const burnedList = Array.isArray(sessionFlags.burned_kol_ids)
    ? (sessionFlags.burned_kol_ids as string[])
    : [];
  if (burnedList.includes(actorId)) {
    const phaseId = (extra.runtimeView as any)?.phaseId || "";
    actions.push({ type: "set_compose", show: false });
    actions.push({
      type: "add_inbox_mail",
      mail: {
        from: "system",
        subject: "Mail non distribué — contact grillé",
        body: `« ${(targetActor as any).name || actorId} » a déjà été en évaluation chez son DSI et le dossier a été clos défavorablement. Tu ne peux pas le re-prospecter — vise un autre KOL dans la liste.`,
        phaseId,
      },
    });
    return { actions, earlyReturn: true, didAdvance: false };
  }

  // ── Cold email whitelist (Bug C fix) ──
  // A cold email is a *prospection* mail. It can only target an AI actor of
  // the current phase WHO IS NOT already a visible contact in the left panel.
  // In S5 Phase 1 this resolves to the 10 KOLs (ai_actors minus alexandre_morel).
  //
  // This stops the player from accidentally cold-emailing internal colleagues
  // (Alexandre, Claire Vasseur, …) and getting a generic LLM reply that
  // bypasses our prospection state machine.
  //
  // Driven by the declarative scenario fields — no scenario-specific code here.
  const phaseAi: string[] = Array.isArray((ctx.phase as any)?.ai_actors)
    ? ((ctx.phase as any).ai_actors as string[])
    : [];
  const phaseChatVisible: string[] = Array.isArray((ctx.phase as any)?.chat_visible_actors)
    ? ((ctx.phase as any).chat_visible_actors as string[])
    : [];
  const isProspect =
    phaseAi.includes(actorId) &&
    !phaseChatVisible.includes(actorId) &&
    actorId !== "player";
  if (!isProspect) {
    const phaseId = (extra.runtimeView as any)?.phaseId || "";
    actions.push({ type: "set_compose", show: false });
    actions.push({
      type: "add_inbox_mail",
      mail: {
        from: "system",
        subject: "Mail non distribué — cible inadéquate",
        body: `« ${(targetActor as any).name || actorId} » n'est pas une cible de prospection pour cette phase (c'est un contact interne ou hors périmètre). Adresse ton mail à un KOL de la liste.`,
        phaseId,
      },
    });
    return { actions, earlyReturn: true, didAdvance: false };
  }

  // Find the actor's prompt file
  // ── Strict: no defaultPrompt fallback in prospection mode ──
  // If the resolved KOL has no loaded prompt, that is a scenario data
  // error — we'd rather generate nothing than have Alex impersonate a KOL.
  const activePrompt = extra.activePromptMap[actorId];
  if (!activePrompt) {
    const phaseId = (extra.runtimeView as any)?.phaseId || "";
    actions.push({ type: "set_compose", show: false });
    actions.push({
      type: "add_inbox_mail",
      mail: {
        from: "system",
        subject: "Mail non distribué — destinataire indisponible",
        body: `Le destinataire « ${(targetActor as any).name || actorId} » est temporairement injoignable. Réessayez plus tard.`,
        phaseId,
      },
    });
    return { actions, earlyReturn: true, didAdvance: false };
  }

  // ── C1: forward score-based advancement config to the API ──────
  // When the current phase declares `advancement: { mode: "prospection_evaluation", … }`
  // (see app/lib/types.ts PhaseDefinition.advancement), we hand it to the chat
  // route along with the scoring criteria so the API can compute a deterministic
  // `prospection_evaluation` block. The frontend reads that block to decide
  // whether to advance — instead of scanning the NPC reply for keywords.
  const phase = ctx.phase as any;
  const advancementConfig = phase?.advancement;
  const scoringCriteria = phase?.scoring?.criteria;
  const evalMode =
    advancementConfig?.mode === "prospection_evaluation" ? "prospection" : undefined;

  // ── C2: similarity vs previously-sent mails to the same recipient ──
  // Computed by mailSimilarity helper (Jaccard on normalised tokens).
  // Used by the API both to force `interested = false` above threshold AND
  // to instruct the NPC to acknowledge the repetition explicitly.
  const sentMails = ((ctx.session as any)?.sentMails ?? []) as Array<{
    to?: string;
    body?: string;
    phaseId?: string;
  }>;
  const similarity = computeColdEmailSimilarity(
    mailDraft.body || "",
    actorId,
    targetActor,
    sentMails,
  );

  actions.push({ type: "set_compose", show: false });
  actions.push({
    type: "async_effect",
    effect: {
      kind: "mail_inbox_reply",
      actorId,
      mailBody: mailDraft.body || "",
      playerMessageSummary: `[Cold email envoyé à ${targetActor?.name || actorId}] ${(mailDraft.body || "").substring(0, 200)}...`,
      mailSummary: `[Le joueur a envoyé un cold email de prospection avec le contenu suivant : ${mailDraft.body || ""}]`,
      replySubject: `RE: ${mailDraft.subject || "Prospection Orisio"}`,
      originalSubject: mailDraft.subject || "Prospection Orisio",
      displayPlayerName: extra.displayPlayerName,
      narrative: (ctx.scenario as any).narrative,
      runtimeView: extra.runtimeView,
      roleplayPrompt: activePrompt,
      // ── C1 payload extensions ──
      eval_mode: evalMode,
      advancement_config: advancementConfig,
      target_actor_id: actorId,
      criteria: Array.isArray(scoringCriteria) ? scoringCriteria : [],
      // ── C2 payload extension ──
      similarity_to_previous: similarity,
    },
  });

  return { actions, earlyReturn: true, didAdvance: false };
}

/**
 * Compute the maximum Jaccard similarity between the new cold-email body
 * and previous mails the player sent to the same recipient (in any phase).
 *
 * Returns 0 when no previous mail to the same recipient exists.
 * The actual tokenisation/Jaccard logic lives in app/lib/mailSimilarity.ts
 * so it stays pure and unit-testable; this wrapper resolves the recipient.
 */
function computeColdEmailSimilarity(
  newBody: string,
  actorId: string,
  targetActor: any,
  sentMails: Array<{ to?: string; body?: string }>,
): number {
  if (!newBody.trim() || sentMails.length === 0) return 0;

  // Match a sent mail to the same recipient. The "to" field may be an
  // actor_id, an email or a name — normalise like handleColdEmailReply.
  const aliases = new Set<string>();
  if (actorId) aliases.add(actorId.toLowerCase());
  if (targetActor?.actor_id) aliases.add(String(targetActor.actor_id).toLowerCase());
  if (targetActor?.name) aliases.add(String(targetActor.name).toLowerCase());
  if (targetActor?.email) aliases.add(String(targetActor.email).toLowerCase());

  // CRITICAL: by the time this runs, handleSendMail has already pushed the
  // current outbound mail into session.sentMails. We MUST exclude it from
  // the "previous bodies" list, otherwise Jaccard returns 1.0 against the
  // mail itself and the engine wrongly treats every first email as a
  // re-send. (Symptom: KOL replies "Je vous ai déjà répondu" on first contact.)
  const newBodyNormalised = newBody.trim();
  const previousBodies = sentMails
    .filter((m) => {
      const to = (m.to || "").trim().toLowerCase();
      if (!to) return false;
      if (aliases.has(to)) return true;
      // tolerate the local part of an email being passed as actor_id
      const localPart = to.split("@")[0];
      return aliases.has(localPart);
    })
    .map((m) => m.body || "")
    .filter((b) => {
      const t = b.trim();
      if (t.length === 0) return false;
      // Exclude the current outbound mail (same exact body) — see comment above.
      if (t === newBodyNormalised) return false;
      return true;
    });

  if (previousBodies.length === 0) return 0;

  let max = 0;
  for (const prev of previousBodies) {
    const sim = jaccardSimilarity(newBody, prev);
    if (sim > max) max = sim;
  }
  return max;
}

// ── BRANCH 3c: dsi_response auto-reply ─────────────────────────
// S5 Phase 2: player sends a mail to the DSI (Eric Moreau).
// The DSI replies via mail_inbox_reply so the response appears
// in the player's inbox (not in chat).

function handleDsiResponseReply(
  ctx: ModuleContext,
  extra: MailModuleContext,
): MailBranchResult {
  const actions: ModuleAction[] = [];
  const mailDraft = extra.currentMailDraft;
  if (!mailDraft) return { actions, earlyReturn: false, didAdvance: false };

  const actorId = "eric_moreau";
  const activePrompt = extra.activePromptMap[actorId];

  // ── Strict routing: no fallback to defaultPrompt for the DSI either ──
  if (!activePrompt) {
    const phaseId = (extra.runtimeView as any)?.phaseId || "";
    actions.push({ type: "set_compose", show: false });
    actions.push({
      type: "add_inbox_mail",
      mail: {
        from: "system",
        subject: "Mail non distribué — destinataire indisponible",
        body: `Le destinataire « ${actorId} » est temporairement injoignable. Réessayez plus tard.`,
        phaseId,
      },
    });
    return { actions, earlyReturn: true, didAdvance: false };
  }

  // ── C2: forward score-based dsi_validation config to the API ──────
  // When the phase declares advancement.mode === "dsi_validation", the
  // API runs a deterministic state machine (DSI_APPROVED / NEEDS_CLARIFICATION
  // / HARD_REJECT) and returns `phase_evaluation`. The frontend wires that
  // into the phase progression + the regression path on HARD_REJECT.
  const phase = ctx.phase as any;
  const advancementConfig = phase?.advancement;
  const scoringCriteria = phase?.scoring?.criteria;
  const evalMode =
    advancementConfig?.mode === "dsi_validation" ? "dsi_validation" : undefined;

  actions.push({ type: "set_compose", show: false });
  actions.push({
    type: "async_effect",
    effect: {
      kind: "mail_inbox_reply",
      actorId,
      mailBody: mailDraft.body || "",
      playerMessageSummary: `[Réponse envoyée à la DSI] ${(mailDraft.body || "").substring(0, 200)}...`,
      mailSummary: `[Le joueur a envoyé sa réponse à la DSI avec le contenu suivant : ${mailDraft.body || ""}]`,
      replySubject: "RE: Demande d'information — Solution Orisio",
      originalSubject: "Demande d'information — Solution Orisio",
      displayPlayerName: extra.displayPlayerName,
      narrative: (ctx.scenario as any).narrative,
      runtimeView: extra.runtimeView,
      roleplayPrompt: activePrompt,
      // ── C2 payload extensions ──
      eval_mode: evalMode,
      advancement_config: advancementConfig,
      target_actor_id: actorId,
      criteria: Array.isArray(scoringCriteria) ? scoringCriteria : [],
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

  // Detect target establishment from "to" email address (primary detection).
  let targetKey: "chose_chu" | "chose_saint_martin" | "chose_clinique" | null = null;
  if (toField.includes("chu-bordeaux") || toField.includes("lemaire")) {
    targetKey = "chose_chu";
  } else if (toField.includes("saintmartin") || toField.includes("hp-saintmartin") || toField.includes("castex")) {
    targetKey = "chose_saint_martin";
  } else if (toField.includes("saint-augustin") || toField.includes("renaud-picard")) {
    targetKey = "chose_clinique";
  }

  // ── Burned-establishment guard ────────────────────────────────────
  // Once an establishment has rejected our pitch, the player cannot
  // re-prospect it. Same UX as the S5 burned KOL guard : surface a
  // system mail and leave the session state untouched. Without this,
  // the player could spam the same dead-end establishment forever.
  const burnedNow: string[] = Array.isArray(flags.burned_establishments)
    ? (flags.burned_establishments as string[])
    : [];
  if (targetKey && burnedNow.includes(targetKey)) {
    const labels: Record<string, string> = {
      chose_chu: "le CHU de Bordeaux",
      chose_saint_martin: "Saint-Martin",
      chose_clinique: "la Clinique Saint-Augustin",
    };
    const phaseIdForBurn = (phase as any).phase_id || "";
    actions.push({ type: "set_compose", show: false });
    actions.push({
      type: "add_inbox_mail",
      mail: {
        from: "system",
        subject: "Mail non distribué — établissement grillé",
        body: `« ${labels[targetKey]} » a déjà refusé votre pitch. Vous ne pouvez pas les re-prospecter. Choisissez un autre établissement parmi ceux qui restent.`,
        phaseId: phaseIdForBurn,
      },
    });
    return { actions, earlyReturn: true, didAdvance: false };
  }

  // Apply the establishment selection flags now that we know it's not burned.
  if (targetKey === "chose_chu") {
    actions.push({ type: "set_flags", flags: { chose_chu: true, chose_saint_martin: false, chose_clinique: false } });
  } else if (targetKey === "chose_saint_martin") {
    actions.push({ type: "set_flags", flags: { chose_saint_martin: true, chose_chu: false, chose_clinique: false } });
  } else if (targetKey === "chose_clinique") {
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

  // ── PITCH REJECTED → block advancement, burn establishment, ask user to retry ──
  // Bug fix : avant, le code pivotait automatiquement vers Clinique Saint-Augustin
  // (pitch_accepted=true + complete_advance_phase) ce qui forçait le joueur en
  // phase contrat sans qu'il ait validé le choix. Le user veut au contraire que
  // le pitch refusé reste BLOQUANT : on garde le joueur en phase pitch_mail,
  // on marque l'établissement refusé comme "burned", et Alexandre l'invite à
  // re-prospecter parmi les établissements restants.
  actions.push({ type: "set_compose", show: false });

  const burnedAfter: string[] = Array.isArray(flags.burned_establishments)
    ? [...(flags.burned_establishments as string[])]
    : [];
  // Identify the establishment we just tried so we can burn it.
  const justTried = choseCHU ? "chose_chu" : choseSM ? "chose_saint_martin" : "chose_clinique";
  if (!burnedAfter.includes(justTried)) burnedAfter.push(justTried);

  // Compute remaining options for Alexandre's contextual message.
  const allOptions: Array<{ key: string; label: string }> = [
    { key: "chose_chu", label: "le CHU de Bordeaux" },
    { key: "chose_saint_martin", label: "Saint-Martin" },
    { key: "chose_clinique", label: "ma clinique Saint-Augustin" },
  ];
  const remaining = allOptions.filter((o) => !burnedAfter.includes(o.key));
  const justTriedLabel = allOptions.find((o) => o.key === justTried)?.label || "cet établissement";

  // Always reset the chosen_* flags so the player can pick again. Burn list
  // persists separately. pitch_accepted stays FALSE so the phase doesn't
  // advance.
  actions.push({
    type: "set_flags",
    flags: {
      pitch_rejected: true,
      chose_chu: false,
      chose_saint_martin: false,
      chose_clinique: false,
      burned_establishments: burnedAfter as any,
    },
  });

  // Wipe the pitch mail draft so a fresh attempt starts blank.
  const currentPhaseId = (phase as any).phase_id || "";
  const rejectionActor = resolveContactActor(choseCHU, choseSM);

  // Build the contextual Alexandre message — list remaining options OR
  // surface the game-over state if all 3 are burned.
  let alexMessage: string;
  if (remaining.length === 0) {
    // All three establishments refused — game over for the pilot.
    alexMessage =
      `Putain… on a tout brûlé. ${justTriedLabel} a refusé aussi, et c'était le dernier établissement de la liste. On va devoir tout reprendre à zéro, il faut retravailler ton pitch en profondeur avant de re-prospecter qui que ce soit.`;
  } else if (remaining.length === 1) {
    alexMessage =
      `Aïe… ${justTriedLabel} a refusé. Il ne nous reste plus que ${remaining[0].label}. Reprends le pitch et fais-le tourner — cette fois soigne le contenu, on n'aura pas de troisième chance.`;
  } else {
    const lastTwo = remaining.map((r) => r.label).join(" ou ");
    alexMessage =
      `Aïe… ${justTriedLabel} a refusé. Bon, on n'y revient pas — ils sont grillés. Il te reste ${lastTwo}. Soigne mieux ton pitch cette fois (gratuité, durée 8 semaines, valeur sur l'occupation des blocs, HDS) et renvoie un mail.`;
  }

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
            content: alexMessage,
          },
          { type: "set_view", view: "chat" },
          { type: "set_contact", actorId: "alexandre_morel" },
        ],
      },
    ],
  });

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
