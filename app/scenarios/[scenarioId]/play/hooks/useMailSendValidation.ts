/**
 * useMailSendValidation — compute whether the Send button is enabled
 * and the human-readable reason when it's not.
 *
 * Single source of truth for the "can the player send this mail?" rule:
 *   - all three header fields filled (to / subject / body)
 *   - attachments present when phase requires them
 *   - body min length when the send advances the phase
 *
 * Both values are derived (no useState) so they always reflect the
 * current draft / phase config.
 */

import type { MailDraft } from "../MailView";

export type MailSendValidation = {
  canActuallySendMail: boolean;
  mailSendBlockReason: string;
};

export function useMailSendValidation(opts: {
  canComposeMail: boolean;
  session: any;
  scenario: any;
  currentMailDraft: MailDraft;
}): MailSendValidation {
  const { canComposeMail, session, scenario, currentMailDraft } = opts;

  const canActuallySendMail = (() => {
    if (!canComposeMail || !session || !scenario) return false;
    const d = currentMailDraft;
    if (!d.to.trim() || !d.subject.trim() || !d.body.trim()) return false;
    const phase = scenario.phases[session.currentPhaseIndex];
    if (phase?.mail_config?.require_attachments && (!d.attachments || d.attachments.length === 0))
      return false;
    if (phase?.mail_config?.send_advances_phase && d.body.trim().length < 20) return false;
    return true;
  })();

  const mailSendBlockReason = (() => {
    if (!canComposeMail || !session || !scenario) return "";
    const d = currentMailDraft;
    if (!d.to.trim()) return "Destinataire requis";
    if (!d.subject.trim()) return "Objet requis";
    if (!d.body.trim()) return "Contenu du mail requis";
    const phase = scenario.phases[session.currentPhaseIndex];
    if (phase?.mail_config?.require_attachments && (!d.attachments || d.attachments.length === 0))
      return "Pièce jointe requise";
    if (phase?.mail_config?.send_advances_phase && d.body.trim().length < 20)
      return "Le contenu du mail est trop court (20 caractères minimum)";
    return "";
  })();

  return { canActuallySendMail, mailSendBlockReason };
}
