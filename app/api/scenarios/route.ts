import { listScenarios } from "../../lib/scenarios";

export async function GET() {
  try {
    const scenarios = listScenarios();
    return Response.json({ scenarios });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
