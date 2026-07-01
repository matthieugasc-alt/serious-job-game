/**
 * Tests unit — deepSaveCheckpoint (fix #70).
 *
 * Vérifie le guard anti-stale (phaseIndex mismatch) et le no-op quand
 * checkpoint absent. Le wipe sur rollback est testé séparément.
 *
 * Note: on stubbe saveCampaign via une écriture temporaire dans
 * data/founder_campaigns/ ce qui reste isolé. Le test crée un tmp dir
 * pour éviter de polluer les fichiers réels.
 */

import { describe, it, expect, vi } from "vitest";

// Stub fs writes BEFORE importing founder — the module reads fs at
// import time via ensureCampaignsDir and saveCampaign. The sandbox
// blocks writes to data/founder_campaigns/, and even in dev we don't
// want the tests to pollute real campaign files.
vi.mock("fs", async () => {
  const actual: any = await vi.importActual("fs");
  return {
    ...actual,
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true),
  };
});

const {
  deepSaveCheckpoint,
  rollbackCheckpoint,
} = await import("../founder");
type FounderCampaign = import("../founder").FounderCampaign;
type FounderCheckpoint = import("../founder").FounderCheckpoint;

const TEST_ID = "test-deepsave";

function baseCampaign(withCheckpoint = true): FounderCampaign {
  return {
    id: TEST_ID,
    userId: "test-user",
    createdAt: new Date().toISOString(),
    status: "in_progress",
    currentScenarioIndex: 0,
    pendingScenarioId: null,
    state: {
      treasury: 10000,
      ownership: 100,
      mrr: 0,
      payroll: 0,
      productQuality: 50,
      techDebt: 20,
      investorConfidence: 50,
      marketValidation: 50,
      elapsedMonths: 0,
    },
    completedScenarios: [],
    lastMicroDebrief: null,
    hasAdvisoryBoard: false,
    burnRateMonthly: 0,
    checkpoint: withCheckpoint
      ? {
          scenarioId: "founder_02_pmv",
          phaseIndex: 3,
          completedPhases: ["phase_1", "phase_2", "phase_3"],
          abandonCount: 0,
          penaltiesApplied: 0,
          savedAt: new Date().toISOString(),
        }
      : null,
  };
}

function snap(overrides: Partial<NonNullable<FounderCheckpoint["sessionSnapshot"]>> = {}) {
  return {
    flags: {},
    chatMessages: [],
    mailDrafts: {},
    savedDrafts: {},
    scores: {},
    pendingTimedEvents: [],
    inboxMails: [],
    sentMails: [],
    injectedPhaseEntryEvents: [],
    currentPhaseIndex: 3,
    capturedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("deepSaveCheckpoint — fix #70", () => {
  it("no-ops (saved:false) when checkpoint is absent", () => {
    const campaign = baseCampaign(false);
    const res = deepSaveCheckpoint(campaign, snap());
    expect(res.saved).toBe(false);
    expect(res.reason).toContain("no checkpoint");
  });

  it("saves the snapshot when phaseIndex matches", () => {
    const campaign = baseCampaign(true);
    const s = snap({
      flags: { pacte_signed_clean: true, foo: "bar" },
      chatMessages: [{ role: "player", content: "hi" }],
      currentPhaseIndex: 3,
    });
    const res = deepSaveCheckpoint(campaign, s);
    expect(res.saved).toBe(true);
    expect(campaign.checkpoint!.sessionSnapshot).toBeDefined();
    expect(campaign.checkpoint!.sessionSnapshot!.flags.pacte_signed_clean).toBe(true);
    expect(campaign.checkpoint!.sessionSnapshot!.chatMessages).toHaveLength(1);
    // capturedAt est réécrit par le serveur (pas celui du client).
    expect(campaign.checkpoint!.sessionSnapshot!.capturedAt).toBeTruthy();
  });

  it("rejects stale snapshot when phaseIndex is behind", () => {
    const campaign = baseCampaign(true);
    // Checkpoint est en phase 3, snapshot dit encore phase 2 → stale.
    const res = deepSaveCheckpoint(campaign, snap({ currentPhaseIndex: 2 }));
    expect(res.saved).toBe(false);
    expect(res.reason).toContain("phase 2");
    expect(campaign.checkpoint!.sessionSnapshot).toBeUndefined();
  });

  it("rejects stale snapshot when phaseIndex is ahead (should not happen but defensive)", () => {
    const campaign = baseCampaign(true);
    const res = deepSaveCheckpoint(campaign, snap({ currentPhaseIndex: 4 }));
    expect(res.saved).toBe(false);
  });

  it("updates checkpoint.savedAt on successful save", async () => {
    const campaign = baseCampaign(true);
    const before = campaign.checkpoint!.savedAt;
    await new Promise((r) => setTimeout(r, 10));
    deepSaveCheckpoint(campaign, snap());
    expect(campaign.checkpoint!.savedAt).not.toBe(before);
  });
});

describe("rollbackCheckpoint — wipes sessionSnapshot", () => {
  it("clears any deep snapshot when rolling back (post-HARD_REJECT hygiene)", () => {
    const campaign = baseCampaign(true);
    // Prime avec un snapshot d'abord.
    deepSaveCheckpoint(campaign, snap({ flags: { chosen_kol_id: "burned" } }));
    expect(campaign.checkpoint!.sessionSnapshot).toBeDefined();

    // Rollback vers phase 1 → le snapshot post-N ne doit plus exister.
    rollbackCheckpoint(campaign, "phase_2", 1);
    expect(campaign.checkpoint!.sessionSnapshot).toBeUndefined();
    expect(campaign.checkpoint!.phaseIndex).toBe(1);
  });
});
