// ══════════════════════════════════════════════════════════════════
// Game Events — Append-only writer
// ══════════════════════════════════════════════════════════════════
//
// Writes GameEvents to JSONL files in data/game_events/.
// One file per session: {sessionId}.jsonl
//
// GUARANTEES:
//   - Append-only: existing lines are NEVER modified or deleted
//   - Fail-safe: if writing fails, console.warn and return — game continues
//   - No reads: this module never reads events back (audit-only for now)
//
// FILE FORMAT:
//   Each line is a JSON object (one GameEvent per line).
//   First line is always a session_started event containing the GameSession header.
// ══════════════════════════════════════════════════════════════════

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { GameEvent, GameEventType, GameSession } from "./types";

// ── Constants ──────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), "data", "game_events");

// ── Ensure directory exists (once per process) ────────────────────

let dirEnsured = false;

function ensureDir(): void {
  if (dirEnsured) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    dirEnsured = true;
  } catch (err) {
    console.warn("[gameEvents] Failed to create data dir:", err);
  }
}

// ── File path for a session ───────────────────────────────────────

function sessionFilePath(sessionId: string): string {
  // Sanitize sessionId to prevent path traversal
  const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(DATA_DIR, `${safe}.jsonl`);
}

// ── Core: append a single event ───────────────────────────────────

function appendEvent(event: GameEvent): void {
  try {
    ensureDir();
    const filePath = sessionFilePath(event.sessionId);
    const line = JSON.stringify(event) + "\n";
    fs.appendFileSync(filePath, line, "utf-8");
  } catch (err) {
    // NEVER throw — game must continue
    console.warn("[gameEvents] Failed to write event:", event.type, err);
  }
}

// ══════════════════════════════════════════════════════════════════
// Public API — one function per event type
// ══════════════════════════════════════════════════════════════════

/**
 * Generate a new session ID. Call once when a scenario starts.
 */
export function generateSessionId(): string {
  return randomUUID();
}

/**
 * Log: session started (first event in the file).
 */
export function logSessionStarted(session: GameSession): void {
  appendEvent({
    eventId: randomUUID(),
    sessionId: session.sessionId,
    type: "session_started",
    timestamp: new Date().toISOString(),
    scenarioId: session.scenarioId,
    userId: session.userId,
    phaseId: null,
    payload: {
      playerName: session.playerName,
      isFounder: session.isFounder,
      campaignId: session.campaignId,
    },
  });
}

/**
 * Log: phase started.
 */
export function logPhaseStarted(
  sessionId: string,
  userId: string,
  scenarioId: string,
  phaseId: string,
  phaseIndex: number,
  phaseTitle: string,
  modules: string[],
): void {
  appendEvent({
    eventId: randomUUID(),
    sessionId,
    type: "phase_started",
    timestamp: new Date().toISOString(),
    scenarioId,
    userId,
    phaseId,
    payload: { phaseIndex, phaseTitle, modules },
  });
}

/**
 * Log: player sent a chat message.
 */
export function logPlayerMessage(
  sessionId: string,
  userId: string,
  scenarioId: string,
  phaseId: string,
  actor: string,
  content: string,
): void {
  appendEvent({
    eventId: randomUUID(),
    sessionId,
    type: "player_message",
    timestamp: new Date().toISOString(),
    scenarioId,
    userId,
    phaseId,
    payload: {
      actor,
      contentLength: content.length,
      contentPreview: content.slice(0, 200),
    },
  });
}

/**
 * Log: AI sent a chat message.
 */
export function logAIMessage(
  sessionId: string,
  userId: string,
  scenarioId: string,
  phaseId: string,
  actor: string,
  content: string,
): void {
  appendEvent({
    eventId: randomUUID(),
    sessionId,
    type: "ai_message",
    timestamp: new Date().toISOString(),
    scenarioId,
    userId,
    phaseId,
    payload: {
      actor,
      contentLength: content.length,
      contentPreview: content.slice(0, 200),
    },
  });
}

/**
 * Log: mail sent by the player.
 */
export function logMailSent(
  sessionId: string,
  userId: string,
  scenarioId: string,
  phaseId: string,
  mailKind: string,
  to: string,
  subject: string,
  bodyLength: number,
  hasAttachments: boolean,
): void {
  appendEvent({
    eventId: randomUUID(),
    sessionId,
    type: "mail_sent",
    timestamp: new Date().toISOString(),
    scenarioId,
    userId,
    phaseId,
    payload: { mailKind, to, subject, bodyLength, hasAttachments },
  });
}

/**
 * Log: contract signed.
 */
export function logContractSigned(
  sessionId: string,
  userId: string,
  scenarioId: string,
  phaseId: string,
  contractType: string,
  articleCount: number,
  flagsSet: string[],
): void {
  appendEvent({
    eventId: randomUUID(),
    sessionId,
    type: "contract_signed",
    timestamp: new Date().toISOString(),
    scenarioId,
    userId,
    phaseId,
    payload: { contractType, articleCount, flagsSet },
  });
}

/**
 * Log: phase completed.
 */
export function logPhaseCompleted(
  sessionId: string,
  userId: string,
  scenarioId: string,
  phaseId: string,
  phaseIndex: number,
  phaseScore: number,
  durationMs: number,
): void {
  appendEvent({
    eventId: randomUUID(),
    sessionId,
    type: "phase_completed",
    timestamp: new Date().toISOString(),
    scenarioId,
    userId,
    phaseId,
    payload: { phaseIndex, phaseScore, durationMs },
  });
}

/**
 * Log: scenario completed (finished).
 */
export function logScenarioCompleted(
  sessionId: string,
  userId: string,
  scenarioId: string,
  ending: string,
  totalScore: number,
  completedPhases: string[],
  durationMs: number,
): void {
  appendEvent({
    eventId: randomUUID(),
    sessionId,
    type: "scenario_completed",
    timestamp: new Date().toISOString(),
    scenarioId,
    userId,
    phaseId: null,
    payload: { ending, totalScore, completedPhases, durationMs },
  });
}

/**
 * Log: outcome applied to campaign (Founder).
 */
export function logOutcomeApplied(
  sessionId: string,
  userId: string,
  scenarioId: string,
  ending: string,
  deltas: Record<string, number>,
  microDebriefDecision: string,
): void {
  appendEvent({
    eventId: randomUUID(),
    sessionId,
    type: "outcome_applied",
    timestamp: new Date().toISOString(),
    scenarioId,
    userId,
    phaseId: null,
    payload: { ending, deltas, microDebriefDecision },
  });
}

/**
 * Log: phase abandoned (player left mid-phase).
 */
export function logPhaseAbandoned(
  sessionId: string,
  userId: string,
  scenarioId: string,
  phaseId: string,
  phaseIndex: number,
  reason: string,
): void {
  appendEvent({
    eventId: randomUUID(),
    sessionId,
    type: "phase_abandoned",
    timestamp: new Date().toISOString(),
    scenarioId,
    userId,
    phaseId,
    payload: { phaseIndex, reason },
  });
}
