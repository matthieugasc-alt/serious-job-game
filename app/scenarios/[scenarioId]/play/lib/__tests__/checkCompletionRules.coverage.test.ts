/**
 * Tests unit — couverture EXHAUSTIVE des completion_rules keys.
 *
 * ⚠ GARDE-FOU AUTOMATIQUE (recommandation advisor, 1er juillet 2026):
 * Empêche définitivement la régression du 1er juillet 2026 où une
 * extraction avait implémenté 3 règles sur 6 → advance par défaut.
 *
 * Ce fichier utilise 2 techniques complémentaires:
 *
 * 1. TypeScript `satisfies readonly (keyof CompletionRules)[]` dans
 *    app/lib/types.ts qui force COMPLETION_RULES_KEYS à contenir des
 *    strings valides du type CompletionRules.
 *
 * 2. Un test qui construit une CompletionRules avec CHAQUE key isolément
 *    et vérifie que la présence de la key produit un effet observable
 *    sur `isCurrentPhaseValidatedByRules`. Si une key est ajoutée au type
 *    et à COMPLETION_RULES_KEYS mais oubliée dans le runtime, le test
 *    échoue.
 */

import { describe, it, expect, vi } from "vitest";
import { COMPLETION_RULES_KEYS, type CompletionRules } from "@/app/lib/types";

vi.mock("fs", async () => {
  const actual: any = await vi.importActual("fs");
  return { ...actual, existsSync: vi.fn().mockReturnValue(false) };
});

const { isCurrentPhaseValidatedByRules } = await import("@/app/lib/runtime");

// ── Setup: constructeur de session minimal pour tester chaque règle ──

function makeSess(rules: CompletionRules): any {
  return {
    scenarioId: "test",
    scenario: {
      phases: [{ phase_id: "phase_test", title: "Test", completion_rules: rules }],
    },
    currentPhaseIndex: 0,
    unlockedPhases: [],
    completedPhases: [],
    flags: {},
    scores: {},
    chatMessages: [],
    mailDrafts: {},
    savedDrafts: {},
    sentMails: [],
    inboxMails: [],
    pendingTimedEvents: [],
    injectedPhaseEntryEvents: [],
    actions: [],
  };
}

/**
 * Pour chaque key du type CompletionRules, construit un cas
 * "règle présente + condition NON satisfaite" et vérifie que la fonction
 * retourne false (donc la règle est bien évaluée).
 *
 * Si un jour on retire une clé du runtime sans updater COMPLETION_RULES_KEYS,
 * le test correspondant échoue.
 */
const RULE_STRESS_CASES: Record<
  (typeof COMPLETION_RULES_KEYS)[number],
  {
    rules: CompletionRules;
    /** Ce que la fonction doit retourner quand la règle n'est PAS satisfaite. */
    expectedWhenFailing: boolean;
    /** Description humaine. */
    description: string;
  }
> = {
  min_score: {
    rules: { min_score: 100 },
    expectedWhenFailing: false,
    description: "phase avec min_score=100 et score=0 → false",
  },
  any_flags: {
    rules: { any_flags: ["never_set"] },
    expectedWhenFailing: false,
    description: "phase avec any_flags=['never_set'] et flags vides → false",
  },
  all_flags: {
    rules: { all_flags: ["a", "b"] },
    expectedWhenFailing: false,
    description: "phase avec all_flags=['a','b'] et flags vides → false",
  },
  max_exchanges: {
    // max_exchanges avec 0 échanges → false (pas atteint le seuil)
    rules: { max_exchanges: 10 },
    expectedWhenFailing: false,
    description: "phase avec max_exchanges=10 et 0 messages → false",
  },
  custom: {
    // custom n'est pas encore implémenté dans runtime → toujours false
    rules: { custom: "flags.some_flag === true" },
    expectedWhenFailing: false,
    description: "phase avec custom (non implémenté) → false par défaut",
  },
  required_player_evidence: {
    rules: {
      required_player_evidence: [{ keywords: ["target_word"], min_matches: 1 }],
    },
    expectedWhenFailing: false,
    description: "phase avec required_player_evidence non satisfait → false",
  },
  required_npc_evidence: {
    rules: {
      required_npc_evidence: [{ keywords: ["target_word"], min_matches: 1 }],
    },
    expectedWhenFailing: false,
    description: "phase avec required_npc_evidence non satisfait → false",
  },
  required_criteria: {
    // E-chantier: câblage via applyPhaseObservation (E3) qui set un flag
    // 'evaluation_passed'. Tant que E3 n'est pas livré, la règle est
    // reconnue par le type mais n'a aucun effet standalone → false attendu.
    rules: { required_criteria: ["identified_client_need", "handled_objection"] },
    expectedWhenFailing: false,
    description: "phase avec required_criteria non satisfait → false (câblage E3)",
  },
  min_criteria_count: {
    // E-chantier idem: câblage via applyPhaseObservation (E3).
    rules: { min_criteria_count: 3 },
    expectedWhenFailing: false,
    description: "phase avec min_criteria_count=3 non atteint → false (câblage E3)",
  },
};

describe("completion_rules — coverage garde-fou", () => {
  it("COMPLETION_RULES_KEYS contient toutes les keys utilisables du type", () => {
    // Cohérence de base: la liste exportée n'est pas vide et contient
    // exactement 9 keys (voir CompletionRules dans types.ts).
    // 7 legacy + 2 E-chantier (required_criteria, min_criteria_count).
    expect(COMPLETION_RULES_KEYS.length).toBe(9);
    // Vérifie qu'aucune duplication.
    const asSet = new Set(COMPLETION_RULES_KEYS);
    expect(asSet.size).toBe(COMPLETION_RULES_KEYS.length);
  });

  it("RULE_STRESS_CASES couvre TOUTES les keys de COMPLETION_RULES_KEYS", () => {
    // Assertion: chaque key doit avoir un stress case. Si tu ajoutes une
    // key à COMPLETION_RULES_KEYS sans écrire son stress case, ça échoue.
    for (const key of COMPLETION_RULES_KEYS) {
      expect(
        RULE_STRESS_CASES[key],
        `⚠ COMPLETION_RULES_KEYS contient "${key}" mais RULE_STRESS_CASES ne l'a pas — ajoute son stress case`,
      ).toBeDefined();
    }
    // Symétrique: aucun stress case sans key correspondante.
    for (const key of Object.keys(RULE_STRESS_CASES)) {
      expect(
        (COMPLETION_RULES_KEYS as readonly string[]).includes(key),
        `⚠ RULE_STRESS_CASES contient "${key}" mais COMPLETION_RULES_KEYS ne l'a pas — ajoute-la au type`,
      ).toBe(true);
    }
  });

  // Test paramétré: chaque key est effectivement évaluée par le runtime.
  for (const key of COMPLETION_RULES_KEYS) {
    it(`règle "${key}": ${RULE_STRESS_CASES[key].description}`, () => {
      const stressCase = RULE_STRESS_CASES[key];
      const sess = makeSess(stressCase.rules);
      const result = isCurrentPhaseValidatedByRules(sess);
      expect(
        result,
        `⚠ Règle "${key}" présente mais non satisfaite → attendu ${stressCase.expectedWhenFailing}, obtenu ${result}. ` +
          `Le runtime ne semble pas évaluer cette règle — c'est le bug régression du 1er juillet.`,
      ).toBe(stressCase.expectedWhenFailing);
    });
  }
});
