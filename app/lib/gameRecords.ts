import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const DATA_DIR = path.join(process.cwd(), 'data');
const GAME_RECORDS_DIR = path.join(DATA_DIR, 'game_records');

export interface ServerGameRecord {
  id: string;
  scenarioId: string;
  scenarioTitle: string;
  playerName: string;
  ending: 'success' | 'partial_success' | 'failure';
  avgScore: number;
  date: string; // ISO
  durationMin: number;
  phasesCompleted: number;
  totalPhases: number;
  debrief: any; // Full debrief data
  pdfPath?: string; // Path to stored PDF (relative to data dir)
  jobFamily?: string; // Job family from scenario meta
  difficulty?: 'junior' | 'intermediate' | 'senior';
  extractedSkills?: ExtractedSkill[]; // AI-extracted skills from debrief
}

export interface ExtractedSkill {
  skill: string; // e.g. "Communication interculturelle"
  level: 'acquise' | 'en_cours' | 'a_travailler';
  evidence: string; // Short excerpt from debrief justifying this
}

/**
 * Ensure game records directory exists
 */
function ensureGameRecordsDir(): void {
  try {
    if (!fs.existsSync(GAME_RECORDS_DIR)) {
      fs.mkdirSync(GAME_RECORDS_DIR, { recursive: true });
    }
  } catch (error) {
    console.error('Failed to create game records directory:', error);
  }
}

/**
 * Get file path for user's game records
 */
function getUserRecordsFile(userId: string): string {
  return path.join(GAME_RECORDS_DIR, `${userId}.json`);
}

/**
 * Load records for a user
 */
function loadUserRecords(userId: string): ServerGameRecord[] {
  try {
    ensureGameRecordsDir();
    const filePath = getUserRecordsFile(userId);

    if (!fs.existsSync(filePath)) {
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as ServerGameRecord[];
  } catch (error) {
    console.error(`Failed to load records for user ${userId}:`, error);
    return [];
  }
}

/**
 * Save records for a user
 */
function saveUserRecords(userId: string, records: ServerGameRecord[]): void {
  try {
    ensureGameRecordsDir();
    const filePath = getUserRecordsFile(userId);
    fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Failed to save records for user ${userId}:`, error);
    throw new Error('Failed to save game record');
  }
}

/**
 * Get all records for a user, sorted newest first
 */
export function getRecordsForUser(userId: string): ServerGameRecord[] {
  const records = loadUserRecords(userId);
  return records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * Save a new game record (generates id and date)
 */
export function saveRecord(
  userId: string,
  record: Omit<ServerGameRecord, 'id' | 'date'>,
): ServerGameRecord {
  try {
    const records = loadUserRecords(userId);

    const newRecord: ServerGameRecord = {
      ...record,
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
    };

    records.push(newRecord);
    saveUserRecords(userId, records);

    return newRecord;
  } catch (error) {
    console.error('Failed to save record:', error);
    throw new Error('Failed to save game record');
  }
}

/**
 * Get a specific record by ID
 */
export function getRecord(userId: string, recordId: string): ServerGameRecord | null {
  try {
    const records = loadUserRecords(userId);
    return records.find((r) => r.id === recordId) || null;
  } catch (error) {
    console.error(`Failed to get record ${recordId}:`, error);
    return null;
  }
}

/**
 * Update a record's PDF path
 */
export function updateRecordPdf(userId: string, recordId: string, pdfPath: string): void {
  try {
    const records = loadUserRecords(userId);
    const record = records.find((r) => r.id === recordId);

    if (!record) {
      throw new Error('Record not found');
    }

    record.pdfPath = pdfPath;
    saveUserRecords(userId, records);
  } catch (error) {
    console.error(`Failed to update PDF for record ${recordId}:`, error);
    throw new Error('Failed to update record PDF');
  }
}

/**
 * Delete a record
 */
export function deleteRecord(userId: string, recordId: string): void {
  try {
    let records = loadUserRecords(userId);
    const initialCount = records.length;

    records = records.filter((r) => r.id !== recordId);

    if (records.length === initialCount) {
      throw new Error('Record not found');
    }

    saveUserRecords(userId, records);
  } catch (error) {
    console.error(`Failed to delete record ${recordId}:`, error);
    throw new Error('Failed to delete record');
  }
}

/**
 * Update extracted skills on a record
 */
export function updateRecordSkills(userId: string, recordId: string, skills: ExtractedSkill[]): void {
  try {
    const records = loadUserRecords(userId);
    const record = records.find((r) => r.id === recordId);
    if (!record) throw new Error('Record not found');
    record.extractedSkills = skills;
    saveUserRecords(userId, records);
  } catch (error) {
    console.error(`Failed to update skills for record ${recordId}:`, error);
  }
}

/**
 * Difficulty weight for score ponderation
 */
function difficultyWeight(diff?: string): number {
  if (diff === 'senior') return 1.5;
  if (diff === 'intermediate') return 1.2;
  return 1.0; // junior or undefined
}

/**
 * Calculate streak (consecutive days with completed scenarios)
 */
export function calculateStreak(userId: string): { currentStreak: number; longestStreak: number; lastPlayedDate: string | null } {
  const records = getRecordsForUser(userId); // sorted newest first
  if (records.length === 0) return { currentStreak: 0, longestStreak: 0, lastPlayedDate: null };

  // Get unique days played (in local date format YYYY-MM-DD)
  const daysPlayed = new Set<string>();
  for (const r of records) {
    const d = new Date(r.date);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    daysPlayed.add(dateStr);
  }

  const sortedDays = Array.from(daysPlayed).sort().reverse(); // newest first
  if (sortedDays.length === 0) return { currentStreak: 0, longestStreak: 0, lastPlayedDate: null };

  const lastPlayedDate = sortedDays[0];

  // Check if streak is active (last played today or yesterday)
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const yesterday = new Date(today.getTime() - 86400000);
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

  // Calculate current streak from today/yesterday backwards
  let currentStreak = 0;
  if (daysPlayed.has(todayStr) || daysPlayed.has(yesterdayStr)) {
    const startDate = daysPlayed.has(todayStr) ? today : yesterday;
    let checkDate = new Date(startDate);
    while (true) {
      const checkStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
      if (daysPlayed.has(checkStr)) {
        currentStreak++;
        checkDate = new Date(checkDate.getTime() - 86400000);
      } else {
        break;
      }
    }
  }

  // Calculate longest streak
  let longestStreak = 0;
  let streak = 1;
  const allDays = Array.from(daysPlayed).sort(); // oldest first
  for (let i = 1; i < allDays.length; i++) {
    const prev = new Date(allDays[i - 1]);
    const curr = new Date(allDays[i]);
    const diffMs = curr.getTime() - prev.getTime();
    if (diffMs <= 86400000 + 1000) { // ~1 day tolerance
      streak++;
    } else {
      longestStreak = Math.max(longestStreak, streak);
      streak = 1;
    }
  }
  longestStreak = Math.max(longestStreak, streak);

  return { currentStreak, longestStreak, lastPlayedDate };
}

/**
 * Calculate progression stats per job family
 */
export interface JobFamilyStats {
  jobFamily: string;
  scenariosCompleted: number;
  avgScore: number; // weighted by difficulty
  bestScore: number;
  totalTimePlayed: number; // minutes
  completedScenarioIds: string[];
  difficulties: Record<string, number>; // count per difficulty
}

export function getJobFamilyStats(userId: string): JobFamilyStats[] {
  const records = getRecordsForUser(userId);
  const byFamily: Record<string, ServerGameRecord[]> = {};

  for (const r of records) {
    const family = r.jobFamily || 'non_classé';
    if (!byFamily[family]) byFamily[family] = [];
    byFamily[family].push(r);
  }

  return Object.entries(byFamily).map(([jobFamily, familyRecords]) => {
    let weightedScoreSum = 0;
    let weightSum = 0;
    let bestScore = 0;
    let totalTime = 0;
    const completedIds = new Set<string>();
    const difficulties: Record<string, number> = {};

    for (const r of familyRecords) {
      const w = difficultyWeight(r.difficulty);
      weightedScoreSum += r.avgScore * w;
      weightSum += w;
      bestScore = Math.max(bestScore, r.avgScore);
      totalTime += r.durationMin || 0;
      completedIds.add(r.scenarioId);
      const diff = r.difficulty || 'junior';
      difficulties[diff] = (difficulties[diff] || 0) + 1;
    }

    return {
      jobFamily,
      scenariosCompleted: completedIds.size,
      avgScore: weightSum > 0 ? Math.round(weightedScoreSum / weightSum) : 0,
      bestScore: Math.round(bestScore),
      totalTimePlayed: totalTime,
      completedScenarioIds: Array.from(completedIds),
      difficulties,
    };
  });
}

/**
 * Get all extracted skills across all records for a user
 */
export interface AggregatedSkill {
  skill: string;
  level: 'acquise' | 'en_cours' | 'a_travailler';
  occurrences: number;
  latestEvidence: string;
  scenarioTitles: string[];
}

export function getAggregatedSkills(userId: string): AggregatedSkill[] {
  const records = getRecordsForUser(userId);
  const skillMap: Record<string, { levels: string[]; evidences: string[]; scenarios: string[] }> = {};

  for (const r of records) {
    if (!r.extractedSkills) continue;
    for (const s of r.extractedSkills) {
      if (!skillMap[s.skill]) {
        skillMap[s.skill] = { levels: [], evidences: [], scenarios: [] };
      }
      skillMap[s.skill].levels.push(s.level);
      skillMap[s.skill].evidences.push(s.evidence);
      if (!skillMap[s.skill].scenarios.includes(r.scenarioTitle)) {
        skillMap[s.skill].scenarios.push(r.scenarioTitle);
      }
    }
  }

  return Object.entries(skillMap).map(([skill, data]) => {
    // Best level: acquise > en_cours > a_travailler
    const levelPriority: Record<string, number> = { acquise: 3, en_cours: 2, a_travailler: 1 };
    const bestLevel = data.levels.reduce((best, l) =>
      (levelPriority[l] || 0) > (levelPriority[best] || 0) ? l : best
    , data.levels[0]) as 'acquise' | 'en_cours' | 'a_travailler';

    return {
      skill,
      level: bestLevel,
      occurrences: data.levels.length,
      latestEvidence: data.evidences[data.evidences.length - 1],
      scenarioTitles: data.scenarios,
    };
  }).sort((a, b) => {
    const p: Record<string, number> = { acquise: 3, en_cours: 2, a_travailler: 1 };
    return (p[b.level] || 0) - (p[a.level] || 0) || b.occurrences - a.occurrences;
  });
}
