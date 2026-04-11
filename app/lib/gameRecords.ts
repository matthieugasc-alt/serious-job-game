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
