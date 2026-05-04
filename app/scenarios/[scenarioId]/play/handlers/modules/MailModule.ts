// ══════════════════════════════════════════════════════════════════
// MailModule — PhaseModule wrapper for handleSendMail logic
// ══════════════════════════════════════════════════════════════════
//
// MIGRATION STRICTE: copier-coller exact de la logique handleSendMail
// depuis page.tsx. Aucune simplification, aucun refactoring.
//
// Handles all mail_config.kind branches:
//   - rupture_cto: bad leaver logic
//   - send_advances_phase: rulesPass + choice_confirmation +
//     negotiation_proposal + advance + post-advance effects
//   - scope_proposal auto-reply (Thomas via MailHandler)
//   - negotiation_proposal chat reply
//   - analyse_rdv (Fourvière dynamic mail generation)
//   - pilot_pitch S3 (pitch evaluation + accept/reject/pivot)
//   - Default: setSession + setShowCompose
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

// ── Extended context for mail operations ──
// Standard ModuleContext doesn't carry enough data for mail logic.
// page.tsx passes these as extra fields on the context.

export interface MailModuleExtra {
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

// ══════════════════════════════════════════════════════════════════
// Module implementation
// ══════════════════════════════════════════════════════════════════

export const MailModule: PhaseModule = {
  type: "mail",

  // ── Detection ──────────────────────────────────────────────────

  canHandle(phase: Record<string, unknown>): boolean {
    // A phase is a mail phase if it declares mail_config
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

  // ── Mail sent: THE BIG ONE ────────────────────────────────────
  // This is the exact migration of handleSendMail from page.tsx.
  // ctx.session contains the "next" clone (already has sendCurrentPhaseMail applied).
  // The extra field carries mail-specific data.

  onMailSent(ctx: ModuleContext, mailKind: string, mailBody: string): ModuleResult {
    const extra = (ctx as any).extra as MailModuleExtra | undefined;
    if (!extra) return EMPTY_RESULT;

    const actions: ModuleAction[] = [];
    const phase = ctx.phase;
    const flags = ctx.flags;
    const scenarioId = ctx.scenarioId;

    // ════════════════════════════════════════════════════════════
    // BRANCH 1: rupture_cto — bad leaver logic
    // ════════════════════════════════════════════════════════════
    if (mailKind === "rupture_cto" && extra.isFounderScenario) {
      const hasExclusivity = !!flags.pacte_signed_clean;
      const ctoId = extra.chosenCtoId || "sofia_renault";
      const ctoActor = extra.actors.find((a: any) => a.actor_id === ctoId);
      const ctoName = ctoActor?.name || "le CTO";

      if (hasExclusivity) {
        // CAS 1: clause présente → bad leaver, CTO sort avec 0€
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
        // CAS 2: clause absente → CTO en position de force, indemnité 2 500€
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
    }

    // ════════════════════════════════════════════════════════════
    // Track scope_proposal for auto-reply after advancing
    // ════════════════════════════════════════════════════════════
    let wasPhase1ScopeProposal = false;
    let phase1MailBody = "";

    // ════════════════════════════════════════════════════════════
    // BRANCH 2: send_advances_phase
    // ════════════════════════════════════════════════════════════
    const mailConfig = phase.mail_config as Record<string, unknown> | undefined;
    if (mailConfig?.send_advances_phase) {
      // ── Check completion rules BEFORE advancing ──
      const rulesPass = (() => {
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
      })();

      // ── Detect scope_proposal for auto-reply ──
      wasPhase1ScopeProposal = mailKind === "scope_proposal";
      phase1MailBody = wasPhase1ScopeProposal ? (extra.currentMailDraft?.body || "") : "";

      // ── Scénario 3 Phase 1: extract establishment choice from confirmation mail ──
      if (mailKind === "choice_confirmation") {
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
      }

      // ── Extract contract variables from negotiation proposal mail ──
      if (rulesPass && mailKind === "negotiation_proposal" && (phase as any).phase_id === "phase_2_negotiation") {
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
          // Thomas sends an angry rejection in chat after a delay
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
          return { actions, advance: false, finish: false };
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
      }

      if (rulesPass) {
        // ── Advance phase ──
        actions.push({ type: "complete_advance_phase" });

        // ── Scénario 3: Phase 1→2 transition — Alexandre sends a mail with the contact info ──
        if (mailKind === "choice_confirmation" && scenarioId?.startsWith("founder_03")) {
          const contactMap: Record<string, { name: string; email: string; label: string }> = {
            chose_chu: { name: "Dr. Pierre Lemaire", email: "p.lemaire@chu-bordeaux.fr", label: "le CHU de Bordeaux" },
            chose_saint_martin: { name: "Laurent Castex", email: "l.castex@hp-saintmartin.fr", label: "l'Hôpital Saint-Martin" },
            chose_clinique: { name: "Dr. Claire Renaud-Picard", email: "c.renaud-picard@clinique-saint-augustin.fr", label: "la Clinique Saint-Augustin" },
          };
          // We need to read the flag we just set — use the mailBody to re-derive
          const bodyLower2 = (extra.currentMailDraft?.body || "").toLowerCase();
          let choiceKey = "chose_clinique";
          if (bodyLower2.includes("chu") || bodyLower2.includes("pellegrin") || bodyLower2.includes("bordeaux")) {
            choiceKey = "chose_chu";
          } else if (bodyLower2.includes("saint-martin") || bodyLower2.includes("saint martin") || bodyLower2.includes("ramsay")) {
            choiceKey = "chose_saint_martin";
          } else if (bodyLower2.includes("saint-augustin") || bodyLower2.includes("saint augustin") || bodyLower2.includes("clinique")) {
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
              phaseId: "__next_phase__", // page.tsx resolves to actual next phase ID
            },
          });
          // Switch to mail view
          actions.push({ type: "set_view", view: "mail" });
        }

        // ── Fourvière: generate dynamic Claire mail with travaux summary ──
        if (mailKind === "analyse_rdv" && scenarioId === "heritage_fourviere") {
          const analyseBody = extra.currentMailDraft?.body || "";
          const dynConfig = (phase as any)?.dynamic_entry_mail;
          // dynConfig is on the NEXT phase, but we need to check if the current phase
          // triggers dynamic mail generation. page.tsx reads scenario.phases[next.currentPhaseIndex].
          // Since we can't read the next phase here, we use async_effect and let page.tsx handle it.
          if (analyseBody.trim()) {
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
            // Early return — page.tsx handles the async mail generation
            return { actions, advance: false, finish: false };
          }
        }
      }
    }

    // ════════════════════════════════════════════════════════════
    // BRANCH 3: scope_proposal auto-reply (Thomas via MailHandler)
    // ════════════════════════════════════════════════════════════
    if (wasPhase1ScopeProposal && phase1MailBody) {
      // shouldAutoReply check (same as MailHandler.shouldAutoReply)
      if (mailKind === "scope_proposal") {
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
        // Early return — page.tsx handles the async reply
        return { actions, advance: false, finish: false };
      }
    }

    // ════════════════════════════════════════════════════════════
    // BRANCH 4: negotiation_proposal chat reply
    // ════════════════════════════════════════════════════════════
    if (mailKind === "negotiation_proposal" && (phase as any).phase_id === "phase_2_negotiation") {
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
      // Early return
      return { actions, advance: false, finish: false };
    }

    // ════════════════════════════════════════════════════════════
    // BRANCH 5: pilot_pitch S3 — pitch evaluation
    // ════════════════════════════════════════════════════════════
    if (mailKind === "pilot_pitch" && scenarioId?.startsWith("founder_03")) {
      const pitchMailBody = extra.currentMailDraft?.body || "";
      const bodyLower = pitchMailBody.toLowerCase();
      const toField = (extra.currentMailDraft?.to || "").toLowerCase();

      // Detect establishment from the "to" email address (primary detection)
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

      // pitchScore >= 4 = good, < 4 = bad
      const pitchIsGood = pitchScore >= 4;

      // Determine which establishment was chosen (from existing flags, since we may have just set them)
      // Re-derive from toField since flags may not be applied yet
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

      if (pitchIsGood) {
        // ── PITCH ACCEPTED → advance to Phase 3 ──
        actions.push({ type: "set_flags", flags: { pitch_accepted: true } });
        // complete_advance_phase handles: completeCurrentPhaseAndAdvance + resolveDynamicActors
        // + resolveEstablishmentPlaceholders + injectPhaseEntryEvents + mail defaults
        // + injecting the contract mail via schedule_timed_event
        actions.push({ type: "complete_advance_phase" });
        // Schedule the contract mail for Phase 3
        const choiceKey2 = choseCHU ? "chose_chu" : choseSM ? "chose_saint_martin" : "chose_clinique";
        const contratMap: Record<string, { id: string; label: string }> = {
          chose_chu: { id: "contrat_chu", label: "Convention de test — CHU de Bordeaux" },
          chose_saint_martin: { id: "contrat_saint_martin", label: "Convention de test — Hôpital Saint-Martin" },
          chose_clinique: { id: "contrat_clinique", label: "Convention de test — Clinique Saint-Augustin" },
        };
        const contrat = contratMap[choiceKey2];
        const contactActor = resolveContactActor(choseCHU, choseSM);
        actions.push({
          type: "schedule_timed_event",
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
        actions.push({ type: "set_compose", show: false });
        return { actions, advance: false, finish: false };
      } else {
        // ── PITCH REJECTED → fallback mechanism ──
        actions.push({ type: "set_flags", flags: { pitch_rejected: true } });
        actions.push({ type: "set_compose", show: false });

        if (!choseClinique) {
          // CHU or Saint-Martin refused → Alexandre intervenes, switches to clinique
          const rejectionActor = resolveContactActor(choseCHU, choseSM);
          const etablissement = choseCHU ? "le CHU" : "Saint-Martin";
          const currentPhaseId = (phase as any).phase_id || "";

          // First delay: contact sends rejection mail
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
              // Second delay: Alexandre intervenes
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
                  // Advance to Phase 3 after switch
                  { type: "complete_advance_phase" },
                  // Schedule contract mail
                  {
                    type: "schedule_timed_event",
                    event: {
                      id: "__next_phase__::contrat_mail",
                      actor: "contact_clinique",
                      content: "Suite à votre demande de test pilote, veuillez trouver ci-joint la convention type applicable. Merci de retourner le document signé ou de transmettre vos observations sous 10 jours ouvrés.",
                      dueAt: Date.now() + 5000,
                      phaseId: "__next_phase__",
                      type: "mail",
                      subject: "Re: Orisio — Proposition de test pilote gratuit",
                      attachments: [{ id: "contrat_clinique", label: "Convention de test — Clinique Saint-Augustin" }],
                    },
                  },
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
              {
                type: "schedule_timed_event",
                event: {
                  id: "__next_phase__::contrat_mail",
                  actor: "contact_clinique",
                  content: "Suite à votre demande de test pilote, veuillez trouver ci-joint la convention type applicable. Merci de retourner le document signé ou de transmettre vos observations sous 10 jours ouvrés.",
                  dueAt: Date.now() + 5000,
                  phaseId: "__next_phase__",
                  type: "mail",
                  subject: "Re: Orisio — Proposition de test pilote gratuit",
                  attachments: [{ id: "contrat_clinique", label: "Convention de test — Clinique Saint-Augustin" }],
                },
              },
              { type: "set_view", view: "chat" },
              { type: "set_contact", actorId: "alexandre_morel" },
            ],
          });
        }
        return { actions, advance: false, finish: false };
      }
    }

    // ════════════════════════════════════════════════════════════
    // DEFAULT: no special handling
    // ════════════════════════════════════════════════════════════
    // If no branch matched and no actions were added, return empty
    // to let page.tsx apply its default behavior (setSession + setShowCompose)
    if (actions.length === 0) {
      return EMPTY_RESULT;
    }

    // Some actions were added (e.g., rupture_cto flags + messages, or send_advances_phase)
    // Add the default compose close
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
