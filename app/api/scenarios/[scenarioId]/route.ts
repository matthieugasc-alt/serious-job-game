import { loadScenario, scenarioExists } from "../../../lib/scenarios";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ scenarioId: string }> }
) {
  const { scenarioId } = await params;

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
