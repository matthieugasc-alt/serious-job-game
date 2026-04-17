import { NextRequest, NextResponse } from 'next/server';
import { validateSession, listUsers } from '@/app/lib/auth';
import { isAdminRole } from '@/app/lib/permissions';
import type { GlobalRole } from '@/app/lib/permissions';

/**
 * GET /api/auth/users — List all users (admin/super_admin only)
 */
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const session = validateSession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  if (!isAdminRole(session.user.role as GlobalRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const users = listUsers();
  return NextResponse.json({ users });
}
