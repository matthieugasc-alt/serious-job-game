import * as fs from 'fs';
import * as path from 'path';
import { getAllScenarioConfigs, saveScenarioConfig } from './scenarioConfig';

const DATA_DIR = path.join(process.cwd(), 'data');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');

/**
 * Référentiel de catégories du catalogue, géré par l'admin.
 * - id : slug stable (ne change JAMAIS après création — les assignations
 *   des scénarios dans scenario_config.json pointent dessus)
 * - label : libellé affiché (renommable librement)
 */
export interface Category {
  id: string;
  label: string;
}

/**
 * Slugify a label into a stable category id.
 * Same normalization family as the home's normalizeJobFamily.
 */
export function slugifyCategoryId(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents (after NFD)
    .replace(/[·.\-]/g, '') // strip middot, dot, dash
    .replace(/\s+/g, '_') // spaces → underscores
    .replace(/[^a-z0-9_]/g, '') // keep only alnum + _
    .replace(/_+/g, '_') // collapse double _
    .replace(/^_|_$/g, ''); // trim leading/trailing _
}

function ensureDataDir(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (error) {
    console.error('Failed to create data directory:', error);
  }
}

function loadCategories(): Category[] {
  try {
    ensureDataDir();
    if (!fs.existsSync(CATEGORIES_FILE)) {
      return [];
    }
    const content = fs.readFileSync(CATEGORIES_FILE, 'utf-8');
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c: any): c is Category =>
        c && typeof c.id === 'string' && c.id.length > 0 && typeof c.label === 'string',
    );
  } catch (error) {
    console.error('Failed to load categories:', error);
    return [];
  }
}

function saveCategories(categories: Category[]): void {
  try {
    ensureDataDir();
    fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(categories, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save categories:', error);
    throw new Error('Failed to save categories');
  }
}

/** Get all categories from the referential. */
export function getAllCategories(): Category[] {
  return loadCategories();
}

/** Get a single category by id. */
export function getCategory(id: string): Category | null {
  return loadCategories().find((c) => c.id === id) || null;
}

/**
 * Create a category from a label. The id is derived (slug) and is stable.
 * Throws if the label is empty or if a category with the same id exists.
 */
export function createCategory(label: string): Category {
  const trimmed = label.trim();
  const id = slugifyCategoryId(trimmed);
  if (!trimmed || !id) {
    throw new Error('invalid_label');
  }
  const categories = loadCategories();
  if (categories.some((c) => c.id === id)) {
    throw new Error('category_exists');
  }
  const category: Category = { id, label: trimmed };
  categories.push(category);
  saveCategories(categories);
  return category;
}

/**
 * Rename a category: only the label changes, the id never moves —
 * scenario assignments (scenario_config.category) survive the rename.
 * Throws if the category does not exist.
 */
export function renameCategory(id: string, label: string): Category {
  const trimmed = label.trim();
  if (!trimmed) {
    throw new Error('invalid_label');
  }
  const categories = loadCategories();
  const index = categories.findIndex((c) => c.id === id);
  if (index < 0) {
    throw new Error('category_not_found');
  }
  categories[index] = { ...categories[index], label: trimmed };
  saveCategories(categories);
  return categories[index];
}

/** Scenario ids whose config currently overrides category with this id. */
export function getScenarioIdsAssignedToCategory(categoryId: string): string[] {
  return getAllScenarioConfigs()
    .filter((c) => (c.category || '').trim() === categoryId)
    .map((c) => c.scenarioId);
}

export interface DeleteCategoryResult {
  deleted: boolean;
  /** Scenarios assigned to the category (blocking without force, purged with force). */
  assignedScenarioIds: string[];
}

/**
 * Delete a category.
 * - Without force: refuses (deleted=false) if scenarios are assigned to it,
 *   and returns their ids so the UI can ask for confirmation.
 * - With force: purges the category override from those scenario configs
 *   (they fall back to job_family / "Autre"), then deletes the category.
 * Throws if the category does not exist.
 */
export function deleteCategory(id: string, force = false): DeleteCategoryResult {
  const categories = loadCategories();
  const index = categories.findIndex((c) => c.id === id);
  if (index < 0) {
    throw new Error('category_not_found');
  }

  const assignedScenarioIds = getScenarioIdsAssignedToCategory(id);
  if (assignedScenarioIds.length > 0 && !force) {
    return { deleted: false, assignedScenarioIds };
  }

  // force (or nothing assigned): purge the category override on each config
  if (assignedScenarioIds.length > 0) {
    const configs = getAllScenarioConfigs();
    for (const config of configs) {
      if ((config.category || '').trim() === id) {
        saveScenarioConfig({ ...config, category: undefined });
      }
    }
  }

  categories.splice(index, 1);
  saveCategories(categories);
  return { deleted: true, assignedScenarioIds };
}
