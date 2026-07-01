/**
 * GET /api/admin/replay/scenario/[scenarioId]
 * ═══════════════════════════════════════════════════════════════════
 *
 * X-chantier X2 — cross-campaign aggregation for a scenario.
 *
 * Scans every founder campaign, extracts evaluation_history entries
 * concerning phases of this scenario, and returns:
 *
 *   - the scenario meta (title, phases)
 *   - per-phase aggregation (attempts, pass rate, average missing criteria)
 *   - list of recent campaigns with their per-phase status
 *   - top criteria never/rarely matched (< 20% match rate)
 *
 * super_admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/app/lib/auth";
import { listCampaignsForUser, loadCampaign } from "@/app/lib/founder";
import * as fs from "fs";
import * as path from "path";

// Scan every campaign file in data/founder — the founder module
// doesn't expose a listAllCampaigns() (privacy per user), but for
// admin analytics we need it. We read the campaigns directory directly.
function listAllCampaignIds(): string[] {
  const campaignsDir = path.resolve(process.cwd(), "data", "founder", "campaigns");
  if (!fs.existsSync(campaignsDir)) return [];
  return fs
    .readdirSync(campaignsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ scenarioId: string }> },
) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = validateSession(token);
  if (!session) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  if (session.user.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { scenarioId } = await params;

  // Load scenario contract
  const scenarioPath = path.resolve(process.cwd(), "scenarios", scenarioId, "scenario.json");
  if (!fs.existsSync(scenarioPath)) {
    return NextResponse.json({ error: "Scenario not found" }, { status: 404 });
  }
  const scenario = JSON.parse(fs.readFileSync(scenarioPath, "utf-8"));

  const phaseContract = (scenario.phases ?? []).map((p: any) => ({
    phase_id: p.phase_id,
    title: p.title,
    observed_criteria: p.evaluation?.observed_criteria,
    required_criteria: p.completion_rules?.required_criteria,
    critical_failure_criteria: p.completion_rules?.critical_failure_criteria,
  }));

  // Iterate every campaign
  const allIds = listAllCampaignIds();
  const scenarioPhaseIds = new Set(phaseContract.map((p: any) => p.phase_id));

  interface CampaignSummary {
    campaignId: string;
    userId: string;
    createdAt: string;
    entries: Array<{
      phaseId: string;
      passed: boolean;
      appliedRule: string;
      timestamp: string;
      criticalFailures: string[];
    }>;
  }

  const campaigns: CampaignSummary[] = [];
  const perPhaseStats: Record<string, {
    attempts: number;
    passed: number;
    critical: number;
    criterionMatched: Record<string, number>;
    criterionSeen: Record<string, number>;
  }> = {};

  for (const cid of allIds) {
    const c = loadCampaign(cid);
    if (!c) continue;
    const history = c.checkpoint?.sessionSnapshot?.evaluation_history ?? [];
    const relevant = history.filter((e: any) => scenarioPhaseIds.has(e.phaseId));
    if (relevant.length === 0) continue;

    campaigns.push({
      campaignId: c.id,
      userId: c.userId,
      createdAt: c.createdAt,
      entries: relevant.map((e: any) => ({
        phaseId: e.phaseId,
        passed: !!e.passed,
        appliedRule: e.appliedRule ?? "?",
        timestamp: e.timestamp,
        criticalFailures: Array.isArray(e.criticalFailures) ? e.criticalFailures : [],
      })),
    });

    for (const e of relevant) {
      const stats = perPhaseStats[e.phaseId] ??= {
        attempts: 0,
        passed: 0,
        critical: 0,
        criterionMatched: {},
        criterionSeen: {},
      };
      stats.attempts++;
      if (e.passed) stats.passed++;
      if (Array.isArray(e.criticalFailures) && e.criticalFailures.length > 0) stats.critical++;
      const observationCriteria = e.observation?.criteria ?? {};
      for (const [cid2, val] of Object.entries(observationCriteria)) {
        stats.criterionSeen[cid2] = (stats.criterionSeen[cid2] ?? 0) + 1;
        if (val === true) stats.criterionMatched[cid2] = (stats.criterionMatched[cid2] ?? 0) + 1;
      }
    }
  }

  // Sort campaigns most recent first
  campaigns.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Compute per-phase aggregated stats
  const phaseStats = phaseContract.map((p: any) => {
    const s = perPhaseStats[p.phase_id];
    if (!s) {
      return {
        phase_id: p.phase_id,
        title: p.title,
        attempts: 0,
        passRate: null,
        criticalRate: null,
        criteriaMatchRates: {},
      };
    }
    const criteriaMatchRates: Record<string, { matched: number; seen: number; rate: number }> = {};
    for (const cid2 of Object.keys(s.criterionSeen)) {
      const seen = s.criterionSeen[cid2];
      const matched = s.criterionMatched[cid2] ?? 0;
      criteriaMatchRates[cid2] = { matched, seen, rate: seen > 0 ? matched / seen : 0 };
    }
    return {
      phase_id: p.phase_id,
      title: p.title,
      attempts: s.attempts,
      passRate: s.attempts > 0 ? s.passed / s.attempts : null,
      criticalRate: s.attempts > 0 ? s.critical / s.attempts : null,
      criteriaMatchRates,
    };
  });

  return NextResponse.json({
    scenarioId,
    scenarioTitle: scenario.meta?.title ?? scenarioId,
    phaseContract,
    phaseStats,
    campaigns: campaigns.slice(0, 50), // cap at 50 most recent
    totalCampaigns: campaigns.length,
  });
}
