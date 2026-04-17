/**
 * /api/studio/[studioId]/validate — Validate studio scenario without compiling to disk
 *
 * POST: Compile and validate, return validation results without writing files
 */

export const runtime = "nodejs";

import {
  readFileSync,
  existsSync,
} from "fs";
import { join } from "path";
import {
  compileScenario,
  validateScenario,
  StudioScenario,
} from "@/app/lib/studioCompiler";
import { requireAuth } from "@/app/lib/auth";

/**
 * POST /api/studio/[studioId]/validate
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
          valid: false,
          compilationErrors: compiledResult.errors || [
            "Compilation failed",
          ],
          validation: null,
        },
        { status: 400 }
      );
    }

    // Validate the compiled scenario
    const validation = validateScenario(compiledResult.data);

    return Response.json({
      valid: validation.valid,
      validation,
    });
  } catch (error: any) {
    console.error(`Error validating studio ${studioId}:`, error);
    return Response.json(
      {
        valid: false,
        error: error?.message || "Failed to validate studio scenario",
      },
      { status: 500 }
    );
  }
}
