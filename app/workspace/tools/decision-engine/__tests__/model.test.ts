/**
 * Tests PURS du reducer applyDecisionOp (model.ts) — invariants du contrat
 * (docs/TOOL_DECISION_ENGINE.md) : Decision Object, options/critères/scores,
 * risques, boards & items, no-op défensif, immutabilité, cohérence.
 */

import { describe, it, expect } from "vitest";
import type { JsonObject } from "@/app/lib/engine/mechanics";
import { applyDecisionOp, emptyDecisionEngineState, normalizeDecisionEngineState } from "../model";
import { weightedScoreOf } from "../spec";
import type { DecisionEngineState } from "../spec";

const T = 1_000;

function run(start: DecisionEngineState, ops: [string, JsonObject][]): DecisionEngineState {
  let s = start as unknown as DecisionEngineState;
  for (const [op, payload] of ops) s = applyDecisionOp(s as never, op, payload) as unknown as DecisionEngineState;
  return normalizeDecisionEngineState(s as never);
}

describe("Decision Object — cycle de vie", () => {
  it("crée une décision, la met à jour, la finalise (append-only via supersedes)", () => {
    let s = run(emptyDecisionEngineState(), [
      ["decision_created", { decision_id: "d1", title: "Choix CTO", context: "3 profils", at: T }],
      ["decision_updated", { decision_id: "d1", patch: { context: "3 profils finalistes" }, at: T + 1 }],
      ["decision_finalized", { decision_id: "d1", final_decision: "Profil B", justification: "meilleur fit", at: T + 2 }],
    ]);
    expect(s.decisions.d1.status).toBe("finalized");
    expect(s.decisions.d1.final_decision).toBe("Profil B");
    expect(s.decisions.d1.decided_at).toBe(T + 2);

    // Une nouvelle décision supersède l'ancienne.
    s = run(s, [["decision_created", { decision_id: "d2", title: "Choix CTO (révisé)", supersedes: "d1", at: T + 3 }]]);
    expect(s.decisions.d2.supersedes).toBe("d1");
    // supersedes vers une décision inexistante est ignoré.
    const s3 = run(s, [["decision_created", { decision_id: "d3", title: "X", supersedes: "ghost", at: T + 4 }]]);
    expect(s3.decisions.d3.supersedes).toBeUndefined();
  });

  it("refuse une décision en double et une op sur une décision inconnue", () => {
    const s0 = run(emptyDecisionEngineState(), [["decision_created", { decision_id: "d1", title: "A", at: T }]]);
    const dup = applyDecisionOp(s0 as never, "decision_created", { decision_id: "d1", title: "B", at: T });
    expect(normalizeDecisionEngineState(dup as never).decisions.d1.title).toBe("A");
    const ghost = applyDecisionOp(s0 as never, "option_added", { decision_id: "ghost", option_id: "o1", label: "x", at: T });
    expect(ghost).toBe(s0);
  });
});

describe("Matrice multicritère — options, critères, scoring, score dérivé", () => {
  const boot = () =>
    run(emptyDecisionEngineState(), [
      ["decision_created", { decision_id: "d1", title: "Choix", at: T }],
      ["option_added", { decision_id: "d1", option_id: "oa", label: "Option A", at: T }],
      ["option_added", { decision_id: "d1", option_id: "ob", label: "Option B", at: T }],
      ["criterion_added", { decision_id: "d1", criterion_id: "c1", label: "Impact", weight: 3, at: T }],
      ["criterion_added", { decision_id: "d1", criterion_id: "c2", label: "Coût", weight: 2, at: T }],
    ]);

  it("score les cellules et le score pondéré se DÉRIVE (jamais stocké)", () => {
    const s = run(boot(), [
      ["option_scored", { decision_id: "d1", option_id: "oa", criterion_id: "c1", value: 4, at: T }],
      ["option_scored", { decision_id: "d1", option_id: "oa", criterion_id: "c2", value: 2, at: T }],
      ["option_scored", { decision_id: "d1", option_id: "ob", criterion_id: "c1", value: 2, justification: "moins fort", at: T }],
    ]);
    // oa = 4*3 + 2*2 = 16 ; ob = 2*3 = 6
    expect(weightedScoreOf(s.decisions.d1, "oa")).toBe(16);
    expect(weightedScoreOf(s.decisions.d1, "ob")).toBe(6);
    expect(s.decisions.d1.scores.ob.c1.justification).toBe("moins fort");
  });

  it("changer un poids recalcule le score dérivé", () => {
    let s = run(boot(), [["option_scored", { decision_id: "d1", option_id: "oa", criterion_id: "c1", value: 5, at: T }]]);
    expect(weightedScoreOf(s.decisions.d1, "oa")).toBe(15); // 5*3
    s = run(s, [["criterion_weight_updated", { decision_id: "d1", criterion_id: "c1", weight: 1, at: T }]]);
    expect(weightedScoreOf(s.decisions.d1, "oa")).toBe(5); // 5*1
  });

  it("retirer une option/critère nettoie les scores associés", () => {
    let s = run(boot(), [
      ["option_scored", { decision_id: "d1", option_id: "oa", criterion_id: "c1", value: 4, at: T }],
      ["option_scored", { decision_id: "d1", option_id: "oa", criterion_id: "c2", value: 3, at: T }],
    ]);
    s = run(s, [["criterion_removed", { decision_id: "d1", criterion_id: "c2", at: T }]]);
    expect(s.decisions.d1.scores.oa.c2).toBeUndefined();
    expect(weightedScoreOf(s.decisions.d1, "oa")).toBe(12); // seul c1 reste
    s = run(s, [["option_removed", { decision_id: "d1", option_id: "oa", at: T }]]);
    expect(s.decisions.d1.scores.oa).toBeUndefined();
    expect(s.decisions.d1.options.some((o) => o.id === "oa")).toBe(false);
  });

  it("scorer une (option,critère) inexistante est un no-op", () => {
    const s0 = boot();
    const same = applyDecisionOp(s0 as never, "option_scored", { decision_id: "d1", option_id: "ghost", criterion_id: "c1", value: 3, at: T });
    expect(normalizeDecisionEngineState(same as never).decisions.d1.scores.ghost).toBeUndefined();
  });
});

describe("Risques & hypothèses", () => {
  it("crée et met à jour un risque (proba/impact/statut/mitigation)", () => {
    let s = run(emptyDecisionEngineState(), [
      ["decision_created", { decision_id: "d1", title: "A", at: T }],
      ["risk_created", { decision_id: "d1", risk_id: "r1", label: "Dépendance fournisseur", probability: 4, impact: 5, at: T }],
    ]);
    expect(s.decisions.d1.risks[0].probability).toBe(4);
    expect(s.decisions.d1.risks[0].status).toBe("open");
    s = run(s, [["risk_updated", { decision_id: "d1", risk_id: "r1", patch: { status: "mitigating", mitigation: "double sourcing" }, at: T }]]);
    expect(s.decisions.d1.risks[0].status).toBe("mitigating");
    expect(s.decisions.d1.risks[0].mitigation).toBe("double sourcing");
  });

  it("documente prévention/guérison et recote le risque résiduel", () => {
    let s = run(emptyDecisionEngineState(), [
      ["decision_created", { decision_id: "d1", title: "A", at: T }],
      ["risk_created", { decision_id: "d1", risk_id: "r1", label: "Rupture de stock", probability: 5, impact: 4, at: T }],
    ]);
    s = run(s, [
      [
        "risk_updated",
        {
          decision_id: "d1",
          risk_id: "r1",
          patch: {
            prevention: "Double sourcing + stock de sécurité",
            cure: "Fournisseur de secours activable en 48h",
            residual_probability: 2,
            residual_impact: 3,
          },
          at: T,
        },
      ],
    ]);
    const r = s.decisions.d1.risks[0];
    expect(r.prevention).toBe("Double sourcing + stock de sécurité");
    expect(r.cure).toBe("Fournisseur de secours activable en 48h");
    expect(r.residual_probability).toBe(2);
    expect(r.residual_impact).toBe(3);
    // La cotation brute reste intacte (brut → résiduel).
    expect(r.probability).toBe(5);
    expect(r.impact).toBe(4);
  });

  it("dépendances : mère-fille + sœur-sœur, refus doublon/cycle/auto-lien, purge à la suppression", () => {
    let s = run(emptyDecisionEngineState(), [
      ["decision_created", { decision_id: "d1", title: "D1", at: T }],
      ["board_created", { board_id: "b1", engine: "matrix", title: "B1", config: {}, data: { items: [] }, at: T }],
      ["board_created", { board_id: "b2", engine: "kanban", title: "B2", config: {}, data: { items: [] }, at: T }],
    ]);
    const dec = { type: "decision", id: "d1" };
    const b1 = { type: "board", id: "b1" };
    const b2 = { type: "board", id: "b2" };
    // mère-fille : d1 → b1
    s = run(s, [["dependency_added", { dependency_id: "dep1", from: dec, to: b1, relation: "parent-child", at: T }]]);
    expect(s.dependencies).toHaveLength(1);
    // doublon → no-op
    s = run(s, [["dependency_added", { dependency_id: "dep1b", from: dec, to: b1, relation: "parent-child", at: T }]]);
    expect(s.dependencies).toHaveLength(1);
    // cycle (b1 → d1) → refusé
    s = run(s, [["dependency_added", { dependency_id: "dep2", from: b1, to: dec, relation: "parent-child", at: T }]]);
    expect(s.dependencies).toHaveLength(1);
    // auto-lien → refusé
    s = run(s, [["dependency_added", { dependency_id: "dep3", from: b1, to: b1, relation: "sibling", at: T }]]);
    expect(s.dependencies).toHaveLength(1);
    // sœur-sœur b1 ↔ b2
    s = run(s, [["dependency_added", { dependency_id: "dep4", from: b1, to: b2, relation: "sibling", at: T }]]);
    expect(s.dependencies).toHaveLength(2);
    // sœur symétrique (b2 ↔ b1) → doublon
    s = run(s, [["dependency_added", { dependency_id: "dep5", from: b2, to: b1, relation: "sibling", at: T }]]);
    expect(s.dependencies).toHaveLength(2);
    // suppression de b2 → ses liens tombent
    s = run(s, [["board_deleted", { board_id: "b2", at: T }]]);
    expect(s.dependencies).toHaveLength(1);
    // suppression explicite du lien restant
    s = run(s, [["dependency_removed", { dependency_id: "dep1", at: T }]]);
    expect(s.dependencies).toHaveLength(0);
  });

  it("crée une hypothèse avec confiance", () => {
    const s = run(emptyDecisionEngineState(), [
      ["decision_created", { decision_id: "d1", title: "A", at: T }],
      ["hypothesis_created", { decision_id: "d1", hypothesis_id: "h1", text: "marché prêt", confidence: 0.6, at: T }],
    ]);
    expect(s.decisions.d1.hypotheses[0].confidence).toBe(0.6);
    expect(s.decisions.d1.hypotheses[0].status).toBe("open");
  });
});

describe("Boards & items", () => {
  const boot = () =>
    run(emptyDecisionEngineState(), [
      ["decision_created", { decision_id: "d1", title: "A", at: T }],
      ["board_created", { board_id: "b1", engine: "matrix", title: "Impact/Effort", decision_id: "d1", config: { scoring: "axis" }, data: { items: [] }, at: T }],
    ]);

  it("crée un board rattaché (la décision le référence) et manipule ses items", () => {
    let s = boot();
    expect(s.boards.b1.decision_id).toBe("d1");
    expect(s.decisions.d1.board_ids).toEqual(["b1"]);

    s = run(s, [
      ["item_added", { board_id: "b1", item: { id: "i1", label: "Init 1", fields: {}, tags: [], links: [], x: 0.2, y: 0.8 }, at: T }],
      ["item_moved", { board_id: "b1", item_id: "i1", patch: { x: 0.6, y: 0.4 }, at: T }],
    ]);
    const items = (s.boards.b1.data as { items: { id: string; x: number; y: number }[] }).items;
    expect(items).toHaveLength(1);
    expect(items[0].x).toBe(0.6);
    expect(items[0].y).toBe(0.4);

    s = run(s, [["item_removed", { board_id: "b1", item_id: "i1", at: T }]]);
    expect((s.boards.b1.data as { items: unknown[] }).items).toHaveLength(0);
  });

  it("supprimer un board retire le rattachement de la décision", () => {
    const s = run(boot(), [["board_deleted", { board_id: "b1" }]]);
    expect(s.boards.b1).toBeUndefined();
    expect(s.decisions.d1.board_ids).toEqual([]);
  });

  it("supprimer la décision détache ses boards (ils survivent)", () => {
    const s = run(boot(), [["decision_deleted", { decision_id: "d1" }]]);
    expect(s.decisions.d1).toBeUndefined();
    expect(s.boards.b1).toBeDefined();
    expect(s.boards.b1.decision_id).toBeUndefined();
  });
});

describe("Robustesse", () => {
  it("op inconnue → même référence (no-op journalisable)", () => {
    const s = run(emptyDecisionEngineState(), [["decision_created", { decision_id: "d1", title: "A", at: T }]]);
    const same = applyDecisionOp(s as never, "decision_teleported", { decision_id: "d1" });
    expect(same).toBe(s);
  });

  it("normalize relit un état corrompu : décision sans id, board d'engine invalide, ui fantôme écartés", () => {
    const corrupt = {
      decisions: { d1: { id: "d1", title: "A", status: "weird", options: "nope", risks: [{ id: "r1", label: "x", probability: 3, impact: 2 }] }, bad: { title: "no id" } },
      boards: { b1: { id: "b1", engine: "spreadsheet" }, b2: { id: "b2", engine: "matrix", config: {}, data: {} } },
      ui: { open_decision_id: "ghost", open_board_id: "b2" },
    };
    const s = normalizeDecisionEngineState(corrupt as never);
    expect(Object.keys(s.decisions)).toEqual(["d1"]);
    expect(s.decisions.d1.status).toBe("draft"); // statut inconnu → défaut
    expect(s.decisions.d1.options).toEqual([]); // options corrompues → []
    expect(s.decisions.d1.risks).toHaveLength(1);
    expect(Object.keys(s.boards)).toEqual(["b2"]); // engine invalide écarté
    expect(s.ui.open_decision_id).toBeUndefined(); // décision fantôme
    expect(s.ui.open_board_id).toBe("b2");
  });

  it("immutabilité : l'état d'entrée n'est pas muté", () => {
    const s0 = run(emptyDecisionEngineState(), [["decision_created", { decision_id: "d1", title: "A", at: T }]]);
    const snap = JSON.stringify(s0);
    applyDecisionOp(s0 as never, "option_added", { decision_id: "d1", option_id: "o1", label: "x", at: T });
    expect(JSON.stringify(s0)).toBe(snap);
  });
});
