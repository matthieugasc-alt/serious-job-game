// ══════════════════════════════════════════════════════════════════
// MailHandler — Post-send effects for specific mail kinds
// ══════════════════════════════════════════════════════════════════
//
// Pure function handler. No React hooks, no owned state.
// page.tsx owns all state and executes the effects described here.
//
// Currently handles:
//   - scope_proposal (S2 phase 1): builds the auto-reply payload
//     for Thomas NovaDev after the player sends the scope mail.
//
// Returns null / false for unrecognized mail kinds → page.tsx
// falls back to its existing legacy code.
// ══════════════════════════════════════════════════════════════════

import type { MailPhaseHandler, AutoReplyContext, AutoReplyEffect } from "./types";

export const MailHandler: MailPhaseHandler = {
  type: "mail",

  // ── Detection ──────────────────────────────────────────────────

  shouldAutoReply(mailKind: string): boolean {
    return mailKind === "scope_proposal";
  },

  // ── Build auto-reply effect ────────────────────────────────────
  // Returns a description of the effect — caller (page.tsx) executes it:
  //   1. fetch("/api/chat", { body: effect.apiPayload })
  //   2. addPlayerMessage(session, effect.playerMessageSummary, effect.actorId)
  //   3. addAIMessage(session, reply, effect.actorId)
  //   4. applyEvaluation(...)
  //   5. switch UI to chat / effect.actorId

  buildAutoReplyEffect(ctx: AutoReplyContext): AutoReplyEffect {
    const mailSummary = `[Le joueur a envoyé un mail de proposition de scope MVP avec le contenu suivant : ${ctx.mailBody}]`;

    return {
      actorId: "thomas_novadev",
      playerMessageSummary: `[Mail envoyé à NovaDev] ${ctx.mailBody.substring(0, 200)}...`,
      apiPayload: {
        playerName: ctx.playerName,
        message: mailSummary,
        phaseTitle: ctx.runtimeView.phaseTitle,
        phaseObjective: ctx.runtimeView.phaseObjective,
        phaseFocus: ctx.runtimeView.phaseFocus,
        phasePrompt: ctx.runtimeView.phasePrompt,
        criteria: ctx.runtimeView.criteria,
        mode: ctx.runtimeView.adaptiveMode,
        narrative: ctx.narrative,
        recentConversation: [],
        playerMessages: [ctx.mailBody],
        roleplayPrompt: ctx.roleplayPrompt,
      },
    };
  },
};
