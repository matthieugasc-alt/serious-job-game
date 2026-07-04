/**
 * ═════════════════════════════════════════════════════════════════
 * Moteur v3 — Workspace : le poste de travail comme état de jeu
 * ═════════════════════════════════════════════════════════════════
 *
 * Réf : docs/CONTRAT_WORKSPACE.md (validé PO, 3 juillet 2026).
 *
 * Principes non négociables :
 *   1. Environnement → Outils → Joueur. Les mécaniques observent.
 *   2. Toute interaction joueur est une WorkspaceAction journalisée
 *      AVANT tout effet. Flux unidirectionnel App → dispatch → moteur.
 *   3. Seul un `completion.trigger` déclaré par le RÉDACTEUR fait
 *      avancer la séquence. Aucune complétion implicite.
 *   4. events (mise en scène, sorties moteur→monde) ≠ triggers
 *      (conditions de passage, lectures du journal). Jamais confondus.
 *   5. Ce fichier est PUR : types + aucun React, aucun I/O.
 */

import type { Json, JsonObject, ActorDef, DocumentDef } from "./mechanics";
import type { StepCriterion, StepCompletionRules, StepObservation } from "./criteria";

// ─── État du poste de travail (dans la session, sérialisable) ─────

export interface ThreadMessage {
  at: number;
  from: "player" | "actor" | "system";
  actor_id?: string;
  content: string;
}

export interface Thread {
  thread_id: string;
  /** Participants IA (actor_ids). Le joueur est implicite. */
  participants: string[];
  title?: string;
  messages: ThreadMessage[];
  unread: number;
}

export interface WsMail {
  mail_id: string;
  at: number;
  from: string; // actor_id ou "player"
  to: string[]; // actor_ids
  subject: string;
  body: string;
  attachment_document_ids?: string[];
  read: boolean;
}

export interface WsNotification {
  notif_id: string;
  at: number;
  app: string; // app_id source ("mail", "messages", …)
  title: string;
  body?: string;
  /**
   * Extension additive (fix toasts, 4 juillet 2026) : identifiant de la
   * ressource source dans l'app — thread_id pour "messages", mail_id
   * pour "mail". Permet au shell de supprimer un toast quand le contenu
   * concerné est déjà sous les yeux du joueur (ChatDock ouvert…).
   */
  source_id?: string;
  read: boolean;
}

export interface WorkspaceState {
  threads: Record<string, Thread>;
  mailbox: {
    inbox: WsMail[];
    sent: WsMail[];
    drafts: Record<string, { to: string[]; subject: string; body: string }>;
  };
  /** Suivi par document : ouvert ? annotations (Tool surligneur plus tard). */
  documents: Record<string, { opened: boolean; annotations: Json[] }>;
  /** État de chaque Tool actif, par tool_id. */
  toolStates: Record<string, Json>;
  notifications: WsNotification[];
  /** Horloge du step courant (timers de triggers/events). */
  stepStartedAt: number;
  scenarioStartedAt: number;
}

// ─── Actions (union FERMÉE — toute interaction passe par là) ──────

export type WorkspaceAction =
  | { type: "message_sent"; thread_id: string; content: string }
  | { type: "mail_sent"; to: string[]; subject: string; body: string; attachment_document_ids?: string[] }
  | { type: "mail_opened"; mail_id: string }
  | { type: "mail_draft_saved"; draft_id: string; to: string[]; subject: string; body: string }
  | { type: "document_opened"; document_id: string }
  | { type: "document_annotated"; document_id: string; annotations: Json[] }
  | { type: "tool_state_changed"; tool_id: string; state: Json }
  /** Extension générique Tools (TOOL_BLOC_NOTES.md §2) : op fine d'un
   *  Tool, journalisée telle quelle ("note_created", "task_moved"…) puis
   *  appliquée par le reducer PUR que le Tool enregistre (applyOp). Le
   *  moteur n'a AUCUNE connaissance des ops. */
  | { type: "tool_op"; tool_id: string; op: string; payload: JsonObject }
  | { type: "contract_signed"; tool_id: string; terms: JsonObject }
  | { type: "contract_rejected"; tool_id: string; reason?: string }
  | { type: "deliverable_submitted"; tool_id?: string; payload: JsonObject }
  | { type: "notification_read"; notif_id: string }
  | { type: "manual_trigger"; label: string }
  | { type: "clock_tick"; now: number };

/** Entrée du journal : l'action + son horodatage + le step actif. */
export interface LoggedAction {
  at: number;
  step_id: string;
  action: WorkspaceAction;
}

/**
 * Reducer PUR d'un Tool (TOOL_BLOC_NOTES.md §2) — enregistré dans le
 * TOOL_REGISTRY (Tool.applyOp) et passé au moteur via
 * ReducerOptions.toolAppliers (même canal injectable que `specs` : le
 * reducer reste pur et testable). Op inconnue → le Tool rend l'état
 * inchangé ; tool sans applier → no-op journalisé défensif côté moteur.
 */
export type ToolOpApplier = (state: Json, op: string, payload: JsonObject) => Json;

// ─── Triggers (déclarés par le RÉDACTEUR — schéma v3) ─────────────

/**
 * `bind_actor` (chantier B — acteurs dynamiques) : quand le trigger
 * tire, le destinataire RÉEL (mail/message) est lié à cet alias dans
 * session.actorBindings. Les steps suivants peuvent référencer l'alias
 * partout où un actor_id est attendu (threads.participants,
 * params.*_actor / actor_id, triggers, events). Autorisé uniquement sur
 * mail_sent, message_sent et any (le sous-trigger qui tire décide).
 *
 * `mail_scored` / `mail_scored_below` (chantier C — scoring IA à
 * seuil) : le dernier mail scoré du step (session.mailScores, produit
 * par la route générique /api/v2/score sur la base de step.scoring)
 * atteint — ou non — le seuil. Les deux se déclarent sur le MÊME envoi
 * (deux exits) : ≥ min_score tire mail_scored, < min_score tire
 * mail_scored_below. Le score n'est JAMAIS montré au joueur.
 */
export type CompletionTrigger =
  | { type: "mail_sent"; to?: string; min_count?: number; bind_actor?: string }
  | { type: "message_sent"; to_actor?: string; min_count?: number; bind_actor?: string }
  | { type: "message_received"; from_actor: string }
  | { type: "contract_signed" }
  | { type: "contract_rejected" }
  | { type: "deliverable_submitted"; tool?: string }
  | { type: "document_opened"; document_id: string }
  | { type: "timer_elapsed"; seconds: number; from?: "step_start" | "scenario_start" }
  | { type: "criterion_observed"; criterion: string }
  | { type: "actor_validation"; actor: string }
  | { type: "mail_scored"; to?: string; min_score: number; scale?: number }
  | { type: "mail_scored_below"; to?: string; min_score: number; scale?: number }
  | { type: "manual"; label: string }
  | { type: "all"; of: CompletionTrigger[] }
  | { type: "any"; of: CompletionTrigger[]; bind_actor?: string };

// ─── Sorties multiples et routage (chantier A) ────────────────────

/** Destination d'une sortie : step suivant, retour à un step (rollback
 *  déclaratif) ou fin immédiate avec un ending NOMMÉ (court-circuite
 *  computeEndingV3). */
export type ExitRoute = "next" | { goto: string } | { end: string };

/** Remise à zéro déclarative exécutée par une route goto : messages des
 *  fils listés vidés, état des tools listés réinitialisé (null). */
export interface ExitReset {
  threads?: string[];
  tools?: string[];
}

/** Event narratif attaché à une sortie : déclenché quand CETTE sortie
 *  tire. `when` est ignoré (le déclencheur est la sortie elle-même) —
 *  le champ est toléré pour rester compatible avec NarrativeEvent. */
export interface ExitNarrativeEvent {
  event_id: string;
  when?: NarrativeWhen;
  effect: NarrativeEffect;
  /** Ne se rejoue pas (défaut true) — clé "<step>:<exit>:<event>". */
  once?: boolean;
}

/**
 * Une sortie de step. Le PREMIER exit dont le trigger tire gagne.
 *  - evaluate (défaut true) : observation IA + verdict moteur enregistré
 *    (stepResults) AVANT de router. false : route directe, sans I/O.
 *  - La route déclarée s'applique QUEL QUE SOIT le verdict : avec des
 *    exits, le rédacteur route explicitement (on_failure ne joue plus).
 */
export interface StepExit {
  id: string;
  trigger: CompletionTrigger;
  evaluate?: boolean;
  route: ExitRoute;
  reset?: ExitReset;
  events?: ExitNarrativeEvent[];
}

export interface StepCompletion {
  /** Sucre : une sortie unique "next" avec la politique on_failure
   *  existante. Exclusif avec `exits` (validation). */
  trigger?: CompletionTrigger;
  /** Sorties multiples ordonnées — la première qui tire gagne. */
  exits?: StepExit[];
  /** "evaluate" (défaut) : observation IA → applyStepObservation → verdict. */
  on_trigger?: "evaluate";
  /** Plafond de goto exécutés PAR CE STEP (défaut 3). */
  max_gotos?: number;
  /** Route de secours quand le plafond de goto est dépassé — OBLIGATOIRE
   *  (validation) dès qu'une sortie route en goto. */
  on_goto_exhausted?: { end: string };
}

// ─── Scoring IA à seuil (chantier C) ──────────────────────────────

/** Cadre de notation d'un step : brief passé tel quel à la route
 *  générique POST /api/v2/score (gpt-4.1-mini, température 0). */
export interface StepScoring {
  brief: string;
  /** Échelle de notation (défaut 10). */
  scale?: number;
}

/** Score enregistré dans la session (audit) — jamais montré au joueur. */
export interface MailScoreRecord {
  mail_id: string;
  at: number;
  step_id: string;
  /** Tentative à laquelle le score appartient (valeur de
   *  session.attemptStartedIndex au moment de l'enregistrement) : un
   *  goto/retry réarme la tentative, les scores antérieurs ne comptent
   *  plus pour les triggers — ils restent journalisés (audit). */
  attempt_started_index: number;
  to: string[];
  score: number;
  scale: number;
  rationale?: string;
}

/** Entrée du journal d'audit des sorties tirées (chantier A). */
export interface LoggedExit {
  at: number;
  step_id: string;
  exit_id: string;
  /** Route effective, lisible : "next" | "goto:<step>" | "end:<ending>". */
  route: string;
}

// ─── Events narratifs (mise en scène — ne font JAMAIS avancer) ────

export type NarrativeWhen =
  | { type: "step_start" }
  | { type: "delay"; seconds: number }
  | { type: "after_action"; action: WorkspaceAction["type"] }
  | { type: "on_retry" }
  | { type: "on_step_passed" };

export type NarrativeEffect =
  | { type: "message_received"; thread_id: string; actor_id: string; content?: string; directive?: string }
  | { type: "mail_received"; from_actor: string; subject: string; body: string; attachment_document_ids?: string[] }
  | { type: "notification"; title: string; body?: string }
  | { type: "actor_reply"; thread_id: string; actor_id: string; directive?: string };

export interface NarrativeEvent {
  event_id: string;
  when: NarrativeWhen;
  effect: NarrativeEffect;
  /** Un event ne se rejoue pas (défaut true). */
  once?: boolean;
}

// ─── Step v3 ──────────────────────────────────────────────────────

export interface StepToolConfig {
  tool: string; // id du TOOL_REGISTRY
  config?: JsonObject;
}

export interface StepInvocationV3 {
  step_id: string;
  mechanic: string;
  title?: string;
  params: JsonObject;
  inputs?: Record<string, string>;
  /** Tools activés pour ce step (complètent les default_tools du manifest). */
  tools?: StepToolConfig[];
  /** Fils de discussion / acteurs joignables pendant ce step. */
  threads?: { thread_id: string; participants: string[]; title?: string }[];
  document_ids?: string[];
  events?: NarrativeEvent[];
  /** Cadre de notation IA des mails du step (chantier C) — requis dès
   *  qu'un trigger mail_scored / mail_scored_below est déclaré. */
  scoring?: StepScoring;
  completion: StepCompletion; // OBLIGATOIRE — validé par le schéma
  evaluation: { observed_criteria: StepCriterion[] };
  completion_rules: StepCompletionRules;
  on_failure?: "retry" | "advance" | "end_scenario";
  max_attempts?: number;
}

export interface ScenarioV3 {
  format: "v3";
  scenario_id: string;
  version: string;
  locale: string;
  meta: { title: string; description: string; difficulty?: string; estimated_minutes?: number };
  actors: ActorDef[];
  documents: DocumentDef[];
  competencies?: string[];
  sequence: StepInvocationV3[];
  endings: import("./mechanics").EndingRule[];
}

// ─── Mécanique headless (v3) ──────────────────────────────────────

export interface MechanicSpecManifest {
  id: string;
  version: string;
  title: string;
  description: string;
  output_keys: readonly string[];
  required_params: readonly string[];
  /** Tools suggérés — le step peut en ajouter/retirer. */
  default_tools: readonly string[];
}

/**
 * Une mécanique v3 est une CAPACITÉ DU MOTEUR. Zéro UI, zéro I/O.
 * Elle cadre les acteurs, extrait les artefacts observables du
 * workspace, et type l'output. Le garde-fou mechanics.headless
 * interdit tout import React dans les fichiers spec.
 */
export interface MechanicSpec<P extends JsonObject = JsonObject, O extends JsonObject = JsonObject> {
  manifest: MechanicSpecManifest;
  /** Consigne universelle de cadrage des acteurs pour ce step. */
  directive(params: P): string;
  /** Ce que l'observateur IA doit regarder (extrait de l'état réel). */
  buildArtifacts(ws: WorkspaceState, step: StepInvocationV3, log: LoggedAction[]): JsonObject;
  /** Output typé consommable par inputs_from, construit après verdict. */
  buildOutput(ws: WorkspaceState, step: StepInvocationV3, observation: StepObservation, log: LoggedAction[]): O;
  validateParams(params: JsonObject): string[];
}

// ─── Résultat d'un dispatch (le cœur rend, l'orchestrateur exécute) ─

/** Effets async à exécuter par l'orchestrateur client (I/O IA). */
export type PendingEffect =
  | { kind: "actor_reply"; thread_id: string; actor_id: string; directive?: string }
  | { kind: "mail_incoming"; from_actor: string; subject: string; body: string; attachment_document_ids?: string[]; directive?: string }
  | { kind: "observe_step" }
  /** exit_id présent : le verdict route par la sortie nommée (chantier A). */
  | { kind: "evaluate_step"; exit_id?: string }
  /** Notation IA d'un mail envoyé (chantier C) → recordMailScore. */
  | { kind: "score_mail"; mail_id: string };

export interface DispatchResult {
  /** Effets narratifs/IA à exécuter (l'orchestrateur les traduit en I/O). */
  effects: PendingEffect[];
  /** Le trigger de complétion du step a-t-il tiré ? */
  completionFired: boolean;
}
