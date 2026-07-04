/**
 * ═════════════════════════════════════════════════════════════════════
 * @revealio/engine — Public API surface (moteur v3, poste de travail)
 * ═════════════════════════════════════════════════════════════════════
 *
 * Point d'entrée unique et stable du moteur v3. Un scénario v3 est une
 * **séquence de mécaniques headless** jouée dans un poste de travail
 * simulé (threads, mailbox, documents, tools) : le joueur agit via des
 * WorkspaceAction, le reducer applique, les triggers déclarent la fin
 * de step. L'architecture est documentée dans docs/MECANIQUES.md ; le
 * legacy v1 (phases) est archivé dans archive/legacy-v1/, le player v2
 * (MechanicModule React + Shell) dans archive/legacy-v2/ARCHIVE.md.
 *
 * ─── Que trouve-t-on ici ? ────────────────────────────────────────
 *
 *  1. **criteria** — le moteur d'évaluation par critères observés :
 *     `applyStepObservation(criteria, rules, observation)` — l'IA
 *     OBSERVE, le moteur DÉCIDE. Inchangé depuis le v2 : c'est LE
 *     moteur de verdict, partagé par sessionV3/workspaceReducer.
 *
 *  2. **mechanics** — les types fondamentaux partagés : `Json`,
 *     `ActorDef`, `DocumentDef`, `TranscriptEvent`, `EndingRule`,
 *     `StepResult`.
 *
 *  3. **workspace** — le vocabulaire du poste de travail :
 *     `ScenarioV3`, `StepInvocationV3`, `WorkspaceState`,
 *     `WorkspaceAction`, `MechanicSpec`, `PendingEffect`…
 *
 *  4. **sessionV3** — l'état de partie pur (sans React) :
 *     init/clone/sérialisation, step courant, `computeEndingV3`.
 *
 *  5. **workspaceReducer** — le cœur : `applyWorkspaceAction`,
 *     `enterStep`, effets narratifs, observation → `completeStepV3`.
 *
 *  6. **triggers** — évaluation déclarative des CompletionTrigger.
 *
 *  7. **composerV3** — validation statique (`validateScenarioV3`) et
 *     résolution des `inputs` inter-steps (`resolveStepInputsV3`).
 *     Parité CLI : scripts/validate-scenarios-v3.mjs.
 *
 *  8. **MECHANIC_SPECS / MECHANIC_SPEC_MANIFESTS** — le registre des
 *     mécaniques headless (app/mechanics/specs.ts), garde-fou testé
 *     contre schema/mechanics-v3.json.
 *
 * ─── Ce qui N'EST PAS ici ─────────────────────────────────────────
 *
 *  - La couche présentation : app/workspace/ (WorkspacePlayer,
 *    WorkspaceShell, apps, tools, orchestrateur I/O IA), importable
 *    directement.
 *  - Le mode founder (app/lib/founder.ts) : économie de campagne,
 *    branchée sur le moteur via /api/v2/complete.
 *
 * ─── Convention d'évolution ───────────────────────────────────────
 *
 * Ajouter un export ici = l'ajouter à ENGINE_PUBLIC_API dans
 * `__tests__/engine.publicApi.test.ts` (le garde-fou échoue sinon).
 * Retirer un export = bump majeur de version.
 */

// ─── criteria — moteur d'évaluation par critères ──────────────────

export type {
  CriterionSeverity,
  StepCriterion,
  StepCompletionRules,
  StepObservation,
  StepEvaluationResult,
} from "./criteria";
export {
  CRITERION_SEVERITIES,
  applyStepObservation,
  effectiveWeight,
} from "./criteria";

// ─── mechanics — types fondamentaux partagés ──────────────────────

export type {
  Json,
  JsonObject,
  ActorDef,
  DocumentDef,
  TranscriptEvent,
  EndingRule,
  StepResult,
} from "./mechanics";

// ─── workspace — vocabulaire du poste de travail ──────────────────

export type {
  ThreadMessage,
  Thread,
  WsMail,
  WsNotification,
  WorkspaceState,
  WorkspaceAction,
  LoggedAction,
  CompletionTrigger,
  StepCompletion,
  NarrativeWhen,
  NarrativeEffect,
  NarrativeEvent,
  StepToolConfig,
  StepInvocationV3,
  ScenarioV3,
  MechanicSpecManifest,
  MechanicSpec,
  PendingEffect,
  DispatchResult,
} from "./workspace";

// ─── sessionV3 — état de partie pur ───────────────────────────────

export type { SessionV3State } from "./sessionV3";
export {
  initializeSessionV3,
  cloneSessionV3,
  getCurrentStepV3,
  serializeSessionV3,
  restoreSessionV3,
  computeEndingV3,
} from "./sessionV3";

// ─── workspaceReducer — le cœur du moteur ─────────────────────────

export type {
  DirectiveSource,
  ReducerOptions,
  StepCompletionOutcome,
} from "./workspaceReducer";
export {
  applyWorkspaceAction,
  enterStep,
  applyNarrativeEffect,
  recordActorMessage,
  recordStepObservation,
  completeStepV3,
} from "./workspaceReducer";

// ─── triggers — évaluation déclarative des CompletionTrigger ──────

export type { TriggerContext } from "./triggers";
export {
  ACTOR_VALIDATION_PREFIX,
  actorValidationCriterion,
  evaluateTrigger,
  triggerMentions,
} from "./triggers";

// ─── composerV3 — validation statique + câblage des inputs ────────

export type { ComposerIssueV3 } from "./composerV3";
export { validateScenarioV3, resolveStepInputsV3 } from "./composerV3";

// ─── Registre des mécaniques headless ─────────────────────────────

export { MECHANIC_SPECS, MECHANIC_SPEC_MANIFESTS } from "@/app/mechanics/specs";
