/**
 * GET /api/admin/analytics
 * ═══════════════════════════════════════════════════════════════════
 *
 * Y-chantier Y2/Y4 — aggregated analytics for /admin/analytics page.
 * Reads all game_events JSONL files, returns 4 slices for the dashboard.
 *
 * super_admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/app/lib/auth";
import { readAllEvents, computeAnalytics } from "@/app/lib/gameEvents/reader";

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = validateSession(token);
  if (!session) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  if (session.user.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const events = readAllEvents();
  const analytics = computeAnalytics(events);

  return NextResponse.json(analytics);
}
