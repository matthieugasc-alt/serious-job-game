import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/app/lib/auth';
import { getOrganization, updateOrganization, getMembership } from '@/app/lib/organizations';
import { isSuperAdmin } from '@/app/lib/permissions';
import { parseBody, updateOrgSchema } from '@/app/lib/validation';

/**
 * GET /api/organizations/[orgId] — Get single organization details
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

  // Super admin can see everything
  if (isSuperAdmin(session.user.role)) {
    return NextResponse.json({ organization: org });
  }

  // Otherwise must be a member
  const membership = getMembership(session.user.id, orgId);
  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({ organization: org });
}

/**
 * PATCH /api/organizations/[orgId] — Update organization settings
 * Accessible by: super_admin OR org admin
 * Body: { name?, status?, settings?: { description?, logoUrl? } }
 */
export async function PATCH(
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

  const body = await req.json();

  // ── Input validation ──
  const parsed = parseBody(body, updateOrgSchema);
  if (parsed.error) return NextResponse.json(parsed.error, { status: 400 });
  const { name, status, settings } = parsed.data;

  // Check permissions: super_admin or org admin
  if (!isSuperAdmin(session.user.role)) {
    const membership = getMembership(session.user.id, orgId);
    if (!membership || membership.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Org admins can only update settings, not status
    if (status) {
      return NextResponse.json(
        { error: 'Only super_admin can change organization status' },
        { status: 403 },
      );
    }
  }

  const result = updateOrganization(orgId, {
    name,
    status,
    settings,
  });

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ organization: result.org });
}
