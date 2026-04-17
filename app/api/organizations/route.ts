import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/app/lib/auth';
import { createOrganization, listOrganizations } from '@/app/lib/organizations';
import { isSuperAdmin } from '@/app/lib/permissions';
import type { OrgType } from '@/app/lib/permissions';
import { parseBody, createOrgSchema } from '@/app/lib/validation';

/**
 * GET /api/organizations — List all organizations (super_admin only)
 * Query params: ?type=enterprise|coach&status=active|suspended
 */
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const session = validateSession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  if (!isSuperAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const type = req.nextUrl.searchParams.get('type') as OrgType | null;
  const status = req.nextUrl.searchParams.get('status') || undefined;

  const orgs = listOrganizations({ type: type || undefined, status });
  return NextResponse.json({ organizations: orgs });
}

/**
 * POST /api/organizations — Create a new organization (super_admin only)
 * Body: { name, type, adminUserId, description? }
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const session = validateSession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  if (!isSuperAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();

  // ── Input validation ──
  const parsed = parseBody(body, createOrgSchema);
  if (parsed.error) return NextResponse.json(parsed.error, { status: 400 });

  const { name, type, adminUserId, settings } = parsed.data;

  const result = createOrganization({
    name,
    type: type as OrgType,
    adminUserId,
    description: settings?.description,
  });

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ organization: result.org }, { status: 201 });
}
