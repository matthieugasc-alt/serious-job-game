import { NextRequest, NextResponse } from 'next/server';
import { validateSession, createManagedUser, getUserById } from '@/app/lib/auth';
import {
  getOrganization,
  getMembership,
  getOrgMembers,
  addMember,
} from '@/app/lib/organizations';
import { isSuperAdmin, canDo } from '@/app/lib/permissions';
import type { OrgMemberRole } from '@/app/lib/permissions';
import { parseBody, addMemberSchema } from '@/app/lib/validation';

/**
 * GET /api/organizations/[orgId]/members — List org members
 * Accessible by: super_admin OR org admin
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

  // Check permission
  if (!isSuperAdmin(session.user.role)) {
    const membership = getMembership(session.user.id, orgId);
    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    // Only admin can see full member list, members can see limited info
    const orgContext = {
      memberRole: membership.role as OrgMemberRole,
      orgType: org.type,
      coachLevel: session.user.coachProfile?.level,
    };
    if (!canDo(session.user.role, 'org:view_members', orgContext)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const members = getOrgMembers(orgId);

  // Enrich with user info
  const enriched = members.map((m) => {
    const user = getUserById(m.userId);
    return {
      ...m,
      user: user
        ? { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status }
        : null,
    };
  });

  return NextResponse.json({ members: enriched });
}

/**
 * POST /api/organizations/[orgId]/members — Add a member to the org
 * Two modes:
 *   1. { userId } — add existing user
 *   2. { email, name } — create managed user + add to org
 * Optional: { role } — defaults to 'member'
 */
export async function POST(
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

  // Check permission: super_admin or org admin with create_accounts
  if (!isSuperAdmin(session.user.role)) {
    const membership = getMembership(session.user.id, orgId);
    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const orgContext = {
      memberRole: membership.role as OrgMemberRole,
      orgType: org.type,
      coachLevel: session.user.coachProfile?.level,
    };
    if (!canDo(session.user.role, 'org:create_accounts', orgContext)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const body = await req.json();

  // ── Input validation ──
  const parsed = parseBody(body, addMemberSchema);
  if (parsed.error) return NextResponse.json(parsed.error, { status: 400 });

  const { userId, email, name, role } = parsed.data;

  let targetUserId = userId;
  let tempPassword: string | undefined;

  // Mode 2: create managed user
  if (!userId && email && name) {
    const result = createManagedUser({
      email,
      name,
      createdBy: session.user.id,
      role: 'user',
    });

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    targetUserId = result.user.id;
    tempPassword = result.tempPassword;
  }

  if (!targetUserId) {
    return NextResponse.json(
      { error: 'Provide userId (existing user) or email+name (create new user)' },
      { status: 400 },
    );
  }

  // Add to org
  const memberResult = addMember({
    userId: targetUserId,
    organizationId: orgId,
    role: (role as OrgMemberRole) || 'member',
    invitedBy: session.user.id,
  });

  if ('error' in memberResult) {
    return NextResponse.json({ error: memberResult.error }, { status: 400 });
  }

  const response: Record<string, unknown> = { membership: memberResult.membership };
  if (tempPassword) {
    response.tempPassword = tempPassword;
  }

  return NextResponse.json(response, { status: 201 });
}
