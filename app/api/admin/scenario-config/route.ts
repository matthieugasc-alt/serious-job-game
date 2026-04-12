import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/app/lib/auth';
import {
  getAllScenarioConfigs,
  saveScenarioConfig,
  ScenarioConfig,
} from '@/app/lib/scenarioConfig';

export const runtime = 'nodejs';

export async function GET() {
  try {
    // GET is publicly accessible — players need to see locked/prerequisite info
    const configs = getAllScenarioConfigs();

    return NextResponse.json({ configs }, {
      status: 200,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    console.error('Failed to retrieve scenario configs:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve scenario configs' },
      { status: 500 },
    );
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

    // Check admin role
    if (user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Insufficient permissions - admin only' },
        { status: 403 },
      );
    }

    // Parse request body
    const body = await request.json();

    // Validate required fields
    if (!body.scenarioId) {
      return NextResponse.json(
        { error: 'Missing required field: scenarioId' },
        { status: 400 },
      );
    }

    if (typeof body.adminLocked !== 'boolean') {
      return NextResponse.json(
        { error: 'Missing required field: adminLocked (must be boolean)' },
        { status: 400 },
      );
    }

    // Build config object
    const config: ScenarioConfig = {
      scenarioId: body.scenarioId,
      adminLocked: body.adminLocked,
      lockMessage: body.lockMessage || undefined,
      prerequisites: Array.isArray(body.prerequisites) ? body.prerequisites : undefined,
      category: body.category || undefined,
      order: typeof body.order === 'number' ? body.order : undefined,
      featured: typeof body.featured === 'boolean' ? body.featured : undefined,
    };

    // Save scenario config
    saveScenarioConfig(config);

    return NextResponse.json(
      { config, message: 'Scenario config saved successfully' },
      { status: 200 },
    );
  } catch (error) {
    console.error('Failed to save scenario config:', error);
    return NextResponse.json({ error: 'Failed to save scenario config' }, { status: 500 });
  }
}
