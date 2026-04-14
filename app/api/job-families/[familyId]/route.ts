/**
 * /api/job-families/[familyId]
 * PATCH  → update { label?, active?, order? }
 * DELETE → remove family
 */

export const runtime = "nodejs";

import { deleteJobFamily, updateJobFamily } from "@/app/lib/jobFamilies";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ familyId: string }> },
) {
  const { familyId } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const family = updateJobFamily(familyId, {
      label: body.label,
      active: body.active,
      order: body.order,
    });
    return Response.json({ family });
  } catch (error: any) {
    const status = /introuvable/i.test(error?.message || "") ? 404 : 400;
    return Response.json(
      { error: error?.message || "Erreur mise à jour" },
      { status },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ familyId: string }> },
) {
  const { familyId } = await params;
  try {
    deleteJobFamily(familyId);
    return Response.json({ success: true });
  } catch (error: any) {
    const status = /introuvable/i.test(error?.message || "") ? 404 : 500;
    return Response.json(
      { error: error?.message || "Erreur suppression" },
      { status },
    );
  }
}
