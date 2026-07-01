/**
 * ═════════════════════════════════════════════════════════════════════
 * @revealio/engine — Public API surface
 * ═════════════════════════════════════════════════════════════════════
 *
 * Point d'entrée unique et stable pour tout ce qu'un dev interne OU
 * externe a besoin de savoir pour écrire, jouer ou étendre un scenario
 * Revealio. Toute évolution de cette API doit être documentée en
 * changelog + versionnée dans package.json.
 *
 * ─── Que trouve-t-on ici ? ────────────────────────────────────────
 *
 *  1. **Types** — ce à quoi ressemble un Scenario, une Session, une
 *     ModuleAction, etc. Aligne avec schema/scenario.schema.json.
 *
 *  2. **Runtime pur** — fonctions sans état React qui manipulent la
 *     session (initializeSession, applyEvaluation, cloneSession, …).
 *     C'est LA source de vérité — tout code qui teste ou avance une
 *     phase doit passer par là.
 *
 *  3. **Handlers & modules** — mécaniques réutilisables (Mail,
 *     Contract, Interview) invoquées par PhaseOrchestrator. Un
 *     module = un ensemble de lifecycle hooks (enter_phase,
 *     mail_sent, contract_signed) qui retourne des ModuleAction[].
 *
 *  4. **React hooks** — les hooks qui composent le player :
 *     useSendChatMessage, useSendMail, useEndPresentation,
 *     useScenarioInit, useDeepSave, etc. Ils consomment le
 *     PlayerContext.
 *
 *  5. **Lib helpers** — utilities pures (fetchChatWithRetry,
 *     phaseEventTracker, getActorInfo).
 *
 *  6. **Guarded constants** — listes exhaustives verrouillées par
 *     TypeScript `satisfies` (COMPLETION_RULES_KEYS).
 *
 * ─── Ce qui N'EST PAS ici ─────────────────────────────────────────
 *
 *  - Les composants UI du player (MailView, ChatView, etc.). Ils sont
 *    importables directement via leur path. Ils ne font pas partie de
 *    l'API "engine" au sens strict (le "moteur de jeu") — c'est la
 *    couche présentation qui les orchestre.
 *
 *  - Les modules d'un scenario spécifique (S0..S5 hooks). Ceux-ci
 *    vivent avec leur composant scenario.
 *
 * ─── Exemple minimal d'utilisation ────────────────────────────────
 *
 * ```ts
 * import {
 *   initializeSession,
 *   isCurrentPhaseValidatedByRules,
 *   addPlayerMessage,
 *   completeCurrentPhaseAndAdvance,
 * } from "@/app/lib/engine";
 *
 * const scenario = await loadScenario("founder_01_incubator");
 * const session = initializeSession(scenario);
 * addPlayerMessage(session, "Bonjour", "npc_example");
 *
 * if (isCurrentPhaseValidatedByRules(session)) {
 *   completeCurrentPhaseAndAdvance(session);
 * }
 * ```
 *
 * ─── Convention d'évolution ───────────────────────────────────────
 *
 * Ajouter un nouvel export ici = ajouter à ENGINE_PUBLIC_API dans
 * `__tests__/engine.publicApi.test.ts`. Le test type-check plantera
 * si tu oublies. Symétriquement, retirer un export requiert une
 * bump de version majeure de package.json.
 */

// ─── Types (schema-aligned) ──────────────────────────────────────

export type {
  ScenarioDefinition,
  SessionState,
  CompletionRules,
  PhaseMailConfig,
} from "@/app/lib/types";
export { COMPLETION_RULES_KEYS } from "@/app/lib/types";

// ─── Runtime pur (source de vérité de la logique de jeu) ─────────

export {
  // Session lifecycle
  initializeSession,
  buildRuntimeView,

  // Message manipulation
  addPlayerMessage,
  addAIMessage,
  addSystemMessage,
  addInboxMail,

  // Phase advancement
  completeCurrentPhaseAndAdvance,
  finishScenario,
  handlePhaseFailure,
  isCurrentPhaseValidatedByRules,
  isCurrentPhaseValidated,
  markCurrentPhaseCompleted,
  unlockCurrentPhase,

  // Phase queries
  getCurrentPhase,
  getCurrentPhaseId,
  getCurrentPhaseCriteria,
  getNextPhaseIndex,
  getPhaseIndexById,
  filterDocumentsByPhase,

  // Events + mails
  injectPhaseEntryEvents,
  sendCurrentPhaseMail,
  updateMailDraft,
  toggleMailAttachment,

  // Scoring + evaluation + interruptions
  applyEvaluation,
  updateAdaptiveMode,
  scheduleInterruption,
  checkNpcSuccessKeywords,
  checkNpcFailureKeywords,
} from "@/app/lib/runtime";

// ─── Handlers & modules (mécaniques déclaratives) ────────────────

export {
  // Phase-level handlers (interview, mail, contract)
  resolvePhaseHandler,
  InterviewHandler,
  ContractHandler,
  MailHandler,
} from "@/app/scenarios/[scenarioId]/play/handlers";

export type {
  PhaseHandler,
  InterviewPhaseHandler,
  ContractPhaseHandler,
  MailPhaseHandler,
  ContractType,
  SignResult,
  NegotiationConfig,
  AutoReplyContext,
  AutoReplyEffect,
  ModuleAction,
  ContractModuleContext,
  MailModuleExtra,
} from "@/app/scenarios/[scenarioId]/play/handlers";

// Module system (PhaseOrchestrator + registry)
export {
  resolveModules,
  dispatch,
  buildModuleContext,
} from "@/app/scenarios/[scenarioId]/play/handlers";

// Central dispatcher for module actions (exhaustive switch — see F5)
export { applyModuleActions } from "@/app/scenarios/[scenarioId]/play/handlers/applyModuleActions";
export type { ApplyModuleActionsDeps } from "@/app/scenarios/[scenarioId]/play/handlers/applyModuleActions";

// Async mail effects (HARD_REJECT, pivot Clinique, etc.)
export { executeMailAsyncEffect } from "@/app/scenarios/[scenarioId]/play/handlers/executeMailAsyncEffect";

// Standardized contract negotiation runner (S0 / S2 / S5)
export { runContractNegotiation, detectsExclusivity } from "@/app/scenarios/[scenarioId]/play/handlers/contractNegotiationSenders";
export type { RunContractNegotiationOpts } from "@/app/scenarios/[scenarioId]/play/handlers/contractNegotiationSenders";

// Dynamic actor resolution (chosen_cto / chosen_kol / establishment)
export {
  resolveDynamicActors,
  resolveEstablishmentPlaceholders,
} from "@/app/scenarios/[scenarioId]/play/handlers/dynamicActorResolution";

// ─── React hooks (couche player) ─────────────────────────────────

export {
  PlayerContext,
  usePlayerContext,
} from "@/app/scenarios/[scenarioId]/play/contexts/PlayerContext";
export type { PlayerContextValue } from "@/app/scenarios/[scenarioId]/play/contexts/PlayerContext";

export { useScenarioInit } from "@/app/scenarios/[scenarioId]/play/hooks/useScenarioInit";
export { useSendChatMessage } from "@/app/scenarios/[scenarioId]/play/hooks/useSendChatMessage";
export { useSendMail } from "@/app/scenarios/[scenarioId]/play/hooks/useSendMail";
export { useEndPresentation } from "@/app/scenarios/[scenarioId]/play/hooks/useEndPresentation";
export { useDeepSave } from "@/app/scenarios/[scenarioId]/play/hooks/useDeepSave";
export {
  useFounderCheckpoint,
} from "@/app/scenarios/[scenarioId]/play/hooks/useFounderCheckpoint";
export type {
  DeepSaveSnapshot,
  FounderCheckpointAPI,
} from "@/app/scenarios/[scenarioId]/play/hooks/useFounderCheckpoint";
export { useTTS } from "@/app/scenarios/[scenarioId]/play/hooks/useTTS";
export { useToasts } from "@/app/scenarios/[scenarioId]/play/hooks/useToasts";
export { useMailSendValidation } from "@/app/scenarios/[scenarioId]/play/hooks/useMailSendValidation";
export { useNewItemNotifications } from "@/app/scenarios/[scenarioId]/play/hooks/useNewItemNotifications";

// ─── Lib helpers (utilities pures) ───────────────────────────────

export { fetchChatWithRetry } from "@/app/scenarios/[scenarioId]/play/lib/fetchChatWithRetry";
export type { ChatRetryResult, ChatRetryDeps } from "@/app/scenarios/[scenarioId]/play/lib/fetchChatWithRetry";

export {
  resolveEventId,
  computeEntryEventKey,
  buildEntryEventKey,
  hasInjectedKey,
  markInjectedKey,
} from "@/app/scenarios/[scenarioId]/play/lib/phaseEventTracker";
export type { PhaseEventLike } from "@/app/scenarios/[scenarioId]/play/lib/phaseEventTracker";

export { getActorInfo } from "@/app/scenarios/[scenarioId]/play/lib/getActorInfo";
export type { ResolvedActorInfo } from "@/app/scenarios/[scenarioId]/play/lib/getActorInfo";

export { buildClinicalArticles } from "@/app/scenarios/[scenarioId]/play/lib/clinicalContractTemplates";
export type { ClinicalEstablishment } from "@/app/scenarios/[scenarioId]/play/lib/clinicalContractTemplates";

export { buildChatContext } from "@/app/lib/chatContextEnrichment";

// cloneSession vit dans playerUtils (utilité UI-side, pas dans runtime)
export { cloneSession, playNotificationSound, fmtTime, getInitials, STATUS_COLORS } from "@/app/scenarios/[scenarioId]/play/lib/playerUtils";

// ─── Founder mode (checkpoint API) ───────────────────────────────

export {
  deepSaveCheckpoint,
  advanceCheckpoint,
  rollbackCheckpoint,
  clearCheckpoint,
  findActiveCampaign,
  handleScenarioEntry,
} from "@/app/lib/founder";
export type {
  FounderCampaign,
  FounderCheckpoint,
  FounderState,
} from "@/app/lib/founder";
