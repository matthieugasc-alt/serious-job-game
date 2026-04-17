import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/app/lib/auth';
import { getOrganization, getMembership } from '@/app/lib/organizations';
import {
  assignScenario,
  batchAssign,
  removeAssignment,
  getOrgAssignments,
  getUserAssignments,
  getOrgCompletionStats,
} from '@/app/lib/assignments';
import { isSuperAdmin, canDo } from '@/app/lib/permissions';
import type { OrgMemberRole } from '@/app/lib/permissions';
import type { AssignmentType } from '@/app/lib/assignments';
import { parseBody, createAssignmentSchema } from '@/app/lib/validation';

/**
 * GET /api/organizations/[orgId]/assignments — List assignments
 * Query params: ?userId=xxx (filter by user), ?stats=true (include completion stats)
 * Accessible by: super_admin, org admin, or member (own assignments only)
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

  const userIdFilter = req.nextUrl.searchParams.get('userId');
  const includeStats = req.nextUrl.searchParams.get('stats') === 'true';

  // Check permissions
  const isSuper = isSuperAdmin(session.user.role);
  const membership = getMembership(session.user.id, orgId);

  if (!isSuper && !membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const isOrgAdmin =
    isSuper ||
    (membership &&
      canDo(session.user.role, 'org:view_results', {
        memberRole: membership.role as OrgMemberRole,
        orgType: org.type,
        coachLevel: session.user.coachProfile?.level,
      }));

  // Members can only see their own assignments
  if (!isOrgAdmin) {
    const assignments = getUserAssignments(session.user.id, orgId);
    return NextResponse.json({ assignments });
  }

  // Admin view
  if (userIdFilter) {
    const assignments = getUserAssignments(userIdFilter, orgId);
    return NextResponse.json({ assignments });
  }

  const assignments = getOrgAssignments(orgId);
  const response: Record<string, unknown> = { assignments };

  if (includeStats) {
    response.stats = getOrgCompletionStats(orgId);
  }

  return NextResponse.json(response);
}

/**
 * POST /api/organizations/[orgId]/assignments — Create assignment(s)
 * Body: { scenarioId, userId, type } OR { scenarioIds, userIds, type } for batch
 * Accessible by: super_admin OR org admin with assign_scenarios permission
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

  // Check permission
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
    if (!canDo(session.user.role, 'org:assign_scenarios', orgContext)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const body = await req.json();

  // ── Input validation ──
  const parsed = parseBody(body, createAssignmentSchema);
  if (parsed.error) return NextResponse.json(parsed.error, { status: 400 });

  const { scenarioId, userId, scenarioIds, userIds, type } = parsed.data;

  // Batch mode
  if (scenarioIds && userIds) {
    const result = batchAssign({
      scenarioIds,
      userIds,
      organizationId: orgId,
      assignedBy: session.user.id,
      type: type as AssignmentType,
    });
    return NextResponse.json(result, { status: 201 });
  }

  // Single mode
  if (!scenarioId || !userId) {
    return NextResponse.json(
      { error: 'Provide scenarioId+userId or scenarioIds+userIds for batch' },
      { status: 400 },
    );
  }

  const result = assignScenario({
    scenarioId,
    userId,
    organizationId: orgId,
    assignedBy: session.user.id,
    type: type as AssignmentType,
  });

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ assignment: result.assignment }, { status: 201 });
}

/**
 * DELETE /api/organizations/[orgId]/assignments — Remove an assignment
 * Query param: ?assignmentId=xxx
 * Accessible by: super_admin OR org admin with assign_scenarios permission
 */
export async function DELETE(
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
    const orgContext = {
      memberRole: membership.role as OrgMemberRole,
      orgType: org.type,
      coachLevel: session.user.coachProfile?.level,
    };
    if (!canDo(session.user.role, 'org:assign_scenarios', orgContext)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const assignmentId = req.nextUrl.searchParams.get('assignmentId');
  if (!assignmentId) {
    return NextResponse.json({ error: 'assignmentId query param required' }, { status: 400 });
  }

  const result = removeAssignment(assignmentId);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
