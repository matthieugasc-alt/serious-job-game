/**
 * /api/job-families
 * GET  → list all families
 * POST → create a family  { label, active?, order? }
 */

export const runtime = "nodejs";

import { createJobFamily, listJobFamilies } from "@/app/lib/jobFamilies";

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
    const body = await request.json().catch(() => ({}));
    if (!body?.label || typeof body.label !== "string") {
      return Response.json(
        { error: "Le champ 'label' est requis" },
        { status: 400 },
      );
    }
    const family = createJobFamily({
      label: body.label,
      active: body.active,
      order: body.order,
    });
    return Response.json({ family }, { status: 201 });
  } catch (error: any) {
    return Response.json(
      { error: error?.message || "Erreur création" },
      { status: 400 },
    );
  }
}
