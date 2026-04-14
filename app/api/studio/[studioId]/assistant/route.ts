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
      return "l'onglet Phases (titres, objectifs, critères d'évaluation, règles de complétion)";
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
  const focus = focusPath ? `\n- Focus demandé : "${focusPath}"` : "";
  return {
    system:
      STUDIO_SYSTEM_PROMPT +
      `\n\nTu es en MODE DISCUSSION. Tu ne proposes AUCUNE modification du scénario. Tu conseilles, tu expliques, tu donnes des pistes.`,
    user: `Contexte : l'utilisateur travaille actuellement sur ${sectionLabel(activeTab)}.${focus}

Historique récent :
${hist || "(aucun)"}

Scénario courant (lecture seule) :
\`\`\`json
${studioRaw}
\`\`\`

Question actuelle :
${message}

RÉPONSE ATTENDUE (JSON STRICT) :
{
  "answer": "réponse concise et concrète (1 à 4 paragraphes)",
  "followUps": [ "question de relance 1", "question de relance 2" ]
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
  const focus = focusPath ? `\n- Path cible : "${focusPath}"` : "";
  return {
    system:
      STUDIO_SYSTEM_PROMPT +
      `\n\nTu es en MODE REMPLISSAGE. Tu proposes des VALEURS pour des champs précis. Tu ne restructures rien. Tu ne supprimes rien.`,
    user: `Contexte : l'utilisateur est sur ${sectionLabel(activeTab)}.${focus}

Historique récent :
${hist || "(aucun)"}

Scénario :
\`\`\`json
${studioRaw}
\`\`\`

Demande :
${message}

RÉPONSE ATTENDUE (JSON STRICT) :
{
  "rationale": "1 à 2 phrases expliquant la logique du remplissage",
  "fields": [
    { "path": "context", "value": "…texte proposé…", "summary": "Contexte reformulé" },
    { "path": "phases[0].objective", "value": "…", "summary": "Objectif de la phase 1" }
  ]
}

RÈGLES :
- Utilise la notation dot/crochet (ex: "phases[2].criteria[0].description").
- "value" doit être du type attendu à cet endroit (string, number, boolean, array, object).
- 1 à 8 assignations maximum.
- Ne propose QUE des champs qui relèvent de ${sectionLabel(activeTab)}, sauf demande explicite.
- Ne touche jamais aux ids.`,
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
  const focus = focusPath ? `\n- Path prioritaire : "${focusPath}"` : "";
  return {
    system:
      STUDIO_SYSTEM_PROMPT +
      `\n\nTu es en MODE PATCH. Tu proposes une version révisée du scénario. Tu préserves TOUS les ids existants et les clés racine.`,
    user: `Contexte : utilisateur sur ${sectionLabel(activeTab)}.${focus}

Historique récent :
${hist || "(aucun)"}

Scénario actuel :
\`\`\`json
${studioRaw}
\`\`\`

Demande :
${message}

RÉPONSE ATTENDUE (JSON STRICT) :
{
  "summary": "1 phrase sur ce que fait le patch",
  "changes": [ { "path": "phases[2].objective", "summary": "Reformulé pour durcir" } ],
  "proposedScenario": { ...scénario complet révisé... }
}

CONTRAINTES :
- Mêmes clés racine qu'à l'entrée.
- Tous les ids existants préservés.
- Pas de suppression d'entités sauf demande explicite de l'utilisateur.
- Compatible avec le runtime (types inchangés).`,
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
