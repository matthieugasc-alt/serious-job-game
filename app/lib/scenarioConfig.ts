import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const SCENARIO_CONFIG_FILE = path.join(DATA_DIR, 'scenario_config.json');

export interface ScenarioConfig {
  scenarioId: string;
  adminLocked: boolean; // true = "working on it", players see it but can't play
  lockMessage?: string; // Custom message shown to players
  prerequisites?: string[]; // Array of scenario IDs that must be completed first
  category?: string; // Override category (defaults to job_family from scenario.json)
  order?: number; // Sort order within category
  featured?: boolean; // Show on top
}

/**
 * Ensure data directory exists
 */
function ensureDataDir(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (error) {
    console.error('Failed to create data directory:', error);
  }
}

/**
 * Load all scenario configs from JSON file
 */
function loadScenarioConfigs(): ScenarioConfig[] {
  try {
    ensureDataDir();

    if (!fs.existsSync(SCENARIO_CONFIG_FILE)) {
      return [];
    }

    const content = fs.readFileSync(SCENARIO_CONFIG_FILE, 'utf-8');
    return JSON.parse(content) as ScenarioConfig[];
  } catch (error) {
    console.error('Failed to load scenario configs:', error);
    return [];
  }
}

/**
 * Save scenario configs to JSON file
 */
function saveScenarioConfigs(configs: ScenarioConfig[]): void {
  try {
    ensureDataDir();
    fs.writeFileSync(SCENARIO_CONFIG_FILE, JSON.stringify(configs, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save scenario configs:', error);
    throw new Error('Failed to save scenario config');
  }
}

/**
 * Get all scenario configs
 */
export function getAllScenarioConfigs(): ScenarioConfig[] {
  return loadScenarioConfigs();
}

/**
 * Get a single scenario config by ID
 */
export function getScenarioConfig(scenarioId: string): ScenarioConfig | null {
  const configs = loadScenarioConfigs();
  return configs.find((c) => c.scenarioId === scenarioId) || null;
}

/**
 * Save or update a scenario config (upsert)
 */
export function saveScenarioConfig(config: ScenarioConfig): void {
  try {
    const configs = loadScenarioConfigs();
    const existingIndex = configs.findIndex((c) => c.scenarioId === config.scenarioId);

    if (existingIndex >= 0) {
      configs[existingIndex] = config;
    } else {
      configs.push(config);
    }

    saveScenarioConfigs(configs);
  } catch (error) {
    console.error('Failed to save scenario config:', error);
    throw new Error('Failed to save scenario config');
  }
}

/**
 * Delete a scenario config
 */
export function deleteScenarioConfig(scenarioId: string): void {
  try {
    let configs = loadScenarioConfigs();
    const initialCount = configs.length;

    configs = configs.filter((c) => c.scenarioId !== scenarioId);

    if (configs.length === initialCount) {
      throw new Error('Scenario config not found');
    }

    saveScenarioConfigs(configs);
  } catch (error) {
    console.error('Failed to delete scenario config:', error);
    throw new Error('Failed to delete scenario config');
  }
}

/**
 * Check if a scenario is locked
 */
export function isScenarioLocked(scenarioId: string): boolean {
  const config = getScenarioConfig(scenarioId);
  return config ? config.adminLocked : false;
}

/**
 * Get prerequisites for a scenario
 */
export function getPrerequisites(scenarioId: string): string[] {
  const config = getScenarioConfig(scenarioId);
  return config?.prerequisites || [];
}

/**
 * Check if a scenario is accessible to a user
 * Returns { accessible, missingPrereqs }
 */
export function isScenarioAccessible(
  scenarioId: string,
  completedScenarioIds: string[],
): { accessible: boolean; missingPrereqs: string[] } {
  // Check if locked
  if (isScenarioLocked(scenarioId)) {
    return { accessible: false, missingPrereqs: [] };
  }

  // Check prerequisites
  const prerequisites = getPrerequisites(scenarioId);
  const missingPrereqs = prerequisites.filter(
    (prereqId) => !completedScenarioIds.includes(prereqId),
  );

  const accessible = missingPrereqs.length === 0;

  return { accessible, missingPrereqs };
}
