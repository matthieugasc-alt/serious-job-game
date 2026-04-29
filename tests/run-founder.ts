#!/usr/bin/env npx ts-node
/**
 * Run Founder Mode Test
 *
 * Launches 10 AI agents × 5 scenarios = 50 simultaneous agents
 * against all Founder mode scenarios.
 *
 * Usage:
 *   npx ts-node tests/run-founder.ts
 *
 * Environment variables:
 *   BASE_URL     — App URL (default: http://localhost:3000)
 *   AUTH_TOKEN   — Auth bearer token (required)
 *   CONCURRENCY  — Parallel agents (default: 5)
 *   MAX_TURNS    — Max turns per agent (default: 40)
 *   DELAY_MS     — Delay between turns in ms (default: 1000)
 */

import * as fs from "fs";
import * as path from "path";
import { runAgentTests, RunReport } from "./agents/agent-runner";
import { AGENT_PERSONALITIES } from "./agents/agent-personalities";

const FOUNDER_SCENARIOS = [
  "founder_00_v1",
  "founder_01_v1",
  "founder_02_v1",
  "founder_03_v1",
  "founder_04_v1",
];

async function main() {
  const baseUrl = process.env.BASE_URL || "http://localhost:3000";
  const authToken = process.env.AUTH_TOKEN || "";
  const concurrency = parseInt(process.env.CONCURRENCY || "5", 10);
  const maxTotalTurns = parseInt(process.env.MAX_TURNS || "40", 10);
  const maxTurnsPerPhase = parseInt(process.env.MAX_TURNS_PER_PHASE || "12", 10);
  const delayMs = parseInt(process.env.DELAY_MS || "1000", 10);

  if (!authToken) {
    console.error("❌ AUTH_TOKEN est requis.");
    process.exit(1);
  }

  console.log(`\n🚀 FOUNDER MODE — Test massif avec ${AGENT_PERSONALITIES.length} agents × ${FOUNDER_SCENARIOS.length} scénarios = ${AGENT_PERSONALITIES.length * FOUNDER_SCENARIOS.length} runs`);
  console.log(`   URL: ${baseUrl}`);
  console.log(`   Concurrence globale: ${concurrency} agents simultanés\n`);

  const allReports: RunReport[] = [];

  // Check which scenarios exist
  const availableScenarios = FOUNDER_SCENARIOS.filter(id => {
    const scenarioPath = path.join(process.cwd(), "scenarios", id, "scenario.json");
    if (!fs.existsSync(scenarioPath)) {
      console.warn(`⚠️ Scénario ${id} non trouvé, ignoré`);
      return false;
    }
    return true;
  });

  console.log(`📋 Scénarios disponibles: ${availableScenarios.join(", ")}\n`);

  for (const scenarioId of availableScenarios) {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`🎯 Démarrage: ${scenarioId}`);
    console.log(`${"═".repeat(60)}`);

    const report = await runAgentTests({
      scenarioId,
      personalities: AGENT_PERSONALITIES,
      api: { baseUrl, authToken },
      maxTurnsPerPhase,
      maxTotalTurns,
      delayBetweenTurns: delayMs,
      concurrency,
    });

    allReports.push(report);
  }

  // Save combined report
  const reportDir = path.join(process.cwd(), "tests", "reports");
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportPath = path.join(reportDir, `founder_all_${timestamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(allReports, null, 2));
  console.log(`\n📄 Rapport combiné sauvegardé: ${reportPath}`);

  // Print aggregate across all scenarios
  console.log(`\n${"═".repeat(60)}`);
  console.log(`📊 RAPPORT GLOBAL — FOUNDER MODE`);
  console.log(`${"═".repeat(60)}`);

  const totalRuns = allReports.reduce((s, r) => s + r.totalAgents, 0);
  const totalCompleted = allReports.reduce((s, r) => s + r.completedAgents, 0);
  const totalFailed = allReports.reduce((s, r) => s + r.failedAgents, 0);
  const totalDuration = allReports.reduce((s, r) => s + r.durationMs, 0);

  console.log(`Total runs: ${totalRuns}`);
  console.log(`Terminés: ${totalCompleted} (${Math.round(totalCompleted / totalRuns * 100)}%)`);
  console.log(`Avec erreurs: ${totalFailed}`);
  console.log(`Durée totale: ${Math.round(totalDuration / 1000)}s`);

  for (const report of allReports) {
    console.log(`\n  📋 ${report.scenarioId}: ${report.completedAgents}/${report.totalAgents} terminés (${Math.round(report.aggregateStats.finishRate * 100)}%)`);
  }

  console.log(`\n${"═".repeat(60)}\n`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
