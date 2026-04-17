/**
 * /api/studio/[studioId] — Get, update, or delete a specific studio scenario
 *
 * GET: Read studio.json for the scenario
 * PUT: Update studio.json with new data
 * DELETE: Delete the entire studio folder
 */

export const runtime = "nodejs";

import {
  readFileSync,
  existsSync,
  writeFileSync,
  rmSync,
} from "fs";
import { join } from "path";
import { requireAuth } from "@/app/lib/auth";

/**
 * GET /api/studio/[studioId]
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ studioId: string }> }
) {
  const { studioId } = await params;

  try {
    // ── Auth guard ──
    const auth = requireAuth(req);
    if (auth.error) return auth.error;

    const studioJsonPath = join(
      process.cwd(),
      "data",
      "studio",
      studioId,
      "studio.json"
    );

    if (!existsSync(studioJsonPath)) {
      return Response.json(
        { error: "Studio scenario not found" },
        { status: 404 }
      );
    }

    const content = readFileSync(studioJsonPath, "utf-8");
    const scenario = JSON.parse(content);

    return Response.json(scenario);
  } catch (error: any) {
    console.error(`Error reading studio ${studioId}:`, error);
    return Response.json(
      { error: error?.message || "Failed to read studio scenario" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/studio/[studioId] — Update studio scenario
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ studioId: string }> }
) {
  const { studioId } = await params;

  try {
    // ── Auth guard ──
    const auth = requireAuth(request);
    if (auth.error) return auth.error;

    const studioJsonPath = join(
      process.cwd(),
      "data",
      "studio",
      studioId,
      "studio.json"
    );

    if (!existsSync(studioJsonPath)) {
      return Response.json(
        { error: "Studio scenario not found" },
        { status: 404 }
      );
    }

    const body = await request.json();

    // Validate body is an object
    if (!body || typeof body !== "object") {
      return Response.json(
        { error: "Request body must be a valid object" },
        { status: 400 }
      );
    }

    // Read current scenario to merge
    const currentContent = readFileSync(studioJsonPath, "utf-8");
    const currentScenario = JSON.parse(currentContent);

    // Merge with updates and set updatedAt
    const updatedScenario = {
      ...currentScenario,
      ...body,
      id: studioId, // Preserve ID
      updatedAt: new Date().toISOString(),
    };

    // Write updated scenario
    writeFileSync(
      studioJsonPath,
      JSON.stringify(updatedScenario, null, 2),
      "utf-8"
    );

    return Response.json(updatedScenario);
  } catch (error: any) {
    console.error(`Error updating studio ${studioId}:`, error);
    return Response.json(
      { error: error?.message || "Failed to update studio scenario" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/studio/[studioId] — Delete studio scenario
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ studioId: string }> }
) {
  const { studioId } = await params;

  try {
    // ── Auth guard ──
    const auth = requireAuth(req);
    if (auth.error) return auth.error;

    const studioDir = join(process.cwd(), "data", "studio", studioId);

    if (!existsSync(studioDir)) {
      return Response.json(
        { error: "Studio scenario not found" },
        { status: 404 }
      );
    }

    // Recursively delete the directory
    rmSync(studioDir, { recursive: true, force: true });

    return Response.json({
      success: true,
      message: `Studio scenario "${studioId}" deleted`,
    });
  } catch (error: any) {
    console.error(`Error deleting studio ${studioId}:`, error);
    return Response.json(
      { error: error?.message || "Failed to delete studio scenario" },
      { status: 500 }
    );
  }
}
