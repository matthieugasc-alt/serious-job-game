/**
 * /api/studio/[studioId]/compile — Compile studio scenario to runtime JSON
 *
 * POST: Compile editorial data to runtime format, validate, and write to scenarios/
 */

export const runtime = "nodejs";

import {
  readFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  statSync,
  copyFileSync,
} from "fs";
import { join } from "path";
import {
  compileScenario,
  validateScenario,
  StudioScenario,
} from "@/app/lib/studioCompiler";
import { requireAuth } from "@/app/lib/auth";

/**
 * POST /api/studio/[studioId]/compile
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ studioId: string }> }
) {
  const { studioId } = await params;

  try {
    // ── Auth guard ──
    const auth = requireAuth(request);
    if (auth.error) return auth.error;

    // Read studio.json
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

    const studioContent = readFileSync(studioJsonPath, "utf-8");
    const studioData: StudioScenario = JSON.parse(studioContent);

    // Compile the scenario
    const compiledResult = compileScenario(studioData);

    if (!compiledResult.success || !compiledResult.data) {
      return Response.json(
        {
          success: false,
          errors: compiledResult.errors || ["Compilation failed"],
        },
        { status: 400 }
      );
    }

    // Validate the compiled scenario
    const validation = validateScenario(compiledResult.data);

    if (!validation.valid) {
      return Response.json(
        {
          success: false,
          validation,
        },
        { status: 400 }
      );
    }

    // Create output directories
    const scenariosDir = join(process.cwd(), "scenarios", studioId);
    mkdirSync(scenariosDir, { recursive: true });

    const promptsOutDir = join(scenariosDir, "prompts");
    mkdirSync(promptsOutDir, { recursive: true });

    // Write compiled scenario.json
    const scenarioJsonPath = join(scenariosDir, "scenario.json");
    writeFileSync(
      scenarioJsonPath,
      JSON.stringify(compiledResult.data, null, 2),
      "utf-8"
    );

    // Copy prompt files from data/studio/[studioId]/prompts/ to scenarios/[studioId]/prompts/
    const promptsSourceDir = join(
      process.cwd(),
      "data",
      "studio",
      studioId,
      "prompts"
    );

    if (existsSync(promptsSourceDir)) {
      const promptFiles = readdirSync(promptsSourceDir);
      for (const file of promptFiles) {
        const sourceFile = join(promptsSourceDir, file);
        const destFile = join(promptsOutDir, file);

        if (statSync(sourceFile).isFile()) {
          copyFileSync(sourceFile, destFile);
        }
      }
    }

    return Response.json(
      {
        success: true,
        compiled: compiledResult.data,
        validation,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error(`Error compiling studio ${studioId}:`, error);
    return Response.json(
      { error: error?.message || "Failed to compile studio scenario" },
      { status: 500 }
    );
  }
}
