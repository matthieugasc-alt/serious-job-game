import * as fs from 'fs';
import * as path from 'path';

const SCENARIOS_DIR = path.join(process.cwd(), 'scenarios');
const STUDIO_DIR = path.join(process.cwd(), 'data', 'studio');

/**
 * Interface for scenario metadata returned by listScenarios
 */
interface ScenarioMeta {
  /** Folder name or file stem - used in URLs */
  id: string;
  /** Internal scenario_id from JSON */
  scenario_id: string;
  title: string;
  subtitle: string;
  description?: string;
  difficulty: string;
  estimated_duration_min: number;
  tags?: string[];
  job_family: string;
  job_families?: string[];
  /** True when the entry is a teaser (studio draft exposed to players, non-playable) */
  is_teaser?: boolean;
  /** Optional banner text for the teaser ("En cours d'implémentation" by default) */
  teaser_banner?: string;
  /** Scenario status: active (default), maintenance (blocked for regular users) */
  status?: 'active' | 'maintenance';
}

/**
 * List all available scenarios (id + meta only, for selection page)
 * Reads all JSON files in /scenarios/ directory
 */
export function listScenarios(): ScenarioMeta[] {
  try {
    if (!fs.existsSync(SCENARIOS_DIR)) {
      return [];
    }

    const entries = fs.readdirSync(SCENARIOS_DIR, { withFileTypes: true });
    const scenarios: ScenarioMeta[] = [];

    for (const entry of entries) {
      let parsed: any = null;

      try {
        if (entry.isDirectory()) {
          // Try scenarios/{dir}/scenario.json
          const scenarioPath = path.join(SCENARIOS_DIR, entry.name, 'scenario.json');
          if (fs.existsSync(scenarioPath)) {
            parsed = JSON.parse(fs.readFileSync(scenarioPath, 'utf-8'));
          }
        } else if (entry.name.endsWith('.json')) {
          // Flat file
          const filePath = path.join(SCENARIOS_DIR, entry.name);
          parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        }

        if (!parsed) continue;

        // Moteur v2 uniquement : les scénarios legacy v1 (par phases) ont
        // été archivés dans archive/legacy-v1/ — seuls les scénarios au
        // format "v2" (séquences de mécaniques) sont jouables via /play.
        if (parsed.format !== 'v2') continue;

        // Extract meta information
        if (parsed.meta && parsed.scenario_id) {
          // Use folder name (or file stem) as the URL-facing ID
          const urlId = entry.isDirectory() ? entry.name : entry.name.replace(/\.json$/, '');
          const scenarioMeta: ScenarioMeta = {
            id: urlId,
            scenario_id: parsed.scenario_id,
            title: parsed.meta.title || 'Untitled',
            subtitle: parsed.meta.subtitle || '',
            description: parsed.meta.description || '',
            difficulty: parsed.meta.difficulty || 'intermediate',
            estimated_duration_min: parsed.meta.estimated_duration_min || 0,
            tags: parsed.meta.tags || [],
            job_family: parsed.meta.job_family || '',
          };

          // Propagate status from meta if present
          if (parsed.meta.status === 'maintenance') {
            scenarioMeta.status = 'maintenance';
          }

          scenarios.push(scenarioMeta);
        }
      } catch (error) {
        // Log parse errors but continue processing other files
        console.warn(`Failed to parse scenario entry ${entry.name}:`, error);
      }
    }

    // --- Studio teasers: expose studio drafts flagged isTeaserVisible ---
    try {
      if (fs.existsSync(STUDIO_DIR)) {
        const publishedIds = new Set(scenarios.map((s) => s.scenario_id));
        const publishedUrlIds = new Set(scenarios.map((s) => s.id));
        const studioEntries = fs.readdirSync(STUDIO_DIR, { withFileTypes: true });
        for (const entry of studioEntries) {
          if (!entry.isDirectory()) continue;
          const studioPath = path.join(STUDIO_DIR, entry.name, 'studio.json');
          if (!fs.existsSync(studioPath)) continue;
          try {
            const studio = JSON.parse(fs.readFileSync(studioPath, 'utf-8'));
            if (!studio?.isTeaserVisible) continue;
            // Skip if already published under same id (avoid duplicates)
            if (publishedIds.has(studio.id) || publishedUrlIds.has(entry.name)) continue;
            scenarios.push({
              id: entry.name,
              scenario_id: studio.id || entry.name,
              title: studio.title || 'Scénario en cours',
              subtitle: studio.subtitle || '',
              description: studio.description || '',
              difficulty: studio.difficulty || 'intermediate',
              estimated_duration_min: studio.durationMin || 0,
              tags: Array.isArray(studio.tags) ? studio.tags : [],
              job_family: studio.jobFamily || '',
              job_families: Array.isArray(studio.jobFamilies) ? studio.jobFamilies : [],
              is_teaser: true,
              teaser_banner:
                typeof studio.teaserBanner === 'string' && studio.teaserBanner.trim()
                  ? studio.teaserBanner
                  : 'En cours d\'implémentation',
            });
          } catch (e) {
            console.warn(`Failed to read studio teaser ${entry.name}:`, e);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to scan studio teasers:', e);
    }

    // Sort: playable first, teasers last; within each group by scenario_id
    scenarios.sort((a, b) => {
      const at = a.is_teaser ? 1 : 0;
      const bt = b.is_teaser ? 1 : 0;
      if (at !== bt) return at - bt;
      return a.scenario_id.localeCompare(b.scenario_id);
    });

    return scenarios;
  } catch (error) {
    console.error('Failed to list scenarios:', error);
    return [];
  }
}
