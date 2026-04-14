import {
  loadScenario,
  scenarioExists,
  isTeaserScenario,
} from "../../../lib/scenarios";

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
    return Response.json(scenario);
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
