import { NextRequest, NextResponse } from 'next/server';
import { validateSession, getUserById } from '@/app/lib/auth';
import { getUserMemberships } from '@/app/lib/organizations';
import { buildCapabilities } from '@/app/lib/permissions';
import type { GlobalRole, OrgMemberRole } from '@/app/lib/permissions';

/**
 * GET /api/capabilities — Get current user's capabilities
 * Returns what the user can do globally + per-org.
 * Used by frontend to show/hide UI elements.
 */
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const session = validateSession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const memberships = getUserMemberships(session.user.id);
  const user = getUserById(session.user.id);

  const capabilities = buildCapabilities(
    session.user.role as GlobalRole,
    memberships.map((m) => ({
      organizationId: m.organizationId,
      memberRole: m.role as OrgMemberRole,
      orgType: m.org.type,
      coachLevel: user?.coachProfile?.level,
      status: m.status,
    })),
  );

  return NextResponse.json({
    user: session.user,
    capabilities,
    memberships: memberships.map((m) => ({
      organizationId: m.organizationId,
      organizationName: m.org.name,
      orgType: m.org.type,
      role: m.role,
      status: m.status,
    })),
  });
}
