import { loadPrompt, scenarioExists } from "../../../../../lib/scenarios";

export async function GET(
  req: Request,
  {
    params,
  }: { params: Promise<{ scenarioId: string; actorId: string }> }
) {
  const { scenarioId, actorId } = await params;

  if (!scenarioExists(scenarioId)) {
    return Response.json({ error: "Scenario not found" }, { status: 404 });
  }

  try {
    const prompt = loadPrompt(scenarioId, `${actorId}.md`);
    if (!prompt) {
      return Response.json({ error: "Prompt not found" }, { status: 404 });
    }
    return Response.json({ prompt });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
