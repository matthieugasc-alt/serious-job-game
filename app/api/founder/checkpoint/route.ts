import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/app/lib/auth';
import {
  findActiveCampaign,
  handleScenarioEntry,
  advanceCheckpoint,
  clearCheckpoint,
  rollbackCheckpoint,
  deepSaveCheckpoint,
  ABANDON_PENALTY,
  SCENARIO_0_ID,
} from '@/app/lib/founder';
import * as fs from 'fs';
import * as path from 'path';

/**
 * POST /api/founder/checkpoint
 *
 * Actions:
 *  - "enter"   → Player enters a scenario play page. Detects first entry vs resume.
 *  - "advance" → Player completed a phase. Update checkpoint.
 *  - "clear"   → Scenario finished. Remove checkpoint.
 *
 * Body: { scenarioId, action, phaseIndex?, completedPhaseId? }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  // sendBeacon (used by useDeepSave on unload) can't send Authorization
  // headers, so we allow the client to pass the token in the body as a
  // fallback. The token is validated the same way either source.
  const token =
    req.headers.get('authorization')?.replace('Bearer ', '') ||
    (typeof body._unloadToken === 'string' ? body._unloadToken : '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const session = validateSession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const { scenarioId, action, phaseIndex, completedPhaseId, targetPhaseId, targetPhaseIndex } = body;

  if (!scenarioId || !action) {
    return NextResponse.json({ error: 'scenarioId and action required' }, { status: 400 });
  }

  const campaign = findActiveCampaign(session.user.id);
  if (!campaign) {
    return NextResponse.json({ error: 'No active campaign' }, { status: 404 });
  }

  switch (action) {
    case 'enter': {
      const result = handleScenarioEntry(campaign, scenarioId);

      // Scenario 0 abandon → delete campaign entirely, signal redirect
      if (result.resetCampaign) {
        const campaignsDir = path.join(process.cwd(), 'data', 'founder_campaigns');
        const campaignFile = path.join(campaignsDir, `${campaign.id}.json`);
        if (fs.existsSync(campaignFile)) {
          fs.unlinkSync(campaignFile);
        }
        return NextResponse.json({ resetCampaign: true });
      }

      return NextResponse.json({
        isResume: result.isResume,
        resetCampaign: false,
        penaltyApplied: result.penaltyApplied,
        penaltyMonths: result.penaltyMonths,
        resumePhaseIndex: result.resumePhaseIndex,
        resumeCompletedPhases: result.resumeCompletedPhases,
        // Deep snapshot when available (undefined for legacy checkpoints
        // saved before the deep_save action shipped, and for first entry).
        resumeSnapshot: result.resumeSnapshot,
        abandonPenalty: ABANDON_PENALTY,
      });
    }

    case 'advance': {
      // Scenario 0: no intermediate checkpoint saves (one-shot)
      if (scenarioId === SCENARIO_0_ID) {
        return NextResponse.json({ ok: true });
      }
      if (typeof phaseIndex !== 'number' || !completedPhaseId) {
        return NextResponse.json(
          { error: 'phaseIndex (number) and completedPhaseId required for advance' },
          { status: 400 }
        );
      }
      advanceCheckpoint(campaign, completedPhaseId, phaseIndex);
      return NextResponse.json({ ok: true });
    }

    case 'clear': {
      clearCheckpoint(campaign);
      return NextResponse.json({ ok: true });
    }

    case 'rollback': {
      // Symmetric counterpart of "advance" — used by HARD_REJECT paths
      // (S5 phase 2 → phase 1) so the persisted checkpoint follows the
      // engine rollback. Without this, "Reprendre" rebuilds a session
      // at the post-rollback phase but with all KOL state wiped, putting
      // the player in an inconsistent state.
      if (scenarioId === SCENARIO_0_ID) {
        return NextResponse.json({ ok: true });
      }
      if (typeof targetPhaseIndex !== 'number' || !targetPhaseId) {
        return NextResponse.json(
          { error: 'targetPhaseIndex (number) and targetPhaseId required for rollback' },
          { status: 400 }
        );
      }
      rollbackCheckpoint(campaign, targetPhaseId, targetPhaseIndex);
      return NextResponse.json({ ok: true });
    }

    case 'deep_save': {
      // Deep snapshot of the client PlayerSession. Called throttled by the
      // client (every 10 s + on unload + after each advance) so the server
      // has enough state to fully hydrate the session on Reprendre.
      //
      // - Scenario 0 skipped: it's one-shot, no resume by design.
      // - No-op if there's no checkpoint yet (should not happen — enter
      //   creates one — but be defensive).
      // - Stale snapshot guard: deepSaveCheckpoint rejects a snapshot
      //   whose currentPhaseIndex doesn't match the server checkpoint's
      //   phaseIndex (prevents overwriting after an advance).
      if (scenarioId === SCENARIO_0_ID) {
        return NextResponse.json({ ok: true, skipped: 'scenario 0' });
      }
      const snapshot = body.snapshot;
      if (!snapshot || typeof snapshot !== 'object') {
        return NextResponse.json({ error: 'snapshot (object) required' }, { status: 400 });
      }
      const result = deepSaveCheckpoint(campaign, snapshot);
      // Return 200 even when saved=false because callers throttle and
      // don't want a benign "stale snapshot" to log as an error client-side.
      return NextResponse.json({ ok: result.saved, reason: result.reason });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
