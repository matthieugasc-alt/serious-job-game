/**
 * ═════════════════════════════════════════════════════════════════
 * Moteur v3 — Reducer workspace : dispatch, events narratifs, verdict
 * ═════════════════════════════════════════════════════════════════
 *
 * Flux unidirectionnel (CONTRAT_WORKSPACE.md §2) — pour CHAQUE action :
 *   (a) journalise dans session.actionLog AVANT tout effet
 *   (b) applique l'action au WorkspaceState (mutations locales : c'est
 *       l'APPELANT qui clone la session, comme completeCurrentStep v2)
 *   (c) collecte les effets narratifs (events after_action / delay,
 *       sémantique once) + réponses d'acteur automatiques
 *   (d) évalue le trigger de complétion du step
 *
 * Le cœur REND des PendingEffect ; l'orchestrateur les EXÉCUTE (I/O IA)
 * puis réinjecte les contenus produits via applyNarrativeEffect /
 * recordActorMessage / recordStepObservation. Zéro React, zéro I/O.
 */

import { applyStepObservation } from "./criteria";
import type { StepEvaluationResult, StepObservation } from "./criteria";
import { artifactLinkMarkdown, buildArtifactHref } from "./artifactLink";
import type { JsonObject } from "./mechanics";
import type {
  DispatchResult,
  ExitNarrativeEvent,
  LoggedAction,
  NarrativeEffect,
  NarrativeEvent,
  NarrativeWhen,
  PendingEffect,
  StepExit,
  StepInvocationV3,
  ToolOpApplier,
  WorkspaceAction,
  WorkspaceState,
} from "./workspace";
import type { SessionV3State } from "./sessionV3";
import { computeEndingV3, getCurrentStepV3 } from "./sessionV3";
import {
  collectTriggerBindings,
  completionTriggerList,
  evaluateTrigger,
  triggerMentions,
} from "./triggers";
import type { TriggerContext } from "./triggers";

// ─── Options du reducer ───────────────────────────────────────────

/**
 * Source de directive d'une mécanique headless : le sous-ensemble de
 * MechanicSpec dont le cœur a besoin (cadrage des acteurs). Les tests
 * passent des specs factices ; l'orchestrateur passera le registre réel.
 */
export interface DirectiveSource {
  directive(params: JsonObject): string;
}

export interface ReducerOptions {
  /** Horloge injectable (tests déterministes). Défaut : Date.now(). */
  now?: number;
  /** Registre des mécaniques headless, par id — sert UNIQUEMENT à la
   *  directive de cadrage des réponses d'acteur. */
  specs?: Record<string, DirectiveSource>;
  /**
   * Reducers PURS des Tools, par tool_id (TOOL_BLOC_NOTES.md §2) —
   * appliqués aux actions `tool_op` APRÈS journalisation. Injectés par
   * l'orchestrateur (WorkspacePlayer, depuis le TOOL_REGISTRY) via le
   * même canal que `specs` : le moteur reste 100 % ignorant des ops.
   */
  toolAppliers?: Record<string, ToolOpApplier>;
}

/** Actions « significatives » : après elles, si le step dépend de
 *  l'observation IA, le reducer demande un rafraîchissement. */
const SIGNIFICANT_ACTIONS: ReadonlySet<WorkspaceAction["type"]> = new Set([
  "message_sent",
  "mail_sent",
  "deliverable_submitted",
  "contract_signed",
  "contract_rejected",
]);

const OBSERVATION_TRIGGER_TYPES = [
  "criterion_observed",
  "actor_validation",
] as const;

const SCORING_TRIGGER_TYPES = ["mail_scored", "mail_scored_below"] as const;

// ─── Acteurs dynamiques (chantier B) : résolution des alias ────────

/**
 * Résolution STRICTE d'une référence d'acteur : binding en session,
 * sinon acteur déclaré, sinon throw explicite — un alias non résolu au
 * runtime est un bug de scénario que composerV3 aurait dû attraper.
 */
function resolveActorStrict(session: SessionV3State, ref: string): string {
  const bound = session.actorBindings[ref];
  if (bound !== undefined) return bound;
  if (session.scenario.actors.some((a) => a.actor_id === ref)) return ref;
  throw new Error(
    `Alias d'acteur non résolu au runtime : "${ref}" — aucun binding en session ` +
      `et aucun acteur déclaré sous cet id (chantier B, bind_actor).`,
  );
}

/**
 * Params d'un step avec les refs d'acteur (`actor_id` / `*_actor`)
 * résolues via session.actorBindings. Utilisé pour les directives de
 * mécanique et par l'orchestrateur (buildArtifacts / buildOutput).
 */
export function resolveStepParamsV3(
  session: SessionV3State,
  params: JsonObject,
): JsonObject {
  let changed = false;
  const out: JsonObject = { ...params };
  for (const [k, v] of Object.entries(out)) {
    if ((k === "actor_id" || k.endsWith("_actor")) && typeof v === "string") {
      const bound = session.actorBindings[v];
      if (bound !== undefined) {
        out[k] = bound;
        changed = true;
      }
    }
  }
  return changed ? out : params;
}

// ─── Dispatch principal ───────────────────────────────────────────

/**
 * Applique une WorkspaceAction à la session (mutée en place — cloner
 * en amont) et rend les effets à exécuter + l'état du trigger.
 */
export function applyWorkspaceAction(
  session: SessionV3State,
  action: WorkspaceAction,
  opts: ReducerOptions = {},
): DispatchResult {
  if (session.isFinished) return { effects: [], completionFired: false };

  const now = action.type === "clock_tick" ? action.now : (opts.now ?? Date.now());
  const step = getCurrentStepV3(session);

  // (a) Journalisation AVANT tout effet — l'audit ne dépend de rien.
  session.actionLog.push({
    at: now,
    step_id: step?.step_id ?? "__no_step__",
    action,
  });

  // (b) Application au WorkspaceState.
  applyActionToWorkspace(session.workspace, action, now, opts.toolAppliers);

  if (!step) return { effects: [], completionFired: false };

  // (c) Effets narratifs : events after_action + delay (via clock_tick).
  const effects: PendingEffect[] = [];
  for (const ev of step.events ?? []) {
    if (!whenMatchesAction(ev.when, action, now, session.workspace)) continue;
    if (!armEvent(session, step, ev)) continue;
    effects.push(...executeEventEffect(session, ev.effect, now));
  }

  // Réponse d'acteur automatique : un message du joueur dans un fil
  // avec participants IA fait répondre CHAQUE participant. Si un event
  // vient de produire un actor_reply pour le même (fil, acteur), on ne
  // double pas — sa directive d'event sera complétée par celle de la
  // mécanique dans la passe finale.
  if (action.type === "message_sent") {
    const thread = session.workspace.threads[action.thread_id];
    for (const actorId of thread?.participants ?? []) {
      const already = effects.some(
        (e) =>
          e.kind === "actor_reply" &&
          e.thread_id === action.thread_id &&
          e.actor_id === actorId,
      );
      if (!already) {
        effects.push({
          kind: "actor_reply",
          thread_id: action.thread_id,
          actor_id: actorId,
        });
      }
    }
  }

  // Débat par mail : un mail du joueur vers un acteur déclaré dans
  // step.mail_actors fait RÉPONDRE cet acteur par mail (une réponse par
  // mail envoyé). Pas de boucle : seul un mail DU JOUEUR déclenche ceci.
  if (action.type === "mail_sent") {
    const mailActors = step.mail_actors ?? [];
    for (const actorId of action.to) {
      if (!mailActors.includes(actorId)) continue;
      const already = effects.some((e) => e.kind === "mail_reply" && e.actor_id === actorId);
      if (!already) {
        effects.push({ kind: "mail_reply", actor_id: actorId, in_reply_to_subject: action.subject });
      }
    }
  }

  // Directive = celle de la mécanique du step + celle de l'event éventuel.
  mergeMechanicDirective(session, effects, step, opts.specs);

  // Chantier C : un mail envoyé pendant un step à `scoring` déclaré part
  // à la notation IA (route générique /api/v2/score) dès que la
  // complétion dépend d'un mail_scored / mail_scored_below.
  if (
    action.type === "mail_sent" &&
    step.scoring &&
    completionTriggerList(step.completion).some((t) =>
      triggerMentions(t, SCORING_TRIGGER_TYPES),
    )
  ) {
    const sent = session.workspace.mailbox.sent;
    const mail = sent[sent.length - 1];
    if (mail) effects.push({ kind: "score_mail", mail_id: mail.mail_id });
  }

  // (d) Trigger de complétion.
  return finalizeCompletion(
    session,
    step,
    SIGNIFICANT_ACTIONS.has(action.type),
    effects,
    now,
    opts,
  );
}

// ─── Entrée dans un step ──────────────────────────────────────────

/**
 * Initialise le step courant (threads, tools, documents, horloge,
 * observation remise à zéro) puis déclenche ses events `step_start`.
 * Idempotent sur les structures (ne réécrit jamais un fil existant).
 * À appeler après initializeSessionV3 (step 1) et après chaque avance.
 */
export function enterStep(
  session: SessionV3State,
  opts: ReducerOptions = {},
): DispatchResult {
  const now = opts.now ?? Date.now();
  const step = getCurrentStepV3(session);
  if (!step || session.isFinished) return { effects: [], completionFired: false };

  const ws = session.workspace;
  ws.stepStartedAt = now;
  session.lastObservation = null;
  session.attemptStartedIndex = session.actionLog.length;
  session.pendingExitId = null;

  for (const t of step.threads ?? []) {
    if (!ws.threads[t.thread_id]) {
      ws.threads[t.thread_id] = {
        thread_id: t.thread_id,
        // Chantier B : les participants peuvent être des alias liés par
        // un step antérieur — résolution stricte à la création du fil.
        participants: t.participants.map((p) => resolveActorStrict(session, p)),
        title: t.title,
        messages: [],
        unread: 0,
      };
    }
  }
  for (const tc of step.tools ?? []) {
    if (!(tc.tool in ws.toolStates)) ws.toolStates[tc.tool] = null;
  }
  for (const id of step.document_ids ?? []) {
    if (!ws.documents[id]) ws.documents[id] = { opened: false, annotations: [] };
  }

  const effects = fireEventsByWhen(session, step, "step_start", now, opts.specs);
  // Un trigger peut être déjà satisfait à l'entrée (document déjà lu,
  // timer scenario_start…) : on l'évalue immédiatement.
  return finalizeCompletion(session, step, false, effects, now, opts);
}

// ─── Réinjection des contenus produits par l'orchestrateur ────────

/**
 * Insère dans l'état un effet narratif RÉSOLU (contenu déjà produit) :
 * mail reçu, message reçu (avec content), notification. Les effets
 * `actor_reply` se résolvent via recordActorMessage. Évalue ensuite le
 * trigger (un `message_received` peut tirer ici même).
 */
export function applyNarrativeEffect(
  session: SessionV3State,
  effect: NarrativeEffect,
  opts: ReducerOptions = {},
): DispatchResult {
  if (session.isFinished) return { effects: [], completionFired: false };
  const now = opts.now ?? Date.now();
  const ws = session.workspace;

  let significant = false;
  switch (effect.type) {
    case "notification":
      pushNotification(ws, "system", effect.title, effect.body, now);
      break;
    case "mail_received":
      deliverMail(session, effect, now);
      break;
    case "message_received":
      if (effect.content !== undefined) {
        insertActorMessage(session, effect.thread_id, effect.actor_id, effect.content, now);
        significant = true;
      }
      break;
    case "actor_reply":
      // Sans contenu il n'y a rien à insérer — utiliser recordActorMessage.
      break;
  }

  const step = getCurrentStepV3(session);
  if (!step) return { effects: [], completionFired: false };
  return finalizeCompletion(session, step, significant, [], now, opts);
}

/**
 * Insère la réponse d'un acteur IA dans un fil (résolution d'un
 * PendingEffect actor_reply par l'orchestrateur), notifie, puis évalue
 * le trigger. Significatif : un step en `actor_validation` doit faire
 * ré-observer après chaque parole d'acteur.
 */
export function recordActorMessage(
  session: SessionV3State,
  threadId: string,
  actorId: string,
  content: string,
  opts: ReducerOptions = {},
): DispatchResult {
  if (session.isFinished) return { effects: [], completionFired: false };
  const now = opts.now ?? Date.now();
  insertActorMessage(session, threadId, actorId, content, now);

  const step = getCurrentStepV3(session);
  if (!step) return { effects: [], completionFired: false };
  return finalizeCompletion(session, step, true, [], now, opts);
}

/**
 * Rafraîchit session.lastObservation (réponse de l'orchestrateur à un
 * effet observe_step) puis réévalue le trigger — c'est ici qu'un
 * criterion_observed / actor_validation en attente peut tirer.
 */
export function recordStepObservation(
  session: SessionV3State,
  observation: StepObservation,
  opts: ReducerOptions = {},
): DispatchResult {
  session.lastObservation = observation;
  const step = getCurrentStepV3(session);
  if (!step || session.isFinished) return { effects: [], completionFired: false };
  // significant=false : on ne redemande jamais une observation depuis
  // une observation (pas de boucle observe → observe).
  return finalizeCompletion(session, step, false, [], opts.now ?? Date.now(), opts);
}

/**
 * Chantier C — enregistre le score IA d'un mail (réponse de
 * l'orchestrateur à un effet score_mail, via POST /api/v2/score) puis
 * réévalue la complétion : c'est ici qu'un mail_scored /
 * mail_scored_below peut tirer. Idempotent par mail_id. Le score reste
 * interne (audit) — JAMAIS montré au joueur.
 */
export function recordMailScore(
  session: SessionV3State,
  mailId: string,
  score: number,
  scale: number,
  rationale?: string,
  opts: ReducerOptions = {},
): DispatchResult {
  if (session.isFinished) return { effects: [], completionFired: false };
  const now = opts.now ?? Date.now();
  const step = getCurrentStepV3(session);
  if (!step) return { effects: [], completionFired: false };

  if (!session.mailScores.some((s) => s.mail_id === mailId)) {
    const mail = session.workspace.mailbox.sent.find((m) => m.mail_id === mailId);
    session.mailScores.push({
      mail_id: mailId,
      at: now,
      step_id: step.step_id,
      attempt_started_index: session.attemptStartedIndex,
      to: mail ? [...mail.to] : [],
      score,
      scale,
      rationale,
    });
  }
  return finalizeCompletion(session, step, false, [], now, opts);
}

// ─── Verdict de step (même moteur que v2, retry DIÉGÉTIQUE) ───────

export interface StepCompletionOutcome {
  outcome: "advanced" | "retry" | "goto" | "ended";
  /** Null uniquement si la session était déjà finie / sans step. */
  evaluation: StepEvaluationResult | null;
  /** Effets narratifs du verdict : on_retry, on_step_passed, step_start
   *  du step suivant. Le retry n'affiche RIEN — le monde réagit. */
  effects: PendingEffect[];
}

/**
 * Applique le verdict moteur au step courant (applyStepObservation →
 * retry/advance/end, politique du step inchangée par rapport au v2)
 * avec un échec DIÉGÉTIQUE : pas de bannière, le retry déclenche les
 * events `on_retry` du step. L'avance déclenche `on_step_passed` du
 * step passé puis enterStep du suivant (events `step_start`).
 *
 * Chantier A : si `exitId` est fourni (verdict d'une SORTIE evaluate),
 * le verdict est enregistré (stepResults, audit) puis la ROUTE DÉCLARÉE
 * de la sortie s'applique — quel que soit le verdict. La politique
 * on_failure et les events on_retry/on_step_passed ne jouent pas : avec
 * des exits, la mise en scène appartient aux `events` de chaque sortie.
 */
export function completeStepV3(
  session: SessionV3State,
  observation: StepObservation,
  output: JsonObject,
  opts: ReducerOptions = {},
  exitId?: string,
): StepCompletionOutcome {
  const now = opts.now ?? Date.now();
  const step = getCurrentStepV3(session);
  if (!step || session.isFinished) {
    return { outcome: "ended", evaluation: null, effects: [] };
  }

  const evaluation = applyStepObservation(step, observation);
  session.evaluationHistory.push(evaluation);
  session.lastObservation = observation;

  const prev = session.stepResults[step.step_id];
  const attempts = (prev?.attempts ?? 0) + 1;
  session.stepResults[step.step_id] = {
    stepId: step.step_id,
    mechanic: step.mechanic,
    evaluation,
    output,
    attempts,
    passed: evaluation.passed,
  };

  // ── Chantier A : verdict d'une sortie → route déclarée, sans policy.
  if (exitId !== undefined) {
    session.pendingExitId = null;
    const exit = step.completion?.exits?.find((e) => e.id === exitId);
    if (exit) {
      const routed = executeExitRoute(session, step, exit, now, opts);
      return { outcome: routed.outcome, evaluation, effects: routed.effects };
    }
    // Sortie introuvable (défensif — composerV3 l'interdit) : on retombe
    // sur la politique legacy ci-dessous.
  }

  if (evaluation.passed) {
    const effects = fireEventsByWhen(session, step, "on_step_passed", now, opts.specs);
    return advanceV3(session, evaluation, effects, now, opts);
  }

  const policy = step.on_failure ?? "retry";
  const maxAttempts = step.max_attempts ?? 2;

  if (policy === "end_scenario" || evaluation.appliedRule === "critical_failure") {
    finishV3(session);
    return { outcome: "ended", evaluation, effects: [] };
  }
  if (policy === "advance" || attempts >= maxAttempts) {
    return advanceV3(session, evaluation, [], now, opts);
  }

  // Retry diégétique : on réarme la tentative (les primitives de
  // trigger action-based repartent de zéro) et le scénario met en
  // scène l'échec via ses events on_retry.
  session.attemptStartedIndex = session.actionLog.length;
  const effects = fireEventsByWhen(session, step, "on_retry", now, opts.specs);
  return { outcome: "retry", evaluation, effects };
}

function advanceV3(
  session: SessionV3State,
  evaluation: StepEvaluationResult,
  effects: PendingEffect[],
  now: number,
  opts: ReducerOptions,
): StepCompletionOutcome {
  if (session.currentStepIndex + 1 >= session.scenario.sequence.length) {
    finishV3(session);
    return { outcome: "ended", evaluation, effects };
  }
  session.currentStepIndex += 1;
  const entered = enterStep(session, { ...opts, now });
  return {
    outcome: "advanced",
    evaluation,
    effects: [...effects, ...entered.effects],
  };
}

function finishV3(session: SessionV3State): void {
  session.isFinished = true;
  session.ending = computeEndingV3(session);
}

// ─── Sorties multiples et routage (chantier A) ────────────────────

function routeLabel(route: StepExit["route"]): string {
  if (route === "next") return "next";
  if (route && typeof route === "object" && "goto" in route) return `goto:${route.goto}`;
  if (route && typeof route === "object" && "end" in route) return `end:${route.end}`;
  return "?";
}

/** Fin avec ending NOMMÉ (court-circuite computeEndingV3). Repli sur
 *  computeEndingV3 si l'id est inconnu/absent (défensif). */
function finishWithEnding(session: SessionV3State, endingId?: string): void {
  session.isFinished = true;
  session.ending =
    (endingId !== undefined
      ? session.scenario.endings.find((e) => e.id === endingId)
      : undefined) ?? computeEndingV3(session);
}

/**
 * Une sortie vient de tirer : bindings (chantier B), journal d'audit,
 * events de la sortie (sémantique once, clé "<step>:<exit>:<event>").
 * Les effets produits sont poussés dans `effects`.
 */
function fireExit(
  session: SessionV3State,
  step: StepInvocationV3,
  exit: StepExit,
  ctx: TriggerContext,
  effects: PendingEffect[],
  now: number,
): void {
  Object.assign(session.actorBindings, collectTriggerBindings(exit.trigger, ctx));
  session.exitLog.push({
    at: now,
    step_id: step.step_id,
    exit_id: exit.id,
    route: routeLabel(exit.route),
  });
  for (const ev of exit.events ?? []) {
    if (!armExitEvent(session, step, exit, ev)) continue;
    effects.push(...executeEventEffect(session, ev.effect, now));
  }
}

function armExitEvent(
  session: SessionV3State,
  step: StepInvocationV3,
  exit: StepExit,
  ev: ExitNarrativeEvent,
): boolean {
  if (ev.once === false) return true;
  const key = `${step.step_id}:${exit.id}:${ev.event_id}`;
  if (session.firedEvents.includes(key)) return false;
  session.firedEvents.push(key);
  return true;
}

/**
 * Exécute la ROUTE d'une sortie :
 *   - "next"          : step suivant (ou fin de séquence → computeEnding) ;
 *   - {goto: step_id} : rollback déclaratif — compteur anti-boucle
 *     (max_gotos, défaut 3, au-delà → on_goto_exhausted.end), reset des
 *     fils/tools listés, ré-entrée du step cible (les events step_start
 *     déjà tirés ne se REJOUENT PAS, sémantique once, sauf once:false ;
 *     compteurs d'actions réarmés via attemptStartedIndex/enterStep) ;
 *   - {end: ending_id}: fin immédiate avec l'ending nommé.
 */
function executeExitRoute(
  session: SessionV3State,
  step: StepInvocationV3,
  exit: StepExit,
  now: number,
  opts: ReducerOptions,
): { outcome: StepCompletionOutcome["outcome"]; effects: PendingEffect[] } {
  session.pendingExitId = null;
  const route = exit.route;

  if (route !== "next" && route && typeof route === "object" && "goto" in route) {
    const count = (session.gotoCounts[step.step_id] ?? 0) + 1;
    session.gotoCounts[step.step_id] = count;
    const max = step.completion?.max_gotos ?? 3;
    if (count > max) {
      const fallback = step.completion?.on_goto_exhausted?.end;
      session.exitLog.push({
        at: now,
        step_id: step.step_id,
        exit_id: exit.id,
        route: `end:${fallback ?? "?"} (max_gotos ${max} dépassé)`,
      });
      finishWithEnding(session, fallback);
      return { outcome: "ended", effects: [] };
    }

    // Reset déclaratif AVANT ré-entrée : fils vidés, tools réinitialisés.
    const ws = session.workspace;
    for (const threadId of exit.reset?.threads ?? []) {
      const thread = ws.threads[threadId];
      if (thread) {
        thread.messages = [];
        thread.unread = 0;
      }
    }
    for (const toolId of exit.reset?.tools ?? []) {
      if (toolId in ws.toolStates) ws.toolStates[toolId] = null;
    }

    const idx = session.scenario.sequence.findIndex((s) => s.step_id === route.goto);
    if (idx < 0) {
      // Défensif — composerV3 refuse un goto vers un step inconnu.
      finishWithEnding(session);
      return { outcome: "ended", effects: [] };
    }
    session.currentStepIndex = idx;
    const entered = enterStep(session, { ...opts, now });
    return { outcome: "goto", effects: entered.effects };
  }

  if (route !== "next" && route && typeof route === "object" && "end" in route) {
    finishWithEnding(session, route.end);
    return { outcome: "ended", effects: [] };
  }

  // "next"
  if (session.currentStepIndex + 1 >= session.scenario.sequence.length) {
    finishWithEnding(session);
    return { outcome: "ended", effects: [] };
  }
  session.currentStepIndex += 1;
  const entered = enterStep(session, { ...opts, now });
  return { outcome: "advanced", effects: entered.effects };
}

// ─── (b) Application d'une action à l'état ────────────────────────

function applyActionToWorkspace(
  ws: WorkspaceState,
  action: WorkspaceAction,
  now: number,
  toolAppliers?: Record<string, ToolOpApplier>,
): void {
  switch (action.type) {
    case "message_sent": {
      const thread = ensureThread(ws, action.thread_id);
      thread.messages.push({ at: now, from: "player", content: action.content });
      // Le joueur écrit dans le fil : il l'a forcément sous les yeux.
      thread.unread = 0;
      break;
    }
    case "mail_sent":
      ws.mailbox.sent.push({
        mail_id: `mail_out_${ws.mailbox.sent.length + 1}`,
        at: now,
        from: "player",
        to: [...action.to],
        subject: action.subject,
        body: action.body,
        attachment_document_ids: action.attachment_document_ids
          ? [...action.attachment_document_ids]
          : undefined,
        attachment_artifacts: action.attachment_artifacts
          ? action.attachment_artifacts.map((a) => ({ ...a }))
          : undefined,
        read: true,
      });
      break;
    case "mail_opened": {
      const mail = ws.mailbox.inbox.find((m) => m.mail_id === action.mail_id);
      if (mail) mail.read = true;
      break;
    }
    case "mail_draft_saved":
      ws.mailbox.drafts[action.draft_id] = {
        to: [...action.to],
        subject: action.subject,
        body: action.body,
        artifact_refs: action.artifact_refs
          ? action.artifact_refs.map((r) => ({ ...r }))
          : undefined,
      };
      break;
    case "artifact_attached_to_mail": {
      const draft = ws.mailbox.drafts.compose ?? { to: [], subject: "", body: "" };
      const href = buildArtifactHref(action.ref);
      // Dédup du lien dans le corps (le href est unique par tool+id+kind).
      const alreadyLinked = draft.body.includes(href);
      const body = alreadyLinked
        ? draft.body
        : `${draft.body}${draft.body.trim() ? "\n\n" : ""}${artifactLinkMarkdown(action.ref)}`;
      // Dédup de la référence (par tool+id).
      const refs = [...(draft.artifact_refs ?? [])];
      if (!refs.some((r) => r.tool === action.ref.tool && r.id === action.ref.id)) {
        refs.push({ ...action.ref });
      }
      ws.mailbox.drafts.compose = { ...draft, body, artifact_refs: refs };
      break;
    }
    case "document_opened":
      ensureDocument(ws, action.document_id).opened = true;
      break;
    case "document_annotated":
      ensureDocument(ws, action.document_id).annotations = [...action.annotations];
      break;
    case "tool_state_changed":
      ws.toolStates[action.tool_id] = action.state;
      break;
    case "tool_op": {
      // Extension générique Tools (TOOL_BLOC_NOTES.md §2) : l'op est déjà
      // journalisée (audit fin) ; on délègue au reducer PUR enregistré
      // par le Tool. Tool sans applier / applier cassé → no-op défensif
      // (l'op reste dans le journal). Le moteur ne connaît AUCUNE op.
      const applier = toolAppliers?.[action.tool_id];
      if (!applier) break;
      try {
        const next = applier(ws.toolStates[action.tool_id] ?? null, action.op, action.payload);
        if (next !== undefined) ws.toolStates[action.tool_id] = next;
      } catch {
        // défensif : un applier qui throw ne bloque jamais le dispatch
      }
      break;
    }
    case "notification_read": {
      const notif = ws.notifications.find((n) => n.notif_id === action.notif_id);
      if (notif) notif.read = true;
      break;
    }
    // Actions « pures journal » : l'état n'a rien à retenir de plus,
    // les triggers lisent actionLog (terms/payload y compris).
    case "contract_signed":
    case "contract_rejected":
    case "deliverable_submitted":
    case "manual_trigger":
    case "clock_tick":
      break;
  }
}

// ─── (c) Events narratifs ─────────────────────────────────────────

function whenMatchesAction(
  when: NarrativeWhen,
  action: WorkspaceAction,
  now: number,
  ws: WorkspaceState,
): boolean {
  if (when.type === "after_action") return when.action === action.type;
  if (when.type === "delay") {
    return (
      action.type === "clock_tick" &&
      now - ws.stepStartedAt >= when.seconds * 1000
    );
  }
  // step_start / on_retry / on_step_passed : hors dispatch d'action.
  return false;
}

/** Marque l'event tiré (sémantique once, défaut true). Rend false si
 *  déjà consommé. Clé par step pour tolérer des event_id réutilisés. */
function armEvent(
  session: SessionV3State,
  step: StepInvocationV3,
  ev: NarrativeEvent,
): boolean {
  if (ev.once === false) return true;
  const key = `${step.step_id}:${ev.event_id}`;
  if (session.firedEvents.includes(key)) return false;
  session.firedEvents.push(key);
  return true;
}

/**
 * Exécute l'effet d'un event : les effets AUTHORÉS (contenu écrit par
 * le rédacteur) sont insérés immédiatement dans l'état ; les effets
 * qui demandent une production IA deviennent des PendingEffect.
 */
function executeEventEffect(
  session: SessionV3State,
  effect: NarrativeEffect,
  now: number,
): PendingEffect[] {
  switch (effect.type) {
    case "notification":
      pushNotification(session.workspace, "system", effect.title, effect.body, now);
      return [];
    case "mail_received":
      // Chantier B : from_actor peut être un alias lié — résolution stricte.
      deliverMail(
        session,
        { ...effect, from_actor: resolveActorStrict(session, effect.from_actor) },
        now,
      );
      return [];
    case "message_received": {
      const actorId = resolveActorStrict(session, effect.actor_id);
      if (effect.content !== undefined) {
        insertActorMessage(session, effect.thread_id, actorId, effect.content, now);
        return [];
      }
      // Sans contenu : c'est à l'IA de parler — même contrat qu'actor_reply.
      return [
        {
          kind: "actor_reply",
          thread_id: effect.thread_id,
          actor_id: actorId,
          directive: effect.directive,
        },
      ];
    }
    case "actor_reply":
      return [
        {
          kind: "actor_reply",
          thread_id: effect.thread_id,
          actor_id: resolveActorStrict(session, effect.actor_id),
          directive: effect.directive,
        },
      ];
  }
}

function fireEventsByWhen(
  session: SessionV3State,
  step: StepInvocationV3,
  whenType: "step_start" | "on_retry" | "on_step_passed",
  now: number,
  specs?: Record<string, DirectiveSource>,
): PendingEffect[] {
  const effects: PendingEffect[] = [];
  for (const ev of step.events ?? []) {
    if (ev.when.type !== whenType) continue;
    if (!armEvent(session, step, ev)) continue;
    effects.push(...executeEventEffect(session, ev.effect, now));
  }
  mergeMechanicDirective(session, effects, step, specs);
  return effects;
}

/** Directive finale d'un actor_reply = directive de la mécanique du
 *  step + directive propre à l'event (dans cet ordre). Les params sont
 *  résolus (chantier B : alias → actor_id) avant d'appeler la spec. */
function mergeMechanicDirective(
  session: SessionV3State,
  effects: PendingEffect[],
  step: StepInvocationV3,
  specs?: Record<string, DirectiveSource>,
): void {
  const spec = specs?.[step.mechanic];
  if (!spec) return;
  let mechDirective: string | undefined;
  try {
    mechDirective = spec.directive(resolveStepParamsV3(session, step.params));
  } catch {
    mechDirective = undefined; // défensif : une spec cassée ne bloque pas le dispatch
  }
  if (!mechDirective) return;
  for (const e of effects) {
    if (e.kind !== "actor_reply" && e.kind !== "mail_reply") continue;
    e.directive = e.directive ? `${mechDirective}\n\n${e.directive}` : mechDirective;
  }
}

// ─── (d) Complétion ───────────────────────────────────────────────

function buildTriggerContext(
  session: SessionV3State,
  step: StepInvocationV3,
  now: number,
): TriggerContext {
  const log: LoggedAction[] = [];
  for (let i = session.attemptStartedIndex; i < session.actionLog.length; i++) {
    const entry = session.actionLog[i];
    if (entry.step_id === step.step_id) log.push(entry);
  }
  return {
    log,
    workspace: session.workspace,
    lastObservation: session.lastObservation,
    now,
    stepStartedAt: session.workspace.stepStartedAt,
    scenarioStartedAt: session.workspace.scenarioStartedAt,
    // Chantier B : alias → actor_id (identité si non lié — un alias non
    // résolu ne matche jamais, jamais de throw dans les triggers).
    resolveActor: (ref) => session.actorBindings[ref] ?? ref,
    // Chantier C : scores du step courant, TENTATIVE courante — un
    // goto/retry réarme attemptStartedIndex, les scores antérieurs ne
    // comptent plus (ils restent dans session.mailScores pour l'audit).
    mailScores: session.mailScores.filter(
      (s) =>
        s.step_id === step.step_id &&
        s.attempt_started_index === session.attemptStartedIndex,
    ),
  };
}

function finalizeCompletion(
  session: SessionV3State,
  step: StepInvocationV3,
  significant: boolean,
  effects: PendingEffect[],
  now: number,
  opts: ReducerOptions = {},
): DispatchResult {
  const ctx = buildTriggerContext(session, step, now);
  const exits = step.completion?.exits;

  // ── Chantier A : sorties multiples — la PREMIÈRE qui tire gagne. ──
  if (exits && exits.length > 0) {
    // Une sortie a déjà tiré et attend son verdict IA : rien ne re-tire.
    if (session.pendingExitId != null) return { effects, completionFired: false };

    for (const exit of exits) {
      if (!evaluateTrigger(exit.trigger, ctx)) continue;
      fireExit(session, step, exit, ctx, effects, now);
      if (exit.evaluate === false) {
        // Route directe, sans observation IA (déterministe, synchrone).
        const routed = executeExitRoute(session, step, exit, now, opts);
        effects.push(...routed.effects);
      } else {
        session.pendingExitId = exit.id;
        effects.push({ kind: "evaluate_step", exit_id: exit.id });
      }
      return { effects, completionFired: true };
    }

    if (
      significant &&
      exits.some((e) => triggerMentions(e.trigger, OBSERVATION_TRIGGER_TYPES))
    ) {
      effects.push({ kind: "observe_step" });
    }
    return { effects, completionFired: false };
  }

  // ── Legacy : trigger unique (sucre — politique on_failure inchangée).
  const trigger = step.completion?.trigger;
  if (trigger && evaluateTrigger(trigger, ctx)) {
    // Chantier B : un trigger legacy peut aussi lier un alias.
    Object.assign(session.actorBindings, collectTriggerBindings(trigger, ctx));
    effects.push({ kind: "evaluate_step" });
    return { effects, completionFired: true };
  }
  // Trigger pas (encore) tiré : si le step dépend de l'observation IA
  // (criterion_observed / actor_validation), demander un rafraîchissement
  // après chaque action significative — c'est l'orchestrateur qui
  // observe puis rappelle recordStepObservation.
  if (
    significant &&
    trigger &&
    triggerMentions(trigger, OBSERVATION_TRIGGER_TYPES)
  ) {
    effects.push({ kind: "observe_step" });
  }
  return { effects, completionFired: false };
}

// ─── Helpers d'état ───────────────────────────────────────────────

function ensureThread(ws: WorkspaceState, threadId: string) {
  return (ws.threads[threadId] ??= {
    thread_id: threadId,
    participants: [],
    messages: [],
    unread: 0,
  });
}

function ensureDocument(ws: WorkspaceState, documentId: string) {
  return (ws.documents[documentId] ??= { opened: false, annotations: [] });
}

/** Nom d'affichage d'un acteur — extension minimale (fix toasts) : les
 *  notifications montrent le NOM du scénario ("Alexandre Morel"), jamais
 *  l'actor_id ("alexandre_morel"). Repli sur l'id si acteur inconnu. */
function actorNameOf(session: SessionV3State, actorId: string): string {
  return (
    session.scenario.actors.find((a) => a.actor_id === actorId)?.name ?? actorId
  );
}

function insertActorMessage(
  session: SessionV3State,
  threadId: string,
  actorId: string,
  content: string,
  now: number,
): void {
  const ws = session.workspace;
  const thread = ensureThread(ws, threadId);
  thread.messages.push({ at: now, from: "actor", actor_id: actorId, content });
  thread.unread += 1;
  pushNotification(
    ws,
    "messages",
    `Message de ${actorNameOf(session, actorId)}`,
    content.length > 120 ? `${content.slice(0, 117)}…` : content,
    now,
    threadId,
  );
}

function deliverMail(
  session: SessionV3State,
  effect: Extract<NarrativeEffect, { type: "mail_received" }>,
  now: number,
): void {
  const ws = session.workspace;
  const mailId = `mail_in_${ws.mailbox.inbox.length + 1}`;
  ws.mailbox.inbox.push({
    mail_id: mailId,
    at: now,
    from: effect.from_actor,
    to: ["player"],
    subject: effect.subject,
    body: effect.body,
    attachment_document_ids: effect.attachment_document_ids
      ? [...effect.attachment_document_ids]
      : undefined,
    read: false,
  });
  pushNotification(
    ws,
    "mail",
    effect.subject,
    `De ${actorNameOf(session, effect.from_actor)}`,
    now,
    mailId,
  );
}

function pushNotification(
  ws: WorkspaceState,
  app: string,
  title: string,
  body: string | undefined,
  now: number,
  sourceId?: string,
): void {
  ws.notifications.push({
    notif_id: `notif_${ws.notifications.length + 1}`,
    at: now,
    app,
    title,
    body,
    source_id: sourceId,
    read: false,
  });
}
