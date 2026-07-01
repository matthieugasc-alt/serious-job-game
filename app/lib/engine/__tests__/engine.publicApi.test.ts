/**
 * Tests unit — verrouille la surface publique de @revealio/engine.
 *
 * ⚠ GARDE-FOU AUTOMATIQUE (chantier F2):
 * Le module `app/lib/engine/index.ts` est la seule API stable exposée
 * aux dev externes et internes. Si quelqu'un retire ou renomme un export
 * ici sans mettre à jour ENGINE_PUBLIC_API, le test échoue avec le nom
 * exact du symbole disparu.
 *
 * Le test valide 2 propriétés:
 *   1. Chaque symbole listé dans ENGINE_PUBLIC_API est réellement exporté
 *      par index.ts (import * as engine).
 *   2. Aucun export "inattendu" n'apparaît sans être listé — cohérence
 *      bidirectionnelle qui empêche l'API de grossir silencieusement.
 *
 * Ajouter un export au barrel = ajouter le nom ici, dans la bonne
 * catégorie. Retirer un export = bump de version majeure côté
 * package.json avant.
 */

import { describe, it, expect } from "vitest";
import * as engine from "../index";

// ─── Source de vérité : ce que l'API publique doit exposer ────────

const ENGINE_PUBLIC_API = {
  // 1. Runtime pur
  runtime: [
    "initializeSession",
    "buildRuntimeView",
    "addPlayerMessage",
    "addAIMessage",
    "addSystemMessage",
    "addInboxMail",
    "completeCurrentPhaseAndAdvance",
    "finishScenario",
    "handlePhaseFailure",
    "isCurrentPhaseValidatedByRules",
    "isCurrentPhaseValidated",
    "markCurrentPhaseCompleted",
    "unlockCurrentPhase",
    "getCurrentPhase",
    "getCurrentPhaseId",
    "getCurrentPhaseCriteria",
    "getNextPhaseIndex",
    "getPhaseIndexById",
    "filterDocumentsByPhase",
    "injectPhaseEntryEvents",
    "sendCurrentPhaseMail",
    "updateMailDraft",
    "toggleMailAttachment",
    "applyEvaluation",
    "updateAdaptiveMode",
    "scheduleInterruption",
    "checkNpcSuccessKeywords",
    "checkNpcFailureKeywords",
  ],

  // 2. Handlers + modules
  handlers: [
    "resolvePhaseHandler",
    "InterviewHandler",
    "ContractHandler",
    "MailHandler",
    "resolveModules",
    "dispatch",
    "buildModuleContext",
    "applyModuleActions",
    "executeMailAsyncEffect",
    "runContractNegotiation",
    "detectsExclusivity",
    "resolveDynamicActors",
    "resolveEstablishmentPlaceholders",
  ],

  // 3. React hooks
  hooks: [
    "PlayerContext",
    "usePlayerContext",
    "useScenarioInit",
    "useSendChatMessage",
    "useSendMail",
    "useEndPresentation",
    "useDeepSave",
    "useFounderCheckpoint",
    "useTTS",
    "useToasts",
    "useMailSendValidation",
    "useNewItemNotifications",
  ],

  // 4. Lib helpers
  lib: [
    "fetchChatWithRetry",
    "resolveEventId",
    "computeEntryEventKey",
    "buildEntryEventKey",
    "hasInjectedKey",
    "markInjectedKey",
    "getActorInfo",
    "buildClinicalArticles",
    "buildChatContext",
    "cloneSession",
    "playNotificationSound",
    "fmtTime",
    "getInitials",
    "STATUS_COLORS",
  ],

  // 5. Founder mode
  founder: [
    "deepSaveCheckpoint",
    "advanceCheckpoint",
    "rollbackCheckpoint",
    "clearCheckpoint",
    "findActiveCampaign",
    "handleScenarioEntry",
  ],

  // 6. Guarded constants
  constants: [
    "COMPLETION_RULES_KEYS",
  ],
} as const;

// ─── Tests ──────────────────────────────────────────────────────

describe("engine — public API surface (garde-fou F2)", () => {
  it("chaque symbole listé dans ENGINE_PUBLIC_API est exporté", () => {
    const allExpected = Object.values(ENGINE_PUBLIC_API).flat();
    const missing: string[] = [];
    for (const name of allExpected) {
      if (!(name in engine)) missing.push(name);
    }
    if (missing.length > 0) {
      throw new Error(
        `⚠ Symboles listés dans ENGINE_PUBLIC_API mais absents de @revealio/engine :\n` +
        missing.map((n) => `  - ${n}`).join("\n") +
        `\n\nSoit ajouter l'export dans app/lib/engine/index.ts, soit retirer le nom ` +
        `de ENGINE_PUBLIC_API (bump majeur package.json requis).`,
      );
    }
    expect(missing.length).toBe(0);
  });

  it("aucun symbole exporté n'échappe à ENGINE_PUBLIC_API", () => {
    const allExpected = new Set(Object.values(ENGINE_PUBLIC_API).flat() as string[]);
    const actualExports = Object.keys(engine);
    const unexpected: string[] = [];
    for (const name of actualExports) {
      // Type-only exports peuvent ne pas apparaître au runtime; ils sont
      // filtrés par TypeScript. On ne regarde que les runtime-only.
      if (!allExpected.has(name)) unexpected.push(name);
    }
    if (unexpected.length > 0) {
      throw new Error(
        `⚠ Symboles exportés par @revealio/engine mais absents de ENGINE_PUBLIC_API :\n` +
        unexpected.map((n) => `  - ${n}`).join("\n") +
        `\n\nAjoute chaque nom dans ENGINE_PUBLIC_API pour verrouiller l'API, ` +
        `ou retire l'export du barrel si non voulu.`,
      );
    }
    expect(unexpected.length).toBe(0);
  });

  it("les catégories du README couvrent tous les exports", () => {
    // Sanity: 6 catégories, chacune non vide.
    expect(Object.keys(ENGINE_PUBLIC_API).length).toBe(6);
    for (const [cat, list] of Object.entries(ENGINE_PUBLIC_API)) {
      expect(list.length, `catégorie "${cat}" vide`).toBeGreaterThan(0);
    }
  });

  it("les fonctions runtime critiques sont bien callable", () => {
    // Smoke test: pas d'undefined dans les exports.
    expect(typeof engine.initializeSession).toBe("function");
    expect(typeof engine.isCurrentPhaseValidatedByRules).toBe("function");
    expect(typeof engine.applyEvaluation).toBe("function");
    expect(typeof engine.applyModuleActions).toBe("function");
    expect(typeof engine.runContractNegotiation).toBe("function");
    expect(typeof engine.fetchChatWithRetry).toBe("function");
    expect(typeof engine.deepSaveCheckpoint).toBe("function");
    expect(Array.isArray(engine.COMPLETION_RULES_KEYS)).toBe(true);
  });
});
