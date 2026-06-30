/**
 * dynamicActorResolution — patch a session.scenario in place to replace
 * the "chosen_cto" / "chosen_kol" placeholders with the real actor id
 * the player selected, AND to fill the {{establishment_*}} mail
 * placeholders for S4.
 *
 * Pure helpers extracted from page.tsx. They MUST be called before
 * injectPhaseEntryEvents so that runtime.ts sees resolved actors.
 *
 * The "dynamic_actor" / "dynamic_mail_to" markers on each phase are
 * flipped to "resolved" after the first resolution so subsequent calls
 * are no-ops.
 */

import { resolveEstablishment, resolveMailPlaceholders } from "../lib/establishmentMap";

/**
 * Resolve "chosen_cto" (S0) and "chosen_kol" (S5) placeholders in the
 * session's scenario phases. Mutates in place.
 */
export function resolveDynamicActors(
  sess: any,
  opts: {
    chosenCtoId: string | null;
    chosenKolId: string | null;
    actors: any[];
  },
): void {
  const { chosenCtoId, chosenKolId, actors } = opts;
  if (!sess?.scenario?.phases) return;

  for (const phase of sess.scenario.phases) {
    // ── chosen_cto resolution (S0) ──
    if (phase.dynamic_actor === "chosen_cto" && chosenCtoId) {
      if (Array.isArray(phase.ai_actors)) {
        phase.ai_actors = phase.ai_actors.map((a: string) =>
          a === "chosen_cto" ? chosenCtoId : a,
        );
      }
      if (Array.isArray(phase.entry_events)) {
        for (const ev of phase.entry_events) {
          if (ev.actor === "chosen_cto") ev.actor = chosenCtoId;
        }
      }
      if (phase.mail_config?.defaults && !phase.mail_config.defaults.to) {
        const ctoActor = actors.find((a: any) => a.actor_id === chosenCtoId);
        if (ctoActor) {
          phase.mail_config.defaults.to = ctoActor.name;
        }
      }
      phase.dynamic_actor = "resolved";
    }

    // ── chosen_kol resolution (S5) ──
    if (phase.dynamic_actor === "chosen_kol" && chosenKolId) {
      if (Array.isArray(phase.ai_actors)) {
        phase.ai_actors = phase.ai_actors.map((a: string) =>
          a === "chosen_kol" ? chosenKolId : a,
        );
      }
      if (Array.isArray(phase.entry_events)) {
        for (const ev of phase.entry_events) {
          if (ev.actor === "chosen_kol") ev.actor = chosenKolId;
        }
      }
      if (phase.mail_config?.defaults && !phase.mail_config.defaults.to) {
        const kolActor = actors.find((a: any) => a.actor_id === chosenKolId);
        if (kolActor) {
          phase.mail_config.defaults.to = (kolActor as any).email || kolActor.name;
        }
      }
      // NOTE: contact panel visibility is handled declaratively by
      // contact_visibility_mode + per-phase chat_visible_actors, not here.
      phase.dynamic_actor = "resolved";
    }
  }
}

/**
 * Resolve {{establishment_email}} / {{establishment_label}} placeholders
 * in mail_config and entry_events.content for scenario 4. Mutates in place.
 */
export function resolveEstablishmentPlaceholders(sess: any): void {
  if (!sess?.scenario?.phases || !sess?.flags) return;

  for (const phase of sess.scenario.phases) {
    if (phase.dynamic_mail_to === "establishment" && phase.dynamic_mail_to !== "resolved") {
      const est = resolveEstablishment(sess.flags);
      if (phase.mail_config?.defaults) {
        resolveMailPlaceholders(phase.mail_config, sess.flags);
      }
      if (Array.isArray(phase.entry_events)) {
        for (const ev of phase.entry_events) {
          if (typeof ev.content === "string" && ev.content.includes("{{establishment_label}}")) {
            ev.content = ev.content.replace(/\{\{establishment_label\}\}/g, est.label);
          }
        }
      }
      phase.dynamic_mail_to = "resolved";
    }
  }
}
