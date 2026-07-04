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
  StepCompletion,
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
 *   - resolveActor : résolution alias → actor_id (chantier B). Absente
 *     ou alias inconnu : la référence est comparée telle quelle (un
 *     alias non lié ne matche donc jamais un acteur réel — défensif).
 *   - mailScores : scores IA du step/tentative courants (chantier C),
 *     dans l'ordre d'enregistrement — le DERNIER score pertinent gagne.
 */
export interface TriggerContext {
  log: readonly LoggedAction[];
  workspace: WorkspaceState;
  lastObservation: StepObservation | null;
  now: number;
  stepStartedAt: number;
  scenarioStartedAt: number;
  resolveActor?: (ref: string) => string;
  mailScores?: readonly { to: readonly string[]; score: number }[];
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
  // Résolution alias → actor_id (chantier B) : identité si non lié.
  const actor = (ref: string) => ctx.resolveActor?.(ref) ?? ref;

  switch (trigger.type) {
    case "mail_sent": {
      // Résolution to → actor_id : action.to est une liste d'actor_ids.
      const to = trigger.to === undefined ? undefined : actor(trigger.to);
      const count = ctx.log.filter(
        (e) =>
          e.action.type === "mail_sent" &&
          (to === undefined || e.action.to.includes(to)),
      ).length;
      return count >= minCount(trigger.min_count);
    }

    case "message_sent": {
      // Résolution to_actor → participants du fil visé par l'action.
      const to = trigger.to_actor === undefined ? undefined : actor(trigger.to_actor);
      const count = ctx.log.filter((e) => {
        if (e.action.type !== "message_sent") return false;
        if (to === undefined) return true;
        const thread = ctx.workspace.threads[e.action.thread_id];
        return thread?.participants.includes(to) ?? false;
      }).length;
      return count >= minCount(trigger.min_count);
    }

    case "message_received": {
      // Un acteur a écrit dans un fil DEPUIS le début du step. Les
      // messages d'acteur ne sont pas des WorkspaceAction : on lit
      // l'état des threads (insertions horodatées du moteur).
      const from = actor(trigger.from_actor);
      return Object.values(ctx.workspace.threads).some((thread) =>
        thread.messages.some(
          (m) =>
            m.from === "actor" &&
            m.actor_id === from &&
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
          actorValidationCriterion(actor(trigger.actor))
        ] === true
      );

    case "mail_scored":
    case "mail_scored_below": {
      // Chantier C : lu sur le score ENREGISTRÉ (session.mailScores,
      // filtré par le reducer sur step + tentative). Dernier score
      // pertinent : un renvoi rescore, le nouveau verdict remplace.
      if (typeof trigger.min_score !== "number") return false;
      const to = trigger.to === undefined ? undefined : actor(trigger.to);
      const scores = (ctx.mailScores ?? []).filter(
        (s) => to === undefined || s.to.includes(to),
      );
      if (scores.length === 0) return false;
      const last = scores[scores.length - 1];
      return trigger.type === "mail_scored"
        ? last.score >= trigger.min_score
        : last.score < trigger.min_score;
    }

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

/**
 * Tous les triggers d'une complétion : le `trigger` legacy (sucre) ET
 * les triggers de chaque exit (chantier A). Sert au reducer (faut-il
 * observer ? scorer ?) et au player (le step est-il temporel ?).
 */
export function completionTriggerList(
  completion: StepCompletion | null | undefined,
): CompletionTrigger[] {
  if (!completion) return [];
  const list: CompletionTrigger[] = [];
  if (completion.trigger) list.push(completion.trigger);
  for (const exit of completion.exits ?? []) {
    if (exit?.trigger) list.push(exit.trigger);
  }
  return list;
}

/**
 * Extrait tous les timer_elapsed (y compris imbriqués dans all/any).
 * Sert au chrono visible du shell (chantier D) : le player en dérive
 * l'échéance depuis stepStartedAt / scenarioStartedAt.
 */
export function collectTimerTriggers(
  triggers: readonly CompletionTrigger[],
): { seconds: number; from: "step_start" | "scenario_start" }[] {
  const out: { seconds: number; from: "step_start" | "scenario_start" }[] = [];
  const walk = (t: CompletionTrigger): void => {
    if (!t || typeof t !== "object") return;
    if (t.type === "timer_elapsed" && typeof t.seconds === "number" && t.seconds > 0) {
      out.push({ seconds: t.seconds, from: t.from ?? "step_start" });
    }
    if (t.type === "all" || t.type === "any") (t.of ?? []).forEach(walk);
  };
  triggers.forEach(walk);
  return out;
}

// ─── Acteurs dynamiques (chantier B) ──────────────────────────────

/**
 * Bindings produits par un trigger QUI VIENT DE TIRER : chaque
 * `bind_actor` rencontré lie son alias au destinataire effectif.
 *   - mail_sent : `to` (résolu) si déclaré, sinon le premier
 *     destinataire du dernier mail correspondant de la tentative ;
 *   - message_sent : `to_actor` (résolu) si déclaré, sinon le premier
 *     participant du fil du dernier message correspondant ;
 *   - any : le PREMIER sous-trigger qui tire décide du destinataire.
 * À appeler uniquement quand evaluateTrigger(trigger, ctx) est vrai.
 */
export function collectTriggerBindings(
  trigger: CompletionTrigger,
  ctx: TriggerContext,
): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (t: CompletionTrigger): void => {
    if (!t || typeof t !== "object") return;
    const alias = (t as { bind_actor?: string }).bind_actor;
    if (alias) {
      const actor = boundActorOf(t, ctx);
      if (actor) out[alias] = actor;
    }
    if (t.type === "all" || t.type === "any") (t.of ?? []).forEach(walk);
  };
  walk(trigger);
  return out;
}

/** Destinataire effectif d'un trigger tiré (voir collectTriggerBindings). */
function boundActorOf(t: CompletionTrigger, ctx: TriggerContext): string | null {
  const actor = (ref: string) => ctx.resolveActor?.(ref) ?? ref;
  switch (t.type) {
    case "mail_sent": {
      const to = t.to === undefined ? undefined : actor(t.to);
      for (let i = ctx.log.length - 1; i >= 0; i--) {
        const a = ctx.log[i].action;
        if (a.type !== "mail_sent") continue;
        if (to !== undefined && !a.to.includes(to)) continue;
        return to ?? a.to[0] ?? null;
      }
      return null;
    }
    case "message_sent": {
      const to = t.to_actor === undefined ? undefined : actor(t.to_actor);
      for (let i = ctx.log.length - 1; i >= 0; i--) {
        const a = ctx.log[i].action;
        if (a.type !== "message_sent") continue;
        const participants = ctx.workspace.threads[a.thread_id]?.participants ?? [];
        if (to !== undefined && !participants.includes(to)) continue;
        return to ?? participants[0] ?? null;
      }
      return null;
    }
    case "any": {
      for (const sub of t.of ?? []) {
        if (!evaluateTrigger(sub, ctx)) continue;
        const bound = boundActorOf(sub, ctx);
        if (bound) return bound;
      }
      return null;
    }
    case "all": {
      for (const sub of t.of ?? []) {
        const bound = boundActorOf(sub, ctx);
        if (bound) return bound;
      }
      return null;
    }
    default:
      return null;
  }
}
