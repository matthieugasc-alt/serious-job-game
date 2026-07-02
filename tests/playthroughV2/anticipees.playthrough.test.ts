/**
 * ═════════════════════════════════════════════════════════════════
 * Playthrough headless des 4 mécaniques anticipées (décision PO du
 * 2 juillet 2026) : diagnostic, feedback, formation, mediation.
 * ═════════════════════════════════════════════════════════════════
 *
 * Aucun scénario réel ne les consomme encore : ce test joue un
 * scénario SYNTHÉTIQUE en mémoire (pas de fichier dans scenarios/)
 * qui les enchaîne avec des chaînes inputs_from, via le harnais et
 * la boucle réelle du moteur. Il prouve que :
 *  A. le scénario passe validateScenarioV2 avec 0 issue (dont la
 *     validation des clés *_actor de mediation par le composer) ;
 *  B. l'enchaînement est jouable bout en bout en happy path, les
 *     inputs_from se résolvent avec les VRAIS formats d'outputs, et
 *     chaque output respecte les output_keys de son manifest ;
 *  C. un critère critical court-circuite immédiatement le scénario.
 */

import { describe, it, expect } from "vitest";
import type { ScenarioV2 } from "@/app/lib/engine/mechanics";
import { validateScenarioV2 } from "@/app/lib/engine/composer";
import { MECHANIC_MANIFESTS } from "@/app/mechanics/manifests";
import { playScenario } from "./harness";

// ─── Scénario synthétique en mémoire (contenu de test, pas de fichier) ──

function buildSyntheticScenario(): ScenarioV2 {
  return {
    format: "v2",
    scenario_id: "synthetique_anticipees",
    version: "1.0.0",
    locale: "fr-FR",
    meta: {
      title: "Synthétique — mécaniques anticipées",
      description:
        "Enchaîne diagnostic → feedback → formation → mediation avec inputs_from.",
    },
    actors: [
      { actor_id: "temoin", name: "Théo", role: "témoin", prompt: "Tu es témoin du problème." },
      { actor_id: "collab", name: "Camille", role: "collaborateur", prompt: "Tu es le collaborateur concerné." },
      { actor_id: "partie_a", name: "Ana", role: "partie A", prompt: "Tu es la partie A du conflit." },
      { actor_id: "partie_b", name: "Bob", role: "partie B", prompt: "Tu es la partie B du conflit." },
    ],
    documents: [],
    sequence: [
      {
        step_id: "s_diagnostic",
        mechanic: "diagnostic",
        title: "Trouver la cause",
        params: {
          situation: "Le service livre en retard depuis trois semaines.",
          actor_id: "temoin",
          hypotheses: [
            { id: "process", label: "Process de revue trop lourd" },
            { id: "outillage", label: "Outillage défaillant" },
          ],
          min_exchanges: 2,
        },
        evaluation: {
          observed_criteria: [
            {
              id: "cause_etayee",
              description: "Le joueur a étayé la cause retenue par l'investigation",
              severity: "required",
            },
            {
              id: "piste_ecartee",
              description: "Le joueur a explicitement écarté au moins une piste",
              severity: "bonus",
            },
          ],
        },
        completion_rules: { required_criteria: ["cause_etayee"] },
      },
      {
        step_id: "s_feedback",
        mechanic: "feedback",
        title: "Débriefer le collaborateur",
        params: {
          actor_id: "collab",
          context_brief: "Restituer le diagnostic au collaborateur concerné.",
          framework_hint: "faits → impact → attente",
          min_rounds: 2,
        },
        inputs: { diagnostic: "s_diagnostic.diagnosis" },
        evaluation: {
          observed_criteria: [
            {
              id: "faits_avances",
              description: "Le joueur s'appuie sur des faits, pas des jugements",
              severity: "required",
            },
            {
              id: "attaque_personnelle",
              description: "Le joueur attaque la personne plutôt que les faits",
              expected: false,
              severity: "critical",
            },
          ],
        },
        completion_rules: {
          required_criteria: ["faits_avances"],
          critical_failure_criteria: ["attaque_personnelle"],
        },
      },
      {
        step_id: "s_formation",
        mechanic: "formation",
        title: "Former au nouveau process",
        params: {
          actor_id: "collab",
          topic: "Le nouveau process de revue allégé",
          objectives: [
            { id: "etapes", label: "Connaître les étapes du process" },
            { id: "criteres_sortie", label: "Savoir quand une revue est terminée" },
          ],
          min_exchanges: 3,
        },
        inputs: { engagements: "s_feedback.commitments" },
        evaluation: {
          observed_criteria: [
            {
              id: "pedagogie_active",
              description: "Le joueur vérifie la compréhension au lieu de monologuer",
              severity: "required",
            },
          ],
        },
        completion_rules: { required_criteria: ["pedagogie_active"] },
      },
      {
        step_id: "s_mediation",
        mechanic: "mediation",
        title: "Réguler le conflit d'équipe",
        params: {
          party_a_actor: "partie_a",
          party_b_actor: "partie_b",
          conflict_brief: "Les deux référents s'opposent sur l'application du nouveau process.",
          min_exchanges: 3,
        },
        inputs: { objectifs_couverts: "s_formation.objectives_covered" },
        evaluation: {
          observed_criteria: [
            {
              id: "ecoute_equitable",
              description: "Le joueur a fait s'exprimer les deux parties",
              severity: "required",
            },
          ],
        },
        completion_rules: { required_criteria: ["ecoute_equitable"] },
      },
    ],
    endings: [
      {
        id: "parcours_complet",
        label: "Parcours complet",
        content: "Diagnostic, feedback, formation et médiation réussis.",
        requires_passed: ["s_diagnostic", "s_feedback", "s_formation", "s_mediation"],
      },
      {
        id: "parcours_partiel",
        label: "Parcours partiel",
        content: "Une partie du parcours a été réussie.",
        min_passed: 2,
      },
      {
        id: "echec",
        label: "Échec",
        content: "Le parcours n'a pas abouti.",
        default: true,
      },
    ],
  };
}

const scenario = buildSyntheticScenario();

// ═══════════════════════════════════════════════════════════════════
// A. Validation statique — 0 issue (composer TS contre les manifests)
// ═══════════════════════════════════════════════════════════════════

describe("anticipées — A. validateScenarioV2", () => {
  it("le scénario synthétique passe avec 0 issue", () => {
    expect(validateScenarioV2(scenario, MECHANIC_MANIFESTS)).toEqual([]);
  });

  it("les clés *_actor de mediation sont bien validées par le composer", () => {
    const broken = buildSyntheticScenario();
    const mediation = broken.sequence.find((s) => s.mechanic === "mediation")!;
    mediation.params = { ...mediation.params, party_b_actor: "fantome" };
    const issues = validateScenarioV2(broken, MECHANIC_MANIFESTS);
    expect(issues.map((i) => i.code)).toContain("UNKNOWN_ACTOR_REF");
  });
});

// ═══════════════════════════════════════════════════════════════════
// B. Happy path — bout en bout, chaînes inputs_from résolues
// ═══════════════════════════════════════════════════════════════════

describe("anticipées — B. happy path", () => {
  it("les 4 steps passent, ending parcours_complet, outputs conformes", () => {
    // playScenario throw si resolveStepInputs échoue (chaîne inputs_from
    // cassée) ou si un output ne contient pas les output_keys du manifest.
    const { session, trace } = playScenario(scenario);

    expect(session.isFinished).toBe(true);
    expect(session.ending?.id).toBe("parcours_complet");
    expect(trace).toHaveLength(4);
    expect(trace.map((t) => t.mechanic)).toEqual([
      "diagnostic",
      "feedback",
      "formation",
      "mediation",
    ]);

    for (const step of scenario.sequence) {
      const sr = session.stepResults[step.step_id];
      expect(sr?.passed, `${step.step_id} devrait passer en happy path`).toBe(true);
      for (const key of MECHANIC_MANIFESTS[step.mechanic].output_keys) {
        expect(
          sr.output[key],
          `${step.step_id} (${step.mechanic}) : output_key "${key}" absente`,
        ).not.toBeUndefined();
      }
    }

    // Formats réels des outputs structurés (contrats inputs_from).
    const diagnosis = session.stepResults.s_diagnostic.output.diagnosis as {
      cause: string;
      evidence: string;
      eliminated: string;
    };
    expect(diagnosis.cause).toBe("process"); // 1re hypothèse déclarée
    expect(diagnosis.evidence.length).toBeGreaterThan(0);

    expect(typeof session.stepResults.s_feedback.output.commitments).toBe("string");

    expect(session.stepResults.s_formation.output.objectives_covered).toEqual([
      "etapes",
      "criteres_sortie",
    ]);

    const resolution = session.stepResults.s_mediation.output.resolution as {
      reached: boolean;
      terms: string;
    };
    expect(resolution.reached).toBe(true);
    expect(resolution.terms.length).toBeGreaterThan(0);

    // Le dialogue de médiation contient bien les trois voix.
    const dialogue = String(session.stepResults.s_mediation.output.dialogue);
    expect(dialogue).toContain("Vous:");
    expect(dialogue).toContain("Ana:");
    expect(dialogue).toContain("Bob:");
  });
});

// ═══════════════════════════════════════════════════════════════════
// C. Critical — court-circuit immédiat du scénario
// ═══════════════════════════════════════════════════════════════════

describe("anticipées — C. critical", () => {
  it("attaque_personnelle sur s_feedback termine le scénario immédiatement", () => {
    const { session, trace } = playScenario(scenario, (s) =>
      s.step_id === "s_feedback" ? { fireCritical: "attaque_personnelle" } : {},
    );

    expect(session.isFinished).toBe(true);
    expect(trace[trace.length - 1].stepId).toBe("s_feedback");
    expect(session.stepResults.s_formation).toBeUndefined();
    expect(session.stepResults.s_mediation).toBeUndefined();

    const sr = session.stepResults.s_feedback;
    expect(sr.passed).toBe(false);
    expect(sr.evaluation.appliedRule).toBe("critical_failure");
    expect(sr.evaluation.criticalFailures).toContain("attaque_personnelle");

    // Un seul step passé (s_diagnostic) → ni complet ni partiel : défaut.
    expect(session.ending?.id).toBe("echec");
  });
});
