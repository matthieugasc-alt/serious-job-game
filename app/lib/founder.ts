import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════════
// FOUNDER MODE — Types & Business Logic
// Surcouche isolée. Ne touche à RIEN du runtime existant.
// ═══════════════════════════════════════════════════════════════════

const DATA_DIR = path.join(process.cwd(), 'data');
const CAMPAIGNS_DIR = path.join(DATA_DIR, 'founder_campaigns');
const RULES_FILE = path.join(DATA_DIR, 'founder_rules.json');

// ── Bornes ──────────────────────────────────────────────────────

export const BOUNDS: Record<FounderStateKey, { min: number; max: number }> = {
  treasury:           { min: 0,   max: Infinity },
  ownership:          { min: 0,   max: 100 },
  mrr:                { min: 0,   max: Infinity },
  payroll:            { min: 0,   max: Infinity },
  productQuality:     { min: 0,   max: 100 },
  techDebt:           { min: 0,   max: 100 },
  investorConfidence: { min: 0,   max: 100 },
  marketValidation:   { min: 0,   max: 100 },
  elapsedMonths:      { min: 0,   max: Infinity },
};

// ── State ───────────────────────────────────────────────────────

export interface FounderState {
  treasury:           number;
  ownership:          number;
  mrr:                number;
  payroll:            number;
  productQuality:     number;
  techDebt:           number;
  investorConfidence: number;
  marketValidation:   number;
  elapsedMonths:      number;
}

export type FounderStateKey = keyof FounderState;

export const FOUNDER_STATE_KEYS: readonly FounderStateKey[] = [
  'treasury', 'ownership', 'mrr', 'payroll',
  'productQuality', 'techDebt', 'investorConfidence', 'marketValidation',
  'elapsedMonths',
] as const;

// ── Delta ───────────────────────────────────────────────────────

export type FounderStateDelta = Record<FounderStateKey, number>;

export function isValidDelta(delta: unknown): delta is FounderStateDelta {
  if (typeof delta !== 'object' || delta === null) return false;
  const d = delta as Record<string, unknown>;
  for (const key of FOUNDER_STATE_KEYS) {
    if (typeof d[key] !== 'number') return false;
    if (!Number.isFinite(d[key] as number)) return false;
  }
  for (const key of Object.keys(d)) {
    if (!FOUNDER_STATE_KEYS.includes(key as FounderStateKey)) return false;
  }
  return true;
}

export function applyDelta(state: FounderState, delta: FounderStateDelta): FounderState {
  const next = { ...state };
  for (const key of FOUNDER_STATE_KEYS) {
    const raw = next[key] + delta[key];
    const { min, max } = BOUNDS[key];
    next[key] = Math.round(Math.min(max, Math.max(min, raw)));
  }
  return next;
}

// ── Signals & Outcomes ──────────────────────────────────────────

export type FounderSignal = 'robust' | 'fragile' | 'costly' | 'delayed' | 'promising';

export interface FounderMicroDebrief {
  decision: string;
  impact:   string;
  strength: string;
  risk:     string;
  advice?:  string;
}

export interface FounderCampaignFlags {
  hasAdvisoryBoard?: boolean;
  royalties_pct?: number | null;
  royalties_cap?: number | null;
  royalties_duration_years?: number | null;
}

export interface FounderOutcome {
  outcomeId:    string;
  label:        string;
  summary:      string;
  signal:       FounderSignal;
  deltas:       FounderStateDelta;
  setsFlags?:   FounderCampaignFlags;
  microDebrief: FounderMicroDebrief;
}

// ── Rules ───────────────────────────────────────────────────────

export interface FounderScenarioRules {
  order: number;
  title: string;
  scenarioId: string;
  // key = normalized ending from debrief ("success" | "partial_success" | "failure")
  outcomes: Record<string, FounderOutcome>;
}

export interface FounderRules {
  version: string;
  pitch: any; // consumed by the intro page, opaque here
  initialState: FounderState;
  scenarios: Record<string, FounderScenarioRules>;
  boardReviews: any[]; // V2
}

export function loadRules(): FounderRules {
  const content = fs.readFileSync(RULES_FILE, 'utf-8');
  return JSON.parse(content);
}

// ── Campaign ────────────────────────────────────────────────────

export type CampaignStatus = 'pitch_seen' | 'in_progress' | 'completed';

export interface CompletedScenarioEntry {
  scenarioId:  string;
  outcomeId:   string;
  signal:      FounderSignal;
  stateAfter:  FounderState;
  completedAt: string;
}

// ── Checkpoint (anti-rollback) ──────────────────────────────────

export interface FounderCheckpoint {
  scenarioId:       string;
  phaseIndex:       number;
  completedPhases:  string[];   // phases already validated before this one
  abandonCount:     number;     // how many times the player left mid-scenario
  penaltiesApplied: number;     // how many penalties already applied (avoids double-apply)
  savedAt:          string;
}

export interface FounderCampaign {
  id:                    string;
  userId:                string;
  createdAt:             string;
  status:                CampaignStatus;
  currentScenarioIndex:  number;
  pendingScenarioId:     string | null;
  state:                 FounderState;
  completedScenarios:    CompletedScenarioEntry[];
  lastMicroDebrief:      FounderMicroDebrief | null;
  hasAdvisoryBoard:      boolean;
  burnRateMonthly:       number;  // 250€/month, applied from scenario 1 onwards
  checkpoint:            FounderCheckpoint | null;
}

// ── Campaign CRUD ───────────────────────────────────────────────

function ensureCampaignsDir(): void {
  if (!fs.existsSync(CAMPAIGNS_DIR)) {
    fs.mkdirSync(CAMPAIGNS_DIR, { recursive: true });
  }
}

function campaignPath(campaignId: string): string {
  return path.join(CAMPAIGNS_DIR, `${campaignId}.json`);
}

export function loadCampaign(campaignId: string): FounderCampaign | null {
  const p = campaignPath(campaignId);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

export function saveCampaign(campaign: FounderCampaign): void {
  ensureCampaignsDir();
  fs.writeFileSync(campaignPath(campaign.id), JSON.stringify(campaign, null, 2), 'utf-8');
}

export function listCampaignsForUser(userId: string): FounderCampaign[] {
  ensureCampaignsDir();
  const files = fs.readdirSync(CAMPAIGNS_DIR).filter((f) => f.endsWith('.json'));
  const campaigns: FounderCampaign[] = [];
  for (const file of files) {
    try {
      const c = JSON.parse(fs.readFileSync(path.join(CAMPAIGNS_DIR, file), 'utf-8'));
      if (c.userId === userId) campaigns.push(c);
    } catch {
      // skip corrupted files
    }
  }
  return campaigns.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function createCampaign(userId: string): FounderCampaign {
  const rules = loadRules();
  const campaign: FounderCampaign = {
    id: crypto.randomUUID(),
    userId,
    createdAt: new Date().toISOString(),
    status: 'in_progress',
    currentScenarioIndex: 0,
    pendingScenarioId: null,
    state: { ...rules.initialState },
    completedScenarios: [],
    lastMicroDebrief: null,
    hasAdvisoryBoard: false,
    burnRateMonthly: 250,
    checkpoint: null,
  };
  saveCampaign(campaign);
  return campaign;
}

// ── Outcome Resolution ──────────────────────────────────────────

export function resolveOutcome(
  scenarioId: string,
  ending: string, // "success" | "partial_success" | "failure" from GameRecord
  rules: FounderRules,
): FounderOutcome {
  const scenarioRules = rules.scenarios[scenarioId];
  if (!scenarioRules) {
    throw new Error(`No founder rules for scenario: ${scenarioId}`);
  }

  const outcome = scenarioRules.outcomes[ending];
  if (!outcome) {
    throw new Error(
      `No outcome mapping for ending "${ending}" in scenario "${scenarioId}". ` +
      `Available: ${Object.keys(scenarioRules.outcomes).join(', ')}`
    );
  }

  return outcome;
}

// ── Apply Outcome to Campaign ──────────────────────────────────

export function applyOutcomeToCampaign(
  campaign: FounderCampaign,
  outcome: FounderOutcome,
): FounderCampaign {
  const updated = { ...campaign };

  // Apply state deltas (treasury, ownership, elapsedMonths, etc.)
  updated.state = applyDelta(campaign.state, outcome.deltas);

  // Apply campaign flags
  if (outcome.setsFlags) {
    if (outcome.setsFlags.hasAdvisoryBoard !== undefined) {
      updated.hasAdvisoryBoard = outcome.setsFlags.hasAdvisoryBoard;
    }
  }

  // Store debrief
  updated.lastMicroDebrief = outcome.microDebrief;

  return updated;
}

// ── Treasury Projection ────────────────────────────────────────

export function projectTreasury(campaign: FounderCampaign): {
  currentTreasury: number;
  monthlyBurn: number;
  monthsRemaining: number;
  runwayDate: string;
} {
  const { treasury, elapsedMonths } = campaign.state;
  const burn = campaign.burnRateMonthly || 250;

  const monthsRemaining = burn > 0 ? Math.floor(treasury / burn) : Infinity;

  // Approximate runway date from campaign start
  const startDate = new Date(campaign.createdAt);
  const runwayEnd = new Date(startDate);
  runwayEnd.setMonth(runwayEnd.getMonth() + elapsedMonths + monthsRemaining);

  return {
    currentTreasury: treasury,
    monthlyBurn: burn,
    monthsRemaining,
    runwayDate: runwayEnd.toISOString().split('T')[0],
  };
}

// ── Anti-Rollback: Checkpoint & Penalty ───────────────────────

/** Penalty for abandoning a scenario mid-phase */
export const ABANDON_PENALTY = {
  months: 0.5,      // +0.5 mois écoulé (15 jours)
  treasury: -125,   // burn de 15 jours à 250€/mois
} as const;

/**
 * Find the active (non-completed) campaign for a user.
 * Returns null if no active campaign exists.
 */
export function findActiveCampaign(userId: string): FounderCampaign | null {
  const campaigns = listCampaignsForUser(userId);
  return campaigns.find((c) => c.status !== 'completed') || null;
}

/** Scenario 0 is played in one sitting — no checkpoint, no resume. */
export const SCENARIO_0_ID = 'founder_00_cto';

/**
 * Handle a player entering a scenario play page.
 *
 * SPECIAL CASE — Scenario 0 ("Trouver un CTO"):
 *   Played in one sitting. If a checkpoint already exists → the player
 *   abandoned → signal `resetCampaign: true`. The caller (API route)
 *   is responsible for deleting the campaign file.
 *
 * ALL OTHER SCENARIOS:
 *   - No checkpoint → first entry, create one.
 *   - Checkpoint exists → resume with penalty.
 */
export function handleScenarioEntry(
  campaign: FounderCampaign,
  scenarioId: string,
): {
  isResume: boolean;
  resetCampaign: boolean;
  penaltyApplied: boolean;
  penaltyMonths: number;
  resumePhaseIndex: number;
  resumeCompletedPhases: string[];
  campaign: FounderCampaign;
} {
  const cp = campaign.checkpoint;

  // ── Scenario 0: one-shot, no checkpoint resume ──
  if (scenarioId === SCENARIO_0_ID) {
    if (cp && cp.scenarioId === SCENARIO_0_ID) {
      // Abandon detected → signal full reset
      return {
        isResume: false,
        resetCampaign: true,
        penaltyApplied: false,
        penaltyMonths: 0,
        resumePhaseIndex: 0,
        resumeCompletedPhases: [],
        campaign,
      };
    }
    // First entry → create a checkpoint (so we can detect abandon next time)
    campaign.checkpoint = {
      scenarioId,
      phaseIndex: 0,
      completedPhases: [],
      abandonCount: 0,
      penaltiesApplied: 0,
      savedAt: new Date().toISOString(),
    };
    saveCampaign(campaign);
    return {
      isResume: false,
      resetCampaign: false,
      penaltyApplied: false,
      penaltyMonths: 0,
      resumePhaseIndex: 0,
      resumeCompletedPhases: [],
      campaign,
    };
  }

  // ── Other scenarios: standard checkpoint logic ──

  // Case 1: No checkpoint or different scenario → first entry
  if (!cp || cp.scenarioId !== scenarioId) {
    campaign.checkpoint = {
      scenarioId,
      phaseIndex: 0,
      completedPhases: [],
      abandonCount: 0,
      penaltiesApplied: 0,
      savedAt: new Date().toISOString(),
    };
    saveCampaign(campaign);
    return {
      isResume: false,
      resetCampaign: false,
      penaltyApplied: false,
      penaltyMonths: 0,
      resumePhaseIndex: 0,
      resumeCompletedPhases: [],
      campaign,
    };
  }

  // Case 2: Checkpoint exists for this scenario → it's a resume (abandon detected)
  cp.abandonCount += 1;

  // Apply penalty only once per abandon (not if already penalized for this abandon)
  let penaltyApplied = false;
  let penaltyMonths = 0;
  if (cp.abandonCount > cp.penaltiesApplied) {
    penaltyMonths = ABANDON_PENALTY.months;
    // Apply time penalty to campaign state
    campaign.state.elapsedMonths = Math.round(
      (campaign.state.elapsedMonths + penaltyMonths) * 10
    ) / 10; // keep 1 decimal for 0.5
    // Apply treasury penalty (burn for 15 days)
    campaign.state.treasury = Math.max(0, campaign.state.treasury + ABANDON_PENALTY.treasury);
    cp.penaltiesApplied = cp.abandonCount;
    penaltyApplied = true;
  }

  cp.savedAt = new Date().toISOString();
  campaign.checkpoint = cp;
  saveCampaign(campaign);

  return {
    isResume: true,
    resetCampaign: false,
    penaltyApplied,
    penaltyMonths,
    resumePhaseIndex: cp.phaseIndex,
    resumeCompletedPhases: [...cp.completedPhases],
    campaign,
  };
}

/**
 * Update checkpoint when a phase is completed (advance to next phase).
 */
export function advanceCheckpoint(
  campaign: FounderCampaign,
  completedPhaseId: string,
  newPhaseIndex: number,
): void {
  if (!campaign.checkpoint) return;
  campaign.checkpoint.phaseIndex = newPhaseIndex;
  if (!campaign.checkpoint.completedPhases.includes(completedPhaseId)) {
    campaign.checkpoint.completedPhases.push(completedPhaseId);
  }
  campaign.checkpoint.savedAt = new Date().toISOString();
  saveCampaign(campaign);
}

/**
 * Clear checkpoint when scenario is finished (no longer needed).
 */
export function clearCheckpoint(campaign: FounderCampaign): void {
  campaign.checkpoint = null;
  saveCampaign(campaign);
}
