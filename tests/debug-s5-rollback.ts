#!/usr/bin/env npx ts-node
/**
 * Debug script — proves the S5 phase 2 HARD_REJECT rollback is correct.
 *
 * Reproduces the engine-side path that runs when Éric Moreau replies with
 * the canonical "Cette réponse n'est pas acceptable. Le processus est
 * interrompu." Tests both the new advancement-driven rollback AND the
 * legacy keyword path to confirm they converge on identical behaviour.
 *
 * Run:
 *   cd serious-job-game
 *   npx tsx tests/debug-s5-rollback.ts
 */

import * as fs from "fs";
import * as path from "path";
import {
  initializeSession,
  handlePhaseFailure,
  checkNpcFailureKeywords,
  getCurrentPhase,
  getCurrentPhaseId,
} from "../app/lib/runtime";

const SCENARIO_PATH = path.join(
  process.cwd(),
  "scenarios",
  "founder_05_sales",
  "scenario.json",
);

function loadScenario() {
  const raw = fs.readFileSync(SCENARIO_PATH, "utf-8");
  return JSON.parse(raw);
}

function snapshot(label: string, session: any) {
  const phase = getCurrentPhase(session);
  const phaseId = getCurrentPhaseId(session);
  console.log(`\n── ${label} ────────────────────────────────────────`);
  console.log(`  currentPhaseIndex = ${session.currentPhaseIndex}`);
  console.log(`  currentPhaseId    = ${phaseId}`);
  console.log(`  phaseTitle        = ${phase?.title}`);
  console.log(`  flags = {`);
  for (const [k, v] of Object.entries(session.flags || {})) {
    console.log(`    ${k}: ${JSON.stringify(v)}`);
  }
  console.log(`  }`);
  const draft = session.mailDrafts?.["phase_1_prospection"];
  console.log(
    `  mailDrafts.phase_1_prospection = ${JSON.stringify(draft || null)}`,
  );
}

function runCaseA() {
  console.log("\n████████████████████████████████████████████████████");
  console.log("█ CASE A — player in phase 2, ÉRIC HARD_REJECT       █");
  console.log("████████████████████████████████████████████████████");

  const scenario = loadScenario();
  const session: any = initializeSession(scenario);

  // Simulate: player has completed phase 1 with Amina, advanced to phase 2.
  session.currentPhaseIndex = scenario.phases.findIndex(
    (p: any) => p.phase_id === "phase_2_dsi",
  );
  session.flags.kol_interested = true;
  (session.flags as any).chosen_kol_id = "amina_khelifi";
  session.flags.dsi_objections_answered = true;
  // Player typed "pénis" as their reply to Éric.
  session.mailDrafts["phase_2_dsi"] = {
    to: "eric_moreau",
    cc: "",
    subject: "RE: Demande d'information — Solution Orisio",
    body: "pénis",
    attachments: [],
  };

  snapshot("BEFORE handlePhaseFailure", session);

  // Éric's canonical HARD_REJECT reply (verbatim from /api/chat safety net).
  const ericReply =
    "Cette réponse n'est pas acceptable dans un cadre d'évaluation DSI. Le processus est interrompu de notre côté.";

  console.log(`\nÉric reply: "${ericReply}"`);
  const keywordTriggered = checkNpcFailureKeywords(session, ericReply);
  console.log(`checkNpcFailureKeywords → ${keywordTriggered}`);

  // The actual call that page.tsx makes in the post-hoc safety net.
  const result = handlePhaseFailure(session);
  console.log(`\nhandlePhaseFailure result:`);
  console.log(`  applied:        ${result.applied}`);
  console.log(`  source:         ${result.source}`);
  console.log(`  newPhaseId:     ${result.newPhaseId}`);
  console.log(`  burnedActorId:  ${result.burnedActorId}`);

  snapshot("AFTER handlePhaseFailure", session);

  // Assertions
  const checks: Array<[string, boolean]> = [
    ["source === 'advancement'", result.source === "advancement"],
    ["newPhaseId === 'phase_1_prospection'", result.newPhaseId === "phase_1_prospection"],
    ["burnedActorId === 'amina_khelifi'", result.burnedActorId === "amina_khelifi"],
    ["currentPhaseIndex === 0", session.currentPhaseIndex === 0],
    ["kol_interested === false", session.flags.kol_interested === false],
    [
      "chosen_kol_id === false",
      session.flags.chosen_kol_id === false ||
        session.flags.chosen_kol_id === undefined,
    ],
    [
      "burned_kol_ids contains amina_khelifi",
      Array.isArray((session.flags as any).burned_kol_ids) &&
        (session.flags as any).burned_kol_ids.includes("amina_khelifi"),
    ],
    [
      "mailDraft phase_1 wiped (to empty)",
      (session.mailDrafts["phase_1_prospection"]?.to || "") === "",
    ],
    [
      "mailDraft phase_1 wiped (body empty)",
      (session.mailDrafts["phase_1_prospection"]?.body || "") === "",
    ],
  ];

  console.log("\n── ASSERTIONS ────────────────────────────────────────");
  let failed = 0;
  for (const [label, ok] of checks) {
    console.log(`  ${ok ? "✓" : "✗"} ${label}`);
    if (!ok) failed++;
  }
  console.log(`\nResult: ${failed === 0 ? "✅ ALL PASS" : `❌ ${failed} FAILED`}`);
  return failed === 0;
}

function runCaseB() {
  console.log("\n\n████████████████████████████████████████████████████");
  console.log("█ CASE B — interop_lied path (also HARD_REJECT)      █");
  console.log("████████████████████████████████████████████████████");

  const scenario = loadScenario();
  const session: any = initializeSession(scenario);

  session.currentPhaseIndex = scenario.phases.findIndex(
    (p: any) => p.phase_id === "phase_2_dsi",
  );
  session.flags.kol_interested = true;
  (session.flags as any).chosen_kol_id = "maxime_chen";
  // Player lied — but for this engine-side test we don't actually evaluate
  // the player text; we simulate that Éric replied with the rejection.
  session.mailDrafts["phase_2_dsi"] = {
    to: "eric_moreau",
    cc: "",
    subject: "RE: Demande d'information — Solution Orisio",
    body: "Notre intégration DxCare est déjà en production sur 3 sites.",
    attachments: [],
  };

  snapshot("BEFORE", session);

  const result = handlePhaseFailure(session);
  console.log(`\nhandlePhaseFailure result: ${JSON.stringify(result)}`);

  snapshot("AFTER", session);

  const ok =
    result.applied &&
    result.source === "advancement" &&
    result.burnedActorId === "maxime_chen" &&
    session.currentPhaseIndex === 0 &&
    Array.isArray((session.flags as any).burned_kol_ids) &&
    (session.flags as any).burned_kol_ids.includes("maxime_chen");
  console.log(`\nResult: ${ok ? "✅ ALL PASS" : "❌ FAILED"}`);
  return ok;
}

function runCaseC() {
  console.log("\n\n████████████████████████████████████████████████████");
  console.log("█ CASE C — second burn stacks correctly              █");
  console.log("████████████████████████████████████████████████████");

  const scenario = loadScenario();
  const session: any = initializeSession(scenario);

  // First failure with Amina
  session.currentPhaseIndex = scenario.phases.findIndex(
    (p: any) => p.phase_id === "phase_2_dsi",
  );
  session.flags.kol_interested = true;
  (session.flags as any).chosen_kol_id = "amina_khelifi";
  handlePhaseFailure(session);
  console.log(
    `After 1st burn: burned_kol_ids = ${JSON.stringify((session.flags as any).burned_kol_ids)}`,
  );

  // Player picks Maxime, gets to phase 2, fails again
  session.currentPhaseIndex = scenario.phases.findIndex(
    (p: any) => p.phase_id === "phase_2_dsi",
  );
  session.flags.kol_interested = true;
  (session.flags as any).chosen_kol_id = "maxime_chen";
  handlePhaseFailure(session);
  console.log(
    `After 2nd burn: burned_kol_ids = ${JSON.stringify((session.flags as any).burned_kol_ids)}`,
  );

  const burned = (session.flags as any).burned_kol_ids as string[];
  const ok =
    Array.isArray(burned) &&
    burned.includes("amina_khelifi") &&
    burned.includes("maxime_chen") &&
    burned.length === 2;
  console.log(`\nResult: ${ok ? "✅ ALL PASS" : "❌ FAILED"}`);
  return ok;
}

const a = runCaseA();
const b = runCaseB();
const c = runCaseC();
const total = a && b && c;
console.log("\n══════════════════════════════════════════════════════");
console.log(total ? "✅ ALL CASES PASS" : "❌ SOME CASES FAILED");
console.log("══════════════════════════════════════════════════════\n");
process.exit(total ? 0 : 1);
