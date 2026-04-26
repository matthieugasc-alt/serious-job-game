import { loadPrompt, loadScenario, scenarioExists } from "../../../../../lib/scenarios";

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
    // Look up the actor's prompt_file from the scenario config
    let promptFile = `${actorId}.md`;
    const scenario = loadScenario(scenarioId);
    if (scenario?.actors) {
      const actor = scenario.actors.find((a: any) => a.actor_id === actorId);
      if (actor?.prompt_file) {
        // prompt_file is like "prompts/contact_etablissement.md" — extract just the filename
        const parts = actor.prompt_file.split("/");
        promptFile = parts[parts.length - 1];
      }
    }

    const prompt = loadPrompt(scenarioId, promptFile);
    if (!prompt) {
      return Response.json({ error: "Prompt not found" }, { status: 404 });
    }
    return Response.json({ prompt });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
