import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/app/lib/auth';
import { getRecordsForUser } from '@/app/lib/gameRecords';
import {
  loadCampaign,
  saveCampaign,
  loadRules,
  resolveOutcome,
  applyOutcomeToCampaign,
  interpolateMicroDebrief,
} from '@/app/lib/founder';

/**
 * POST /api/founder/apply-outcome
 * Body: { campaignId }
 *
 * Reads the latest GameRecord for the pending scenario,
 * resolves the FounderOutcome, applies deltas, returns micro-debrief.
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const session = validateSession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const body = await req.json();
  const { campaignId } = body;

  if (!campaignId) {
    return NextResponse.json({ error: 'campaignId required' }, { status: 400 });
  }

  const campaign = loadCampaign(campaignId);
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  if (campaign.userId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!campaign.pendingScenarioId) {
    return NextResponse.json({ error: 'No pending scenario' }, { status: 400 });
  }

  const scenarioId = campaign.pendingScenarioId;

  // Check not already completed
  if (campaign.completedScenarios.some((s) => s.scenarioId === scenarioId)) {
    return NextResponse.json({ error: 'Scenario already completed' }, { status: 400 });
  }

  // Find the latest game record for this scenario
  const records = getRecordsForUser(session.user.id);
  const matchingRecord = records.find((r) => r.scenarioId === scenarioId);

  if (!matchingRecord) {
    return NextResponse.json(
      { error: `No game record found for scenario "${scenarioId}". Play the scenario first.` },
      { status: 404 }
    );
  }

  // Resolve outcome from normalized ending
  const rules = loadRules();
  let outcome;
  try {
    outcome = resolveOutcome(scenarioId, matchingRecord.ending, rules);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  // ── Dynamic deltas: override hardcoded values with actual contract values ──
  // For scenarios where the player negotiates a price/equity (e.g. founder_02_mvp),
  // the treasury and ownership deltas must reflect the actual contract, not hardcoded values.
  const debrief = matchingRecord.debrief;
  if (debrief?.contractPrice != null && typeof debrief.contractPrice === 'number') {
    // Treasury delta = -(contract price + burn for the period)
    // The elapsed months burn is kept from the outcome.
    const burnPerMonth = campaign.burnRateMonthly ?? 250;
    const months = outcome.deltas.elapsedMonths ?? 0;
    const burn = burnPerMonth * months;
    outcome = {
      ...outcome,
      deltas: {
        ...outcome.deltas,
        treasury: -(debrief.contractPrice + burn),
      },
    };
  }
  if (debrief?.contractEquity != null && typeof debrief.contractEquity === 'number') {
    // contractEquity can be 0 (cash-only deal) — 0 is a valid value
    outcome = {
      ...outcome,
      deltas: {
        ...outcome.deltas,
        ownership: -debrief.contractEquity,
      },
    };
  }

  // ── Store royalties (intéressement) in campaign flags for future scenarios ──
  if (debrief?.royaltiesPct != null && typeof debrief.royaltiesPct === 'number') {
    outcome = {
      ...outcome,
      setsFlags: {
        ...(outcome.setsFlags || {}),
        royalties_pct: debrief.royaltiesPct,
        royalties_cap: debrief.royaltiesCap ?? null,
        royalties_duration_years: debrief.royaltiesDuration ?? null,
      },
    };
  }

  // ── Interpolate microDebrief templates with actual values ──
  // Variables available: contract_price, contract_equity, burn, treasury_after,
  // devis_total, devis_cash_paid, devis_features_count, deal_detail
  const burnPerMonthForTemplate = campaign.burnRateMonthly ?? 250;
  const monthsForTemplate = outcome.deltas.elapsedMonths ?? 0;
  const burnForTemplate = burnPerMonthForTemplate * monthsForTemplate;
  const treasuryAfterForTemplate = campaign.state.treasury + outcome.deltas.treasury;

  // Build deal_detail for S4 bad_deal
  let dealDetail = '';
  if (debrief?.royaltiesPct != null && debrief.royaltiesPct > 0) {
    dealDetail = `Interessement de ${debrief.royaltiesPct}%${debrief.royaltiesCap ? ` (plafond ${debrief.royaltiesCap} €)` : ' sans plafond'}`;
  }
  if (debrief?.contractEquity != null && debrief.contractEquity > 0) {
    dealDetail += (dealDetail ? ' + ' : '') + `${debrief.contractEquity}% de BSA`;
  }
  if (!dealDetail) dealDetail = 'Conditions trop genereux';

  const templateVars: Record<string, string | number | null> = {
    contract_price: debrief?.contractPrice ?? null,
    contract_equity: debrief?.contractEquity ?? null,
    burn: burnForTemplate,
    treasury_after: treasuryAfterForTemplate,
    devis_total: debrief?.devisTotal ?? debrief?.contractPrice ?? null,
    devis_cash_paid: debrief?.contractPrice ?? null,
    devis_features_count: Array.isArray(debrief?.selectedFeatures) ? debrief.selectedFeatures.length : null,
    deal_detail: dealDetail,
  };

  outcome = {
    ...outcome,
    microDebrief: interpolateMicroDebrief(outcome.microDebrief, templateVars),
  };

  // Apply deltas + flags via unified helper
  const stateBefore = { ...campaign.state };
  const updatedCampaign = applyOutcomeToCampaign(campaign, outcome);

  // Record completion
  updatedCampaign.completedScenarios.push({
    scenarioId,
    outcomeId: outcome.outcomeId,
    signal: outcome.signal,
    stateAfter: { ...updatedCampaign.state },
    completedAt: new Date().toISOString(),
  });

  // Clear checkpoint (anti-rollback: scenario is done)
  updatedCampaign.checkpoint = null;

  // Advance to next scenario
  updatedCampaign.currentScenarioIndex += 1;
  updatedCampaign.pendingScenarioId = null;

  // Check if all scenarios done
  const scenarioKeys = Object.keys(rules.scenarios);
  if (updatedCampaign.currentScenarioIndex >= scenarioKeys.length) {
    updatedCampaign.status = 'completed';
  }

  saveCampaign(updatedCampaign);

  return NextResponse.json({
    outcome: {
      outcomeId: outcome.outcomeId,
      label: outcome.label,
      summary: outcome.summary,
      signal: outcome.signal,
    },
    microDebrief: outcome.microDebrief,
    stateBefore,
    stateAfter: updatedCampaign.state,
    deltas: outcome.deltas,
    campaign: updatedCampaign,
  });
}
