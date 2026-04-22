import { NextRequest, NextResponse } from 'next/server';
import { validateSession, updateFounderAccess } from '@/app/lib/auth';
import { isAdminRole } from '@/app/lib/permissions';
import type { GlobalRole } from '@/app/lib/permissions';

/**
 * PATCH /api/auth/users/founder-access
 * Body: { userId: string, founderAccess: boolean }
 * Admin/super_admin only.
 */
export async function PATCH(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const session = validateSession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  if (!isAdminRole(session.user.role as GlobalRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { userId, founderAccess } = body;

    if (!userId || typeof founderAccess !== 'boolean') {
      return NextResponse.json({ error: 'userId (string) and founderAccess (boolean) required' }, { status: 400 });
    }

    const result = updateFounderAccess(userId, founderAccess);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
