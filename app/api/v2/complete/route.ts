import { NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

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
}

interface Body {
  scenario_id: string;
  campaign_id?: string | null;
  ending_id?: string | null;
  finished_at?: string;
  duration_min?: number;
  step_results?: StepResultSummary[];
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

  // TODO(founder) : quand campaign_id est fourni, câbler apply-outcome
  // côté founder (progression de campagne, déblocage du step suivant).
  // Le chantier "bascule founder" (Jalon 5) branchera ici — pour
  // l'instant on se contente de persister la complétion.

  return NextResponse.json({ ok: true, id: record.id });
}
