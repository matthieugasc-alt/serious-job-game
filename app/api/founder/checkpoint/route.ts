import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/app/lib/auth';
import {
  findActiveCampaign,
  handleScenarioEntry,
  advanceCheckpoint,
  clearCheckpoint,
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
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const session = validateSession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const body = await req.json();
  const { scenarioId, action, phaseIndex, completedPhaseId } = body;

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

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
