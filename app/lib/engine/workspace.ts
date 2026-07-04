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

// ─── Triggers (déclarés par le RÉDACTEUR — schéma v3) ─────────────

export type CompletionTrigger =
  | { type: "mail_sent"; to?: string; min_count?: number }
  | { type: "message_sent"; to_actor?: string; min_count?: number }
  | { type: "message_received"; from_actor: string }
  | { type: "contract_signed" }
  | { type: "contract_rejected" }
  | { type: "deliverable_submitted"; tool?: string }
  | { type: "document_opened"; document_id: string }
  | { type: "timer_elapsed"; seconds: number; from?: "step_start" | "scenario_start" }
  | { type: "criterion_observed"; criterion: string }
  | { type: "actor_validation"; actor: string }
  | { type: "manual"; label: string }
  | { type: "all"; of: CompletionTrigger[] }
  | { type: "any"; of: CompletionTrigger[] };

export interface StepCompletion {
  trigger: CompletionTrigger;
  /** "evaluate" (défaut) : observation IA → applyStepObservation → verdict. */
  on_trigger?: "evaluate";
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
  | { kind: "evaluate_step" };

export interface DispatchResult {
  /** Effets narratifs/IA à exécuter (l'orchestrateur les traduit en I/O). */
  effects: PendingEffect[];
  /** Le trigger de complétion du step a-t-il tiré ? */
  completionFired: boolean;
}
