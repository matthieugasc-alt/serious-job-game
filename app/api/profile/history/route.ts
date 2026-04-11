import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/app/lib/auth';
import { getRecordsForUser } from '@/app/lib/gameRecords';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    // Extract token from Authorization header
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    // Validate session
    const result = validateSession(token);
    if (!result) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    const { user } = result;

    // Get game records for user
    const records = getRecordsForUser(user.id);

    return NextResponse.json({ records }, { status: 200 });
  } catch (error) {
    console.error('Failed to retrieve game history:', error);
    return NextResponse.json({ error: 'Failed to retrieve game history' }, { status: 500 });
  }
}
