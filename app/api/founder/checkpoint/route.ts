import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/app/lib/auth';
import {
  findActiveCampaign,
  handleScenarioEntry,
  advanceCheckpoint,
  clearCheckpoint,
  ABANDON_PENALTY,
} from '@/app/lib/founder';

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
      return NextResponse.json({
        isResume: result.isResume,
        penaltyApplied: result.penaltyApplied,
        penaltyMonths: result.penaltyMonths,
        resumePhaseIndex: result.resumePhaseIndex,
        resumeCompletedPhases: result.resumeCompletedPhases,
        abandonPenalty: ABANDON_PENALTY,
      });
    }

    case 'advance': {
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
