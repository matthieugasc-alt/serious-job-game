import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/app/lib/auth';
import { getRecordsForUser } from '@/app/lib/gameRecords';
import {
  loadCampaign,
  saveCampaign,
  loadRules,
  resolveOutcome,
  applyOutcomeToCampaign,
} from '@/app/lib/founder';

/**
 * POST /api/founder/apply-outcome
 * Body: { campaignId }
 *
 * Reads the latest GameRecord for the pending scenario,
 * resolves the FounderOutcome, applies deltas, returns micro-debrief.
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const session = validateSession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const body = await req.json();
  const { campaignId } = body;

  if (!campaignId) {
    return NextResponse.json({ error: 'campaignId required' }, { status: 400 });
  }

  const campaign = loadCampaign(campaignId);
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  if (campaign.userId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!campaign.pendingScenarioId) {
    return NextResponse.json({ error: 'No pending scenario' }, { status: 400 });
  }

  const scenarioId = campaign.pendingScenarioId;

  // Check not already completed
  if (campaign.completedScenarios.some((s) => s.scenarioId === scenarioId)) {
    return NextResponse.json({ error: 'Scenario already completed' }, { status: 400 });
  }

  // Find the latest game record for this scenario
  const records = getRecordsForUser(session.user.id);
  const matchingRecord = records.find((r) => r.scenarioId === scenarioId);

  if (!matchingRecord) {
    return NextResponse.json(
      { error: `No game record found for scenario "${scenarioId}". Play the scenario first.` },
      { status: 404 }
    );
  }

  // Resolve outcome from normalized ending
  const rules = loadRules();
  let outcome;
  try {
    outcome = resolveOutcome(scenarioId, matchingRecord.ending, rules);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  // Apply deltas + flags via unified helper
  const stateBefore = { ...campaign.state };
  const updatedCampaign = applyOutcomeToCampaign(campaign, outcome);

  // Record completion
  updatedCampaign.completedScenarios.push({
    scenarioId,
    outcomeId: outcome.outcomeId,
    signal: outcome.signal,
    stateAfter: { ...updatedCampaign.state },
    completedAt: new Date().toISOString(),
  });

  // Clear checkpoint (anti-rollback: scenario is done)
  updatedCampaign.checkpoint = null;

  // Advance to next scenario
  updatedCampaign.currentScenarioIndex += 1;
  updatedCampaign.pendingScenarioId = null;

  // Check if all scenarios done
  const scenarioKeys = Object.keys(rules.scenarios);
  if (updatedCampaign.currentScenarioIndex >= scenarioKeys.length) {
    updatedCampaign.status = 'completed';
  }

  saveCampaign(updatedCampaign);

  return NextResponse.json({
    outcome: {
      outcomeId: outcome.outcomeId,
      label: outcome.label,
      summary: outcome.summary,
      signal: outcome.signal,
    },
    microDebrief: outcome.microDebrief,
    stateBefore,
    stateAfter: updatedCampaign.state,
    deltas: outcome.deltas,
    campaign: updatedCampaign,
  });
}
