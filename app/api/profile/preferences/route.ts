import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/app/lib/auth';
import { getPreferences, savePreferences, UserPreferences } from '@/app/lib/userPreferences';

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

    // Get user preferences
    const preferences = getPreferences(user.id);

    return NextResponse.json({ preferences }, { status: 200 });
  } catch (error) {
    console.error('Failed to retrieve preferences:', error);
    return NextResponse.json({ error: 'Failed to retrieve preferences' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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

    // Parse request body
    const body = await request.json();

    // Validate preferences structure
    const preferences: UserPreferences = {
      selectedCategories: Array.isArray(body.selectedCategories) ? body.selectedCategories : [],
      displayName: body.displayName || undefined,
    };

    // Save preferences
    savePreferences(user.id, preferences);

    return NextResponse.json(
      { preferences, message: 'Preferences saved successfully' },
      { status: 200 },
    );
  } catch (error) {
    console.error('Failed to save preferences:', error);
    return NextResponse.json({ error: 'Failed to save preferences' }, { status: 500 });
  }
}
