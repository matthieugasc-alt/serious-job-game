/**
 * GET /api/admin/scenario-diff/[scenarioId]?from=X.Y.Z&to=X.Y.Z
 * ═══════════════════════════════════════════════════════════════════
 *
 * VS3 — retourne les versions archivées d'un scenario + le diff des
 * critères entre 2 versions.
 *
 * super_admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/app/lib/auth";
import { listScenarioVersions, readScenarioVersion } from "@/app/lib/scenarioVersioning";

interface CriterionShape {
  id: string;
  description?: string;
  severity?: string;
  competencies?: string[];
  error_type?: string;
}

function extractCriteria(scenario: unknown): Record<string, CriterionShape[]> {
  // per phase, list criteria
  const s = scenario as { phases?: Array<{ phase_id?: string; evaluation?: { observed_criteria?: any[] } }> };
  const out: Record<string, CriterionShape[]> = {};
  for (const p of s?.phases ?? []) {
    const pid = p.phase_id;
    if (!pid) continue;
    const criteria = p.evaluation?.observed_criteria;
    if (!Array.isArray(criteria)) continue;
    out[pid] = criteria.map((c: any) => ({
      id: c.id,
      description: c.description,
      severity: c.severity,
      competencies: c.competencies,
      error_type: c.error_type,
    }));
  }
  return out;
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
  const versions = listScenarioVersions(scenarioId);
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ versions });
  }

  const fromScenario = readScenarioVersion(scenarioId, from);
  const toScenario = readScenarioVersion(scenarioId, to);
  if (!fromScenario || !toScenario) {
    return NextResponse.json({ error: "Version not archived" }, { status: 404 });
  }

  const fromCriteria = extractCriteria(fromScenario);
  const toCriteria = extractCriteria(toScenario);

  const allPhases = new Set([...Object.keys(fromCriteria), ...Object.keys(toCriteria)]);
  const diff: Array<{
    phaseId: string;
    added: CriterionShape[];
    removed: CriterionShape[];
    modified: Array<{ id: string; before: CriterionShape; after: CriterionShape; changes: string[] }>;
  }> = [];

  for (const phaseId of allPhases) {
    const before = fromCriteria[phaseId] ?? [];
    const after = toCriteria[phaseId] ?? [];
    const beforeMap = new Map(before.map((c) => [c.id, c]));
    const afterMap = new Map(after.map((c) => [c.id, c]));

    const added = after.filter((c) => !beforeMap.has(c.id));
    const removed = before.filter((c) => !afterMap.has(c.id));
    const modified: typeof diff[0]["modified"] = [];
    for (const [id, b] of beforeMap) {
      const a = afterMap.get(id);
      if (!a) continue;
      const changes: string[] = [];
      if (b.description !== a.description) changes.push("description");
      if (b.severity !== a.severity) changes.push(`severity: ${b.severity ?? "(defaut)"} → ${a.severity ?? "(defaut)"}`);
      if (b.error_type !== a.error_type) changes.push(`error_type: ${b.error_type ?? "(vide)"} → ${a.error_type ?? "(vide)"}`);
      if (JSON.stringify(b.competencies ?? []) !== JSON.stringify(a.competencies ?? [])) {
        changes.push("competencies");
      }
      if (changes.length > 0) modified.push({ id, before: b, after: a, changes });
    }
    if (added.length > 0 || removed.length > 0 || modified.length > 0) {
      diff.push({ phaseId, added, removed, modified });
    }
  }

  return NextResponse.json({ versions, from, to, diff });
}
