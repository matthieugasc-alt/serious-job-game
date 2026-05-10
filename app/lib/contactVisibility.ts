/**
 * Contact Visibility Helper
 *
 * Computes which actors are shown in the left-hand chat contacts panel.
 *
 * Two modes are supported:
 *   1. "explicit" — driven by `scenario.contact_visibility_mode === "explicit"`.
 *      The visible contacts come exclusively from the current phase's
 *      `chat_visible_actors` array (plus the player). `ai_actors` membership
 *      no longer implies visibility. Placeholders such as "chosen_kol" and
 *      "chosen_cto" are resolved via the injected `resolveActorId` function.
 *      If a placeholder isn't yet resolved (e.g. chosen_kol_id flag absent),
 *      the entry is silently dropped.
 *
 *   2. legacy (default) — when `contact_visibility_mode` is undefined.
 *      Falls back to the historical filter: an actor is visible if its
 *      `visible_in_contacts` flag is true. This preserves behaviour for every
 *      scenario that hasn't opted in to the explicit model.
 *
 * Design constraints:
 *   - Pure function. No mutation of any actor object.
 *   - No dependency on React or page.tsx internals.
 *   - No scenario-specific branching (zero `if scenarioId === ...`).
 */

import type { ActorDefinition, PhaseDefinition, ScenarioDefinition } from "./types";

export type ContactVisibilityMode = "explicit";

export type ComputeVisibleContactsParams = {
  /** The scenario currently being played. */
  scenario: Pick<ScenarioDefinition, "actors"> & {
    contact_visibility_mode?: ContactVisibilityMode;
  };

  /** The phase the player is currently in (or undefined if unresolved). */
  currentPhase: (Pick<PhaseDefinition, "ai_actors"> & {
    chat_visible_actors?: string[];
  }) | undefined | null;

  /**
   * Resolves dynamic placeholders ("chosen_kol", "chosen_cto", …) into
   * concrete actor_ids using the live session flags.
   * Should return the input unchanged when no resolution applies.
   * Should return the placeholder itself (or any non-actor sentinel) when
   * the placeholder cannot be resolved yet — those entries will be filtered out.
   */
  resolveActorId: (actorId: string) => string;
};

/**
 * Returns the ordered list of actors to show in the left-hand contacts panel.
 *
 * Always includes the player actor (if defined). Order of returned actors
 * follows the order of `chat_visible_actors` (in explicit mode) or the
 * scenario `actors` array order (in legacy mode), so callers don't need to
 * re-sort.
 */
export function computeVisibleContacts(
  params: ComputeVisibleContactsParams
): ActorDefinition[] {
  const { scenario, currentPhase, resolveActorId } = params;
  const actors = scenario?.actors ?? [];
  if (actors.length === 0) return [];

  const playerActor = actors.find((a) => a.actor_id === "player");

  // ── Explicit mode ──
  if (scenario?.contact_visibility_mode === "explicit") {
    const explicitList = currentPhase?.chat_visible_actors ?? [];
    const seen = new Set<string>();
    const result: ActorDefinition[] = [];

    if (playerActor) {
      result.push(playerActor);
      seen.add(playerActor.actor_id);
    }

    for (const ref of explicitList) {
      const resolved = resolveActorId(ref);
      // Drop unresolved placeholders (e.g. "chosen_kol" before kol_interested)
      if (resolved === "chosen_kol" || resolved === "chosen_cto") continue;
      if (seen.has(resolved)) continue;
      const actor = actors.find((a) => a.actor_id === resolved);
      if (!actor) continue;
      result.push(actor);
      seen.add(resolved);
    }

    return result;
  }

  // ── Legacy mode ──
  return actors.filter(
    (a) => a.actor_id === "player" || a.visible_in_contacts === true
  );
}
