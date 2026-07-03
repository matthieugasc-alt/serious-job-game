/**
 * ═════════════════════════════════════════════════════════════════
 * Moteur v3 — Triggers de complétion : la SEULE chose qui avance
 * ═════════════════════════════════════════════════════════════════
 *
 * Implémente les 11 primitives + all/any du CONTRAT_WORKSPACE.md §4.
 * Sémantique stricte : rien d'autre ne fait avancer la séquence,
 * aucune complétion implicite. Déterministe, défensif (ne throw
 * jamais, un trigger malformé rend false — le composer v3 l'aurait
 * refusé en amont).
 *
 * Zéro React, zéro I/O, zéro Date.now() : tout le temps vient du ctx.
 */

import type { StepObservation } from "./criteria";
import type {
  CompletionTrigger,
  LoggedAction,
  WorkspaceState,
} from "./workspace";

/**
 * Contexte d'évaluation, fourni par le reducer :
 *   - log : les actions de la TENTATIVE courante du step (le reducer
 *     découpe actionLog par step et par tentative — voir
 *     SessionV3State.attemptStartedIndex)
 *   - lastObservation : dernière observation IA du step, rafraîchie
 *     par l'orchestrateur (effet observe_step → recordStepObservation)
 *   - horloges : now / stepStartedAt / scenarioStartedAt (ms epoch)
 */
export interface TriggerContext {
  log: readonly LoggedAction[];
  workspace: WorkspaceState;
  lastObservation: StepObservation | null;
  now: number;
  stepStartedAt: number;
  scenarioStartedAt: number;
}

/**
 * CONVENTION actor_validation : l'observateur IA rapporte le marqueur
 * de validation d'un acteur comme un PSEUDO-CRITÈRE booléen nommé
 * "__actor_validation_<actor_id>" dans observation.criteria. Il n'est
 * jamais déclaré dans observed_criteria (le verdict moteur l'ignore —
 * il apparaît au pire dans `unexpected`), jamais affiché au joueur.
 * Seul le trigger `actor_validation` le lit.
 */
export const ACTOR_VALIDATION_PREFIX = "__actor_validation_";

export function actorValidationCriterion(actorId: string): string {
  return `${ACTOR_VALIDATION_PREFIX}${actorId}`;
}

export function evaluateTrigger(
  trigger: CompletionTrigger,
  ctx: TriggerContext,
): boolean {
  if (!trigger || typeof trigger !== "object") return false;

  switch (trigger.type) {
    case "mail_sent": {
      // Résolution to → actor_id : action.to est une liste d'actor_ids.
      const count = ctx.log.filter(
        (e) =>
          e.action.type === "mail_sent" &&
          (trigger.to === undefined || e.action.to.includes(trigger.to)),
      ).length;
      return count >= minCount(trigger.min_count);
    }

    case "message_sent": {
      // Résolution to_actor → participants du fil visé par l'action.
      const count = ctx.log.filter((e) => {
        if (e.action.type !== "message_sent") return false;
        if (trigger.to_actor === undefined) return true;
        const thread = ctx.workspace.threads[e.action.thread_id];
        return thread?.participants.includes(trigger.to_actor) ?? false;
      }).length;
      return count >= minCount(trigger.min_count);
    }

    case "message_received": {
      // Un acteur a écrit dans un fil DEPUIS le début du step. Les
      // messages d'acteur ne sont pas des WorkspaceAction : on lit
      // l'état des threads (insertions horodatées du moteur).
      return Object.values(ctx.workspace.threads).some((thread) =>
        thread.messages.some(
          (m) =>
            m.from === "actor" &&
            m.actor_id === trigger.from_actor &&
            m.at >= ctx.stepStartedAt,
        ),
      );
    }

    case "contract_signed":
      return ctx.log.some((e) => e.action.type === "contract_signed");

    case "contract_rejected":
      return ctx.log.some((e) => e.action.type === "contract_rejected");

    case "deliverable_submitted":
      return ctx.log.some(
        (e) =>
          e.action.type === "deliverable_submitted" &&
          (trigger.tool === undefined || e.action.tool_id === trigger.tool),
      );

    case "document_opened":
      // État persistant : la pièce a été consultée (même à un step
      // antérieur) — « consultation d'une pièce », pas « ré-ouverture ».
      return ctx.workspace.documents[trigger.document_id]?.opened === true;

    case "timer_elapsed": {
      if (typeof trigger.seconds !== "number" || trigger.seconds < 0) return false;
      const startedAt =
        trigger.from === "scenario_start"
          ? ctx.scenarioStartedAt
          : ctx.stepStartedAt;
      return ctx.now - startedAt >= trigger.seconds * 1000;
    }

    case "criterion_observed":
      return ctx.lastObservation?.criteria?.[trigger.criterion] === true;

    case "actor_validation":
      return (
        ctx.lastObservation?.criteria?.[
          actorValidationCriterion(trigger.actor)
        ] === true
      );

    case "manual":
      return ctx.log.some(
        (e) =>
          e.action.type === "manual_trigger" && e.action.label === trigger.label,
      );

    case "all":
      // Défensif : un `all` vide ne valide RIEN (le composer le refuse).
      return (
        Array.isArray(trigger.of) &&
        trigger.of.length > 0 &&
        trigger.of.every((t) => evaluateTrigger(t, ctx))
      );

    case "any":
      return (
        Array.isArray(trigger.of) &&
        trigger.of.length > 0 &&
        trigger.of.some((t) => evaluateTrigger(t, ctx))
      );

    default:
      // Type inconnu (scénario invalide passé au travers) : jamais true.
      return false;
  }
}

function minCount(value: number | undefined): number {
  return typeof value === "number" && value >= 1 ? value : 1;
}

/**
 * Le trigger (ou l'un de ses sous-triggers all/any) mentionne-t-il un
 * des types donnés ? Sert au reducer pour savoir si le step dépend de
 * l'observation IA (criterion_observed / actor_validation) et donc
 * s'il faut émettre `observe_step` après les actions significatives.
 */
export function triggerMentions(
  trigger: CompletionTrigger,
  types: readonly CompletionTrigger["type"][],
): boolean {
  if (!trigger || typeof trigger !== "object") return false;
  if (types.includes(trigger.type)) return true;
  if (trigger.type === "all" || trigger.type === "any") {
    return (trigger.of ?? []).some((t) => triggerMentions(t, types));
  }
  return false;
}
