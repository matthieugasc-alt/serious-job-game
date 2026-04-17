import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/app/lib/auth';
import { isAdminRole } from '@/app/lib/permissions';
import {
  getAllScenarioConfigs,
  saveScenarioConfig,
  ScenarioConfig,
} from '@/app/lib/scenarioConfig';
import { parseBody, scenarioConfigSchema } from '@/app/lib/validation';

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
    if (!isAdminRole(user.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions - admin only' },
        { status: 403 },
      );
    }

    // Parse & validate request body
    const body = await request.json();

    // ── Input validation ──
    const parsed = parseBody(body, scenarioConfigSchema);
    if (parsed.error) return NextResponse.json(parsed.error, { status: 400 });

    // Build config object
    const config: ScenarioConfig = {
      scenarioId: parsed.data.scenarioId,
      adminLocked: parsed.data.adminLocked,
      lockMessage: parsed.data.lockMessage || undefined,
      prerequisites: parsed.data.prerequisites || undefined,
      category: parsed.data.category || undefined,
      order: parsed.data.order,
      featured: parsed.data.featured,
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
