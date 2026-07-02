import { NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import {
  loadCampaign,
  saveCampaign,
  loadRules,
  resolveOutcome,
  applyOutcomeToCampaign,
  interpolateMicroDebrief,
  type FounderCampaign,
  type FounderMicroDebrief,
} from "@/app/lib/founder";
import { logOutcomeApplied } from "@/app/lib/gameEvents";

/**
 * POST /api/v2/complete — persistance d'une fin de partie v2.
 *
 * Reçoit le résumé produit par le player (/play/[scenarioId]) :
 *   { scenario_id, campaign_id?, ending_id, step_results, ... }
 *
 * Persistance : app/lib/gameRecords.ts est par-utilisateur (Bearer token
 * obligatoire) et son schéma ServerGameRecord (avgScore, debrief,
 * playerName…) ne mappe pas une complétion v2 anonyme — pas "simple à
 * réutiliser" ici. On écrit donc un fichier JSON append-only dans
 * data/v2_completions/<scenario_id>_<timestamp>.json.
 *
 * Founder : quand campaign_id est fourni et que le scénario est couvert
 * par data/founder_rules.json, l'outcome économique est résolu et
 * appliqué ici (remplace le flow legacy /api/founder/apply-outcome qui
 * lisait les GameRecords du player legacy). La réponse contient alors
 * { microDebrief, campaign } pour affichage direct par PlayerClient.
 *
 * TODO-DEBT(founder-auth) : cette route est anonyme (le Shell v2 ne
 * transmet pas de Bearer token). Le campaign_id (UUID non devinable)
 * sert de capability : quiconque le possède peut faire avancer la
 * campagne. À re-sécuriser quand le player v2 aura une session.
 */

export const runtime = "nodejs";

const COMPLETIONS_DIR = path.join(process.cwd(), "data", "v2_completions");

interface StepResultSummary {
  step_id: string;
  mechanic: string;
  passed: boolean;
  attempts: number;
  applied_rule?: string;
  matched?: string[];
  missing?: string[];
  critical_failures?: string[];
  bonus_matched?: string[];
  /** Output brut de la mécanique (ex : { agreement, proposals_count }
   *  pour `negociation`) — exploité pour les deltas founder dynamiques. */
  output?: Record<string, unknown>;
}

interface Body {
  scenario_id: string;
  campaign_id?: string | null;
  ending_id?: string | null;
  finished_at?: string;
  duration_min?: number;
  step_results?: StepResultSummary[];
}

// ── Founder : extraction de l'accord de négociation ──────────────

interface Agreement {
  concluded: boolean;
  terms: Record<string, unknown>;
}

/** Dernier output contenant un `agreement` (mécanique negociation). */
function extractAgreement(stepResults: StepResultSummary[]): Agreement | null {
  for (let i = stepResults.length - 1; i >= 0; i--) {
    const out = stepResults[i]?.output;
    if (!out || typeof out !== "object") continue;
    const agreement = (out as Record<string, unknown>).agreement;
    if (!agreement || typeof agreement !== "object" || Array.isArray(agreement)) continue;
    const a = agreement as Record<string, unknown>;
    const terms = a.terms;
    if (!terms || typeof terms !== "object" || Array.isArray(terms)) continue;
    return { concluded: a.concluded === true, terms: terms as Record<string, unknown> };
  }
  return null;
}

interface FounderApplication {
  microDebrief: FounderMicroDebrief | null;
  campaign: FounderCampaign;
  alreadyCompleted?: boolean;
}

/**
 * Résout et applique l'outcome founder d'une complétion v2.
 * Réutilise la logique existante de app/lib/founder.ts (resolveOutcome,
 * applyOutcomeToCampaign, interpolateMicroDebrief) — miroir du flow
 * legacy /api/founder/apply-outcome, alimenté par step_results v2 au
 * lieu du GameRecord.debrief legacy.
 */
function applyFounderCompletion(
  campaignId: string,
  scenarioId: string,
  endingId: string | null,
  stepResults: StepResultSummary[],
  completionId: string,
): FounderApplication | { error: string } {
  const campaign = loadCampaign(campaignId);
  if (!campaign) return { error: `Campagne introuvable : ${campaignId}` };

  const rules = loadRules();
  if (!rules.scenarios[scenarioId]) {
    return { error: `Scénario hors périmètre founder : ${scenarioId}` };
  }

  // Idempotence : un double POST (keepalive + retry) ne rejoue pas l'outcome.
  if (campaign.completedScenarios.some((s) => s.scenarioId === scenarioId)) {
    return { microDebrief: campaign.lastMicroDebrief, campaign, alreadyCompleted: true };
  }

  if (!endingId) return { error: "ending_id manquant — outcome non résolu" };

  let outcome;
  try {
    outcome = resolveOutcome(scenarioId, endingId, rules);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  const burnPerMonth = campaign.burnRateMonthly ?? 250;
  const months = outcome.deltas.elapsedMonths ?? 0;
  const burn = burnPerMonth * months;

  // ── Deltas dynamiques depuis l'accord de négociation v2 ──
  const agreement = extractAgreement(stepResults);
  const agreedNumber = (key: string): number | null => {
    if (!agreement?.concluded) return null;
    const v = agreement.terms[key];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };

  // founder_02_mvp — terme "prix" : la trésorerie reflète le contrat réel,
  // pas la valeur codée en dur (même règle que le flow legacy contractPrice).
  const contractPrice = agreedNumber("prix");
  if (contractPrice != null) {
    outcome = {
      ...outcome,
      deltas: { ...outcome.deltas, treasury: -(contractPrice + burn) },
    };
  }

  // founder_04_v1 — termes "pourcentage_ca" / "plafond_eur" / "duree_ans" :
  // intéressement négocié, stocké en flags de campagne (parité legacy).
  const royaltiesPct = agreedNumber("pourcentage_ca");
  const royaltiesCap = agreedNumber("plafond_eur");
  const royaltiesDuration = agreedNumber("duree_ans");
  if (royaltiesPct != null) {
    outcome = {
      ...outcome,
      setsFlags: {
        ...(outcome.setsFlags || {}),
        royalties_pct: royaltiesPct,
        royalties_cap: royaltiesCap,
        royalties_duration_years: royaltiesDuration,
      },
    };
  }

  // TODO-DEBT(founder-dynamic-deltas) : le scénario v2 founder_02 ne
  // négocie plus d'equity (pas de terme "equity") et founder_04 ne produit
  // plus de devis chiffré (pas de terme cash). Les deltas ownership/treasury
  // correspondants restent STATIQUES (founder_rules.json) ; les variables de
  // template contract_equity / devis_* sont rétro-calculées depuis ces deltas
  // pour garder un microDebrief cohérent. devis_features_count n'a aucune
  // source v2 → laissé null ({{devis_features_count}} restera visible, choix
  // assumé de founder.ts : bug visible plutôt que masqué).

  // ── Variables de template du microDebrief ──
  const treasuryAfter = campaign.state.treasury + outcome.deltas.treasury;
  const staticCash = -outcome.deltas.treasury - burn; // cash sorti hors burn
  const contractEquity = outcome.deltas.ownership < 0 ? -outcome.deltas.ownership : null;

  let dealDetail = "";
  if (royaltiesPct != null && royaltiesPct > 0) {
    dealDetail = `Interessement de ${royaltiesPct}%${
      royaltiesCap != null ? ` (plafond ${royaltiesCap} €)` : " sans plafond"
    }`;
  }
  if (contractEquity != null && contractEquity > 0) {
    dealDetail += (dealDetail ? " + " : "") + `${contractEquity}% de BSA`;
  }
  if (!dealDetail) dealDetail = "Conditions trop genereuses";

  const templateVars: Record<string, string | number | null> = {
    contract_price: contractPrice ?? (staticCash > 0 ? staticCash : null),
    contract_equity: contractEquity,
    burn,
    treasury_after: treasuryAfter,
    devis_total: staticCash > 0 ? staticCash : null,
    devis_cash_paid: staticCash > 0 ? staticCash : null,
    devis_features_count: null, // cf. TODO-DEBT(founder-dynamic-deltas)
    deal_detail: dealDetail,
  };

  outcome = {
    ...outcome,
    microDebrief: interpolateMicroDebrief(outcome.microDebrief, templateVars),
  };

  // ── Application : deltas + flags via le helper unifié ──
  const updatedCampaign = applyOutcomeToCampaign(campaign, outcome);

  updatedCampaign.completedScenarios.push({
    scenarioId,
    outcomeId: outcome.outcomeId,
    signal: outcome.signal,
    stateAfter: { ...updatedCampaign.state },
    completedAt: new Date().toISOString(),
  });

  // Checkpoint legacy inutile en v2 (le Shell reprend via localStorage) —
  // on le purge pour ne pas laisser un état de reprise obsolète.
  updatedCampaign.checkpoint = null;

  updatedCampaign.currentScenarioIndex += 1;
  updatedCampaign.pendingScenarioId = null;

  const scenarioKeys = Object.keys(rules.scenarios);
  if (updatedCampaign.currentScenarioIndex >= scenarioKeys.length) {
    updatedCampaign.status = "completed";
  }

  saveCampaign(updatedCampaign);

  // Logging passif (fire-and-forget, ne casse jamais le jeu)
  try {
    logOutcomeApplied(
      completionId,
      updatedCampaign.userId,
      scenarioId,
      endingId,
      outcome.deltas,
      outcome.microDebrief?.decision || "none",
    );
  } catch {
    // swallow
  }

  return { microDebrief: outcome.microDebrief, campaign: updatedCampaign };
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  if (typeof body?.scenario_id !== "string" || body.scenario_id.length === 0) {
    return NextResponse.json({ error: "scenario_id requis" }, { status: 400 });
  }
  // Le scenario_id sert de nom de fichier : mêmes contraintes que /play.
  if (!/^[a-zA-Z0-9_-]+$/.test(body.scenario_id)) {
    return NextResponse.json({ error: "scenario_id invalide" }, { status: 400 });
  }

  const record = {
    id: crypto.randomUUID(),
    scenario_id: body.scenario_id,
    campaign_id: body.campaign_id ?? null,
    ending_id: body.ending_id ?? null,
    finished_at: body.finished_at ?? new Date().toISOString(),
    duration_min: typeof body.duration_min === "number" ? body.duration_min : null,
    step_results: Array.isArray(body.step_results) ? body.step_results : [],
  };

  try {
    fs.mkdirSync(COMPLETIONS_DIR, { recursive: true });
    const file = path.join(
      COMPLETIONS_DIR,
      `${body.scenario_id}_${Date.now()}.json`,
    );
    fs.writeFileSync(file, JSON.stringify(record, null, 2), "utf-8");
  } catch (error) {
    console.error("v2/complete : échec de persistance", error);
    return NextResponse.json({ error: "Persistance impossible" }, { status: 500 });
  }

  // ── Founder : appliquer l'outcome économique à la campagne ──
  if (typeof body.campaign_id === "string" && body.campaign_id.length > 0) {
    let founder: FounderApplication | { error: string };
    try {
      founder = applyFounderCompletion(
        body.campaign_id,
        body.scenario_id,
        record.ending_id,
        record.step_results,
        record.id,
      );
    } catch (error) {
      // La complétion est déjà persistée : ne jamais bloquer le joueur.
      console.error("v2/complete : échec application outcome founder", error);
      founder = { error: "Application de l'outcome founder impossible" };
    }

    if ("error" in founder) {
      console.error("v2/complete : outcome founder non appliqué —", founder.error);
      return NextResponse.json({ ok: true, id: record.id, founder_error: founder.error });
    }

    return NextResponse.json({
      ok: true,
      id: record.id,
      microDebrief: founder.microDebrief,
      campaign: founder.campaign,
      already_completed: founder.alreadyCompleted ?? false,
    });
  }

  return NextResponse.json({ ok: true, id: record.id });
}
