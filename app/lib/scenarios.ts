import * as fs from 'fs';
import * as path from 'path';

const SCENARIOS_DIR = path.join(process.cwd(), 'scenarios');

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

          scenarios.push(scenarioMeta);
        }
      } catch (error) {
        // Log parse errors but continue processing other files
        console.warn(`Failed to parse scenario entry ${entry.name}:`, error);
      }
    }

    // Sort by scenario_id for consistency
    scenarios.sort((a, b) => a.scenario_id.localeCompare(b.scenario_id));

    return scenarios;
  } catch (error) {
    console.error('Failed to list scenarios:', error);
    return [];
  }
}

/**
 * Load a full scenario by ID
 * Searches for scenario.json file or {scenarioId}.json file
 */
export function loadScenario(scenarioId: string): any {
  try {
    // Try loading from subdirectory first: scenarios/{scenarioId}/scenario.json
    const scenarioSubdirPath = path.join(SCENARIOS_DIR, scenarioId, 'scenario.json');
    if (fs.existsSync(scenarioSubdirPath)) {
      const content = fs.readFileSync(scenarioSubdirPath, 'utf-8');
      return JSON.parse(content);
    }

    // Fall back to single JSON file: scenarios/{scenarioId}.json
    const scenarioFilePath = path.join(SCENARIOS_DIR, `${scenarioId}.json`);
    if (fs.existsSync(scenarioFilePath)) {
      const content = fs.readFileSync(scenarioFilePath, 'utf-8');
      return JSON.parse(content);
    }

    // Check if any JSON file contains this scenario_id
    if (!fs.existsSync(SCENARIOS_DIR)) {
      throw new Error(`Scenario not found: ${scenarioId}`);
    }

    const dirContents = fs.readdirSync(SCENARIOS_DIR);
    for (const file of dirContents) {
      if (!file.endsWith('.json')) {
        continue;
      }

      try {
        const filePath = path.join(SCENARIOS_DIR, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(content);
        if (parsed.scenario_id === scenarioId) {
          return parsed;
        }
      } catch {
        // Continue checking other files
      }
    }

    throw new Error(`Scenario not found: ${scenarioId}`);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load scenario ${scenarioId}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Load a character prompt file
 * Supports both subdirectory structure (scenarios/{scenarioId}/prompts/{promptFile})
 * and embedded content in the scenario JSON
 */
export function loadPrompt(scenarioId: string, promptFile: string): string {
  try {
    // Try loading from file system first: scenarios/{scenarioId}/prompts/{promptFile}
    const promptPath = path.join(SCENARIOS_DIR, scenarioId, 'prompts', promptFile);
    if (fs.existsSync(promptPath)) {
      return fs.readFileSync(promptPath, 'utf-8');
    }

    // Try with .md extension if not already included
    if (!promptFile.endsWith('.md')) {
      const mdPromptPath = path.join(SCENARIOS_DIR, scenarioId, 'prompts', `${promptFile}.md`);
      if (fs.existsSync(mdPromptPath)) {
        return fs.readFileSync(mdPromptPath, 'utf-8');
      }
    }

    // Fall back to loading from scenario JSON if it has embedded prompts
    const scenario = loadScenario(scenarioId);

    // Check for prompts in scenario object
    if (scenario.prompts && typeof scenario.prompts === 'object') {
      // Check if promptFile matches a key directly
      if (promptFile in scenario.prompts) {
        const content = scenario.prompts[promptFile];
        return typeof content === 'string' ? content : JSON.stringify(content);
      }

      // Check without extension
      const promptKey = promptFile.replace(/\.(md|txt)$/, '');
      if (promptKey in scenario.prompts) {
        const content = scenario.prompts[promptKey];
        return typeof content === 'string' ? content : JSON.stringify(content);
      }
    }

    // Check in actors for AI prompts
    if (scenario.actors && Array.isArray(scenario.actors)) {
      const actorId = promptFile.replace(/\.(md|txt)$/, '');
      const actor = scenario.actors.find((a: any) => a.actor_id === actorId && a.system_prompt);
      if (actor) {
        return actor.system_prompt;
      }
    }

    // If nothing found, return empty string per spec
    return '';
  } catch (error) {
    console.warn(`Failed to load prompt ${promptFile} from scenario ${scenarioId}:`, error);
    return '';
  }
}

/**
 * Check if a scenario exists
 */
export function scenarioExists(scenarioId: string): boolean {
  try {
    // Check subdirectory structure
    const scenarioSubdirPath = path.join(SCENARIOS_DIR, scenarioId, 'scenario.json');
    if (fs.existsSync(scenarioSubdirPath)) {
      return true;
    }

    // Check single JSON file with exact scenario_id name
    const scenarioFilePath = path.join(SCENARIOS_DIR, `${scenarioId}.json`);
    if (fs.existsSync(scenarioFilePath)) {
      return true;
    }

    // Check if any JSON file contains this scenario_id
    if (!fs.existsSync(SCENARIOS_DIR)) {
      return false;
    }

    const dirContents = fs.readdirSync(SCENARIOS_DIR);
    for (const file of dirContents) {
      if (!file.endsWith('.json')) {
        continue;
      }

      try {
        const filePath = path.join(SCENARIOS_DIR, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(content);
        if (parsed.scenario_id === scenarioId) {
          return true;
        }
      } catch {
        // Continue checking other files
      }
    }

    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Get all available scenario IDs (internal use)
 */
export function getAllScenarioIds(): string[] {
  return listScenarios().map((s) => s.scenario_id);
}
