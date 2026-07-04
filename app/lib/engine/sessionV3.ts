/**
 * ═════════════════════════════════════════════════════════════════
 * Moteur v3 — Session workspace : état pur d'une partie "poste de
 * travail" (CONTRAT_WORKSPACE.md, validé PO le 3 juillet 2026)
 * ═════════════════════════════════════════════════════════════════
 *
 * Zéro React, zéro I/O. La session est un objet JSON sérialisable :
 * deep-save = JSON.stringify(session), reprise = JSON.parse.
 *
 * Étend le modèle v2 (stepResults / evaluationHistory / ending) avec :
 *   - workspace       : l'état du poste de travail (threads, mails, docs…)
 *   - actionLog       : LE journal — toute interaction joueur, horodatée,
 *                       écrite AVANT tout effet (audit, replay, triggers)
 *   - lastObservation : dernière observation IA du step courant
 *                       (rafraîchie par l'orchestrateur via observe_step)
 *   - firedEvents     : events narratifs déjà tirés (sémantique `once`)
 *
 * Le moteur v2 (sessionV2.ts) a été purgé — cf. archive/legacy-v2/ARCHIVE.md.
 */

import type { EndingRule, StepResult } from "./mechanics";
import type { StepEvaluationResult, StepObservation } from "./criteria";
import type {
  ScenarioV3,
  StepInvocationV3,
  WorkspaceState,
  LoggedAction,
  LoggedExit,
  MailScoreRecord,
} from "./workspace";

export interface SessionV3State {
  format: "session_v3";
  scenarioId: string;
  scenario: ScenarioV3;
  currentStepIndex: number;
  /** Verdicts + outputs par step_id (dernier essai). */
  stepResults: Record<string, StepResult>;
  /** Tous les verdicts rendus, dans l'ordre (y compris les retries). */
  evaluationHistory: StepEvaluationResult[];
  /** L'état du poste de travail — la matière des triggers et de l'observation. */
  workspace: WorkspaceState;
  /** Journal exhaustif des WorkspaceAction — le « git blame » de la partie. */
  actionLog: LoggedAction[];
  /**
   * Dernière observation IA du step courant. Remise à null à chaque
   * enterStep. C'est ELLE que lisent les triggers `criterion_observed`
   * et `actor_validation` — l'orchestrateur la rafraîchit via l'effet
   * `observe_step` puis `recordStepObservation`.
   */
  lastObservation: StepObservation | null;
  /** Events narratifs déjà tirés — clés "<step_id>:<event_id>" (once). */
  firedEvents: string[];
  /**
   * Index dans actionLog où commence la TENTATIVE courante du step.
   * Réarmé à enterStep et à chaque retry : les primitives de trigger
   * action-based (mail_sent, message_sent…) comptent par tentative,
   * sinon un trigger déjà satisfait re-tirerait à la première action
   * suivant un retry (boucle evaluate). Les timers, eux, restent
   * ancrés sur stepStartedAt / scenarioStartedAt.
   */
  attemptStartedIndex: number;
  /**
   * Chantier B — acteurs dynamiques : alias → actor_id réel, liés par
   * les triggers `bind_actor`. Résolution au runtime partout où un
   * actor_id est attendu (threads, params, triggers, events).
   */
  actorBindings: Record<string, string>;
  /**
   * Chantier C — scores IA des mails envoyés (route /api/v2/score),
   * journalisés pour l'audit et lus par mail_scored / mail_scored_below.
   * JAMAIS montrés au joueur.
   */
  mailScores: MailScoreRecord[];
  /** Chantier A — nombre de goto exécutés, par step_id source (anti-boucle). */
  gotoCounts: Record<string, number>;
  /** Chantier A — journal d'audit des sorties tirées. */
  exitLog: LoggedExit[];
  /**
   * Chantier A — sortie tirée en attente de son verdict IA (evaluate
   * par défaut) : tant qu'elle n'est pas résolue, aucune sortie du step
   * ne peut re-tirer (anti double tir). Remis à null à chaque enterStep.
   */
  pendingExitId: string | null;
  isFinished: boolean;
  ending: EndingRule | null;
  realStartTime: number;
}

/**
 * Construit la session et le WorkspaceState initial :
 *   - threads déclarés du premier step
 *   - TOUS les documents du scénario, non ouverts, sans annotation
 *   - toolStates initialisés (null = « pas encore initialisé par le
 *     Tool » : l'engine est pur, `Tool.initialState` vit côté UI et
 *     pousse son état via l'action tool_state_changed)
 *   - horloges (scenarioStartedAt = stepStartedAt = now)
 *
 * N'émet AUCUN effet : les events `step_start` du premier step sont
 * déclenchés par enterStep(session) — à appeler juste après.
 */
export function initializeSessionV3(
  scenario: ScenarioV3,
  now: number = Date.now(),
): SessionV3State {
  return {
    format: "session_v3",
    scenarioId: scenario.scenario_id,
    scenario,
    currentStepIndex: 0,
    stepResults: {},
    evaluationHistory: [],
    workspace: buildInitialWorkspace(scenario, now),
    actionLog: [],
    lastObservation: null,
    firedEvents: [],
    attemptStartedIndex: 0,
    actorBindings: {},
    mailScores: [],
    gotoCounts: {},
    exitLog: [],
    pendingExitId: null,
    isFinished: false,
    ending: null,
    realStartTime: now,
  };
}

function buildInitialWorkspace(scenario: ScenarioV3, now: number): WorkspaceState {
  const documents: WorkspaceState["documents"] = {};
  for (const doc of scenario.documents) {
    documents[doc.id] = { opened: false, annotations: [] };
  }

  const threads: WorkspaceState["threads"] = {};
  const toolStates: WorkspaceState["toolStates"] = {};
  const first = scenario.sequence[0];
  if (first) {
    for (const t of first.threads ?? []) {
      threads[t.thread_id] = {
        thread_id: t.thread_id,
        participants: [...t.participants],
        title: t.title,
        messages: [],
        unread: 0,
      };
    }
    for (const tc of first.tools ?? []) {
      toolStates[tc.tool] = null;
    }
  }

  return {
    threads,
    mailbox: { inbox: [], sent: [], drafts: {} },
    documents,
    toolStates,
    notifications: [],
    stepStartedAt: now,
    scenarioStartedAt: now,
  };
}

export function getCurrentStepV3(session: SessionV3State): StepInvocationV3 | null {
  return session.scenario.sequence[session.currentStepIndex] ?? null;
}

export function cloneSessionV3(session: SessionV3State): SessionV3State {
  return JSON.parse(JSON.stringify(session)) as SessionV3State;
}

/** Sérialisation deep-save. Symétrique de restoreSessionV3. */
export function serializeSessionV3(session: SessionV3State): string {
  return JSON.stringify(session);
}

export function restoreSessionV3(raw: string): SessionV3State {
  const parsed = JSON.parse(raw) as SessionV3State;
  if (parsed?.format !== "session_v3") {
    throw new Error("Snapshot invalide : format session_v3 attendu.");
  }
  // Rétrocompat deep-save : les snapshots antérieurs aux chantiers A/B/C
  // n'ont pas ces champs — on les initialise (purement additif).
  parsed.actorBindings ??= {};
  parsed.mailScores ??= [];
  parsed.gotoCounts ??= {};
  parsed.exitLog ??= [];
  parsed.pendingExitId ??= null;
  return parsed;
}

/**
 * Ending déterministe : première règle qui matche, dans l'ordre de
 * déclaration ; sinon la règle `default: true` ; sinon null.
 * (Même sémantique que computeEndingV2 — dupliquée car le moteur v2
 * reste intact et son type de session est incompatible.)
 */
export function computeEndingV3(session: SessionV3State): EndingRule | null {
  const passedIds = Object.values(session.stepResults)
    .filter((r) => r.passed)
    .map((r) => r.stepId);

  let fallback: EndingRule | null = null;
  for (const rule of session.scenario.endings) {
    if (rule.default) {
      fallback = fallback ?? rule;
      continue;
    }
    const requiresOk = (rule.requires_passed ?? []).every((id) =>
      passedIds.includes(id),
    );
    const minOk =
      rule.min_passed === undefined || passedIds.length >= rule.min_passed;
    if (requiresOk && minOk) return rule;
  }
  return fallback;
}
