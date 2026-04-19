import { NextResponse } from 'next/server';
import { loadRules } from '@/app/lib/founder';

/**
 * GET /api/founder/rules — Returns founder rules (pitch, scenarios, initialState)
 * Public endpoint — no auth required (pitch is non-sensitive).
 */
export async function GET() {
  try {
    const rules = loadRules();
    return NextResponse.json(rules);
  } catch {
    return NextResponse.json({ error: 'Failed to load rules' }, { status: 500 });
  }
}
