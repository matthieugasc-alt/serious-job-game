/**
 * Agent Runner
 *
 * Orchestrates N agents playing a scenario in parallel.
 * Each agent gets a HeadlessEngine instance + an AI brain
 * that decides actions based on personality.
 */

import { HeadlessEngine, ScenarioDefinition, ApiConfig } from "./headless-engine";
import { AgentPersonality, buildAgentBrainPrompt, AGENT_PERSONALITIES } from "./agent-personalities";

// ── Types ──

export interface AgentRunConfig {
  scenarioId: string;
  personalities: AgentPersonality[];
  api: ApiConfig;
  maxTurnsPerPhase: number;
  maxTotalTurns: number;
  delayBetweenTurns: number; // ms, to avoid rate limiting
  concurrency: number; // how many agents run simultaneously
}

export interface AgentAction {
  action: "chat" | "mail" | "wait";
  to?: string;
  message?: string;
  subject?: string;
  body?: string;
  reason?: string;
}

export interface AgentResult {
  personalityId: string;
  personalityName: string;
  scenarioId: string;
  summary: ReturnType<HeadlessEngine["getSummary"]>;
  debrief: any | null;
  actions: { turn: number; phase: string; action: AgentAction; result: string }[];
  log: string[];
  errors: string[];
  warnings: string[];
  durationMs: number;
  turnCount: number;
}

export interface RunReport {
  scenarioId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  totalAgents: number;
  completedAgents: number;
  failedAgents: number;
  results: AgentResult[];
  aggregateStats: {
    avgTurns: number;
    avgDurationMs: number;
    avgPhasesReached: number;
    finishRate: number;
    errorRate: number;
    commonErrors: { error: string; count: number }[];
    commonWarnings: { warning: string; count: number }[];
  };
}

// ── Agent Brain (LLM-powered decision maker) ──

async function askAgentBrain(
  api: ApiConfig,
  personality: AgentPersonality,
  scenario: ScenarioDefinition,
  engine: HeadlessEngine
): Promise<AgentAction> {
  const phase = engine.currentPhase;
  if (!phase) return { action: "wait", reason: "no active phase" };

  const prompt = buildAgentBrainPrompt(
    personality,
    scenario,
    phase,
    {
      chatHistory: engine.session.chatMessages.map(m => ({
        actor: m.actor,
        content: m.content,
      })),
      inboxMails: engine.session.inboxMails.map(m => ({
        from: m.from,
        subject: m.subject,
        body: m.body,
      })),
      sentMails: engine.session.sentMails.map(m => ({
        to: m.to || "",
        subject: m.subject,
        body: m.body,
      })),
      availableDocuments: scenario.resources?.documents
        ?.filter(d => {
          if (!d.available_from_phase) return true;
          const phaseIdx = scenario.phases.findIndex(p => p.phase_id === d.available_from_phase);
          return phaseIdx <= engine.session.currentPhaseIndex;
        })
        .map(d => d.label) || [],
    }
  );

  try {
    const res = await fetch(`${api.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${api.authToken}`,
      },
      body: JSON.stringify({
        playerName: personality.name,
        message: prompt,
        phaseTitle: "Agent Brain",
        phaseObjective: "Décider la prochaine action du joueur simulé",
        phaseFocus: "",
        phasePrompt: "",
        criteria: [],
        mode: "standard",
        narrative: scenario.narrative,
        recentConversation: [],
        playerMessages: [prompt],
        roleplayPrompt: `Tu es le cerveau d'un agent de test. Tu ne joues PAS un personnage du scénario. Tu décides quelle action le joueur simulé doit prendre. Réponds UNIQUEMENT en JSON valide.`,
      }),
    });

    if (!res.ok) {
      engine.addError(`Agent brain API error: ${res.status}`);
      return { action: "wait", reason: `API error ${res.status}` };
    }

    const data = await res.json();
    const reply = data.reply || "";

    // Parse JSON from reply
    const jsonMatch = reply.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      engine.addWarning(`Agent brain returned non-JSON: ${reply.slice(0, 100)}`);
      return { action: "wait", reason: "unparseable response" };
    }

    const parsed = JSON.parse(jsonMatch[0]) as AgentAction;

    // Validate action
    if (!["chat", "mail", "wait"].includes(parsed.action)) {
      engine.addWarning(`Agent brain returned invalid action: ${parsed.action}`);
      return { action: "wait", reason: "invalid action type" };
    }

    return parsed;
  } catch (err: any) {
    engine.addError(`Agent brain fetch failed: ${err.message}`);
    return { action: "wait", reason: `fetch error: ${err.message}` };
  }
}

// ── Execute a single action ──

async function executeAction(
  engine: HeadlessEngine,
  action: AgentAction
): Promise<string> {
  switch (action.action) {
    case "chat": {
      if (!action.to || !action.message) {
        return "SKIPPED: missing to/message for chat";
      }
      const reply = await engine.sendChat(action.to, action.message);
      return `NPC replied: ${reply.slice(0, 100)}...`;
    }

    case "mail": {
      if (!action.to || !action.body) {
        return "SKIPPED: missing to/body for mail";
      }
      const result = await engine.sendMail(
        action.to,
        action.subject || "(sans objet)",
        action.body
      );
      return result.advanced
        ? "MAIL SENT → phase advanced"
        : "MAIL SENT";
    }

    case "wait": {
      return `WAITED: ${action.reason || "no reason"}`;
    }

    default:
      return `UNKNOWN ACTION: ${(action as any).action}`;
  }
}

// ── Run a single agent through the scenario ──

async function runSingleAgent(
  scenario: ScenarioDefinition,
  personality: AgentPersonality,
  api: ApiConfig,
  config: { maxTurnsPerPhase: number; maxTotalTurns: number; delayBetweenTurns: number }
): Promise<AgentResult> {
  const startTime = Date.now();
  const engine = new HeadlessEngine(scenario, api, personality.name);
  await engine.loadPrompts();

  const actions: AgentResult["actions"] = [];
  let totalTurns = 0;
  let turnsInPhase = 0;
  let lastPhaseId = engine.currentPhaseId;

  engine.addLog(`🎭 Agent "${personality.name}" (${personality.id}) démarré`);

  // Inject initial entry events
  engine.injectEntryEvents();

  while (!engine.isFinished && totalTurns < config.maxTotalTurns) {
    // Phase changed?
    if (engine.currentPhaseId !== lastPhaseId) {
      turnsInPhase = 0;
      lastPhaseId = engine.currentPhaseId;
      engine.injectEntryEvents();
    }

    // Guard: too many turns in same phase
    if (turnsInPhase >= config.maxTurnsPerPhase) {
      engine.addWarning(`Agent bloqué en phase ${engine.currentPhaseId} après ${turnsInPhase} tours — force advance`);
      const advanced = engine.tryAdvancePhase();
      if (!advanced) {
        // Force advance by setting flags
        const phase = engine.currentPhase;
        if (phase?.completion_rules?.any_flags) {
          for (const flag of phase.completion_rules.any_flags) {
            engine.session.flags[flag] = true;
          }
          engine.tryAdvancePhase();
        } else {
          engine.session.currentPhaseIndex++;
        }
      }
      turnsInPhase = 0;
      continue;
    }

    // Ask the AI brain what to do
    const action = await askAgentBrain(api, personality, scenario, engine);

    // Execute the action
    const result = await executeAction(engine, action);

    actions.push({
      turn: totalTurns,
      phase: engine.currentPhaseId,
      action,
      result,
    });

    totalTurns++;
    turnsInPhase++;

    // Delay between turns
    if (config.delayBetweenTurns > 0) {
      await new Promise(r => setTimeout(r, config.delayBetweenTurns));
    }
  }

  // Generate debrief if finished
  let debrief = null;
  if (engine.isFinished) {
    debrief = await engine.generateDebrief();
  }

  const durationMs = Date.now() - startTime;
  engine.addLog(`🏁 Agent "${personality.name}" terminé en ${Math.round(durationMs / 1000)}s, ${totalTurns} tours`);

  return {
    personalityId: personality.id,
    personalityName: personality.name,
    scenarioId: scenario.scenario_id,
    summary: engine.getSummary(),
    debrief,
    actions,
    log: engine.log,
    errors: engine.errors,
    warnings: engine.warnings,
    durationMs,
    turnCount: totalTurns,
  };
}

// ── Run multiple agents with concurrency control ──

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = [];
  const executing = new Set<Promise<void>>();

  for (const task of tasks) {
    const p = (async () => {
      const result = await task();
      results.push(result);
    })();
    executing.add(p);
    p.finally(() => executing.delete(p));

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

// ── Main orchestrator ──

export async function runAgentTests(config: AgentRunConfig): Promise<RunReport> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  console.log(`\n${"═".repeat(60)}`);
  console.log(`🧪 AGENT TEST RUN — ${config.scenarioId}`);
  console.log(`   ${config.personalities.length} agents, concurrency: ${config.concurrency}`);
  console.log(`${"═".repeat(60)}\n`);

  // Load scenario
  const scenario = HeadlessEngine.loadScenario(config.scenarioId);
  console.log(`✅ Scénario chargé: ${scenario.meta.title} (${scenario.phases.length} phases)`);

  // Create agent tasks
  const agentTasks = config.personalities.map((personality, i) => {
    return async () => {
      console.log(`\n🎭 [${i + 1}/${config.personalities.length}] Démarrage: ${personality.name} (${personality.id})`);
      try {
        const result = await runSingleAgent(scenario, personality, config.api, {
          maxTurnsPerPhase: config.maxTurnsPerPhase,
          maxTotalTurns: config.maxTotalTurns,
          delayBetweenTurns: config.delayBetweenTurns,
        });
        const status = result.summary.finished ? "✅ TERMINÉ" : `⏸️ Bloqué phase ${result.summary.finalPhase}`;
        console.log(`   ${status} — ${result.turnCount} tours, ${result.errors.length} erreurs`);
        return result;
      } catch (err: any) {
        console.error(`   ❌ CRASH: ${err.message}`);
        return {
          personalityId: personality.id,
          personalityName: personality.name,
          scenarioId: config.scenarioId,
          summary: {
            playerName: personality.name,
            scenarioId: config.scenarioId,
            phasesReached: 0,
            totalPhases: scenario.phases.length,
            finalPhase: "CRASH",
            finished: false,
            totalMessages: 0,
            totalMailsSent: 0,
            totalMailsReceived: 0,
            scores: {},
            flags: {},
            errors: [`CRASH: ${err.message}`],
            warnings: [],
            durationMs: 0,
          },
          debrief: null,
          actions: [],
          log: [`CRASH: ${err.message}`],
          errors: [`CRASH: ${err.message}`],
          warnings: [],
          durationMs: 0,
          turnCount: 0,
        } as AgentResult;
      }
    };
  });

  // Run with concurrency
  const results = await runWithConcurrency(agentTasks, config.concurrency);

  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - startMs;

  // Aggregate stats
  const completed = results.filter(r => r.summary.finished);
  const failed = results.filter(r => r.errors.length > 0);

  const allErrors = results.flatMap(r => r.errors);
  const allWarnings = results.flatMap(r => r.warnings);

  const errorCounts = new Map<string, number>();
  for (const err of allErrors) {
    // Normalize error strings (remove timestamps)
    const normalized = err.replace(/\[\d{2}:\d{2}:\d{2}\]\s*❌\s*/, "").slice(0, 80);
    errorCounts.set(normalized, (errorCounts.get(normalized) || 0) + 1);
  }
  const commonErrors = [...errorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([error, count]) => ({ error, count }));

  const warningCounts = new Map<string, number>();
  for (const warn of allWarnings) {
    const normalized = warn.replace(/\[\d{2}:\d{2}:\d{2}\]\s*⚠️\s*/, "").slice(0, 80);
    warningCounts.set(normalized, (warningCounts.get(normalized) || 0) + 1);
  }
  const commonWarnings = [...warningCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([warning, count]) => ({ warning, count }));

  const report: RunReport = {
    scenarioId: config.scenarioId,
    startedAt,
    finishedAt,
    durationMs,
    totalAgents: results.length,
    completedAgents: completed.length,
    failedAgents: failed.length,
    results,
    aggregateStats: {
      avgTurns: results.reduce((s, r) => s + r.turnCount, 0) / results.length,
      avgDurationMs: results.reduce((s, r) => s + r.durationMs, 0) / results.length,
      avgPhasesReached: results.reduce((s, r) => s + r.summary.phasesReached, 0) / results.length,
      finishRate: completed.length / results.length,
      errorRate: failed.length / results.length,
      commonErrors,
      commonWarnings,
    },
  };

  // Print report summary
  console.log(`\n${"═".repeat(60)}`);
  console.log(`📊 RAPPORT DE TEST`);
  console.log(`${"═".repeat(60)}`);
  console.log(`Scénario: ${config.scenarioId}`);
  console.log(`Durée totale: ${Math.round(durationMs / 1000)}s`);
  console.log(`Agents: ${results.length} total, ${completed.length} terminés, ${failed.length} avec erreurs`);
  console.log(`Taux de complétion: ${Math.round(report.aggregateStats.finishRate * 100)}%`);
  console.log(`Tours moyens: ${Math.round(report.aggregateStats.avgTurns)}`);
  console.log(`Phases atteintes (moy): ${report.aggregateStats.avgPhasesReached.toFixed(1)}/${scenario.phases.length}`);

  if (commonErrors.length > 0) {
    console.log(`\n❌ ERREURS FRÉQUENTES :`);
    for (const { error, count } of commonErrors.slice(0, 5)) {
      console.log(`   ${count}x — ${error}`);
    }
  }

  if (commonWarnings.length > 0) {
    console.log(`\n⚠️ WARNINGS FRÉQUENTS :`);
    for (const { warning, count } of commonWarnings.slice(0, 5)) {
      console.log(`   ${count}x — ${warning}`);
    }
  }

  console.log(`\n--- DÉTAIL PAR AGENT ---`);
  for (const r of results) {
    const status = r.summary.finished ? "✅" : "❌";
    console.log(`${status} ${r.personalityName.padEnd(30)} | phases: ${r.summary.phasesReached}/${r.summary.totalPhases} | tours: ${r.turnCount} | msgs: ${r.summary.totalMessages} | mails: ${r.summary.totalMailsSent} | erreurs: ${r.errors.length}`);
  }

  console.log(`\n${"═".repeat(60)}\n`);

  return report;
}

// ── Utility: get auth token ──

export async function getAuthToken(baseUrl: string, email: string, password: string): Promise<string> {
  // Try to authenticate via the app's auth endpoint
  try {
    const res = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.token || data.accessToken || "";
    }
  } catch {
    // Fallback: return empty, engine will handle auth errors
  }
  return "";
}
