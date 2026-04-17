/**
 * assignments.ts — Scenario assignment system
 *
 * Manages the attribution of scenarios to users within an organization context.
 * Supports visible (optional) and mandatory assignment types.
 * Tracks completion status.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const DATA_DIR = path.join(process.cwd(), 'data');
const ASSIGNMENTS_FILE = path.join(DATA_DIR, 'scenario_assignments.json');

// ─── Types ──────────────────────────────────────────────────────

export type AssignmentType = 'visible' | 'mandatory';
export type AssignmentStatus = 'assigned' | 'started' | 'completed';

export type ScenarioAssignment = {
  id: string;
  scenarioId: string;
  userId: string;
  organizationId: string;
  assignedBy: string;
  type: AssignmentType;
  status: AssignmentStatus;
  assignedAt: string;
  startedAt?: string;
  completedAt?: string;
  gameRecordId?: string;       // link to the game record when completed
};

// ─── File I/O ───────────────────────────────────────────────────

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadAssignments(): ScenarioAssignment[] {
  try {
    ensureDataDir();
    if (!fs.existsSync(ASSIGNMENTS_FILE)) return [];
    return JSON.parse(fs.readFileSync(ASSIGNMENTS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveAssignments(assignments: ScenarioAssignment[]): void {
  ensureDataDir();
  fs.writeFileSync(ASSIGNMENTS_FILE, JSON.stringify(assignments, null, 2), 'utf-8');
}

// ─── Assignment CRUD ────────────────────────────────────────────

/**
 * Assign a scenario to a user within an org context.
 * Idempotent: if the assignment already exists, update its type.
 */
export function assignScenario(params: {
  scenarioId: string;
  userId: string;
  organizationId: string;
  assignedBy: string;
  type: AssignmentType;
}): { assignment: ScenarioAssignment } | { error: string } {
  const assignments = loadAssignments();

  // Check for existing assignment (same scenario + user + org)
  const existing = assignments.find(
    (a) =>
      a.scenarioId === params.scenarioId &&
      a.userId === params.userId &&
      a.organizationId === params.organizationId,
  );

  if (existing) {
    // Update type if changed
    existing.type = params.type;
    existing.assignedBy = params.assignedBy;
    saveAssignments(assignments);
    return { assignment: existing };
  }

  const assignment: ScenarioAssignment = {
    id: crypto.randomUUID(),
    scenarioId: params.scenarioId,
    userId: params.userId,
    organizationId: params.organizationId,
    assignedBy: params.assignedBy,
    type: params.type,
    status: 'assigned',
    assignedAt: new Date().toISOString(),
  };

  assignments.push(assignment);
  saveAssignments(assignments);
  return { assignment };
}

/**
 * Batch assign: assign multiple scenarios to multiple users.
 * Returns count of created/updated assignments.
 */
export function batchAssign(params: {
  scenarioIds: string[];
  userIds: string[];
  organizationId: string;
  assignedBy: string;
  type: AssignmentType;
}): { created: number; updated: number } {
  const assignments = loadAssignments();
  let created = 0;
  let updated = 0;

  for (const userId of params.userIds) {
    for (const scenarioId of params.scenarioIds) {
      const existing = assignments.find(
        (a) =>
          a.scenarioId === scenarioId &&
          a.userId === userId &&
          a.organizationId === params.organizationId,
      );

      if (existing) {
        existing.type = params.type;
        existing.assignedBy = params.assignedBy;
        updated++;
      } else {
        assignments.push({
          id: crypto.randomUUID(),
          scenarioId,
          userId,
          organizationId: params.organizationId,
          assignedBy: params.assignedBy,
          type: params.type,
          status: 'assigned',
          assignedAt: new Date().toISOString(),
        });
        created++;
      }
    }
  }

  saveAssignments(assignments);
  return { created, updated };
}

/**
 * Remove an assignment.
 */
export function removeAssignment(assignmentId: string): { success: boolean; error?: string } {
  const assignments = loadAssignments();
  const idx = assignments.findIndex((a) => a.id === assignmentId);
  if (idx === -1) return { success: false, error: 'Assignment not found' };

  assignments.splice(idx, 1);
  saveAssignments(assignments);
  return { success: true };
}

/**
 * Remove all assignments for a scenario+user+org combo.
 */
export function removeAssignmentByContext(
  scenarioId: string,
  userId: string,
  organizationId: string,
): { success: boolean } {
  let assignments = loadAssignments();
  const before = assignments.length;
  assignments = assignments.filter(
    (a) =>
      !(a.scenarioId === scenarioId && a.userId === userId && a.organizationId === organizationId),
  );

  if (assignments.length !== before) {
    saveAssignments(assignments);
  }
  return { success: true };
}

// ─── Status Updates ─────────────────────────────────────────────

/**
 * Mark an assignment as started.
 */
export function markStarted(
  scenarioId: string,
  userId: string,
  organizationId: string,
): void {
  const assignments = loadAssignments();
  const a = assignments.find(
    (a) =>
      a.scenarioId === scenarioId &&
      a.userId === userId &&
      a.organizationId === organizationId &&
      a.status === 'assigned',
  );

  if (a) {
    a.status = 'started';
    a.startedAt = new Date().toISOString();
    saveAssignments(assignments);
  }
}

/**
 * Mark an assignment as completed. Link to the game record.
 */
export function markCompleted(
  scenarioId: string,
  userId: string,
  organizationId: string,
  gameRecordId?: string,
): void {
  const assignments = loadAssignments();
  const a = assignments.find(
    (a) =>
      a.scenarioId === scenarioId &&
      a.userId === userId &&
      a.organizationId === organizationId &&
      (a.status === 'assigned' || a.status === 'started'),
  );

  if (a) {
    a.status = 'completed';
    a.completedAt = new Date().toISOString();
    if (gameRecordId) a.gameRecordId = gameRecordId;
    saveAssignments(assignments);
  }
}

// ─── Queries ────────────────────────────────────────────────────

/**
 * Get all assignments for a user in a specific org.
 */
export function getUserAssignments(userId: string, organizationId: string): ScenarioAssignment[] {
  return loadAssignments().filter(
    (a) => a.userId === userId && a.organizationId === organizationId,
  );
}

/**
 * Get all assignments for a user across all orgs.
 */
export function getAllUserAssignments(userId: string): ScenarioAssignment[] {
  return loadAssignments().filter((a) => a.userId === userId);
}

/**
 * Get all assignments in an org (for admin view).
 */
export function getOrgAssignments(organizationId: string): ScenarioAssignment[] {
  return loadAssignments().filter((a) => a.organizationId === organizationId);
}

/**
 * Get assignments for a specific scenario in an org.
 */
export function getScenarioAssignments(
  scenarioId: string,
  organizationId: string,
): ScenarioAssignment[] {
  return loadAssignments().filter(
    (a) => a.scenarioId === scenarioId && a.organizationId === organizationId,
  );
}

/**
 * Get completion stats for an org.
 */
export function getOrgCompletionStats(organizationId: string): {
  total: number;
  assigned: number;
  started: number;
  completed: number;
  mandatoryTotal: number;
  mandatoryCompleted: number;
} {
  const assignments = loadAssignments().filter((a) => a.organizationId === organizationId);
  const mandatory = assignments.filter((a) => a.type === 'mandatory');

  return {
    total: assignments.length,
    assigned: assignments.filter((a) => a.status === 'assigned').length,
    started: assignments.filter((a) => a.status === 'started').length,
    completed: assignments.filter((a) => a.status === 'completed').length,
    mandatoryTotal: mandatory.length,
    mandatoryCompleted: mandatory.filter((a) => a.status === 'completed').length,
  };
}

/**
 * Get completion stats per user in an org.
 */
export function getUserCompletionStats(
  userId: string,
  organizationId: string,
): {
  total: number;
  completed: number;
  mandatory: number;
  mandatoryCompleted: number;
} {
  const assignments = loadAssignments().filter(
    (a) => a.userId === userId && a.organizationId === organizationId,
  );
  const mandatory = assignments.filter((a) => a.type === 'mandatory');

  return {
    total: assignments.length,
    completed: assignments.filter((a) => a.status === 'completed').length,
    mandatory: mandatory.length,
    mandatoryCompleted: mandatory.filter((a) => a.status === 'completed').length,
  };
}
