import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const USER_PREFERENCES_DIR = path.join(DATA_DIR, 'user_preferences');

export interface UserPreferences {
  selectedCategories: string[]; // Empty = show all
  displayName?: string;
}

/**
 * Ensure user preferences directory exists
 */
function ensureUserPreferencesDir(): void {
  try {
    if (!fs.existsSync(USER_PREFERENCES_DIR)) {
      fs.mkdirSync(USER_PREFERENCES_DIR, { recursive: true });
    }
  } catch (error) {
    console.error('Failed to create user preferences directory:', error);
  }
}

/**
 * Get file path for user preferences
 */
function getUserPreferencesFile(userId: string): string {
  return path.join(USER_PREFERENCES_DIR, `${userId}.json`);
}

/**
 * Get user preferences (with defaults if not found)
 */
export function getPreferences(userId: string): UserPreferences {
  try {
    ensureUserPreferencesDir();
    const filePath = getUserPreferencesFile(userId);

    if (!fs.existsSync(filePath)) {
      // Return defaults
      return {
        selectedCategories: [],
      };
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as UserPreferences;
  } catch (error) {
    console.error(`Failed to load preferences for user ${userId}:`, error);
    // Return defaults on error
    return {
      selectedCategories: [],
    };
  }
}

/**
 * Save user preferences
 */
export function savePreferences(userId: string, prefs: UserPreferences): void {
  try {
    ensureUserPreferencesDir();
    const filePath = getUserPreferencesFile(userId);
    fs.writeFileSync(filePath, JSON.stringify(prefs, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Failed to save preferences for user ${userId}:`, error);
    throw new Error('Failed to save user preferences');
  }
}
