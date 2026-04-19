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
}

export type FounderStateKey = keyof FounderState;

export const FOUNDER_STATE_KEYS: readonly FounderStateKey[] = [
  'treasury', 'ownership', 'mrr', 'payroll',
  'productQuality', 'techDebt', 'investorConfidence', 'marketValidation',
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

export interface FounderOutcome {
  outcomeId:    string;
  label:        string;
  summary:      string;
  signal:       FounderSignal;
  deltas:       FounderStateDelta;
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
