import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/app/lib/auth';
import {
  createCampaign,
  listCampaignsForUser,
  loadCampaign,
  loadRules,
} from '@/app/lib/founder';

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
  const { campaignId, pendingScenarioId } = body;

  if (!campaignId) {
    return NextResponse.json({ error: 'campaignId required' }, { status: 400 });
  }

  const { saveCampaign } = await import('@/app/lib/founder');
  const campaign = loadCampaign(campaignId);
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  if (campaign.userId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (pendingScenarioId !== undefined) {
    campaign.pendingScenarioId = pendingScenarioId;
  }

  saveCampaign(campaign);
  return NextResponse.json({ campaign });
}
