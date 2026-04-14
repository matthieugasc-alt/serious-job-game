/**
 * POST /api/studio/[studioId]/assistant
 *
 * Copilote intégré du Scenario Studio.
 *
 * Body :
 *   {
 *     mode: "free" | "fill" | "patch",
 *     message: string,
 *     history?: AssistantMessage[],          // messages précédents (user/assistant)
 *     context?: { activeTab?: string, focusPath?: string }   // borne l'IA
 *   }
 *
 * Réponse selon le mode :
 *   - "free"  → { mode, answer, followUps[] }
 *   - "fill"  → { mode, rationale, fields: [{path,value,summary}] }   (preview, non appliqué)
 *   - "patch" → { mode, summary, changes[], proposedScenario }         (preview, non appliqué)
 *
 * Aucune écriture sur le scénario. L'UI affiche la proposition, l'utilisateur
 * clique "Appliquer" qui met à jour le state local puis l'autosave persiste.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  AIPatchPayloadSchema,
  ASSISTANT_MODES,
  AssistantFillResponseSchema,
  AssistantFreeResponseSchema,
  AssistantMessageSchema,
  STUDIO_SYSTEM_PROMPT,
  callJSON,
  type AssistantMessage,
  type AssistantMode,
} from "@/app/lib/studioAI";
import { z } from "zod";

const HISTORY_MAX = 12; // on borne l'historique passé au modèle

interface ReqBody {
  mode?: AssistantMode;
  message?: string;
  history?: unknown;
  context?: {
    activeTab?: string;
    focusPath?: string;
  };
}

function studioJsonPath(studioId: string): string {
  return join(process.cwd(), "data", "studio", studioId, "studio.json");
}

function truncateHistory(history: AssistantMessage[]): AssistantMessage[] {
  return history.slice(-HISTORY_MAX);
}

function sectionLabel(activeTab?: string): string {
  switch (activeTab) {
    case "general":
      return "l'onglet Général (titre, sous-titre, description, métadonnées)";
    case "narrative":
      return "l'onglet Narratif (contexte, mission, situation initiale, déclencheur, background)";
    case "actors":
      return "l'onglet Acteurs";
    case "phases":
      return "l'onglet Phases (compétences cibles, objectifs, trigger de fin de phase, scoring secondaire)";
    case "documents":
      return "l'onglet Documents";
    case "endings":
      return "l'onglet Fins";
    case "review":
      return "l'onglet Revue IA";
    case "json":
      return "l'onglet Aperçu JSON";
    default:
      return "le scénario dans son ensemble";
  }
}

function buildFreePrompt(
  studioRaw: string,
  message: string,
  history: AssistantMessage[],
  activeTab?: string,
  focusPath?: string,
): { system: string; user: string } {
  const hist = history
    .map((m) => `${m.role === "user" ? "UTILISATEUR" : "ASSISTANT"}: ${m.content}`)
    .join("\n");
  const focus = focusPath ? `\nFocus : "${focusPath}"` : "";
  return {
    system:
      STUDIO_SYSTEM_PROMPT +
      `\n\nMODE DISCUSSION — tu ne modifies pas le scénario.
Mais tu ne te contentes PAS de commenter ou poser des questions.
Tu PRODUIS du contenu directement exploitable : brouillons de descriptions, ébauches de dialogues, exemples de mails, propositions de personnages, formulations de compétences, etc.
Si on te demande un avis, donne-le en 2 phrases puis propose immédiatement une alternative concrète.
Ne reformule jamais la question. Réponds.`,
    user: `Section active : ${sectionLabel(activeTab)}.${focus}

${hist ? `Historique :\n${hist}\n` : ""}Scénario :
\`\`\`json
${studioRaw}
\`\`\`

${message}

JSON STRICT :
{
  "answer": "ta réponse — produis du contenu, pas du commentaire. 1 à 3 paragraphes max.",
  "followUps": [ "action concrète qu'on peut enchaîner (pas une question)", "autre action possible" ]
}`,
  };
}

function buildFillPrompt(
  studioRaw: string,
  message: string,
  history: AssistantMessage[],
  activeTab?: string,
  focusPath?: string,
): { system: string; user: string } {
  const hist = history
    .map((m) => `${m.role === "user" ? "UTILISATEUR" : "ASSISTANT"}: ${m.content}`)
    .join("\n");
  const focus = focusPath ? `\nPath cible : "${focusPath}"` : "";
  return {
    system:
      STUDIO_SYSTEM_PROMPT +
      `\n\nMODE REMPLISSAGE — tu écris directement les contenus pour les champs demandés.
Pas de commentaire, pas de "voici ce que je propose". Tu remplis.
Pour les phases : compétences cibles et trigger de fin AVANT tout scoring.
"rationale" = 1 phrase sèche, pas un paragraphe explicatif.`,
    user: `Section : ${sectionLabel(activeTab)}.${focus}

${hist ? `Historique :\n${hist}\n` : ""}Scénario :
\`\`\`json
${studioRaw}
\`\`\`

${message}

JSON STRICT :
{
  "rationale": "1 phrase max — ce que tu as rempli et pourquoi",
  "fields": [
    { "path": "context", "value": "…contenu rédigé…", "summary": "Résumé 3 mots" }
  ]
}

Notation dot/crochet. Types corrects. 1 à 8 assignations. Scope : ${sectionLabel(activeTab)} sauf demande explicite. Jamais les ids.`,
  };
}

function buildPatchPrompt(
  studioRaw: string,
  message: string,
  history: AssistantMessage[],
  activeTab?: string,
  focusPath?: string,
): { system: string; user: string } {
  const hist = history
    .map((m) => `${m.role === "user" ? "UTILISATEUR" : "ASSISTANT"}: ${m.content}`)
    .join("\n");
  const focus = focusPath ? `\nPath prioritaire : "${focusPath}"` : "";
  return {
    system:
      STUDIO_SYSTEM_PROMPT +
      `\n\nMODE PATCH — tu produis directement la version révisée du scénario.
Pas de justification, pas de commentaire. Tu fais le changement demandé.
Préserve TOUS les ids et clés racine. Compétences avant scoring.`,
    user: `Section : ${sectionLabel(activeTab)}.${focus}

${hist ? `Historique :\n${hist}\n` : ""}Scénario actuel :
\`\`\`json
${studioRaw}
\`\`\`

${message}

JSON STRICT :
{
  "summary": "1 phrase — ce qui change",
  "changes": [ { "path": "phases[2].objective", "summary": "3 mots" } ],
  "proposedScenario": { ...scénario complet révisé... }
}

Mêmes clés racine. Ids préservés. Pas de suppression sauf demande. Types inchangés.`,
  };
}

/**
 * Garde-fou pour le mode patch : mêmes règles que /ai-patch.
 */
function assertRuntimeCompatible(
  original: Record<string, unknown>,
  proposed: Record<string, unknown>,
): void {
  if (original.id !== proposed.id) {
    throw compatError("L'id du scénario a été modifié.");
  }
  for (const key of Object.keys(original)) {
    if (!(key in proposed)) {
      throw compatError(`Clé racine manquante dans la proposition : "${key}"`);
    }
  }
  for (const name of ["actors", "phases", "documents", "endings", "channels"]) {
    const o = (original as any)[name];
    const p = (proposed as any)[name];
    if (!Array.isArray(o)) continue;
    if (!Array.isArray(p)) {
      throw compatError(`"${name}" n'est plus un tableau.`);
    }
    const origIds = new Set(o.map((x: any) => x?.id).filter(Boolean));
    const propIds = new Set(p.map((x: any) => x?.id).filter(Boolean));
    for (const id of origIds) {
      if (!propIds.has(id)) {
        throw compatError(
          `Entité "${name}" avec id "${id}" supprimée — refus pour protéger le runtime.`,
        );
      }
    }
  }
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
    const body: ReqBody = await request.json().catch(() => ({}));

    const mode = body.mode;
    if (!mode || !ASSISTANT_MODES.includes(mode)) {
      return Response.json(
        {
          error: `Mode invalide. Valeurs : ${ASSISTANT_MODES.join(", ")}`,
        },
        { status: 400 },
      );
    }
    const message = (body.message || "").trim();
    if (!message) {
      return Response.json({ error: "Message vide" }, { status: 400 });
    }

    const historyParsed = z.array(AssistantMessageSchema).safeParse(
      body.history ?? [],
    );
    if (!historyParsed.success) {
      return Response.json(
        { error: "Historique invalide", issues: historyParsed.error.issues },
        { status: 400 },
      );
    }
    const history = truncateHistory(historyParsed.data);

    const p = studioJsonPath(studioId);
    if (!existsSync(p)) {
      return Response.json(
        { error: "Studio scenario not found" },
        { status: 404 },
      );
    }
    const studioRaw = readFileSync(p, "utf-8");

    const activeTab = body.context?.activeTab;
    const focusPath = body.context?.focusPath;

    if (mode === "free") {
      const { system, user } = buildFreePrompt(
        studioRaw,
        message,
        history,
        activeTab,
        focusPath,
      );
      const payload = await callJSON({
        schema: AssistantFreeResponseSchema,
        system,
        user,
        temperature: 0.7,
      });
      return Response.json({ mode, ...payload });
    }

    if (mode === "fill") {
      const { system, user } = buildFillPrompt(
        studioRaw,
        message,
        history,
        activeTab,
        focusPath,
      );
      const payload = await callJSON({
        schema: AssistantFillResponseSchema,
        system,
        user,
        temperature: 0.5,
      });
      return Response.json({ mode, ...payload });
    }

    // mode === "patch"
    const { system, user } = buildPatchPrompt(
      studioRaw,
      message,
      history,
      activeTab,
      focusPath,
    );
    const payload = await callJSON({
      schema: AIPatchPayloadSchema,
      system,
      user,
      temperature: 0.6,
    });
    const original = JSON.parse(studioRaw);
    assertRuntimeCompatible(original, payload.proposedScenario);
    return Response.json({ mode, ...payload });
  } catch (error: any) {
    console.error(`[assistant] error for ${studioId}:`, error);
    let status = 500;
    if (error?.code === "runtime_incompatible") status = 422;
    else if (
      error?.code === "invalid_json" ||
      error?.code === "schema_mismatch"
    )
      status = 502;
    return Response.json(
      {
        error: error?.message || "Erreur copilote",
        code: error?.code,
      },
      { status },
    );
  }
}
