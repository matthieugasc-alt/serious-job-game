/**
 * GET /api/admin/replay/[campaignId]
 * ═══════════════════════════════════════════════════════════════════
 *
 * E-chantier E5 — admin-only replay endpoint.
 *
 * Returns everything an admin needs to audit "pourquoi cette phase
 * est-elle validée ?" for a completed OR in-flight campaign:
 *
 *   - campaign.sessionSnapshot.evaluation_history (E4 audit trail)
 *   - scenarios[each].phases[each].evaluation.observed_criteria
 *     (so the UI can cross-reference expected vs observed criteria)
 *   - campaign meta (userId, status, current scenario) for header
 *
 * Access is gated to super_admin only — regular users cannot replay
 * anyone else's game (privacy).
 */

import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/app/lib/auth";
import { loadCampaign, loadRules } from "@/app/lib/founder";
import * as fs from "fs";
import * as path from "path";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = validateSession(token);
  if (!session) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

  // Access gate: super_admin only. Regular users can't view other
  // people's simulations. If we later want to allow users to review
  // their own game, we can relax this to `session.user.id === campaign.userId`.
  if (session.user.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { campaignId } = await params;
  const campaign = loadCampaign(campaignId);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Load per-scenario phase evaluation contracts so the UI can render
  // expected vs observed criteria side-by-side.
  const rules = loadRules();
  const phaseContracts: Record<
    string,
    Array<{
      phase_id: string;
      title: string;
      observed_criteria?: Array<{ id: string; description: string; expected?: boolean }>;
      required_criteria?: string[];
      min_criteria_count?: number;
    }>
  > = {};

  const scenariosDir = path.resolve(process.cwd(), "scenarios");
  for (const scenarioRule of Object.values(rules.scenarios ?? {})) {
    const scenarioId = scenarioRule.scenarioId;
    const scenarioJsonPath = path.join(scenariosDir, scenarioId, "scenario.json");
    try {
      const raw = fs.readFileSync(scenarioJsonPath, "utf-8");
      const json = JSON.parse(raw);
      phaseContracts[scenarioId] = (json.phases ?? []).map((p: any) => ({
        phase_id: p.phase_id,
        title: p.title,
        observed_criteria: p.evaluation?.observed_criteria,
        required_criteria: p.completion_rules?.required_criteria,
        min_criteria_count: p.completion_rules?.min_criteria_count,
      }));
    } catch {
      // scenario absent or malformed — skip silently
    }
  }

  return NextResponse.json({
    campaign: {
      id: campaign.id,
      userId: campaign.userId,
      status: campaign.status,
      createdAt: campaign.createdAt,
      currentScenarioIndex: campaign.currentScenarioIndex,
      pendingScenarioId: campaign.pendingScenarioId,
    },
    evaluation_history: campaign.checkpoint?.sessionSnapshot?.evaluation_history ?? [],
    phaseContracts,
  });
}
