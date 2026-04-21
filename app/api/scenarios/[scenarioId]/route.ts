import {
  loadScenario,
  scenarioExists,
  isTeaserScenario,
} from "../../../lib/scenarios";
import * as fs from "fs";
import * as path from "path";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ scenarioId: string }> }
) {
  const { scenarioId } = await params;

  // Teaser drafts are visible in the list but not playable.
  if (isTeaserScenario(scenarioId)) {
    return Response.json(
      {
        error: "Scenario not playable (teaser)",
        code: "teaser_not_playable",
      },
      { status: 423 }
    );
  }

  if (!scenarioExists(scenarioId)) {
    return Response.json({ error: "Scenario not found" }, { status: 404 });
  }

  try {
    const scenario = loadScenario(scenarioId);

    // ── Inject document content from .md files ──
    // Documents have file_path (e.g. "documents/cv_sofia.md") relative to scenario dir.
    // We read them and inject `content` so the front-end can display them.
    if (scenario.resources?.documents) {
      const scenarioDir = path.join(process.cwd(), "scenarios", scenarioId);
      for (const doc of scenario.resources.documents) {
        if (doc.file_path && !doc.content) {
          try {
            const docPath = path.join(scenarioDir, doc.file_path);
            if (fs.existsSync(docPath)) {
              doc.content = fs.readFileSync(docPath, "utf-8");
            }
          } catch {
            // Non-blocking: document stays without content
          }
        }
      }
    }

    return Response.json(scenario);
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
