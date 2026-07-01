// ═══════════════════════════════════════════════════════════════════
// Z-chantier — Référentiel de compétences transverse
// ═══════════════════════════════════════════════════════════════════
//
// Source de vérité : data/competencies.json.
// Utilisé par CF (critère → compétence), CF2 (agrégation dashboard),
// AS (assistant de conception).
//
// La liste évolue via /admin/competencies (Z2). Toute désactivation
// est un soft delete pour préserver la lisibilité des replays anciens.
// ═══════════════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";

export interface Competency {
  id: string;
  label: string;
  description: string;
  /** Optional: parent competency id for hierarchical grouping (V2). */
  parent?: string;
  /** Optional: soft-delete marker. Historical evaluations keep pointing here. */
  archived?: boolean;
}

export interface CompetencyReference {
  version: string;
  competencies: Competency[];
}

const FILE = path.resolve(process.cwd(), "data", "competencies.json");

let cache: CompetencyReference | null = null;

export function loadCompetencies(): CompetencyReference {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(FILE, "utf-8");
    cache = JSON.parse(raw);
    return cache!;
  } catch {
    // Empty fallback — new install or file missing
    cache = { version: "0.0.0", competencies: [] };
    return cache;
  }
}

export function saveCompetencies(ref: CompetencyReference): void {
  cache = ref;
  fs.writeFileSync(FILE, JSON.stringify(ref, null, 2) + "\n", "utf-8");
}

export function listActiveCompetencies(): Competency[] {
  return loadCompetencies().competencies.filter((c) => !c.archived);
}

export function competencyIds(): Set<string> {
  return new Set(loadCompetencies().competencies.map((c) => c.id));
}

/** Force re-read from disk (used after edits from admin). */
export function invalidateCompetencyCache(): void {
  cache = null;
}
