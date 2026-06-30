/**
 * executeMailAsyncEffect — central dispatcher for async effects emitted
 * by MailModule (kind = mail_auto_reply / mail_inbox_reply /
 * negotiation_chat_reply / fourviere_dynamic_mail).
 *
 * Extracted from page.tsx so the 540-line monster lives outside the
 * monolith. The function still owns all 4 kinds — splitting them into
 * sub-files per kind is a follow-up refactor; the structure here makes
 * it trivial.
 *
 * Contract
 * ────────
 * The page passes a `deps` bag with everything we need (refs, setters,
 * helpers). This module never touches React directly — all side effects
 * go through the deps callbacks.
 *
 * The S5 HARD_REJECT / pivot Clinique logic lives in `mail_inbox_reply`.
 * Any change there has been historically the source of bugs — guard
 * with the offline grader + E2E tests before touching.
 */

import type { ScenarioDefinition } from "@/app/lib/types";
import {
  addAIMessage,
  addInboxMail,
  addPlayerMessage,
  applyEvaluation,
  checkNpcFailureKeywords,
  checkNpcSuccessKeywords,
  completeCurrentPhaseAndAdvance,
  handlePhaseFailure,
  injectPhaseEntryEvents,
  isCurrentPhaseValidatedByRules,
  unlockCurrentPhase,
} from "@/app/lib/runtime";

type MainView = "chat" | "mail" | "docs" | "context" | "notes";

export type ExecuteMailAsyncEffectDeps = {
  scenario: ScenarioDefinition;
  /** Authoritative session for closure-free reads (cf. recentMailThread build). */
  sessionRef: { current: any };
  /** Auth header builder. */
  apiHeaders: (extra?: Record<string, string>) => Record<string, string>;
  /** Clone helper. */
  cloneSession: (s: any) => any;
  /** Page setters. */
  setSession: (s: any) => void;
  setSelectedMailId: (id: string | null) => void;
  setShowCompose: (b: boolean) => void;
  setSelectedContact: (id: string | null) => void;
  setMainView: (v: MainView) => void;
  /** Audio cue. */
  playNotificationSound: () => void;
  /** Phase-bookkeeping helpers owned by the page. */
  resolveDynamicActors: (sess: any) => void;
  resolveEstablishmentPlaceholders: (sess: any) => void;
  dispatchEnterPhase: (sess: any) => boolean;
  /** Founder checkpoint helpers. */
  notifyCheckpointClear: () => void;
  notifyCheckpointRollback: (targetPhaseId: string, targetPhaseIndex: number) => void;
};

export function executeMailAsyncEffect(
  effect: any,
  next: any,
  deps: ExecuteMailAsyncEffectDeps,
): void {
  const {
    scenario,
    sessionRef,
    apiHeaders,
    cloneSession,
    setSession,
    setSelectedMailId,
    setShowCompose,
    setSelectedContact,
    setMainView,
    playNotificationSound,
    resolveDynamicActors,
    resolveEstablishmentPlaceholders,
    dispatchEnterPhase,
    notifyCheckpointClear,
    notifyCheckpointRollback,
  } = deps;

  switch (effect.kind) {
    case "mail_auto_reply": {
      // Scope proposal auto-reply from Thomas
      const mailSummary = effect.mailSummary;
      (async () => {
        try {
          const res = await fetch("/api/chat", {
            method: "POST",
            headers: apiHeaders(),
            body: JSON.stringify({
              playerName: effect.displayPlayerName,
              message: mailSummary,
              phaseTitle: (effect.runtimeView as any).phaseTitle,
              phaseObjective: (effect.runtimeView as any).phaseObjective,
              phaseFocus: (effect.runtimeView as any).phaseFocus,
              phasePrompt: (effect.runtimeView as any).phasePrompt,
              criteria: (effect.runtimeView as any).criteria,
              mode: (effect.runtimeView as any).adaptiveMode,
              narrative: effect.narrative,
              recentConversation: [],
              playerMessages: [effect.mailBody],
              roleplayPrompt: effect.roleplayPrompt,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            playNotificationSound();
            const final2 = cloneSession(sessionRef.current || next);
            addPlayerMessage(final2, effect.playerMessageSummary, effect.actorId);
            addAIMessage(final2, data.reply, effect.actorId);
            applyEvaluation(final2, data.matched_criteria || [], data.score_delta || 0, data.flags_to_set || {});
            // ── Success keywords: NPC positive response sets flags (e.g., KOL interested) ──
            const sf = checkNpcSuccessKeywords(final2, data.reply);
            if (sf) {
              for (const [k, v] of Object.entries(sf)) {
                if (v === true) final2.flags[k] = true;
              }
            }
            setSession(final2);
          }
        } catch (err) {
          console.error("Error in mail_auto_reply async effect:", err);
        }
      })();
      break;
    }
    case "mail_inbox_reply": {
      // NPC replies by mail (inbox) instead of chat — used for cold email KOL replies & DSI responses
      const mailSummary3 = effect.mailSummary;
      // ── Bug 1 fix: build a real mail thread history for this NPC ──
      // Without this, the NPC was treated as stateless — he would re-ask
      // "what's your stack?" on every retry as if it were a brand new thread.
      // We feed past sent_mails (player) and inbox replies (this NPC) into
      // recentConversation so the API can give him real continuity.
      const currentPhaseIdLive =
        scenario?.phases?.[(sessionRef.current || next).currentPhaseIndex]?.phase_id ?? "";
      const sessionForLookup = sessionRef.current || next;
      const targetActorIdForThread = (effect as any).target_actor_id || effect.actorId;

      type ThreadMsg = { role: "user" | "assistant"; content: string; ts: number };
      const threadMsgs: ThreadMsg[] = [];
      // The mail we are about to send is ALREADY in session.sentMails by the
      // time this effect runs (handleSendMail mutates the session before
      // dispatching mail_inbox_reply). We must NOT include it in the thread
      // history — otherwise the LLM sees the same body twice (in
      // recentConversation AND in the current user message) and concludes
      // it has already replied. That's the "Maxime says 'I already
      // replied' on the very first contact" bug.
      const currentMailBody = (effect.mailBody || "").trim();

      // Player's previous outbound mails to this recipient in this phase.
      for (const m of (sessionForLookup.sentMails || [])) {
        if (m.phaseId !== currentPhaseIdLive) continue;
        // Resolve "to" to actor id like MailModule does.
        const toLower = (m.to || "").trim().toLowerCase();
        const matches =
          toLower === targetActorIdForThread.toLowerCase() ||
          toLower.split("@")[0] === targetActorIdForThread.toLowerCase();
        if (!matches) continue;
        // Skip the current mail (we add it as the "current message" below,
        // not as past history).
        if ((m.body || "").trim() === currentMailBody) continue;
        threadMsgs.push({ role: "user", content: m.body || "", ts: m.sentAt || 0 });
      }
      // NPC's previous inbound replies in this phase.
      for (const m of (sessionForLookup.inboxMails || [])) {
        if (m.phaseId !== currentPhaseIdLive) continue;
        if (m.from !== targetActorIdForThread) continue;
        threadMsgs.push({
          role: "assistant",
          content: m.body || "",
          ts: (m as any).receivedAt || 0,
        });
      }
      threadMsgs.sort((a, b) => a.ts - b.ts);
      const recentMailThread = threadMsgs.map(({ role, content }) => ({ role, content }));

      // ── Bug 1bis: "1 KOL = 1 chance" — once this NPC has replied,
      // a follow-up cannot magically flip him to interested. Computed
      // from inboxMails so it survives across retries.
      const previouslyReplied = (sessionForLookup.inboxMails || []).some(
        (m: any) => m.phaseId === currentPhaseIdLive && m.from === targetActorIdForThread,
      );

      (async () => {
        try {
          const res = await fetch("/api/chat", {
            method: "POST",
            headers: apiHeaders(),
            body: JSON.stringify({
              playerName: effect.displayPlayerName,
              message: mailSummary3,
              phaseTitle: (effect.runtimeView as any).phaseTitle,
              phaseObjective: (effect.runtimeView as any).phaseObjective,
              phaseFocus: (effect.runtimeView as any).phaseFocus,
              phasePrompt: (effect.runtimeView as any).phasePrompt,
              criteria: (effect as any).criteria ?? (effect.runtimeView as any).criteria,
              mode: (effect.runtimeView as any).adaptiveMode,
              narrative: effect.narrative,
              recentConversation: recentMailThread,
              playerMessages: [effect.mailBody],
              roleplayPrompt: effect.roleplayPrompt,
              eval_mode: (effect as any).eval_mode,
              advancement_config: (effect as any).advancement_config,
              target_actor_id: (effect as any).target_actor_id,
              similarity_to_previous: (effect as any).similarity_to_previous,
              previously_replied: previouslyReplied,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            const replyText = (data.reply || "").trim();
            const isSilence = replyText === "[PAS DE RÉPONSE]" || replyText.includes("[PAS DE RÉPONSE]");

            // ── LOG #0a — runs unconditionally on every mail_inbox_reply. ──
            // eslint-disable-next-line no-console
            console.log("[S5_MAIL_INBOX_REPLY_RECEIVED]", {
              effect_actorId: effect.actorId,
              effect_eval_mode: (effect as any).eval_mode,
              has_advancement_config: !!(effect as any).advancement_config,
              advancement_config: (effect as any).advancement_config,
              api_returned_phase_evaluation: !!data.phase_evaluation,
              api_returned_phase_evaluation_state: data.phase_evaluation?.state,
              api_returned_prospection_evaluation: !!data.prospection_evaluation,
              api_returned_reply_first_120: replyText.slice(0, 120),
              isSilence,
            });

            const final2 = cloneSession(sessionRef.current || next);
            // Record player's sent mail in conversation history
            addPlayerMessage(final2, effect.playerMessageSummary, effect.actorId);

            if (isSilence) {
              // KOL decided not to respond — silence radio, no inbox mail, no chat message, no notification
            } else {
              playNotificationSound();
              applyEvaluation(final2, data.matched_criteria || [], data.score_delta || 0, data.flags_to_set || {});
              addInboxMail(final2, {
                from: effect.actorId,
                subject: effect.replySubject || "RE: " + (effect.originalSubject || ""),
                body: data.reply,
                phaseId: scenario.phases[final2.currentPhaseIndex]?.phase_id || "",
              });

              const phaseEval = data.phase_evaluation as
                | {
                    mode?: string;
                    state?: string;
                    score?: number;
                    actorId?: string;
                    matched_criteria?: string[];
                    missing_required_criteria?: string[];
                    hard_reject_reasons?: string[];
                    similarity_to_previous?: number;
                  }
                | undefined;
              const prospEval = data.prospection_evaluation as
                | {
                    score?: number;
                    interested?: boolean;
                    actorId?: string;
                    matched_criteria?: string[];
                    missing_required_criteria?: string[];
                    similarity_to_previous?: number;
                    state?: string;
                  }
                | undefined;

              if (phaseEval && process.env.NODE_ENV !== "production") {
                // eslint-disable-next-line no-console
                console.log(`[${phaseEval.mode || "phase_eval"}]`, {
                  to_actor_id: effect.actorId,
                  state: phaseEval.state,
                  score: phaseEval.score,
                  matched_criteria: phaseEval.matched_criteria,
                  missing_required_criteria: phaseEval.missing_required_criteria,
                  hard_reject_reasons: phaseEval.hard_reject_reasons,
                  similarity_to_previous: phaseEval.similarity_to_previous,
                  previously_replied: previouslyReplied,
                });
              }

              if (phaseEval) {
                const cfg = (effect as any).advancement_config as
                  | {
                      set_flag?: string;
                      set_actor_flag?: string;
                      failure_phase?: string;
                      failure_reset_flags?: string[];
                      failure_message?: string;
                    }
                  | undefined;

                const state = phaseEval.state;
                const isSuccessState =
                  state === "FIRST_CONTACT_SUCCESS" || state === "DSI_APPROVED";
                const isHardRejectState = state === "DSI_HARD_REJECT";

                if (isSuccessState) {
                  if (cfg?.set_flag) final2.flags[cfg.set_flag] = true;
                  if (cfg?.set_actor_flag && effect.actorId) {
                    final2.flags[cfg.set_actor_flag] = effect.actorId;
                  }
                  unlockCurrentPhase(final2);
                  if (isCurrentPhaseValidatedByRules(final2)) {
                    completeCurrentPhaseAndAdvance(final2);
                    if (final2.isFinished) {
                      notifyCheckpointClear();
                    } else {
                      resolveDynamicActors(final2);
                      resolveEstablishmentPlaceholders(final2);
                      injectPhaseEntryEvents(final2);
                      dispatchEnterPhase(final2);
                    }
                  }
                } else if (isHardRejectState && cfg?.failure_phase) {
                  // eslint-disable-next-line no-console
                  console.log("[S5_HARD_REJECT_ENTER]", {
                    beforePhaseIndex: final2.currentPhaseIndex,
                    beforePhaseId: scenario.phases[final2.currentPhaseIndex]?.phase_id,
                    flagsBefore: { ...final2.flags },
                    advancement_config_seen: cfg,
                  });

                  const result = handlePhaseFailure(final2);

                  // eslint-disable-next-line no-console
                  console.log("[S5_HARD_REJECT_NEXT_SESSION]", {
                    result_applied: result.applied,
                    result_source: result.source,
                    result_newPhaseId: result.newPhaseId,
                    result_burnedActorId: result.burnedActorId,
                    nextPhaseIndex: final2.currentPhaseIndex,
                    nextPhaseId: scenario.phases[final2.currentPhaseIndex]?.phase_id,
                    flagsAfter: { ...final2.flags },
                    mailDraftPhase1: final2.mailDrafts["phase_1_prospection"],
                    burned_kol_ids: (final2.flags as any).burned_kol_ids,
                  });

                  if (result.applied) {
                    setSelectedMailId(null);
                    setShowCompose(false);
                    setSelectedContact("alexandre_morel");
                    if (result.newPhaseId) {
                      notifyCheckpointRollback(
                        result.newPhaseId,
                        final2.currentPhaseIndex,
                      );
                    }
                    // eslint-disable-next-line no-console
                    console.log("[S5_HARD_REJECT_AFTER_SETTERS]", {
                      intendedPhaseIndex: final2.currentPhaseIndex,
                      intendedPhaseId: scenario.phases[final2.currentPhaseIndex]?.phase_id,
                      intendedSelectedContact: "alexandre_morel",
                      intendedSelectedMailId: null,
                      intendedShowCompose: false,
                      checkpointRolledBack: result.newPhaseId,
                    });
                  }
                }
                // NEEDS_CLARIFICATION / NOT_INTERESTED / ALREADY_REPLIED
                // → no flag change, no advance — just show the NPC reply
                // (already added to inbox above). The phase stays put.
              } else if (prospEval) {
                if (prospEval.interested === true) {
                  const cfg = (effect as any).advancement_config as
                    | { set_flag?: string; set_actor_flag?: string }
                    | undefined;
                  if (cfg?.set_flag) final2.flags[cfg.set_flag] = true;
                  if (cfg?.set_actor_flag && effect.actorId) {
                    final2.flags[cfg.set_actor_flag] = effect.actorId;
                  }
                  unlockCurrentPhase(final2);
                  if (isCurrentPhaseValidatedByRules(final2)) {
                    completeCurrentPhaseAndAdvance(final2);
                    if (final2.isFinished) {
                      notifyCheckpointClear();
                    } else {
                      resolveDynamicActors(final2);
                      resolveEstablishmentPlaceholders(final2);
                      injectPhaseEntryEvents(final2);
                      dispatchEnterPhase(final2);
                    }
                  }
                }
              } else {
                // (B) legacy keyword path
                const sf = checkNpcSuccessKeywords(final2, data.reply);
                if (sf) {
                  for (const [k, v] of Object.entries(sf)) {
                    if (v === true) final2.flags[k] = true;
                  }
                  if (sf.kol_interested && effect.actorId) {
                    final2.flags.chosen_kol_id = effect.actorId;
                  }
                }
              }

              // Failure keywords safety net — applies to BOTH paths.
              if (checkNpcFailureKeywords(final2, data.reply)) {
                // eslint-disable-next-line no-console
                console.log("[S5_FAILURE_KEYWORDS_TRIGGERED]", {
                  reply_first_120: (data.reply || "").slice(0, 120),
                  before_phase_index: final2.currentPhaseIndex,
                });
                const fkResult = handlePhaseFailure(final2);
                // eslint-disable-next-line no-console
                console.log("[S5_FAILURE_KEYWORDS_RESULT]", {
                  applied: fkResult.applied,
                  source: fkResult.source,
                  newPhaseId: fkResult.newPhaseId,
                  burnedActorId: fkResult.burnedActorId,
                  after_phase_index: final2.currentPhaseIndex,
                });
                if (fkResult.applied) {
                  setSelectedMailId(null);
                  setShowCompose(false);
                  setSelectedContact("alexandre_morel");
                  if (fkResult.newPhaseId) {
                    notifyCheckpointRollback(
                      fkResult.newPhaseId,
                      final2.currentPhaseIndex,
                    );
                  }
                }
              }
            }
            setSession(final2);
          }
        } catch (err) {
          console.error("Error in mail_inbox_reply async effect:", err);
        }
      })();
      break;
    }
    case "negotiation_chat_reply": {
      // Thomas chat response to negotiation mail
      (async () => {
        try {
          const res = await fetch("/api/chat", {
            method: "POST",
            headers: apiHeaders(),
            body: JSON.stringify({
              playerName: effect.displayPlayerName,
              message: effect.mailSummary,
              phaseTitle: (effect.runtimeView as any).phaseTitle,
              phaseObjective: (effect.runtimeView as any).phaseObjective,
              phaseFocus: (effect.runtimeView as any).phaseFocus,
              phasePrompt: (effect.runtimeView as any).phasePrompt,
              criteria: (effect.runtimeView as any).criteria,
              mode: (effect.runtimeView as any).adaptiveMode,
              narrative: effect.narrative,
              recentConversation: effect.recentConversation,
              playerMessages: effect.playerMessages,
              roleplayPrompt: effect.roleplayPrompt,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            playNotificationSound();
            const final2 = cloneSession(next);
            addPlayerMessage(final2, effect.playerMessageSummary, effect.actorId);
            addAIMessage(final2, data.reply, effect.actorId);
            applyEvaluation(final2, data.matched_criteria || [], data.score_delta || 0, data.flags_to_set || {});
            setSession(final2);
          }
        } catch (err) {
          console.error("Error in negotiation_chat_reply async effect:", err);
        }
      })();
      break;
    }
    case "fourviere_dynamic_mail": {
      // Generate dynamic Claire mail via API
      const nextPhase = scenario.phases[next.currentPhaseIndex];
      const dynConfig = (nextPhase as any)?.dynamic_entry_mail;
      const p4Id = nextPhase?.phase_id || "phase_4";
      const truncatedAnalyse = effect.analyseBody;
      (async () => {
        try {
          const prompt = `Tu es Claire Beaumont, directrice d'ImmoLyon Patrimoine. Écris un mail interne COURT (max 12 lignes) à ton agent junior.

L'agent t'a envoyé cette analyse du RDV Delvaux (85m² Fourvière) :
---
${truncatedAnalyse}
---

Ton mail doit :
- Remercier brièvement
- Résumer les travaux que Delvaux a faits suite aux recommandations (cuisine refaite si mentionnée, meubles retirés/remplacés si demandé, régime fiscal choisi, etc. — invente les détails cohérents)
- Dire que quelques semaines ont passé, tout est prêt
- Demander de rédiger une annonce Le Bon Coin (points forts : vue Saône, parquet chêne, cheminée, Fourvière)
- Demander d'envoyer par mail pour validation

Tutoie l'agent. Signe "Claire Beaumont — Directrice — ImmoLyon Patrimoine". Réponds UNIQUEMENT le corps du mail.`;

          const res = await fetch("/api/chat", {
            method: "POST",
            headers: apiHeaders(),
            body: JSON.stringify({
              playerName: effect.displayPlayerName,
              message: prompt,
              phaseTitle: "Génération mail transition",
              phaseObjective: "",
              phaseFocus: "",
              phasePrompt: "",
              criteria: [],
              mode: "default",
              narrative: scenario.narrative,
              recentConversation: [],
              playerMessages: [],
              roleplayPrompt: prompt,
              skipEvaluation: true,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            const mailBody = data.reply || "Bonjour,\n\nBon travail pour l'analyse. M. Delvaux a effectué les travaux nécessaires suite à tes recommandations. Il faut maintenant publier une annonce sur Le Bon Coin.\n\nRédige un texte attractif mais honnête. Mets en avant les vrais points forts : vue sur la Saône, parquet chêne massif, cheminée d'époque, quartier Fourvière.\n\nEnvoie-moi l'annonce par mail pour validation.\n\nClaire Beaumont\nDirectrice — ImmoLyon Patrimoine";
            const updated = cloneSession(next);
            addInboxMail(updated, {
              from: dynConfig?.actor || "claire_beaumont",
              subject: dynConfig?.subject || "Annonce Le Bon Coin — Bien Delvaux Fourvière",
              body: mailBody,
              phaseId: p4Id,
            });
            setSession(updated);
            setMainView("mail");
            playNotificationSound();
          }
        } catch (err) {
          // Fallback: inject a generic mail
          console.error("Error generating dynamic Claire mail:", err);
          const fallback = cloneSession(next);
          addInboxMail(fallback, {
            from: "claire_beaumont",
            subject: "Annonce Le Bon Coin — Bien Delvaux Fourvière",
            body: "Bonjour,\n\nBon travail pour l'analyse du rendez-vous Delvaux. M. Delvaux a effectué les travaux nécessaires suite à tes recommandations — le bien est maintenant prêt pour la location.\n\nIl faut publier rapidement une annonce sur Le Bon Coin. Rédige un texte attractif mais honnête. Mets en avant les vrais points forts : la vue sur la Saône, le parquet chêne massif, la cheminée d'époque, le quartier Fourvière.\n\nN'exagère pas et ne mens pas sur l'état du bien.\n\nEnvoie-moi l'annonce par mail pour validation.\n\nClaire Beaumont\nDirectrice — ImmoLyon Patrimoine",
            phaseId: p4Id,
          });
          setSession(fallback);
          setMainView("mail");
        }
      })();
      break;
    }
    default:
      console.warn("Unknown mail async effect kind:", effect.kind);
  }
}
