// ═══════════════════════════════════════════════════════════════════
// Y-chantier — reader over JSONL game_events files for analytics.
// ═══════════════════════════════════════════════════════════════════
//
// Read-only. Scans data/game_events/*.jsonl and aggregates events
// for the /admin/analytics dashboard.
//
// Kept lean: linear scans over JSONL files, no indexing yet. When
// volume grows past ~100k events, we'll add a per-scenario index or
// migrate to sqlite. For now (early prod) files are small.
// ═══════════════════════════════════════════════════════════════════

import fs from "fs";
import path from "path";
import type { GameEvent } from "./types";

const DATA_DIR = path.join(process.cwd(), "data", "game_events");

export function readAllEvents(): GameEvent[] {
  if (!fs.existsSync(DATA_DIR)) return [];
  const out: GameEvent[] = [];
  for (const file of fs.readdirSync(DATA_DIR)) {
    if (!file.endsWith(".jsonl")) continue;
    try {
      const raw = fs.readFileSync(path.join(DATA_DIR, file), "utf-8");
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        try {
          out.push(JSON.parse(line));
        } catch {
          // skip malformed line
        }
      }
    } catch {
      // skip unreadable file
    }
  }
  return out;
}

export interface PhaseMetric {
  scenarioId: string;
  phaseId: string;
  attempts: number;
  abandonments: number;
  completions: number;
  abandonRate: number;
  criticalFailures: number;
  totalDurationMs: number;
  averageDurationMs: number;
}

export interface CriterionMetric {
  scenarioId: string;
  phaseId: string;
  criterionId: string;
  matched: number;
  seen: number;
  matchRate: number;
}

export interface ScenarioMetric {
  scenarioId: string;
  sessions: number;
  completions: number;
  abandonments: number;
  completionRate: number;
}

export interface HelpMetric {
  scenarioId: string;
  phaseId: string;
  source: string;
  count: number;
}

/**
 * Aggregate metrics from all events for the analytics dashboard.
 * Returns 6 top-level slices, one per question the PO wants answered.
 */
export function computeAnalytics(events: GameEvent[]) {
  // ── Per-phase: attempts + abandon rate + duration ──
  const phaseAcc = new Map<string, PhaseMetric>();
  const phaseKey = (s: string, p: string) => `${s}::${p}`;

  for (const e of events) {
    const key = phaseKey(e.scenarioId, e.phaseId || "");
    const m = phaseAcc.get(key) ?? {
      scenarioId: e.scenarioId,
      phaseId: e.phaseId || "",
      attempts: 0,
      abandonments: 0,
      completions: 0,
      abandonRate: 0,
      criticalFailures: 0,
      totalDurationMs: 0,
      averageDurationMs: 0,
    };
    if (e.type === "phase_started") m.attempts++;
    if (e.type === "phase_abandoned") m.abandonments++;
    if (e.type === "phase_completed") {
      m.completions++;
      const d = (e.payload as any)?.durationMs;
      if (typeof d === "number") m.totalDurationMs += d;
    }
    if (e.type === "phase_evaluated") {
      const crits = (e.payload as any)?.criticalFailures;
      if (Array.isArray(crits) && crits.length > 0) m.criticalFailures++;
    }
    phaseAcc.set(key, m);
  }
  for (const m of phaseAcc.values()) {
    m.abandonRate = m.attempts > 0 ? m.abandonments / m.attempts : 0;
    m.averageDurationMs = m.completions > 0 ? m.totalDurationMs / m.completions : 0;
  }

  // ── Per-criterion match rate ──
  const critAcc = new Map<string, CriterionMetric>();
  const critKey = (s: string, p: string, c: string) => `${s}::${p}::${c}`;

  for (const e of events) {
    if (e.type !== "phase_evaluated") continue;
    const observed = (e.payload as any)?.criteriaObserved as Record<string, boolean> | undefined;
    const matched = (e.payload as any)?.matched as string[] | undefined;
    if (!observed) continue;
    for (const [cid, val] of Object.entries(observed)) {
      const key = critKey(e.scenarioId, e.phaseId || "", cid);
      const m = critAcc.get(key) ?? {
        scenarioId: e.scenarioId,
        phaseId: e.phaseId || "",
        criterionId: cid,
        matched: 0,
        seen: 0,
        matchRate: 0,
      };
      m.seen++;
      const isMatch = Array.isArray(matched) ? matched.includes(cid) : val === true;
      if (isMatch) m.matched++;
      critAcc.set(key, m);
    }
  }
  for (const m of critAcc.values()) m.matchRate = m.seen > 0 ? m.matched / m.seen : 0;

  // ── Per-scenario completion ──
  const scenAcc = new Map<string, ScenarioMetric>();
  for (const e of events) {
    const m = scenAcc.get(e.scenarioId) ?? {
      scenarioId: e.scenarioId,
      sessions: 0,
      completions: 0,
      abandonments: 0,
      completionRate: 0,
    };
    if (e.type === "session_started") m.sessions++;
    if (e.type === "scenario_completed") m.completions++;
    if (e.type === "scenario_abandoned") m.abandonments++;
    scenAcc.set(e.scenarioId, m);
  }
  for (const m of scenAcc.values()) m.completionRate = m.sessions > 0 ? m.completions / m.sessions : 0;

  // ── Help requests per phase/source ──
  const helpAcc = new Map<string, HelpMetric>();
  for (const e of events) {
    if (e.type !== "help_requested") continue;
    const source = (e.payload as any)?.source ?? "unknown";
    const key = `${e.scenarioId}::${e.phaseId || ""}::${source}`;
    const m = helpAcc.get(key) ?? {
      scenarioId: e.scenarioId,
      phaseId: e.phaseId || "",
      source: String(source),
      count: 0,
    };
    m.count++;
    helpAcc.set(key, m);
  }

  return {
    phases: [...phaseAcc.values()],
    criteria: [...critAcc.values()],
    scenarios: [...scenAcc.values()],
    help: [...helpAcc.values()],
    totalEvents: events.length,
  };
}
