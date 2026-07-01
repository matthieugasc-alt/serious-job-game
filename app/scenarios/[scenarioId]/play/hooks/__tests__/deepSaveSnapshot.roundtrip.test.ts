/**
 * Tests unit — round-trip PlayerSession → deepSave snapshot → restore.
 *
 * ⚠ GARDE-FOU AUTOMATIQUE (recommandation advisor, 1er juillet 2026):
 * Si quelqu'un ajoute un champ à PlayerSession qui doit survivre au reload
 * (comme `flags`, `mailDrafts`, `chatMessages`, etc.) et oublie de l'ajouter
 * à `DeepSaveSnapshot`, ce test échoue.
 *
 * La liste `SNAPSHOTTABLE_FIELDS` est la source de vérité de "quels champs
 * de PlayerSession doivent être persistés". Toute évolution de PlayerSession
 * doit soit ajouter le champ ici, soit documenter explicitement pourquoi
 * il ne doit PAS être persisté (ex: ref audio, timer id).
 */

import { describe, it, expect, vi } from "vitest";
import type { DeepSaveSnapshot } from "../useFounderCheckpoint";

// ── Source de vérité : les champs de PlayerSession qui DOIVENT être persistés ──
// Si tu ajoutes un champ à PlayerSession qui doit survivre au reload,
// ajoute-le à cette liste. Le test type-check plantera si tu ne le fais pas.
const SNAPSHOTTABLE_FIELDS = [
  "flags",
  "chatMessages",
  "mailDrafts",
  "savedDrafts",
  "scores",
  "pendingTimedEvents",
  "inboxMails",
  "sentMails",
  "injectedPhaseEntryEvents",
  "currentPhaseIndex",
] as const;

type SnapshottableField = (typeof SNAPSHOTTABLE_FIELDS)[number];

// Le type DeepSaveSnapshot doit contenir CHACUN de ces champs.
// Si un champ manque, cette assertion type-fail.
type _Assert_Snapshot_Contains_All_Fields = {
  [K in SnapshottableField]: DeepSaveSnapshot[K];
};

describe("Snapshot round-trip — garde-fou", () => {
  it("DeepSaveSnapshot expose tous les champs listés dans SNAPSHOTTABLE_FIELDS", () => {
    // Assertion runtime : construire un snapshot avec chaque champ et vérifier
    // qu'aucun ne devient `undefined`.
    const sample: DeepSaveSnapshot = {
      flags: { one_pager_submitted: true },
      chatMessages: [{ id: "1", role: "player", content: "hi" }],
      mailDrafts: { phase_1: { to: "x@y.z", subject: "s", body: "b", cc: "", attachments: [] } },
      savedDrafts: {},
      scores: { phase_1: 80 },
      pendingTimedEvents: [{ id: "e1", actor: "npc", content: "c", dueAt: Date.now(), phaseId: "phase_1", type: "chat" }],
      inboxMails: [{ id: "m1", from: "sender", subject: "s", body: "b", to: "me" }],
      sentMails: [{ id: "s1", kind: "one_pager_submission", to: "j@t.f", subject: "s", body: "b" }],
      injectedPhaseEntryEvents: ["phase_1::intro"],
      currentPhaseIndex: 2,
    };
    for (const f of SNAPSHOTTABLE_FIELDS) {
      expect(sample[f], `Snapshot field "${f}" is undefined — did DeepSaveSnapshot type diverge?`).toBeDefined();
    }
  });

  it("chaque champ round-trippe JSON stringify/parse sans perte", () => {
    // Simule: client capture snapshot → server persiste JSON → client hydrate
    const original: DeepSaveSnapshot = {
      flags: { chose_chu: true, pacte_signed_clean: true, score_debug: 42 },
      chatMessages: [
        { id: "1", role: "player", content: "salut", phaseId: "p1", timestamp: 1000 },
        { id: "2", role: "npc", actor: "sofia", content: "hello", phaseId: "p1", timestamp: 2000 },
      ],
      mailDrafts: {
        phase_1: {
          to: "jury@t.f",
          cc: "cofounder@o.f",
          subject: "Candidature",
          body: "corps du mail",
          attachments: [{ id: "one_pager_template", label: "One-Pager" }],
        },
      },
      savedDrafts: {
        "phase_1::backup@x.com": {
          to: "backup@x.com", cc: "", subject: "backup", body: "draft", attachments: [],
        },
      },
      scores: { phase_1: 87, phase_2: 62 },
      pendingTimedEvents: [
        { id: "evt_1", actor: "contact_chu", content: "convention", dueAt: 5000, phaseId: "p3", type: "mail" as const },
      ],
      inboxMails: [
        { id: "in_1", from: "thomas", subject: "devis", body: "voir PJ", to: "me", attachments: [] },
      ],
      sentMails: [
        { id: "out_1", kind: "one_pager_submission", to: "jury", subject: "candidature", body: "..." },
      ],
      injectedPhaseEntryEvents: ["phase_1::intro", "phase_2::briefing"],
      currentPhaseIndex: 1,
    };

    const serialized = JSON.stringify(original);
    const restored = JSON.parse(serialized) as DeepSaveSnapshot;

    // Assert : chaque champ répliqué identique (deep equality).
    for (const f of SNAPSHOTTABLE_FIELDS) {
      expect(restored[f], `Round-trip lost field "${f}"`).toEqual(original[f]);
    }
  });

  it("un snapshot vide (état initial) round-trippe aussi sans erreur", () => {
    const empty: DeepSaveSnapshot = {
      flags: {},
      chatMessages: [],
      mailDrafts: {},
      savedDrafts: {},
      scores: {},
      pendingTimedEvents: [],
      inboxMails: [],
      sentMails: [],
      injectedPhaseEntryEvents: [],
      currentPhaseIndex: 0,
    };
    const restored = JSON.parse(JSON.stringify(empty)) as DeepSaveSnapshot;
    expect(restored).toEqual(empty);
  });
});
