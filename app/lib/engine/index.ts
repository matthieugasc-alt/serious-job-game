/**
 * ═════════════════════════════════════════════════════════════════════
 * @revealio/engine — Public API surface (moteur v2, format mécaniques)
 * ═════════════════════════════════════════════════════════════════════
 *
 * Point d'entrée unique et stable du moteur v2. Un scénario v2 est une
 * **séquence de mécaniques** (`sequence[]` de `StepInvocation`) — plus
 * de phases, plus de PhaseModule, plus de mail_config. L'architecture
 * est documentée dans docs/MECANIQUES.md ; le legacy v1 est archivé
 * dans archive/legacy-v1/ (voir ARCHIVE.md pour le mapping v1→v2).
 *
 * ─── Que trouve-t-on ici ? ────────────────────────────────────────
 *
 *  1. **mechanics** — le contrat d'une mécanique : `MechanicModule`
 *     (Component + evaluate), `MechanicManifest` (params/outputs),
 *     `ScenarioV2`, `StepInvocation`, `StepResult`, `EndingRule`,
 *     `MechanicIO`/`TranscriptEvent` (I/O vivant du player).
 *
 *  2. **criteria** — le moteur d'évaluation par critères observés :
 *     `applyStepObservation(criteria, rules, observation)` (successeur
 *     de applyPhaseObservation v1), sévérités, poids effectifs.
 *
 *  3. **sessionV2** — l'état de partie pur (sans React) :
 *     initialisation, avancement de step, transcript, sérialisation,
 *     calcul de l'ending (`computeEndingV2`).
 *
 *  4. **composer** — validation statique d'un scénario v2
 *     (`validateScenarioV2`) et résolution des `inputs` inter-steps
 *     (`resolveStepInputs`). Parité CLI : scripts/validate-scenarios-v2.mjs.
 *
 *  5. **MECHANIC_MANIFESTS** — le registre des mécaniques disponibles
 *     (app/mechanics/manifests.ts), garde-fou testé contre
 *     schema/mechanics.json.
 *
 * ─── Ce qui N'EST PAS ici ─────────────────────────────────────────
 *
 *  - Les composants React des mécaniques (app/mechanics/<id>/Component)
 *    et le player (app/player/Shell, MechanicRunner) : couche
 *    présentation, importable directement.
 *  - Le mode founder (app/lib/founder.ts) : économie de campagne,
 *    branchée sur le moteur via /api/v2/complete.
 *
 * ─── Exemple minimal ──────────────────────────────────────────────
 *
 * ```ts
 * import {
 *   validateScenarioV2,
 *   initializeSessionV2,
 *   getCurrentStep,
 *   completeCurrentStep,
 *   computeEndingV2,
 * } from "@/app/lib/engine";
 *
 * const issues = validateScenarioV2(scenario, MECHANIC_MANIFESTS);
 * const session = initializeSessionV2(scenario);
 * const step = getCurrentStep(session);
 * // … la mécanique produit un StepResult …
 * completeCurrentStep(session, result);
 * const ending = computeEndingV2(session);
 * ```
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

// ─── mechanics — contrat des mécaniques + format scénario v2 ─────

export type {
  Json,
  JsonObject,
  MechanicManifest,
  MechanicModule,
  MechanicContext,
  MechanicResult,
  MechanicProps,
  MechanicIO,
  TranscriptEvent,
  ActorDef,
  DocumentDef,
  ScenarioV2,
  StepInvocation,
  StepResult,
  EndingRule,
} from "./mechanics";

// ─── sessionV2 — état de partie pur ───────────────────────────────

export type { SessionV2State } from "./sessionV2";
export {
  initializeSessionV2,
  cloneSessionV2,
  getCurrentStep,
  recordTranscriptEvent,
  completeCurrentStep,
  computeEndingV2,
  serializeSessionV2,
  restoreSessionV2,
} from "./sessionV2";

// ─── composer — validation statique + câblage des inputs ─────────

export type { ComposerIssue } from "./composer";
export { validateScenarioV2, resolveStepInputs } from "./composer";

// ─── Registre des mécaniques ──────────────────────────────────────

export { MECHANIC_MANIFESTS } from "@/app/mechanics/manifests";
