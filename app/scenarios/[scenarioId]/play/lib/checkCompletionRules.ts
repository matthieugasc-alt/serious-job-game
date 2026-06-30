/**
 * checkCompletionRules — evaluates a phase's completion_rules block
 * against the current conversation + score.
 *
 * Rules supported (all optional, all must pass when present):
 *   - required_npc_evidence:    [{ keywords: string[], min_matches?: number }, …]
 *   - required_player_evidence: idem on player messages
 *   - min_score:                number — current phase score must be ≥
 *
 * Returns `true` when ALL declared rules pass (or no rules at all).
 * Used by the legacy mail-send fallback to decide whether to advance.
 */

export type CompletionEvidence = {
  keywords?: string[];
  min_matches?: number;
};

export type CompletionRules = {
  required_npc_evidence?: CompletionEvidence[];
  required_player_evidence?: CompletionEvidence[];
  min_score?: number;
};

export type CompletionRulesPhase = {
  phase_id?: string;
  completion_rules?: CompletionRules;
};

export type CompletionRulesConv = Array<{
  role: "player" | "npc" | string;
  content?: string;
}>;

export function checkCompletionRules(
  phase: CompletionRulesPhase | undefined,
  conversation: CompletionRulesConv,
  scores: Record<string, number> | undefined,
): boolean {
  const rules = phase?.completion_rules;
  if (!rules) return true;

  if (Array.isArray(rules.required_npc_evidence) && rules.required_npc_evidence.length > 0) {
    const npcText = conversation
      .filter((m) => m.role === "npc")
      .map((m) => (m.content || "").toLowerCase())
      .join(" ");
    const allMet = rules.required_npc_evidence.every((ev) => {
      const matched = (ev.keywords || []).filter((kw) => npcText.includes(kw.toLowerCase()));
      return matched.length >= (ev.min_matches || 1);
    });
    if (!allMet) return false;
  }

  if (Array.isArray(rules.required_player_evidence) && rules.required_player_evidence.length > 0) {
    const playerText = conversation
      .filter((m) => m.role === "player")
      .map((m) => (m.content || "").toLowerCase())
      .join(" ");
    const allMet = rules.required_player_evidence.every((ev) => {
      const matched = (ev.keywords || []).filter((kw) => playerText.includes(kw.toLowerCase()));
      return matched.length >= (ev.min_matches || 1);
    });
    if (!allMet) return false;
  }

  if (rules.min_score !== undefined && phase?.phase_id) {
    const phaseScore = scores?.[phase.phase_id] || 0;
    if (phaseScore < rules.min_score) return false;
  }

  return true;
}
