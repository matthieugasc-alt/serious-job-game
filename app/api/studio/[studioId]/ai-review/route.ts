/**
 * POST /api/studio/[studioId]/ai-review
 *
 * Produit une revue IA complète du scénario courant.
 * - Lit data/studio/<id>/studio.json
 * - Demande à gpt-4.1-mini de produire { blockingErrors[], warnings[], suggestions[] }
 *   conformes à AIReviewPayloadSchema
 * - Persiste la revue dans data/studio/<id>/ai-reviews.json (historique, 10 dernières)
 * - Renvoie la revue au client
 *
 * N'applique AUCUNE modification au scénario — c'est une lecture seule côté scénario.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

import { createHash, randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import {
  AIReviewPayloadSchema,
  STUDIO_SYSTEM_PROMPT,
  callJSON,
} from "@/app/lib/studioAI";
import { requireAuth } from "@/app/lib/auth";

const REVIEWS_HISTORY_LIMIT = 10;

interface PersistedReview {
  id: string;
  scenarioId: string;
  versionHash: string;
  createdAt: string;
  blockingErrors: any[];
  warnings: any[];
  suggestions: any[];
}

function studioDir(studioId: string): string {
  return join(process.cwd(), "data", "studio", studioId);
}

function readStudioJson(studioId: string): {
  raw: string;
  data: any;
} | null {
  const p = join(studioDir(studioId), "studio.json");
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, "utf-8");
  return { raw, data: JSON.parse(raw) };
}

function readReviewsFile(studioId: string): PersistedReview[] {
  const p = join(studioDir(studioId), "ai-reviews.json");
  if (!existsSync(p)) return [];
  try {
    const parsed = JSON.parse(readFileSync(p, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeReviewsFile(studioId: string, reviews: PersistedReview[]): void {
  const dir = studioDir(studioId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const p = join(dir, "ai-reviews.json");
  writeFileSync(p, JSON.stringify(reviews, null, 2), "utf-8");
}

function buildUserPrompt(studioRaw: string): string {
  return `Voici le scénario à auditer (JSON du studio). Analyse-le de façon exhaustive et produis une revue structurée.

CRITÈRES À VÉRIFIER :
- Incohérences narratives (contradictions internes entre contexte, mission, phases, endings)
- Objectifs irréalistes ou mal calibrés vs durée / difficulté
- Transitions faibles entre phases (déclencheurs peu clairs)
- Difficulté mal dosée (trop facile / trop dure pour le profil visé)
- Acteurs mal définis (prompt vague, pas de motivation claire, pas de style)
- Documents inutiles, mal rattachés ou manquants
- Phases déséquilibrées (une phase qui écrase les autres)
- Tâches floues pour le joueur
- Compétences cibles absentes ou non observables dans une phase
- Compétences formulées trop vaguement ("bien communiquer" au lieu d'une capacité précise et mesurable)
- Phase sans trigger de fin clair lié à la démonstration d'une compétence
- Scoring mécanique non relié aux compétences (score pur sans valeur pédagogique)
- Conditions de fin (endings) incohérentes avec les compétences / completion_rules

LOGIQUE PÉDAGOGIQUE :
Tu raisonnes d'abord en compétences : qu'est-ce que le joueur doit apprendre, montrer, valider ?
Le score et les critères techniques sont secondaires et doivent servir la validation d'une compétence, pas l'inverse.

FORMAT DE SORTIE STRICT (JSON) :
{
  "blockingErrors": [ { "id": "uuid-like", "path": "phases[2].transitions[0]", "title": "...", "description": "...", "severity": "blocker", "rationale": "..." } ],
  "warnings":       [ { ...même forme..., "severity": "warning" } ],
  "suggestions":    [ { ...même forme..., "severity": "suggestion" } ]
}

- "blockingErrors" = le scénario est incompilable ou injouable tel quel.
- "warnings" = il tourne mais avec un risque important pour la qualité pédagogique.
- "suggestions" = pistes d'amélioration non obligatoires.

Sois précis dans "path" (utilise la vraie structure du JSON fourni). Chaque item doit être actionnable.

SCÉNARIO :
\`\`\`json
${studioRaw}
\`\`\``;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ studioId: string }> },
) {
  const { studioId } = await params;

  try {
    // ── Auth guard ──
    const auth = requireAuth(_request);
    if (auth.error) return auth.error;

    const studio = readStudioJson(studioId);
    if (!studio) {
      return Response.json(
        { error: "Studio scenario not found" },
        { status: 404 },
      );
    }

    const versionHash = createHash("sha1").update(studio.raw).digest("hex");

    // Appel IA borné
    const payload = await callJSON({
      schema: AIReviewPayloadSchema,
      system: STUDIO_SYSTEM_PROMPT,
      user: buildUserPrompt(studio.raw),
      temperature: 0.3,
    });

    // Compléter les IDs manquants côté serveur pour robustesse
    const withIds = {
      blockingErrors: payload.blockingErrors.map((i) => ({
        ...i,
        id: i.id || randomUUID(),
      })),
      warnings: payload.warnings.map((i) => ({
        ...i,
        id: i.id || randomUUID(),
      })),
      suggestions: payload.suggestions.map((i) => ({
        ...i,
        id: i.id || randomUUID(),
      })),
    };

    const review: PersistedReview = {
      id: randomUUID(),
      scenarioId: studioId,
      versionHash,
      createdAt: new Date().toISOString(),
      ...withIds,
    };

    const history = readReviewsFile(studioId);
    const next = [review, ...history].slice(0, REVIEWS_HISTORY_LIMIT);
    writeReviewsFile(studioId, next);

    return Response.json({ review });
  } catch (error: any) {
    console.error(`[ai-review] error for ${studioId}:`, error);
    const status =
      error?.code === "invalid_json" || error?.code === "schema_mismatch"
        ? 502
        : typeof error?.status === "number"
          ? error.status
          : 500;
    return Response.json(
      {
        error:
          error?.message || "Erreur serveur lors de la génération de la revue",
        code: error?.code,
      },
      { status },
    );
  }
}

/**
 * GET /api/studio/[studioId]/ai-review
 * Renvoie l'historique (10 dernières revues persistées).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ studioId: string }> },
) {
  const { studioId } = await params;
  try {
    const reviews = readReviewsFile(studioId);
    return Response.json({ reviews });
  } catch (error: any) {
    console.error(`[ai-review GET] error for ${studioId}:`, error);
    return Response.json(
      { error: error?.message || "Erreur lecture historique" },
      { status: 500 },
    );
  }
}
