/**
 * Tests unit — dynamicActorResolution.
 *
 * Vérifie que chosen_cto (S0) et chosen_kol (S5) sont bien substitués dans
 * ai_actors + entry_events + mail_config.defaults.to, que
 * `dynamic_actor` passe à `"resolved"` (idempotence), et que
 * resolveEstablishmentPlaceholders (S4) remplace {{establishment_label}}.
 */

import { describe, it, expect } from "vitest";
import {
  resolveDynamicActors,
  resolveEstablishmentPlaceholders,
} from "../dynamicActorResolution";

// ── Fixtures ───────────────────────────────────────────────────────

const CTO_ACTOR = { actor_id: "sofia_renault", name: "Sofia Renault", email: "s.renault@example.com" };
const KOL_ACTOR = { actor_id: "dr_lambert", name: "Dr Lambert", email: "l@chu.fr" };

function makeSess(phases: any[]) {
  return { scenario: { phases }, flags: {} };
}

// ── resolveDynamicActors : chosen_cto (S0) ────────────────────────

describe("resolveDynamicActors — chosen_cto", () => {
  it("substitutes chosen_cto in ai_actors, entry_events and mail_config.to", () => {
    const sess = makeSess([{
      phase_id: "phase_3_pacte",
      dynamic_actor: "chosen_cto",
      ai_actors: ["chosen_cto", "cofounder"],
      entry_events: [{ actor: "chosen_cto", content: "message" }],
      mail_config: { defaults: { to: "" } },
    }]);
    resolveDynamicActors(sess, {
      chosenCtoId: "sofia_renault",
      chosenKolId: null,
      actors: [CTO_ACTOR],
    });
    const p = sess.scenario.phases[0];
    expect(p.ai_actors).toEqual(["sofia_renault", "cofounder"]);
    expect(p.entry_events[0].actor).toBe("sofia_renault");
    // Le mail_to auto-filled utilise le NAME du CTO (pas l'email).
    expect(p.mail_config.defaults.to).toBe("Sofia Renault");
    // Idempotence: le marker passe à "resolved" → prochain appel = no-op.
    expect(p.dynamic_actor).toBe("resolved");
  });

  it("preserves an already-set mail_config.to (pre-existing draft)", () => {
    const sess = makeSess([{
      phase_id: "p1",
      dynamic_actor: "chosen_cto",
      mail_config: { defaults: { to: "custom@already-set.com" } },
    }]);
    resolveDynamicActors(sess, {
      chosenCtoId: "sofia_renault",
      chosenKolId: null,
      actors: [CTO_ACTOR],
    });
    expect(sess.scenario.phases[0].mail_config.defaults.to).toBe("custom@already-set.com");
  });

  it("no-op when chosenCtoId is null", () => {
    const sess = makeSess([{
      phase_id: "p1",
      dynamic_actor: "chosen_cto",
      ai_actors: ["chosen_cto"],
    }]);
    resolveDynamicActors(sess, {
      chosenCtoId: null,
      chosenKolId: null,
      actors: [],
    });
    // Rien substitué, marker inchangé (donc réessayable plus tard).
    expect(sess.scenario.phases[0].ai_actors).toEqual(["chosen_cto"]);
    expect(sess.scenario.phases[0].dynamic_actor).toBe("chosen_cto");
  });

  it("is idempotent: second call on already-resolved phase is no-op", () => {
    const sess = makeSess([{
      phase_id: "p1",
      dynamic_actor: "chosen_cto",
      ai_actors: ["chosen_cto"],
    }]);
    resolveDynamicActors(sess, {
      chosenCtoId: "sofia_renault",
      chosenKolId: null,
      actors: [CTO_ACTOR],
    });
    // 2e appel avec un ID différent : le premier a mis "resolved", 2e ne doit
    // pas changer ai_actors même si le nouvel ID diffère.
    resolveDynamicActors(sess, {
      chosenCtoId: "someone_else",
      chosenKolId: null,
      actors: [{ actor_id: "someone_else", name: "X" }],
    });
    expect(sess.scenario.phases[0].ai_actors).toEqual(["sofia_renault"]);
  });
});

// ── resolveDynamicActors : chosen_kol (S5) ────────────────────────

describe("resolveDynamicActors — chosen_kol", () => {
  it("substitutes chosen_kol + auto-fills mail_to with email (fallback name)", () => {
    const sess = makeSess([{
      phase_id: "phase_2",
      dynamic_actor: "chosen_kol",
      ai_actors: ["chosen_kol"],
      entry_events: [{ actor: "chosen_kol", content: "hello" }],
      mail_config: { defaults: { to: "" } },
    }]);
    resolveDynamicActors(sess, {
      chosenCtoId: null,
      chosenKolId: "dr_lambert",
      actors: [KOL_ACTOR],
    });
    const p = sess.scenario.phases[0];
    expect(p.ai_actors).toEqual(["dr_lambert"]);
    expect(p.entry_events[0].actor).toBe("dr_lambert");
    // Email prioritaire pour les KOL (contrairement au CTO qui prend le name).
    expect(p.mail_config.defaults.to).toBe("l@chu.fr");
    expect(p.dynamic_actor).toBe("resolved");
  });

  it("does not touch phases whose dynamic_actor marker is neither chosen_cto nor chosen_kol", () => {
    const sess = makeSess([{
      phase_id: "p1",
      dynamic_actor: "resolved",  // déjà résolu
      ai_actors: ["chosen_cto"],
    }]);
    resolveDynamicActors(sess, {
      chosenCtoId: "sofia_renault",
      chosenKolId: null,
      actors: [CTO_ACTOR],
    });
    expect(sess.scenario.phases[0].ai_actors).toEqual(["chosen_cto"]);
  });
});

// ── resolveEstablishmentPlaceholders (S4) ─────────────────────────

describe("resolveEstablishmentPlaceholders", () => {
  it("replaces {{establishment_label}} in entry_events.content", () => {
    const sess: any = {
      scenario: {
        phases: [{
          phase_id: "p3",
          dynamic_mail_to: "establishment",
          entry_events: [
            { content: "Vous entrez au {{establishment_label}}." },
            { content: "Sans placeholder." },
          ],
          mail_config: { defaults: {} },
        }],
      },
      flags: { chose_chu: true },
    };
    resolveEstablishmentPlaceholders(sess);
    const p = sess.scenario.phases[0];
    // "le CHU de Bordeaux" est le label figé dans lib/establishmentMap.
    expect(p.entry_events[0].content).toContain("CHU");
    expect(p.entry_events[0].content).not.toContain("{{establishment_label}}");
    expect(p.entry_events[1].content).toBe("Sans placeholder.");
    expect(p.dynamic_mail_to).toBe("resolved");
  });

  it("no-op when flags are empty or session is missing", () => {
    // Missing session
    resolveEstablishmentPlaceholders(null);
    // Missing flags
    const sess: any = { scenario: { phases: [{}] } };
    resolveEstablishmentPlaceholders(sess);
    // Both silently do nothing (no throw).
    expect(true).toBe(true);
  });

  it("skips phases with a different dynamic_mail_to marker", () => {
    const sess: any = {
      scenario: {
        phases: [{
          phase_id: "p1",
          dynamic_mail_to: "resolved",
          entry_events: [{ content: "{{establishment_label}}" }],
        }],
      },
      flags: { chose_chu: true },
    };
    resolveEstablishmentPlaceholders(sess);
    // Marker != "establishment" → pas de substitution.
    expect(sess.scenario.phases[0].entry_events[0].content).toContain("{{establishment_label}}");
  });
});
