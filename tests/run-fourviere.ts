#!/usr/bin/env npx ts-node
/**
 * Run Fourvière Test
 *
 * Launches 10 AI agents with different personalities
 * against the "heritage_fourviere" scenario.
 *
 * Usage:
 *   npx ts-node tests/run-fourviere.ts
 *
 * Environment variables:
 *   BASE_URL     — App URL (default: http://localhost:3000)
 *   AUTH_TOKEN   — Auth bearer token (required)
 *   CONCURRENCY  — Parallel agents (default: 3)
 *   MAX_TURNS    — Max turns per agent (default: 40)
 *   DELAY_MS     — Delay between turns in ms (default: 1000)
 */

import * as fs from "fs";
import * as path from "path";
import { runAgentTests, RunReport } from "./agents/agent-runner";
import { AGENT_PERSONALITIES } from "./agents/agent-personalities";

async function main() {
  const baseUrl = process.env.BASE_URL || "http://localhost:3000";
  const authToken = process.env.AUTH_TOKEN || "";
  const concurrency = parseInt(process.env.CONCURRENCY || "3", 10);
  const maxTotalTurns = parseInt(process.env.MAX_TURNS || "40", 10);
  const maxTurnsPerPhase = parseInt(process.env.MAX_TURNS_PER_PHASE || "12", 10);
  const delayMs = parseInt(process.env.DELAY_MS || "1000", 10);

  if (!authToken) {
    console.error("❌ AUTH_TOKEN est requis. Récupérez-le depuis localStorage dans le navigateur.");
    console.error("   Exemple: AUTH_TOKEN=eyJ... npx ts-node tests/run-fourviere.ts");
    process.exit(1);
  }

  console.log(`\n🏠 L'Héritage de Fourvière — Test avec 10 agents`);
  console.log(`   URL: ${baseUrl}`);
  console.log(`   Concurrence: ${concurrency} agents simultanés`);
  console.log(`   Max tours/agent: ${maxTotalTurns}`);
  console.log(`   Max tours/phase: ${maxTurnsPerPhase}`);
  console.log(`   Délai entre tours: ${delayMs}ms\n`);

  const report = await runAgentTests({
    scenarioId: "heritage_fourviere",
    personalities: AGENT_PERSONALITIES,
    api: { baseUrl, authToken },
    maxTurnsPerPhase,
    maxTotalTurns,
    delayBetweenTurns: delayMs,
    concurrency,
  });

  // Save report to file
  const reportDir = path.join(process.cwd(), "tests", "reports");
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportPath = path.join(reportDir, `fourviere_${timestamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`📄 Rapport sauvegardé: ${reportPath}`);

  // Also save a human-readable summary
  const summaryPath = path.join(reportDir, `fourviere_${timestamp}_summary.txt`);
  const summary = generateHumanSummary(report);
  fs.writeFileSync(summaryPath, summary);
  console.log(`📝 Résumé sauvegardé: ${summaryPath}`);

  // Exit with error code if too many failures
  if (report.aggregateStats.finishRate < 0.3) {
    console.error(`\n⚠️ Taux de complétion faible (${Math.round(report.aggregateStats.finishRate * 100)}%) — il y a probablement des bugs`);
    process.exit(1);
  }
}

function generateHumanSummary(report: RunReport): string {
  const lines: string[] = [];

  lines.push("═".repeat(70));
  lines.push(`RAPPORT DE TEST — ${report.scenarioId}`);
  lines.push(`Date: ${report.startedAt}`);
  lines.push("═".repeat(70));
  lines.push("");
  lines.push(`Durée totale: ${Math.round(report.durationMs / 1000)}s`);
  lines.push(`Agents: ${report.totalAgents} total, ${report.completedAgents} terminés, ${report.failedAgents} avec erreurs`);
  lines.push(`Taux de complétion: ${Math.round(report.aggregateStats.finishRate * 100)}%`);
  lines.push(`Tours moyens par agent: ${Math.round(report.aggregateStats.avgTurns)}`);
  lines.push(`Phases atteintes (moy): ${report.aggregateStats.avgPhasesReached.toFixed(1)}`);
  lines.push("");

  // Per-agent detail
  lines.push("─".repeat(70));
  lines.push("DÉTAIL PAR AGENT");
  lines.push("─".repeat(70));

  for (const r of report.results) {
    lines.push("");
    lines.push(`▸ ${r.personalityName} (${r.personalityId})`);
    lines.push(`  Statut: ${r.summary.finished ? "TERMINÉ" : `BLOQUÉ (phase ${r.summary.finalPhase})`}`);
    lines.push(`  Tours: ${r.turnCount} | Messages: ${r.summary.totalMessages} | Mails envoyés: ${r.summary.totalMailsSent}`);
    lines.push(`  Phases atteintes: ${r.summary.phasesReached}/${r.summary.totalPhases}`);
    lines.push(`  Scores: ${JSON.stringify(r.summary.scores)}`);
    lines.push(`  Flags: ${JSON.stringify(r.summary.flags)}`);

    if (r.errors.length > 0) {
      lines.push(`  Erreurs (${r.errors.length}):`);
      for (const err of r.errors.slice(0, 5)) {
        lines.push(`    ❌ ${err}`);
      }
      if (r.errors.length > 5) lines.push(`    ... et ${r.errors.length - 5} de plus`);
    }

    if (r.warnings.length > 0) {
      lines.push(`  Warnings (${r.warnings.length}):`);
      for (const w of r.warnings.slice(0, 3)) {
        lines.push(`    ⚠️ ${w}`);
      }
      if (r.warnings.length > 3) lines.push(`    ... et ${r.warnings.length - 3} de plus`);
    }

    // Action trace (first 10)
    if (r.actions.length > 0) {
      lines.push(`  Actions (${r.actions.length} total, premières 10):`);
      for (const a of r.actions.slice(0, 10)) {
        const desc = a.action.action === "chat"
          ? `CHAT → ${a.action.to}: "${(a.action.message || "").slice(0, 60)}..."`
          : a.action.action === "mail"
            ? `MAIL → ${a.action.to}: "${a.action.subject}" (${(a.action.body || "").length} chars)`
            : `WAIT: ${a.action.reason || "?"}`;
        lines.push(`    [T${a.turn}/${a.phase}] ${desc}`);
        lines.push(`      → ${a.result.slice(0, 80)}`);
      }
    }

    if (r.debrief) {
      lines.push(`  Debrief: ending="${r.debrief.ending}"`);
    }
  }

  // Common errors
  if (report.aggregateStats.commonErrors.length > 0) {
    lines.push("");
    lines.push("─".repeat(70));
    lines.push("ERREURS FRÉQUENTES");
    lines.push("─".repeat(70));
    for (const { error, count } of report.aggregateStats.commonErrors) {
      lines.push(`  ${count}x — ${error}`);
    }
  }

  // Common warnings
  if (report.aggregateStats.commonWarnings.length > 0) {
    lines.push("");
    lines.push("─".repeat(70));
    lines.push("WARNINGS FRÉQUENTS");
    lines.push("─".repeat(70));
    for (const { warning, count } of report.aggregateStats.commonWarnings) {
      lines.push(`  ${count}x — ${warning}`);
    }
  }

  lines.push("");
  lines.push("═".repeat(70));

  return lines.join("\n");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
