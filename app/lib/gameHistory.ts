/** ═══════════════════════════════════════════════════════════════════
 *  Game History — localStorage persistence for completed games
 *
 *  Stores a list of GameRecord objects under the key "game_history".
 *  Each record includes scenario info, ending, date, and full debrief.
 * ═══════════════════════════════════════════════════════════════════ */

export interface GameRecord {
  id: string;
  scenarioId: string;
  scenarioTitle: string;
  playerName: string;
  ending: "success" | "partial_success" | "failure";
  avgScore: number;
  date: string; // ISO string
  debrief: any; // Full DebriefResponse from the AI
}

const STORAGE_KEY = "game_history";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Get all saved game records, newest first */
export function getGameHistory(): GameRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const records = JSON.parse(raw) as GameRecord[];
    return records.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  } catch {
    return [];
  }
}

/** Save a new game record */
export function saveGameRecord(
  record: Omit<GameRecord, "id" | "date">
): GameRecord {
  const full: GameRecord = {
    ...record,
    id: generateId(),
    date: new Date().toISOString(),
  };
  const existing = getGameHistory();
  existing.unshift(full);
  // Keep max 50 records
  const trimmed = existing.slice(0, 50);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  return full;
}

/** Delete a game record by id */
export function deleteGameRecord(id: string): void {
  const existing = getGameHistory();
  const filtered = existing.filter((r) => r.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

/** Get a single game record by id */
export function getGameRecord(id: string): GameRecord | null {
  const records = getGameHistory();
  return records.find((r) => r.id === id) || null;
}
