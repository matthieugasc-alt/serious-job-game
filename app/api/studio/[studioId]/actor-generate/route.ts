/**
 * POST /api/studio/[studioId]/actor-generate
 *
 * Transforme un briefing narratif (ActorBriefing) en prompt IA structuré +
 * règles de comportement + limites + style.
 *
 * Body :
 *   { actorId: string, briefing: ActorBriefing }
 *
 * Réponse :
 *   { prompt, behaviorRules[], limits[], style }
 *
 * N'écrit RIEN sur le scénario. C'est l'UI qui décide d'injecter dans
 * actor.promptContent via le PUT existant après validation humaine.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

import {
  ActorBriefingSchema,
  ActorGenerationPayloadSchema,
  STUDIO_SYSTEM_PROMPT,
  callJSON,
  type ActorBriefing,
} from "@/app/lib/studioAI";

interface ReqBody {
  actorId?: string;
  actorName?: string;
  briefing?: unknown;
}

function levelLabel(v: number): string {
  if (v < 0.25) return "très bas";
  if (v < 0.5) return "bas";
  if (v < 0.75) return "élevé";
  return "très élevé";
}

function buildUserPrompt(
  briefing: ActorBriefing,
  actorName?: string,
): string {
  return `Tu dois générer le comportement d'un acteur IA pour un scénario pédagogique.

BRIEFING NARRATIF :
- Nom : ${actorName || "(non précisé)"}
- Rôle professionnel : ${briefing.role}
- Traits de personnalité : ${briefing.personalityTraits.join(", ") || "(aucun)"}
- Histoire / contexte : ${briefing.backstory || "(non précisé)"}
- Motivations : ${briefing.motivations.join(", ") || "(aucune)"}
- Peurs : ${briefing.fears.join(", ") || "(aucune)"}
- Biais : ${briefing.biases.join(", ") || "(aucun)"}
- Relation au joueur : ${briefing.relationToPlayer || "(non précisé)"}
- Objectifs personnels : ${briefing.personalGoals.join(", ") || "(aucun)"}
- Niveau d'ouverture : ${levelLabel(briefing.openness)} (${briefing.openness.toFixed(2)}/1.00)
- Niveau de tension : ${levelLabel(briefing.tension)} (${briefing.tension.toFixed(2)}/1.00)
- Niveau de rigidité : ${levelLabel(briefing.rigidity)} (${briefing.rigidity.toFixed(2)}/1.00)
- Éléments de langage : ${briefing.speechElements || "(non précisé)"}

TÂCHE :
Produis un JSON strict avec 4 champs :
{
  "prompt": "Instruction système complète (2 à 4 paragraphes) qui pilote le comportement de l'acteur pendant la conversation. Doit intégrer rôle, motivations, peurs, biais, rapport au joueur, niveaux d'ouverture/tension/rigidité et style de langage.",
  "behaviorRules": [ "règle 1 concrète", "règle 2...", ... 4 à 8 règles ],
  "limits": [ "ce que l'acteur ne fait JAMAIS", ... 3 à 5 limites ],
  "style": "1 phrase décrivant le ton et le registre de parole (vouvoiement/tutoiement, tics éventuels, niveau de formalité)"
}

EXIGENCES :
- Le prompt doit pouvoir être directement copié dans actor.promptContent.
- Pas de méta-commentaires sur la pédagogie ou le scénario global.
- Garde la cohérence avec les niveaux numériques fournis (un acteur à rigidité très élevée ne doit pas capituler au premier argument).
- Écris en français naturel, pas de jargon LLM.`;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ studioId: string }> },
) {
  const { studioId } = await params;

  try {
    const body: ReqBody = await request.json().catch(() => ({}));
    const parsedBriefing = ActorBriefingSchema.safeParse(body.briefing);
    if (!parsedBriefing.success) {
      return Response.json(
        {
          error: "Briefing invalide",
          issues: parsedBriefing.error.issues,
        },
        { status: 400 },
      );
    }

    const payload = await callJSON({
      schema: ActorGenerationPayloadSchema,
      system: STUDIO_SYSTEM_PROMPT,
      user: buildUserPrompt(parsedBriefing.data, body.actorName),
      temperature: 0.6,
    });

    return Response.json({
      actorId: body.actorId ?? null,
      scenarioId: studioId,
      ...payload,
    });
  } catch (error: any) {
    console.error(`[actor-generate] error for ${studioId}:`, error);
    const status =
      error?.code === "invalid_json" || error?.code === "schema_mismatch"
        ? 502
        : 500;
    return Response.json(
      {
        error: error?.message || "Erreur serveur lors de la génération",
        code: error?.code,
      },
      { status },
    );
  }
}
