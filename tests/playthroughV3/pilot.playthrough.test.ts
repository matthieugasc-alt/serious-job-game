/**
 * ═════════════════════════════════════════════════════════════════
 * Playthrough headless v3 — le pilote founder_02_mvp joué bout-en-bout
 * PAR DISPATCH d'actions (CONTRAT_WORKSPACE §2 et §6).
 * ═════════════════════════════════════════════════════════════════
 *
 * Même principe que sessionV3.integration.test.ts mais avec le VRAI
 * scénario et les VRAIES specs headless (MECHANIC_SPECS) : le moteur,
 * les triggers, les events narratifs et les buildArtifacts/buildOutput
 * sont réels ; seule l'OBSERVATION est synthétique (l'IA observatrice
 * est remplacée par un oracle déterministe).
 *
 * Ce que ces tests PROUVENT :
 *  A. validateScenarioV3 = 0 issue (+ params valides pour chaque spec) ;
 *  B. happy path → ending "success" : s1 (mail de debrief à Alexandre),
 *     s2 (mail de cadrage à Thomas), s3 (EXIT contrat signé → next),
 *     outputs conformes aux output_keys, chaîne d'inputs s2 → s3 résolue ;
 *  C. échec s1 → RETRY DIÉGÉTIQUE (event on_retry d'Alexandre, pas de
 *     bannière) puis chemin dégradé → ending "partial_success" ;
 *  D. tout raté → ending "failure" : s3 route l'EXIT contract_rejected
 *     vers {end: "failure"} — chaque ending atteignable.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it, expect } from "vitest";

import type { StepObservation } from "@/app/lib/engine/criteria";
import type { PendingEffect, ScenarioV3 } from "@/app/lib/engine/workspace";
import {
  initializeSessionV3,
  getCurrentStepV3,
  type SessionV3State,
} from "@/app/lib/engine/sessionV3";
import {
  applyWorkspaceAction,
  completeStepV3,
  enterStep,
  recordActorMessage,
  type StepCompletionOutcome,
} from "@/app/lib/engine/workspaceReducer";
import { validateScenarioV3, resolveStepInputsV3 } from "@/app/lib/engine/composerV3";
import { MECHANIC_SPECS, MECHANIC_SPEC_MANIFESTS } from "@/app/mechanics/specs";

const RAW = fs.readFileSync(
  path.join(process.cwd(), "scenarios", "founder_02_mvp", "scenario.json"),
  "utf8",
);
const registry = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "schema", "mechanics-v3.json"), "utf8"),
) as { tools: string[] };

function loadScenario(): ScenarioV3 {
  return JSON.parse(RAW) as ScenarioV3;
}

const T0 = 1_000_000;
const OPTS = { specs: MECHANIC_SPECS };
const opts = (now: number) => ({ now, ...OPTS });

/** Oracle : verdict moteur avec observation synthétique + output RÉEL
 *  (buildOutput de la spec headless du step, depuis le workspace).
 *  `exitId` (chantier A) : verdict d'une SORTIE — la route déclarée de
 *  l'exit s'applique après enregistrement du verdict. */
function evaluate(
  session: SessionV3State,
  criteria: Record<string, boolean>,
  now: number,
  exitId?: string,
): StepCompletionOutcome {
  const step = getCurrentStepV3(session)!;
  const spec = MECHANIC_SPECS[step.mechanic];
  expect(spec, `spec headless manquante pour ${step.mechanic}`).toBeDefined();
  const observation: StepObservation = { criteria };
  const output = spec.buildOutput(session.workspace, step, observation, session.actionLog);
  return completeStepV3(session, observation, output, opts(now), exitId);
}

const S2_MINORS = {
  choice_module_stats: false,
  choice_module_materiel: false,
  choice_module_equipes: false,
  choice_module_integrations: false,
  choice_module_mobile: false,
};

function kinds(effects: PendingEffect[]): string[] {
  return effects.map((e) => e.kind);
}

// ═══════════════════════════════════════════════════════════════════
// A. Validation statique
// ═══════════════════════════════════════════════════════════════════

describe("A. founder_02_mvp v3 — validation statique", () => {
  it("composerV3 : 0 issue contre les specs headless et les tools réels", () => {
    expect(validateScenarioV3(loadScenario(), MECHANIC_SPEC_MANIFESTS, registry.tools)).toEqual([]);
  });

  it("chaque step a des params valides pour sa spec headless", () => {
    for (const step of loadScenario().sequence) {
      expect(
        MECHANIC_SPECS[step.mechanic].validateParams(step.params),
        `params invalides pour ${step.step_id}`,
      ).toEqual([]);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// B. Happy path → ending "success"
// ═══════════════════════════════════════════════════════════════════

describe("B. happy path — journée complète, contrat signé", () => {
  it("s1 analyse → s2 decision → s3 negociation → success", () => {
    const scenario = loadScenario();
    const session = initializeSessionV3(scenario, T0);

    // ── s1 : Alexandre ouvre la journée dans Messages (verbatim v2) et
    //         annonce EXPLICITEMENT la remise attendue (mail de debrief).
    const entry = enterStep(session, opts(T0));
    expect(entry.completionFired).toBe(false);
    const alexThread = session.workspace.threads.th_alexandre;
    expect(alexThread.messages).toHaveLength(1);
    expect(alexThread.messages[0].content).toMatch(/Grosse session de boulot/);
    expect(alexThread.messages[0].content).toMatch(/envoie-moi un mail de debrief/);
    expect(alexThread.unread).toBe(1);

    // Le joueur lit le data pack et prend des notes (Tool notes).
    for (const id of ["synthese_entretiens", "note_cadrage", "devis_novadev"]) {
      applyWorkspaceAction(session, { type: "document_opened", document_id: id }, opts(T0 + 1_000));
    }
    applyWorkspaceAction(
      session,
      {
        type: "tool_state_changed",
        tool_id: "notes",
        state: { content: "Pain point universel : annulations. Devis 32k vs tréso 15k." },
      },
      opts(T0 + 2_000),
    );

    // Le joueur discute avec Alexandre dans Messages — ça ne complète PAS
    // le step (seul le mail de debrief avance).
    const msg = applyWorkspaceAction(
      session,
      {
        type: "message_sent",
        thread_id: "th_alexandre",
        content:
          "Le pain point universel c'est la gestion des annulations + le planning temps réel. Le devis à 32k est infinançable avec 15k de tréso : on doit couper le scope.",
      },
      opts(T0 + 3_000),
    );
    expect(msg.completionFired).toBe(false);
    expect(kinds(msg.effects)).toEqual(["actor_reply"]);
    const reply = msg.effects[0];
    expect(reply).toMatchObject({ thread_id: "th_alexandre", actor_id: "alexandre_morel" });
    // Directive = cadrage universel de la mécanique analyse.
    expect(reply.kind === "actor_reply" && reply.directive).toMatch(/analyse documentaire/);
    recordActorMessage(session, "th_alexandre", "alexandre_morel", "Ok. Et donc, on garde quoi ?", opts(T0 + 4_000));

    // Le mail de debrief à Alexandre — c'est LUI le trigger de complétion.
    const debrief = applyWorkspaceAction(
      session,
      {
        type: "mail_sent",
        to: ["alexandre_morel"],
        subject: "Debrief data pack — pain point et budget",
        body: "Pain point universel : la gestion des annulations + le planning temps réel. Le devis à 32k est infinançable avec 15k de tréso : on coupe le scope, le reste passe en V2.",
      },
      opts(T0 + 5_000),
    );
    expect(debrief.completionFired).toBe(true);
    expect(kinds(debrief.effects)).toContain("evaluate_step");

    const v1 = evaluate(
      session,
      { pain_point_identifie: true, budget_confronte: true, bruit_ecarte: true },
      T0 + 6_000,
    );
    expect(v1.outcome).toBe("advanced");
    const out1 = session.stepResults.s1_analyse_terrain.output;
    expect(out1.findings).toBeDefined();
    expect(JSON.stringify(out1.findings)).toContain("annulations");

    // ── s2 : relance d'Alexandre (event step_start) puis mail de cadrage.
    expect(getCurrentStepV3(session)?.step_id).toBe("s2_scope_mvp");
    const lastAlex = alexThread.messages[alexThread.messages.length - 1];
    expect(lastAlex.content).toMatch(/trancher/);

    const send = applyWorkspaceAction(
      session,
      {
        type: "mail_sent",
        to: ["thomas_novadev"],
        subject: "Cadrage MVP Orisio — scope réduit",
        body: "Nous retenons deux modules pour la V1 : planning temps réel du bloc + gestion des annulations. Budget contraint (~15k de trésorerie), time-to-market prioritaire : le reste passe en V2.",
      },
      opts(T0 + 10_000),
    );
    expect(send.completionFired).toBe(true);
    expect(kinds(send.effects)).toContain("evaluate_step");

    const v2 = evaluate(
      session,
      {
        choice_module_planning: true,
        choice_module_annulations: true,
        justif_budget_ttm: true,
        ...S2_MINORS,
      },
      T0 + 11_000,
    );
    expect(v2.outcome).toBe("advanced");
    const out2 = session.stepResults.s2_scope_mvp.output;
    expect(out2.choice).toContain("Cadrage MVP");
    expect(typeof out2.justification).toBe("string");

    // ── Chaîne d'inputs : s3 lit s2.choice / s2.justification.
    const s3 = getCurrentStepV3(session)!;
    expect(s3.step_id).toBe("s3_nego_novadev");
    const inputs = resolveStepInputsV3(session, s3);
    expect(String(inputs.scope_retenu)).toContain("Cadrage MVP");
    expect(inputs.justification_scope).toBeDefined();

    // ── s3 : Thomas ouvre à 21 000 € (event step_start, verbatim v2).
    const thomasThread = session.workspace.threads.th_thomas;
    expect(thomasThread.messages[0].content).toMatch(/21 000 € HT/);

    // Relance diégétique de Thomas sur delay (clock_tick, once).
    const tick1 = applyWorkspaceAction(
      session,
      { type: "clock_tick", now: session.workspace.stepStartedAt + 241_000 },
      OPTS,
    );
    expect(tick1.completionFired).toBe(false);
    expect(thomasThread.messages.some((m) => /prix travaillé/.test(m.content))).toBe(true);
    const countAfterTick1 = thomasThread.messages.length;
    applyWorkspaceAction(
      session,
      { type: "clock_tick", now: session.workspace.stepStartedAt + 242_000 },
      OPTS,
    );
    expect(thomasThread.messages).toHaveLength(countAfterTick1); // once par défaut

    // Proposition via le Tool contrat → Thomas réagit (event after_action, once:false).
    const proposal = { at: T0 + 20_000, values: { prix: 14000, delai_semaines: 8, equity_pct: 0 } };
    applyWorkspaceAction(
      session,
      {
        type: "tool_state_changed",
        tool_id: "contrat",
        state: { values: proposal.values, proposals: [proposal], status: "open" },
      },
      opts(T0 + 20_000),
    );
    const prop = applyWorkspaceAction(
      session,
      { type: "deliverable_submitted", tool_id: "contrat", payload: { proposal } },
      opts(T0 + 20_500),
    );
    expect(prop.completionFired).toBe(false);
    expect(prop.effects).toContainEqual(
      expect.objectContaining({ kind: "actor_reply", actor_id: "thomas_novadev", thread_id: "th_thomas" }),
    );
    // La directive de l'acteur inclut les paliers du scénario (params.directive).
    const propReply = prop.effects.find((e) => e.kind === "actor_reply");
    expect(propReply?.kind === "actor_reply" && propReply.directive).toMatch(/11 000/);
    recordActorMessage(session, "th_thomas", "thomas_novadev", "14 500 et c'est faisable en 7 semaines.", opts(T0 + 21_000));

    // Deuxième proposition : l'event once:false rejoue.
    const proposal2 = { at: T0 + 22_000, values: { prix: 12000, delai_semaines: 8, equity_pct: 0 } };
    applyWorkspaceAction(
      session,
      {
        type: "tool_state_changed",
        tool_id: "contrat",
        state: { values: proposal2.values, proposals: [proposal, proposal2], status: "open" },
      },
      opts(T0 + 22_000),
    );
    const prop2 = applyWorkspaceAction(
      session,
      { type: "deliverable_submitted", tool_id: "contrat", payload: { proposal: proposal2 } },
      opts(T0 + 22_500),
    );
    expect(kinds(prop2.effects)).toContain("actor_reply");
    recordActorMessage(session, "th_thomas", "thomas_novadev", "OK ça me va. On part là-dessus.", opts(T0 + 23_000));

    // Signature aux termes convenus → EXIT "contrat_signe" (chantier A).
    applyWorkspaceAction(
      session,
      {
        type: "tool_state_changed",
        tool_id: "contrat",
        state: { values: proposal2.values, proposals: [proposal, proposal2], status: "signed" },
      },
      opts(T0 + 24_000),
    );
    const sign = applyWorkspaceAction(
      session,
      { type: "contract_signed", tool_id: "contrat", terms: proposal2.values },
      opts(T0 + 24_500),
    );
    expect(sign.completionFired).toBe(true);
    expect(sign.effects).toContainEqual({ kind: "evaluate_step", exit_id: "contrat_signe" });
    expect(session.exitLog).toContainEqual(
      expect.objectContaining({ step_id: "s3_nego_novadev", exit_id: "contrat_signe", route: "next" }),
    );

    const v3 = evaluate(
      session,
      {
        accord_conclu: true,
        prix_maitrise: true,
        equity_cedee: false,
        contreparties_structurees: true,
        relation_professionnelle: true,
      },
      T0 + 25_000,
      "contrat_signe",
    );
    expect(v3.outcome).toBe("ended");
    expect(session.isFinished).toBe(true);
    expect(session.ending?.id).toBe("success");

    // L'agreement alimente les deltas founder (/api/v2/complete lit "prix").
    const out3 = session.stepResults.s3_nego_novadev.output;
    expect(out3.agreement).toEqual({
      concluded: true,
      terms: { prix: 12000, delai_semaines: 8, equity_pct: 0 },
    });
    expect(out3.proposals_count).toBe(2);

    // Outputs conformes aux output_keys du manifest v3, pour chaque step.
    for (const step of scenario.sequence) {
      const result = session.stepResults[step.step_id];
      expect(result?.passed, `${step.step_id} devrait passer en happy path`).toBe(true);
      for (const key of MECHANIC_SPECS[step.mechanic].manifest.output_keys) {
        expect(result.output[key], `${step.step_id} : output_key "${key}" absente`).not.toBeUndefined();
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// C. Retry diégétique puis chemin dégradé → "partial_success"
// ═══════════════════════════════════════════════════════════════════

describe("C. échec s1 → retry diégétique → ending dégradé", () => {
  it("l'event on_retry d'Alexandre se déclenche, puis partial_success", () => {
    const session = initializeSessionV3(loadScenario(), T0);
    enterStep(session, opts(T0));

    // Tentative 1 : mail de debrief incomplet (pain point ok, budget absent).
    const bad = applyWorkspaceAction(
      session,
      {
        type: "mail_sent",
        to: ["alexandre_morel"],
        subject: "Debrief",
        body: "Le vrai sujet c'est les annulations.",
      },
      opts(T0 + 1_000),
    );
    expect(bad.completionFired).toBe(true); // le trigger tire, le verdict tranche

    const beforeRetry = session.workspace.threads.th_alexandre.messages.length;
    const v1 = evaluate(
      session,
      { pain_point_identifie: true, budget_confronte: false, bruit_ecarte: false },
      T0 + 3_000,
    );
    expect(v1.outcome).toBe("retry"); // pas de bannière : le monde réagit
    const msgs = session.workspace.threads.th_alexandre.messages;
    expect(msgs).toHaveLength(beforeRetry + 1);
    expect(msgs[msgs.length - 1].content).toMatch(/32k/); // event on_retry (authoré)
    expect(getCurrentStepV3(session)?.step_id).toBe("s1_analyse_terrain");
    expect(session.stepResults.s1_analyse_terrain.attempts).toBe(1);

    // La tentative est réarmée : rien ne re-tire sans nouvelle action.
    const tick = applyWorkspaceAction(session, { type: "clock_tick", now: T0 + 4_000 }, OPTS);
    expect(tick.completionFired).toBe(false);

    // Tentative 2 : mail de debrief complet → passe.
    const mail2 = applyWorkspaceAction(
      session,
      {
        type: "mail_sent",
        to: ["alexandre_morel"],
        subject: "Debrief (complet)",
        body: "Annulations + planning, et le devis 32k est intenable avec 15k : on coupe.",
      },
      opts(T0 + 5_000),
    );
    expect(mail2.completionFired).toBe(true); // nouveau mail dans la tentative réarmée
    const v2 = evaluate(
      session,
      { pain_point_identifie: true, budget_confronte: true, bruit_ecarte: false },
      T0 + 6_000,
    );
    expect(v2.outcome).toBe("advanced");
    expect(session.stepResults.s1_analyse_terrain.attempts).toBe(2);
    expect(session.stepResults.s1_analyse_terrain.passed).toBe(true);

    // s2 échoue (justification faible) → on_failure "advance", step non passé.
    applyWorkspaceAction(
      session,
      { type: "mail_sent", to: ["thomas_novadev"], subject: "Scope", body: "On prend tout." },
      opts(T0 + 10_000),
    );
    const v3 = evaluate(
      session,
      { choice_module_planning: true, choice_module_annulations: true, justif_budget_ttm: false, ...S2_MINORS },
      T0 + 11_000,
    );
    expect(v3.outcome).toBe("advanced");
    expect(session.stepResults.s2_scope_mvp.passed).toBe(false);

    // s3 réussit (exit contrat_signe → next = fin) → 2 steps passés → partial_success.
    applyWorkspaceAction(
      session,
      { type: "contract_signed", tool_id: "contrat", terms: { prix: 13000, delai_semaines: 8, equity_pct: 0 } },
      opts(T0 + 20_000),
    );
    const v4 = evaluate(
      session,
      {
        accord_conclu: true,
        prix_maitrise: true,
        equity_cedee: false,
        contreparties_structurees: false,
        relation_professionnelle: true,
      },
      T0 + 21_000,
      "contrat_signe",
    );
    expect(v4.outcome).toBe("ended");
    expect(session.ending?.id).toBe("partial_success");
  });
});

// ═══════════════════════════════════════════════════════════════════
// D. Tout raté → ending default "failure"
// ═══════════════════════════════════════════════════════════════════

describe("D. échec généralisé → failure (default)", () => {
  it("max_attempts sur s1, scope raté, contrat refusé → failure", () => {
    const session = initializeSessionV3(loadScenario(), T0);
    enterStep(session, opts(T0));

    const failS1 = { pain_point_identifie: true, budget_confronte: false, bruit_ecarte: false };
    // Tentative 1 → retry ; tentative 2 → advance en échec (max_attempts: 2).
    applyWorkspaceAction(
      session,
      { type: "mail_sent", to: ["alexandre_morel"], subject: "Debrief", body: "…" },
      opts(T0 + 1_000),
    );
    expect(evaluate(session, failS1, T0 + 3_000).outcome).toBe("retry");
    applyWorkspaceAction(
      session,
      { type: "mail_sent", to: ["alexandre_morel"], subject: "Debrief 2", body: "…" },
      opts(T0 + 4_000),
    );
    expect(evaluate(session, failS1, T0 + 5_000).outcome).toBe("advanced");
    expect(session.stepResults.s1_analyse_terrain.passed).toBe(false);

    // s2 raté (modules requis absents du mail).
    applyWorkspaceAction(
      session,
      { type: "mail_sent", to: ["thomas_novadev"], subject: "On fait tout", body: "Les 7 modules." },
      opts(T0 + 6_000),
    );
    expect(
      evaluate(
        session,
        { choice_module_planning: false, choice_module_annulations: false, justif_budget_ttm: false, ...S2_MINORS },
        T0 + 7_000,
      ).outcome,
    ).toBe("advanced");

    // s3 : contrat REFUSÉ → l'EXIT "contrat_refuse" route vers {end: "failure"}.
    const reject = applyWorkspaceAction(
      session,
      { type: "contract_rejected", tool_id: "contrat", reason: "Trop cher" },
      opts(T0 + 8_000),
    );
    expect(reject.completionFired).toBe(true);
    expect(reject.effects).toContainEqual({ kind: "evaluate_step", exit_id: "contrat_refuse" });
    const v = evaluate(
      session,
      {
        accord_conclu: false,
        prix_maitrise: false,
        equity_cedee: false,
        contreparties_structurees: false,
        relation_professionnelle: true,
      },
      T0 + 9_000,
      "contrat_refuse",
    );
    expect(v.outcome).toBe("ended");
    expect(session.isFinished).toBe(true);
    expect(session.ending?.id).toBe("failure");
    // L'output négociation reflète l'absence d'accord.
    const out3 = session.stepResults.s3_nego_novadev.output;
    expect((out3.agreement as { concluded: boolean }).concluded).toBe(false);
  });
});
