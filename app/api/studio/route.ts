/**
 * /api/studio — List all studio scenarios and create new ones
 *
 * GET: List all scenarios from data/studio/ directory
 * POST: Create a new scenario with initial structure
 */

export const runtime = "nodejs";

import {
  readdirSync,
  readFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from "fs";
import { join } from "path";

interface StudioScenario {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
}

interface CreateScenarioRequest {
  title: string;
  tags?: string[];
}

/**
 * Convert title to kebab-case ID
 */
function generateScenarioId(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * GET /api/studio — List all studio scenarios
 */
export async function GET() {
  try {
    const studioDir = join(process.cwd(), "data", "studio");

    // Create data/studio if it doesn't exist
    if (!existsSync(studioDir)) {
      mkdirSync(studioDir, { recursive: true });
      return Response.json({ scenarios: [] });
    }

    const entries = readdirSync(studioDir, { withFileTypes: true });
    const scenarios: StudioScenario[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const studioJsonPath = join(studioDir, entry.name, "studio.json");
      if (!existsSync(studioJsonPath)) continue;

      try {
        const content = readFileSync(studioJsonPath, "utf-8");
        const data = JSON.parse(content);

        scenarios.push({
          id: data.id || entry.name,
          title: data.title || "Untitled",
          status: data.status || "draft",
          updatedAt: data.updatedAt || new Date().toISOString(),
        });
      } catch (e) {
        // Skip malformed studio.json files
        console.error(`Error reading studio.json in ${entry.name}:`, e);
      }
    }

    // Sort by updatedAt descending
    scenarios.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return Response.json({ scenarios });
  } catch (error: any) {
    console.error("Error listing studios:", error);
    return Response.json(
      { error: error?.message || "Failed to list studios" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/studio — Create a new studio scenario
 */
export async function POST(request: Request) {
  try {
    const body: CreateScenarioRequest = await request.json();

    if (!body.title || typeof body.title !== "string") {
      return Response.json(
        { error: "Missing or invalid title" },
        { status: 400 }
      );
    }

    const scenarioId = generateScenarioId(body.title);
    const now = new Date().toISOString();

    // Create the studio scenario template
    const studioScenario = {
      id: scenarioId,
      title: body.title,
      subtitle: "",
      description: "",
      jobFamily: "",
      difficulty: "junior" as const,
      durationMin: 30,
      tags: body.tags || [],
      locale: "fr-FR",
      context: "",
      mission: "",
      initialSituation: "",
      trigger: "",
      backgroundFact: "",
      scenarioStart: new Date().toISOString(),
      simSpeedMultiplier: 1,
      pedagogicalGoals: [],
      competencies: [],
      introCards: [],
      actors: [],
      channels: [],
      phases: [],
      documents: [],
      endings: [],
      defaultEndingId: "",
      status: "draft",
      adminLocked: true,
      createdAt: now,
      updatedAt: now,
    };

    // Create directory structure
    const studioDir = join(process.cwd(), "data", "studio", scenarioId);
    mkdirSync(studioDir, { recursive: true });

    const assetsDir = join(studioDir, "assets");
    mkdirSync(assetsDir, { recursive: true });

    const promptsDir = join(studioDir, "prompts");
    mkdirSync(promptsDir, { recursive: true });

    // Write studio.json
    const studioJsonPath = join(studioDir, "studio.json");
    writeFileSync(
      studioJsonPath,
      JSON.stringify(studioScenario, null, 2),
      "utf-8"
    );

    return Response.json(
      {
        success: true,
        scenario: studioScenario,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error creating studio scenario:", error);
    return Response.json(
      { error: error?.message || "Failed to create studio scenario" },
      { status: 500 }
    );
  }
}
