import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/app/lib/auth";
import {
  generateSessionId,
  logSessionStarted,
  logPhaseStarted,
  logPlayerMessage,
  logAIMessage,
  logMailSent,
  logContractSigned,
  logPhaseCompleted,
  logScenarioCompleted,
  logPhaseAbandoned,
} from "@/app/lib/gameEvents";

/**
 * POST /api/game-events
 *
 * Passive logging endpoint — receives game events from the client
 * and writes them to the append-only JSONL store.
 *
 * NEVER affects gameplay. If logging fails, returns 200 anyway.
 * The client should fire-and-forget these calls.
 */
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ ok: true }); // Silent — no auth = skip

    const session = validateSession(token);
    if (!session) return NextResponse.json({ ok: true }); // Silent — invalid = skip

    const userId = session.user.id;
    const body = await req.json();
    const { type, sessionId, scenarioId, phaseId, ...payload } = body;

    if (!type || !sessionId || !scenarioId) {
      return NextResponse.json({ ok: true }); // Silent — bad data = skip
    }

    switch (type) {
      case "session_started":
        logSessionStarted({
          sessionId,
          userId,
          scenarioId,
          playerName: payload.playerName || "",
          startedAt: new Date().toISOString(),
          isFounder: !!payload.isFounder,
          campaignId: payload.campaignId || null,
        });
        break;

      case "phase_started":
        logPhaseStarted(
          sessionId, userId, scenarioId, phaseId || "",
          payload.phaseIndex ?? 0,
          payload.phaseTitle || "",
          payload.modules || [],
        );
        break;

      case "player_message":
        logPlayerMessage(
          sessionId, userId, scenarioId, phaseId || "",
          payload.actor || "",
          payload.content || "",
        );
        break;

      case "ai_message":
        logAIMessage(
          sessionId, userId, scenarioId, phaseId || "",
          payload.actor || "",
          payload.content || "",
        );
        break;

      case "mail_sent":
        logMailSent(
          sessionId, userId, scenarioId, phaseId || "",
          payload.mailKind || "",
          payload.to || "",
          payload.subject || "",
          payload.bodyLength ?? 0,
          !!payload.hasAttachments,
        );
        break;

      case "contract_signed":
        logContractSigned(
          sessionId, userId, scenarioId, phaseId || "",
          payload.contractType || "",
          payload.articleCount ?? 0,
          payload.flagsSet || [],
        );
        break;

      case "phase_completed":
        logPhaseCompleted(
          sessionId, userId, scenarioId, phaseId || "",
          payload.phaseIndex ?? 0,
          payload.phaseScore ?? 0,
          payload.durationMs ?? 0,
        );
        break;

      case "scenario_completed":
        logScenarioCompleted(
          sessionId, userId, scenarioId,
          payload.ending || "unknown",
          payload.totalScore ?? 0,
          payload.completedPhases || [],
          payload.durationMs ?? 0,
        );
        break;

      case "phase_abandoned":
        logPhaseAbandoned(
          sessionId, userId, scenarioId, phaseId || "",
          payload.phaseIndex ?? 0,
          payload.reason || "unknown",
        );
        break;

      default:
        // Unknown event type — silently ignore
        break;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    // NEVER break the game — swallow errors
    console.warn("[game-events] API error:", err);
    return NextResponse.json({ ok: true });
  }
}
