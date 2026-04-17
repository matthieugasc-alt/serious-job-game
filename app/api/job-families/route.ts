/**
 * /api/job-families
 * GET  → list all families
 * POST → create a family  { label, active?, order? }
 */

export const runtime = "nodejs";

import { createJobFamily, listJobFamilies } from "@/app/lib/jobFamilies";
import { requireAuth } from "@/app/lib/auth";
import { isAdminRole } from "@/app/lib/permissions";
import type { GlobalRole } from "@/app/lib/permissions";
import { parseBody, createJobFamilySchema } from "@/app/lib/validation";

export async function GET() {
  try {
    return Response.json({ families: listJobFamilies() });
  } catch (error: any) {
    return Response.json(
      { error: error?.message || "Erreur lecture" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    // ── Auth + admin guard ──
    const auth = requireAuth(request);
    if (auth.error) return auth.error;
    if (!isAdminRole(auth.user.role as GlobalRole)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));

    // ── Input validation ──
    const parsed = parseBody(body, createJobFamilySchema);
    if (parsed.error) return Response.json(parsed.error, { status: 400 });

    const family = createJobFamily({
      label: parsed.data.label,
      active: parsed.data.active,
      order: parsed.data.order,
    });
    return Response.json({ family }, { status: 201 });
  } catch (error: any) {
    return Response.json(
      { error: error?.message || "Erreur création" },
      { status: 400 },
    );
  }
}
