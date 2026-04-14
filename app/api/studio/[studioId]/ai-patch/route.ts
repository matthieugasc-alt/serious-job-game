/**
 * POST /api/studio/[studioId]/ai-patch
 *
 * Produit une PROPOSITION de modification du scénario (preview uniquement).
 * - Lit data/studio/<id>/studio.json
 * - Demande à gpt-4.1-mini un scénario révisé selon l'action choisie
 * - Valide le schéma + la compatibilité runtime (mêmes clés racine, ids préservés)
 * - NE persiste rien. Renvoie { summary, changes[], proposedScenario } au client.
 *
 * Le client affiche la preview et l'utilisateur clique "Appliquer" qui appellera
 * le PUT existant /api/studio/[studioId] avec le proposedScenario.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  AIPatchPayloadSchema,
  PATCH_ACTIONS,
  STUDIO_SYSTEM_PROMPT,
  callJSON,
  type PatchAction,
} from "@/app/lib/studioAI";

const ACTION_INSTRUCTIONS: Record<PatchAction, string> = {
  "fix-inconsistency":
    "Corrige UNIQUEMENT les incohérences narratives (contradictions internes, timeline impossible, personnages aux rôles contradictoires, transitions illogiques, critères d'évaluation détachés des objectifs). Ne retouche rien d'autre.",
  improve:
    "Améliore la qualité rédactionnelle et la précision pédagogique (reformule les objectifs flous, enrichit les descriptions pauvres, rend les tâches joueur actionnables). Ne change ni les ids ni la structure.",
  harden:
    "Rend le scénario PLUS DIFFICILE : durcis les acteurs IA (plus résistants, plus exigeants), augmente la difficulté des objectifs, serre les critères d'évaluation, raccourcis les délais, ajoute des obstacles réalistes. Cohérent avec le contexte pro.",
  smooth:
    "Rend le scénario PLUS FLUIDE : lisse les transitions de phases, clarifie les déclencheurs, harmonise le ton, retire les ruptures narratives. Zéro changement structurel.",
  realism:
    "Renforce le RÉALISME MÉTIER : corrige les détails techniques, précise les codes professionnels, remplace les formulations génériques par du vocabulaire du secteur, ajuste les timings aux usages réels.",
};

function studioJsonPath(studioId: string): string {
  return join(process.cwd(), "data", "studio", studioId, "studio.json");
}

interface PatchBody {
  action?: PatchAction;
  targetPath?: string; // optionnel — ex "phases[2]" ou "actors[0]"
  instruction?: string; // optionnel — précision humaine
}

function buildUserPrompt(
  studioRaw: string,
  action: PatchAction,
  targetPath?: string,
  instruction?: string,
): string {
  const actionBrief = ACTION_INSTRUCTIONS[action];
  const target = targetPath
    ? `\nCIBLE : concentre-toi sur le nœud JSON "${targetPath}" (tu peux toucher à son contenu, mais pas ailleurs sauf nécessité absolue de cohérence).`
    : "\nPortée : scénario complet.";
  const extra = instruction
    ? `\nPRÉCISION UTILISATEUR : ${instruction}`
    : "";

  return `Tâche : produis une version révisée du scénario suivant.
ACTION : ${action}
DIRECTIVE : ${actionBrief}${target}${extra}

CONTRAINTES ABSOLUES :
- Préserve TOUS les ids existants (ids d'acteurs, de phases, de documents, de channels, d'endings).
- Conserve exactement les mêmes clés racine qu'à l'entrée (id, title, subtitle, description, actors, channels, phases, documents, endings, ...).
- Ne supprime pas d'entités existantes sauf si la directive l'exige explicitement.
- Tu peux ajouter de nouvelles entités si nécessaire pour l'action demandée.
- Reste compatible avec le moteur runtime : même types pour chaque champ qu'à l'entrée.

FORMAT DE SORTIE (JSON STRICT) :
{
  "summary": "1 phrase résumant la nature des changements",
  "changes": [ { "path": "phases[2].objective", "summary": "Reformulé pour être actionnable" }, ... ],
  "proposedScenario": { ... le scénario complet révisé, MÊME forme qu'à l'entrée ... }
}

SCÉNARIO ACTUEL :
\`\`\`json
${studioRaw}
\`\`\``;
}

/**
 * Garde-fous côté serveur : on refuse les propositions qui cassent l'invariant
 * "mêmes clés racine et mêmes ids" pour protéger le runtime.
 */
function assertRuntimeCompatible(
  original: Record<string, unknown>,
  proposed: Record<string, unknown>,
): void {
  if (original.id !== proposed.id) {
    throw compatError("L'id du scénario a été modifié.");
  }
  const originalKeys = Object.keys(original).sort();
  for (const key of originalKeys) {
    if (!(key in proposed)) {
      throw compatError(`Clé racine manquante dans la proposition : "${key}"`);
    }
  }

  const checkIdArray = (name: string) => {
    const o = (original as any)[name];
    const p = (proposed as any)[name];
    if (!Array.isArray(o)) return;
    if (!Array.isArray(p)) {
      throw compatError(`"${name}" n'est plus un tableau dans la proposition.`);
    }
    const origIds = new Set(o.map((x: any) => x?.id).filter(Boolean));
    const propIds = new Set(p.map((x: any) => x?.id).filter(Boolean));
    for (const id of origIds) {
      if (!propIds.has(id)) {
        throw compatError(
          `L'entité "${name}" avec id "${id}" a été supprimée — refus pour protéger le runtime.`,
        );
      }
    }
  };

  checkIdArray("actors");
  checkIdArray("phases");
  checkIdArray("documents");
  checkIdArray("endings");
  checkIdArray("channels");
}

function compatError(msg: string): Error {
  const err: any = new Error(msg);
  err.code = "runtime_incompatible";
  return err;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ studioId: string }> },
) {
  const { studioId } = await params;

  try {
    const body: PatchBody = await request.json().catch(() => ({}));
    const action = body.action;

    if (!action || !PATCH_ACTIONS.includes(action)) {
      return Response.json(
        {
          error: `Action invalide. Valeurs acceptées : ${PATCH_ACTIONS.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const p = studioJsonPath(studioId);
    if (!existsSync(p)) {
      return Response.json(
        { error: "Studio scenario not found" },
        { status: 404 },
      );
    }
    const studioRaw = readFileSync(p, "utf-8");
    const original = JSON.parse(studioRaw);

    const payload = await callJSON({
      schema: AIPatchPayloadSchema,
      system: STUDIO_SYSTEM_PROMPT,
      user: buildUserPrompt(studioRaw, action, body.targetPath, body.instruction),
      temperature: action === "fix-inconsistency" ? 0.2 : 0.6,
    });

    assertRuntimeCompatible(original, payload.proposedScenario);

    return Response.json({
      action,
      targetPath: body.targetPath ?? null,
      summary: payload.summary,
      changes: payload.changes,
      proposedScenario: payload.proposedScenario,
    });
  } catch (error: any) {
    console.error(`[ai-patch] error for ${studioId}:`, error);
    let status = 500;
    if (error?.code === "runtime_incompatible") status = 422;
    else if (
      error?.code === "invalid_json" ||
      error?.code === "schema_mismatch"
    )
      status = 502;
    return Response.json(
      {
        error: error?.message || "Erreur serveur lors de la génération du patch",
        code: error?.code,
      },
      { status },
    );
  }
}
