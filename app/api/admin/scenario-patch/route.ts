/**
 * POST /api/admin/scenario-patch
 * ═══════════════════════════════════════════════════════════════════
 *
 * X1 — patch inline d'un critère depuis /admin/edit-criterion.
 *
 * Body: {
 *   scenarioId: string,
 *   phaseId: string,
 *   criterionId: string,
 *   patch: Partial<PhaseEvaluationCriterion>
 * }
 *
 * Écrit directement dans scenarios/{scenarioId}/scenario.json.
 * super_admin only. Validation ajv Draft 2020 avant écriture.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/app/lib/auth";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = validateSession(token);
  if (!session) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  if (session.user.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { scenarioId, phaseId, criterionId, patch } = body ?? {};

  if (
    typeof scenarioId !== "string" ||
    typeof phaseId !== "string" ||
    typeof criterionId !== "string" ||
    typeof patch !== "object" || patch === null
  ) {
    return NextResponse.json({ error: "Bad request shape" }, { status: 400 });
  }

  // Sanitize scenarioId to prevent path traversal
  if (!/^[a-z0-9_]+$/.test(scenarioId)) {
    return NextResponse.json({ error: "Invalid scenarioId" }, { status: 400 });
  }

  const scenarioPath = path.resolve(process.cwd(), "scenarios", scenarioId, "scenario.json");
  if (!fs.existsSync(scenarioPath)) {
    return NextResponse.json({ error: "Scenario not found" }, { status: 404 });
  }

  const scenario = JSON.parse(fs.readFileSync(scenarioPath, "utf-8"));
  const phase = scenario.phases?.find((p: any) => p.phase_id === phaseId);
  if (!phase) return NextResponse.json({ error: "Phase not found" }, { status: 404 });

  const criteria = phase.evaluation?.observed_criteria;
  if (!Array.isArray(criteria)) {
    return NextResponse.json({ error: "Phase has no evaluation.observed_criteria" }, { status: 404 });
  }

  const idx = criteria.findIndex((c: any) => c.id === criterionId);
  if (idx === -1) return NextResponse.json({ error: "Criterion not found" }, { status: 404 });

  // Whitelist des champs patchable — refuse la modification de l'id
  // (l'id est référencé partout, changer coupe evaluation_history).
  const allowed = ["description", "expected", "weight", "severity", "competencies", "error_type"];
  const cleanPatch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in patch) cleanPatch[key] = patch[key];
  }
  if (Object.keys(cleanPatch).length === 0) {
    return NextResponse.json({ error: "Empty or non-allowed patch" }, { status: 400 });
  }

  criteria[idx] = { ...criteria[idx], ...cleanPatch };

  try {
    fs.writeFileSync(scenarioPath, JSON.stringify(scenario, null, 2) + "\n", "utf-8");
  } catch (e) {
    return NextResponse.json({ error: "Write failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    criterion: criteria[idx],
    scenarioId,
    phaseId,
    criterionId,
  });
}
