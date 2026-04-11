/** ═══════════════════════════════════════════════════════════════════
 *  /api/admin/save-scenario — Save a scenario JSON to disk
 *
 *  POST body: { scenario: {...} }
 *  Creates a folder in /scenarios/<scenario_id>/ and writes scenario.json
 * ═══════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";

import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const scenario = body.scenario;

    if (!scenario || !scenario.scenario_id) {
      return Response.json(
        { error: "Missing scenario or scenario_id" },
        { status: 400 }
      );
    }

    // Sanitize scenario_id for folder name
    const folderId = scenario.scenario_id
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_")
      .slice(0, 60);

    const scenarioDir = join(process.cwd(), "scenarios", folderId);
    await mkdir(scenarioDir, { recursive: true });

    const scenarioPath = join(scenarioDir, "scenario.json");
    await writeFile(scenarioPath, JSON.stringify(scenario, null, 2), "utf-8");

    return Response.json({
      success: true,
      path: `scenarios/${folderId}/scenario.json`,
      scenarioId: folderId,
    });
  } catch (error: any) {
    console.error("Save scenario error:", error);
    return Response.json(
      { error: error?.message || "Erreur lors de la sauvegarde" },
      { status: 500 }
    );
  }
}
