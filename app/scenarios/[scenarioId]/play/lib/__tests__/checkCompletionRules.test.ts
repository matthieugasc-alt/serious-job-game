/**
 * Tests unit — isCurrentPhaseValidatedByRules (runtime, source de vérité).
 *
 * ⚠ REGRESSION GUARD (bug S1 phase 1_onepager, cf. task #104):
 * L'ancien lib/checkCompletionRules ne testait que npc_evidence +
 * player_evidence + min_score → retournait true par défaut sur des
 * completion_rules avec any_flags (comme S1 phase 1). Résultat: mail
 * envoyé = auto-advance sans que la condition métier soit remplie.
 *
 * Ce fichier de tests couvre les 6 règles pour empêcher toute future
 * régression du même type.
 */

import { describe, it, expect, vi } from "vitest";

// initializeSession lit des fichiers via fs — on stubbe pour rester en Node pur.
vi.mock("fs", async () => {
  const actual: any = await vi.importActual("fs");
  return { ...actual, existsSync: vi.fn().mockReturnValue(false) };
});

const { isCurrentPhaseValidatedByRules } = await import("@/app/lib/runtime");

// ── Fixture helpers ────────────────────────────────────────────────

function makeSess(opts: {
  completion_rules?: any;
  min_player_messages?: number;
  flags?: Record<string, any>;
  scores?: Record<string, number>;
  chatMessages?: any[];
}): any {
  const phaseId = "phase_test";
  return {
    scenarioId: "test",
    scenario: {
      phases: [
        {
          phase_id: phaseId,
          title: "Test",
          completion_rules: opts.completion_rules,
          min_player_messages: opts.min_player_messages,
        },
      ],
    },
    currentPhaseIndex: 0,
    unlockedPhases: [],
    completedPhases: [],
    flags: opts.flags || {},
    scores: opts.scores || {},
    chatMessages: opts.chatMessages || [],
    mailDrafts: {},
    savedDrafts: {},
    sentMails: [],
    inboxMails: [],
    pendingTimedEvents: [],
    injectedPhaseEntryEvents: [],
    actions: [],
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe("isCurrentPhaseValidatedByRules — regression guard (bug S1 one-pager)", () => {
  it("BLOCKS advance when any_flags list is present but no flag is truthy", () => {
    // C'est EXACTEMENT le cas S1 phase 1_onepager avant fix.
    const s = makeSess({
      completion_rules: { any_flags: ["one_pager_submitted"] },
      flags: {},
    });
    expect(isCurrentPhaseValidatedByRules(s)).toBe(false);
  });

  it("ADVANCES when any_flags is satisfied", () => {
    const s = makeSess({
      completion_rules: { any_flags: ["one_pager_submitted"] },
      flags: { one_pager_submitted: true },
    });
    expect(isCurrentPhaseValidatedByRules(s)).toBe(true);
  });

  it("BLOCKS when all_flags is present but some are missing", () => {
    const s = makeSess({
      completion_rules: { all_flags: ["a", "b", "c"] },
      flags: { a: true, b: true },
    });
    expect(isCurrentPhaseValidatedByRules(s)).toBe(false);
  });

  it("ADVANCES when all_flags are all truthy", () => {
    const s = makeSess({
      completion_rules: { all_flags: ["a", "b"] },
      flags: { a: true, b: true },
    });
    expect(isCurrentPhaseValidatedByRules(s)).toBe(true);
  });

  it("respects min_score threshold", () => {
    expect(
      isCurrentPhaseValidatedByRules(
        makeSess({ completion_rules: { min_score: 60 }, scores: { phase_test: 59 } }),
      ),
    ).toBe(false);
    expect(
      isCurrentPhaseValidatedByRules(
        makeSess({ completion_rules: { min_score: 60 }, scores: { phase_test: 60 } }),
      ),
    ).toBe(true);
  });

  it("required_player_evidence is a hard gate: fails even if flags pass", () => {
    const s = makeSess({
      completion_rules: {
        required_player_evidence: [{ keywords: ["mvp"], min_matches: 1 }],
        any_flags: ["shortcut"],
      },
      flags: { shortcut: true }, // any_flags OK
      chatMessages: [
        { role: "player", content: "Salut", phaseId: "phase_test" },
      ], // pas "mvp" dans les messages
    });
    // Player evidence pas satisfaite → return false MÊME si any_flags true.
    expect(isCurrentPhaseValidatedByRules(s)).toBe(false);
  });

  it("required_npc_evidence is a hard gate too", () => {
    const s = makeSess({
      completion_rules: {
        required_npc_evidence: [{ keywords: ["accepté"], min_matches: 1 }],
        any_flags: ["shortcut"],
      },
      flags: { shortcut: true },
      chatMessages: [{ role: "npc", content: "Non merci.", phaseId: "phase_test" }],
    });
    expect(isCurrentPhaseValidatedByRules(s)).toBe(false);
  });

  it("max_exchanges advances after N messages when other rules pass", () => {
    const msgs = Array.from({ length: 4 }, (_, i) => ({
      role: i % 2 === 0 ? "player" : "npc",
      content: `msg ${i}`,
      phaseId: "phase_test",
    }));
    const s = makeSess({
      completion_rules: { max_exchanges: 3 },
      chatMessages: msgs,
    });
    expect(isCurrentPhaseValidatedByRules(s)).toBe(true);
  });

  it("no completion_rules: falls back to min_player_messages", () => {
    const withFew = makeSess({
      min_player_messages: 3,
      chatMessages: [
        { role: "player", content: "1", phaseId: "phase_test" },
        { role: "player", content: "2", phaseId: "phase_test" },
      ],
    });
    expect(isCurrentPhaseValidatedByRules(withFew)).toBe(false);

    const withEnough = makeSess({
      min_player_messages: 2,
      chatMessages: [
        { role: "player", content: "1", phaseId: "phase_test" },
        { role: "player", content: "2", phaseId: "phase_test" },
      ],
    });
    expect(isCurrentPhaseValidatedByRules(withEnough)).toBe(true);
  });
});
