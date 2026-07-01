/**
 * Tests unit — checkCompletionRules.
 *
 * Vérifie les combinaisons npc_evidence + player_evidence + min_score
 * et les cas d'edge (règles absentes, mix passing/failing).
 */

import { describe, it, expect } from "vitest";
import { checkCompletionRules } from "../checkCompletionRules";

describe("checkCompletionRules", () => {
  it("returns true when no rules declared", () => {
    expect(checkCompletionRules({ phase_id: "p1" }, [], undefined)).toBe(true);
    expect(checkCompletionRules(undefined, [], {})).toBe(true);
  });

  it("passes npc_evidence when every keyword group hits min_matches", () => {
    const phase = {
      phase_id: "p1",
      completion_rules: {
        required_npc_evidence: [
          { keywords: ["ok", "d'accord"], min_matches: 1 },
          { keywords: ["envoie", "expedie"], min_matches: 1 },
        ],
      },
    };
    const conv = [
      { role: "npc", content: "OK, on est d'accord." },
      { role: "npc", content: "Envoie-nous le devis." },
    ];
    expect(checkCompletionRules(phase, conv, {})).toBe(true);
  });

  it("fails npc_evidence when at least one group misses", () => {
    const phase = {
      phase_id: "p1",
      completion_rules: {
        required_npc_evidence: [
          { keywords: ["ok"], min_matches: 1 },
          { keywords: ["envoie"], min_matches: 1 },
        ],
      },
    };
    const conv = [{ role: "npc", content: "OK mais je réfléchis." }];
    expect(checkCompletionRules(phase, conv, {})).toBe(false);
  });

  it("respects min_matches > 1 (must find keyword N times across NPC messages)", () => {
    const phase = {
      phase_id: "p1",
      completion_rules: {
        required_npc_evidence: [{ keywords: ["oui", "d'accord", "parfait"], min_matches: 2 }],
      },
    };
    const conv = [{ role: "npc", content: "Oui, parfait." }];
    expect(checkCompletionRules(phase, conv, {})).toBe(true);
    const conv2 = [{ role: "npc", content: "Oui." }];
    expect(checkCompletionRules(phase, conv2, {})).toBe(false);
  });

  it("evaluates player_evidence separately (only reads player messages)", () => {
    const phase = {
      phase_id: "p1",
      completion_rules: {
        required_player_evidence: [{ keywords: ["exclusivite"], min_matches: 1 }],
      },
    };
    // Le keyword dans un message NPC ne doit PAS compter.
    const conv = [
      { role: "npc", content: "Vous parlez d'exclusivite ?" },
      { role: "player", content: "Non, je veux juste discuter." },
    ];
    expect(checkCompletionRules(phase, conv, {})).toBe(false);
  });

  it("passes when player_evidence matches in player messages", () => {
    const phase = {
      phase_id: "p1",
      completion_rules: {
        required_player_evidence: [{ keywords: ["mvp"], min_matches: 1 }],
      },
    };
    const conv = [{ role: "player", content: "Je propose un MVP sur 3 mois." }];
    expect(checkCompletionRules(phase, conv, {})).toBe(true);
  });

  it("enforces min_score threshold", () => {
    const phase = { phase_id: "p1", completion_rules: { min_score: 60 } };
    expect(checkCompletionRules(phase, [], { p1: 59 })).toBe(false);
    expect(checkCompletionRules(phase, [], { p1: 60 })).toBe(true);
    expect(checkCompletionRules(phase, [], { p1: 90 })).toBe(true);
  });

  it("min_score defaults to 0 when phase has no score entry", () => {
    const phase = { phase_id: "p1", completion_rules: { min_score: 1 } };
    expect(checkCompletionRules(phase, [], {})).toBe(false);
  });

  it("ALL rules must pass — combining npc_evidence + min_score", () => {
    const phase = {
      phase_id: "p1",
      completion_rules: {
        required_npc_evidence: [{ keywords: ["ok"] }],
        min_score: 50,
      },
    };
    // Score OK mais pas de NPC → fail
    expect(checkCompletionRules(phase, [{ role: "player", content: "salut" }], { p1: 80 })).toBe(false);
    // NPC OK mais score insuffisant → fail
    expect(checkCompletionRules(phase, [{ role: "npc", content: "OK" }], { p1: 10 })).toBe(false);
    // Les deux OK → pass
    expect(checkCompletionRules(phase, [{ role: "npc", content: "OK" }], { p1: 80 })).toBe(true);
  });

  it("keyword matching is case-insensitive", () => {
    const phase = {
      phase_id: "p1",
      completion_rules: {
        required_npc_evidence: [{ keywords: ["CONFIRME"], min_matches: 1 }],
      },
    };
    expect(checkCompletionRules(phase, [{ role: "npc", content: "Je confirme." }], {})).toBe(true);
  });
});
