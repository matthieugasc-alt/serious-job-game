import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/app/lib/auth';
import {
  createCampaign,
  listCampaignsForUser,
  loadCampaign,
  loadRules,
  saveCampaign,
} from '@/app/lib/founder';
import * as fs from 'fs';
import * as path from 'path';

/**
 * GET /api/founder/campaigns — List campaigns for current user
 * Optional: ?id=xxx to get a single campaign
 */
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const session = validateSession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const campaignId = req.nextUrl.searchParams.get('id');

  if (campaignId) {
    const campaign = loadCampaign(campaignId);
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    if (campaign.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.json({ campaign });
  }

  const campaigns = listCampaignsForUser(session.user.id);
  return NextResponse.json({ campaigns });
}

/**
 * POST /api/founder/campaigns — Create a new campaign
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const session = validateSession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  // Check if user already has an active campaign
  const existing = listCampaignsForUser(session.user.id);
  const active = existing.find((c) => c.status !== 'completed');
  if (active) {
    return NextResponse.json({ campaign: active, existing: true });
  }

  const campaign = createCampaign(session.user.id);
  return NextResponse.json({ campaign }, { status: 201 });
}

/**
 * PATCH /api/founder/campaigns — Update campaign (set pending scenario, etc.)
 * Body: { campaignId, pendingScenarioId }
 */
export async function PATCH(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const session = validateSession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const body = await req.json();
  const { campaignId, pendingScenarioId, currentScenarioIndex } = body;

  if (!campaignId) {
    return NextResponse.json({ error: 'campaignId required' }, { status: 400 });
  }

  const campaign = loadCampaign(campaignId);
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  if (campaign.userId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (pendingScenarioId !== undefined) {
    campaign.pendingScenarioId = pendingScenarioId;
  }

  if (typeof currentScenarioIndex === 'number' && currentScenarioIndex >= 0) {
    // Admin jump: reset state to match the target scenario index
    const rules = loadRules();
    const scenarioKeys = Object.keys(rules.scenarios);

    campaign.currentScenarioIndex = currentScenarioIndex;
    campaign.pendingScenarioId = null;
    campaign.status = 'in_progress';
    campaign.checkpoint = null;

    // Rebuild completedScenarios and state from outcomes up to this index
    campaign.completedScenarios = [];
    campaign.state = { ...rules.initialState };
    campaign.hasAdvisoryBoard = false;
    campaign.lastMicroDebrief = null;

    // Replay outcomes for completed scenarios (0 to currentScenarioIndex - 1)
    // ADMIN DEBUG: only apply elapsedMonths + flags, NOT treasury/ownership/etc.
    // This prevents "trésorerie épuisée" when jumping to a later scenario.
    const SKIP_DELTA_KEYS = new Set(["treasury", "ownership", "mrr", "payroll", "productQuality", "techDebt", "investorConfidence", "marketValidation"]);
    for (let i = 0; i < currentScenarioIndex && i < scenarioKeys.length; i++) {
      const scId = scenarioKeys[i];
      const scRules = rules.scenarios[scId];
      if (!scRules) continue;
      // Default to "success" outcome for admin jump
      const outcome = scRules.outcomes.success || Object.values(scRules.outcomes)[0];
      if (outcome) {
        // Apply ONLY elapsedMonths (needed for timeline), skip economic deltas
        for (const key of Object.keys(outcome.deltas)) {
          if (SKIP_DELTA_KEYS.has(key)) continue; // Don't drain treasury/ownership on debug skip
          const k = key as keyof typeof campaign.state;
          if (typeof campaign.state[k] === 'number' && typeof outcome.deltas[k] === 'number') {
            (campaign.state as any)[k] = Math.max(0, campaign.state[k] + outcome.deltas[k]);
          }
        }
        // Apply flags
        if (outcome.setsFlags?.hasAdvisoryBoard) {
          campaign.hasAdvisoryBoard = true;
        }
        campaign.completedScenarios.push({
          scenarioId: scId,
          outcomeId: outcome.outcomeId,
          signal: outcome.signal,
          stateAfter: { ...campaign.state },
          completedAt: new Date().toISOString(),
        });
      }
    }
  }

  saveCampaign(campaign);
  return NextResponse.json({ campaign });
}

/**
 * DELETE /api/founder/campaigns — Delete a campaign (super_admin reset)
 * Body: { campaignId }
 */
export async function DELETE(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const session = validateSession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  // Only super_admin can delete campaigns
  if (session.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden — super_admin only' }, { status: 403 });
  }

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

  // Delete the campaign file
  const campaignsDir = path.join(process.cwd(), 'data', 'founder_campaigns');
  const campaignFile = path.join(campaignsDir, `${campaignId}.json`);
  if (fs.existsSync(campaignFile)) {
    fs.unlinkSync(campaignFile);
  }

  return NextResponse.json({ deleted: true });
}
