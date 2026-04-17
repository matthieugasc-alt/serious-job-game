import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/app/lib/auth';
import { getOrganization, getMembership, getFeatureFlags, updateFeatureFlags } from '@/app/lib/organizations';
import { isSuperAdmin } from '@/app/lib/permissions';
import { parseBody, updateFeaturesSchema } from '@/app/lib/validation';

/**
 * GET /api/organizations/[orgId]/features — Get feature flags
 * Accessible by: super_admin OR org admin/member
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const session = validateSession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const { orgId } = await params;
  const org = getOrganization(orgId);
  if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

  // Must be member or super_admin
  if (!isSuperAdmin(session.user.role)) {
    const membership = getMembership(session.user.id, orgId);
    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const flags = getFeatureFlags(orgId);
  return NextResponse.json({ features: flags?.features || null });
}

/**
 * PATCH /api/organizations/[orgId]/features — Update feature flags (super_admin only)
 * Body: { custom_scenarios?: boolean, studio_access?: boolean, max_managed_users?: number, advanced_analytics?: boolean }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const session = validateSession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  if (!isSuperAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden — super_admin only' }, { status: 403 });
  }

  const { orgId } = await params;
  const org = getOrganization(orgId);
  if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

  const body = await req.json();

  // ── Input validation ──
  const parsed = parseBody(body, updateFeaturesSchema);
  if (parsed.error) return NextResponse.json(parsed.error, { status: 400 });

  const result = updateFeatureFlags(orgId, parsed.data);

  if (!result.success) {
    return NextResponse.json({ error: 'Failed to update features' }, { status: 400 });
  }

  const flags = getFeatureFlags(orgId);
  return NextResponse.json({ features: flags?.features || null });
}
