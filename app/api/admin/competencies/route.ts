/**
 * /api/admin/competencies
 * ═══════════════════════════════════════════════════════════════════
 *
 * Z-chantier Z2 — CRUD sur le référentiel.
 * super_admin only.
 *
 * GET  → list all (including archived, front filtre selon besoin)
 * POST → { action: 'upsert', competency: Competency }
 *        { action: 'archive', id: string }
 *        { action: 'unarchive', id: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/app/lib/auth";
import {
  loadCompetencies,
  saveCompetencies,
  invalidateCompetencyCache,
  type Competency,
} from "@/app/lib/competencies";

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function checkAuth(req: NextRequest, requireSuperAdmin: boolean) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const session = validateSession(token);
  if (!session) return { error: NextResponse.json({ error: "Invalid session" }, { status: 401 }) };
  if (requireSuperAdmin && session.user.role !== "super_admin") {
    return { error: forbidden() };
  }
  return { session };
}

export async function GET(req: NextRequest) {
  // Read is open to any authenticated user (used by edit-criterion page).
  const auth = checkAuth(req, false);
  if (auth.error) return auth.error;

  invalidateCompetencyCache();
  const ref = loadCompetencies();
  return NextResponse.json(ref);
}

export async function POST(req: NextRequest) {
  const auth = checkAuth(req, true);
  if (auth.error) return auth.error;

  const body = await req.json();
  const action = body?.action;
  const ref = loadCompetencies();

  if (action === "upsert") {
    const c = body.competency as Competency;
    if (!c?.id || !/^[a-z0-9_]+$/.test(c.id)) {
      return NextResponse.json({ error: "Invalid id (snake_case a-z 0-9 _)" }, { status: 400 });
    }
    if (!c.label || !c.description) {
      return NextResponse.json({ error: "label + description required" }, { status: 400 });
    }
    const idx = ref.competencies.findIndex((x) => x.id === c.id);
    if (idx >= 0) ref.competencies[idx] = { ...ref.competencies[idx], ...c };
    else ref.competencies.push(c);
    saveCompetencies(ref);
    return NextResponse.json({ ok: true, competency: c });
  }

  if (action === "archive" || action === "unarchive") {
    const target = ref.competencies.find((c) => c.id === body.id);
    if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
    target.archived = action === "archive";
    saveCompetencies(ref);
    return NextResponse.json({ ok: true, competency: target });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
