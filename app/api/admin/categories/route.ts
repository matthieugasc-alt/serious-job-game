import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/app/lib/auth';
import { isAdminRole } from '@/app/lib/permissions';
import {
  getAllCategories,
  createCategory,
  renameCategory,
  deleteCategory,
} from '@/app/lib/categories';
import {
  parseBody,
  createCategorySchema,
  renameCategorySchema,
} from '@/app/lib/validation';

export const runtime = 'nodejs';

// ═══════════════════════════════════════════════════════════════════
// /api/admin/categories — référentiel de catégories du catalogue
//
// GET    (public)          → { categories: [{ id, label }] }
//   Public : la home et le profil résolvent id → label sans être admin.
// POST   (admin, Bearer)   { label }        → 201 { category }
// PATCH  (admin, Bearer)   { id, label }    → 200 { category }   (rename : l'id ne bouge pas)
// DELETE (admin, Bearer)   ?id=<id>[&force=true]
//   - sans force, si des scénarios sont assignés → 409 { assignedScenarioIds }
//   - avec force=true → purge l'override category de ces scénarios puis supprime
// ═══════════════════════════════════════════════════════════════════

/** Bearer + admin guard partagé par POST/PATCH/DELETE. */
function requireAdmin(request: NextRequest): NextResponse | null {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
  }

  const result = validateSession(token);
  if (!result) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  if (!isAdminRole(result.user.role)) {
    return NextResponse.json(
      { error: 'Insufficient permissions - admin only' },
      { status: 403 },
    );
  }

  return null;
}

export async function GET() {
  try {
    const categories = getAllCategories();
    return NextResponse.json(
      { categories },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
      },
    );
  } catch (error) {
    console.error('Failed to retrieve categories:', error);
    return NextResponse.json({ error: 'Failed to retrieve categories' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = requireAdmin(request);
  if (guard) return guard;

  try {
    const body = await request.json();
    const parsed = parseBody(body, createCategorySchema);
    if (parsed.error) return NextResponse.json(parsed.error, { status: 400 });

    const category = createCategory(parsed.data.label);
    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'category_exists') {
      return NextResponse.json(
        { error: 'category_exists', message: 'Une catégorie avec cet identifiant existe déjà' },
        { status: 409 },
      );
    }
    if (error instanceof Error && error.message === 'invalid_label') {
      return NextResponse.json(
        { error: 'invalid_label', message: 'Libellé de catégorie invalide' },
        { status: 400 },
      );
    }
    console.error('Failed to create category:', error);
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const guard = requireAdmin(request);
  if (guard) return guard;

  try {
    const body = await request.json();
    const parsed = parseBody(body, renameCategorySchema);
    if (parsed.error) return NextResponse.json(parsed.error, { status: 400 });

    const category = renameCategory(parsed.data.id, parsed.data.label);
    return NextResponse.json({ category }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === 'category_not_found') {
      return NextResponse.json(
        { error: 'category_not_found', message: 'Catégorie introuvable' },
        { status: 404 },
      );
    }
    if (error instanceof Error && error.message === 'invalid_label') {
      return NextResponse.json(
        { error: 'invalid_label', message: 'Libellé de catégorie invalide' },
        { status: 400 },
      );
    }
    console.error('Failed to rename category:', error);
    return NextResponse.json({ error: 'Failed to rename category' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const guard = requireAdmin(request);
  if (guard) return guard;

  try {
    const { searchParams } = new URL(request.url);
    const id = (searchParams.get('id') || '').trim();
    const force = searchParams.get('force') === 'true';

    if (!id) {
      return NextResponse.json(
        { error: 'invalid_input', message: "Le paramètre 'id' est requis" },
        { status: 400 },
      );
    }

    const result = deleteCategory(id, force);

    if (!result.deleted) {
      // Des scénarios sont assignés — l'UI doit confirmer puis rappeler avec force=true
      return NextResponse.json(
        {
          error: 'category_in_use',
          message: `${result.assignedScenarioIds.length} scénario(s) assigné(s) à cette catégorie`,
          assignedScenarioIds: result.assignedScenarioIds,
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { deleted: true, clearedScenarioIds: result.assignedScenarioIds },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'category_not_found') {
      return NextResponse.json(
        { error: 'category_not_found', message: 'Catégorie introuvable' },
        { status: 404 },
      );
    }
    console.error('Failed to delete category:', error);
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 });
  }
}
