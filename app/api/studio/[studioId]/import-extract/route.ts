/**
 * POST /api/studio/[studioId]/import-extract
 *
 * Drag-and-drop intelligent import.
 *
 * Accepte :
 *   - multipart/form-data avec un champ "file" (txt, md, image png/jpg)
 *   - OU application/json { text: string } si le frontend a déjà extrait le texte
 *
 * Pour les images, utilise la vision de gpt-4.1-mini (OCR + compréhension).
 * Pour les pdf/docx, le frontend peut : soit convertir côté client, soit
 * coller le texte dans le champ texte. V1 : on renvoie une erreur explicite.
 *
 * Sortie :
 *   {
 *     confident:  ExtractedField[],
 *     uncertain:  ExtractedField[],
 *     missing:    string[],
 *     conflicts:  [{ path, existingValue, proposedValue, note }],
 *     summary:    string
 *   }
 *
 * Rien n'est écrit sur le scénario. L'UI preview puis l'utilisateur applique.
 */

export const runtime = "nodejs";
export const maxDuration = 90;

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  ImportExtractPayloadSchema,
  STUDIO_SYSTEM_PROMPT,
  callJSON,
  getOpenAIClient,
} from "@/app/lib/studioAI";

const MAX_TEXT_CHARS = 60_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
const SUPPORTED_TEXT = ["text/plain", "text/markdown"];
const SUPPORTED_IMAGE = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

interface JsonBody {
  text?: string;
}

function studioJsonPath(studioId: string): string {
  return join(process.cwd(), "data", "studio", studioId, "studio.json");
}

const EXTRACTION_FIELDS_HINT = `
Champs cibles attendus (utilise ces paths exacts dans "path") :
  title, subtitle, description, difficulty, duration, locale, tags,
  context, mission, initialSituation, trigger, backgroundFact,
  actors[i].{name, role, personality, promptContent},
  phases[i].{title, objective, competencies[j], completionTrigger, introMessage, interactionMode, criteria[j].description},
  documents[i].{label, content},
  endings[i].{label, content}

PRIORITÉ PHASES : extrais d'abord les compétences cibles (phases[i].competencies) et les triggers de fin (phases[i].completionTrigger). Le scoring est secondaire.
`;

function buildExtractionPrompt(
  sourceText: string,
  currentStudioRaw: string,
): string {
  return `Tu extrais une structure de scénario depuis un document source pour pré-remplir le studio.

DOCUMENT SOURCE :
<<<
${sourceText.slice(0, MAX_TEXT_CHARS)}
>>>

SCÉNARIO ACTUEL DANS LE STUDIO (pour détecter les conflits) :
\`\`\`json
${currentStudioRaw}
\`\`\`

${EXTRACTION_FIELDS_HINT}

TU DOIS PRODUIRE UN JSON STRICT :
{
  "summary": "1 phrase sur ce que tu as trouvé",
  "confident": [ { "path": "title", "value": "...", "summary": "Titre détecté", "confidence": "high" }, ... ],
  "uncertain": [ { "path": "phases[0].objective", "value": "...", "summary": "Objectif déduit", "confidence": "medium" }, ... ],
  "missing":   [ "endings", "actors[*].promptContent", ... ],    // liste de paths importants absents du doc
  "conflicts": [ { "path": "title", "existingValue": "Ancien", "proposedValue": "Nouveau", "note": "Le doc diffère du studio actuel" } ]
}

RÈGLES :
- confidence "high" si explicite dans le doc, "medium" si déduit raisonnablement, "low" si faible.
- N'invente pas d'informations absentes : mets-les dans "missing" au lieu de deviner.
- Pour "actors[i]" et "phases[i]", génère de nouveaux ids si besoin (format "actor-<timestamp>", "phase-<timestamp>") via un placeholder stable ; le frontend les finalisera.
- Ne propose jamais de clé racine inconnue.
- Si un champ existe déjà côté studio avec une valeur non vide, place-le en "conflicts" plutôt qu'en "confident".`;
}

async function extractFromText(
  sourceText: string,
  currentStudioRaw: string,
): Promise<unknown> {
  return await callJSON({
    schema: ImportExtractPayloadSchema,
    system: STUDIO_SYSTEM_PROMPT,
    user: buildExtractionPrompt(sourceText, currentStudioRaw),
    temperature: 0.2,
  });
}

async function extractFromImage(
  imageBase64: string,
  mime: string,
  currentStudioRaw: string,
): Promise<unknown> {
  const client = getOpenAIClient();
  const completion = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: STUDIO_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Extrais une structure de scénario depuis l'image jointe (photo, capture d'écran, ou note manuscrite).

SCÉNARIO ACTUEL :
\`\`\`json
${currentStudioRaw}
\`\`\`

${EXTRACTION_FIELDS_HINT}

FORMAT JSON STRICT identique à :
{
  "summary": "...", "confident": [...], "uncertain": [...],
  "missing": [...], "conflicts": [...]
}

RÈGLES : confidence "high" si lu clairement, "medium" si déduit, "low" sinon. N'invente rien ; absents → "missing". Conflit si le studio a déjà une valeur.`,
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mime};base64,${imageBase64}`,
              detail: "high",
            },
          },
        ],
      },
    ],
  });

  const raw = completion.choices?.[0]?.message?.content ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const err: any = new Error("Réponse IA non-JSON pour l'image");
    err.code = "invalid_json";
    throw err;
  }
  const checked = ImportExtractPayloadSchema.safeParse(parsed);
  if (!checked.success) {
    const err: any = new Error("Réponse IA hors schéma pour l'image");
    err.code = "schema_mismatch";
    err.issues = checked.error.issues;
    throw err;
  }
  return checked.data;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ studioId: string }> },
) {
  const { studioId } = await params;

  try {
    const p = studioJsonPath(studioId);
    if (!existsSync(p)) {
      return Response.json(
        { error: "Studio scenario not found" },
        { status: 404 },
      );
    }
    const studioRaw = readFileSync(p, "utf-8");

    const contentType = request.headers.get("content-type") || "";

    // ---- JSON text payload ----
    if (contentType.includes("application/json")) {
      const body: JsonBody = await request.json().catch(() => ({}));
      const text = (body.text || "").trim();
      if (!text) {
        return Response.json(
          { error: "Champ 'text' vide" },
          { status: 400 },
        );
      }
      if (text.length < 20) {
        return Response.json(
          { error: "Texte trop court pour extraction" },
          { status: 400 },
        );
      }
      const payload = await extractFromText(text, studioRaw);
      return Response.json(payload);
    }

    // ---- multipart/form-data ----
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!file || !(file instanceof File)) {
        return Response.json(
          { error: "Aucun fichier joint (champ 'file')" },
          { status: 400 },
        );
      }

      const type = (file.type || "").toLowerCase();
      const name = file.name || "file";

      // Text files
      if (
        SUPPORTED_TEXT.includes(type) ||
        /\.(txt|md|markdown)$/i.test(name)
      ) {
        const text = await file.text();
        if (text.length < 20) {
          return Response.json(
            { error: "Texte trop court" },
            { status: 400 },
          );
        }
        const payload = await extractFromText(text, studioRaw);
        return Response.json(payload);
      }

      // Images
      if (SUPPORTED_IMAGE.includes(type) || /\.(png|jpe?g|webp)$/i.test(name)) {
        if (file.size > MAX_IMAGE_BYTES) {
          return Response.json(
            { error: "Image trop volumineuse (max 8 MB)" },
            { status: 400 },
          );
        }
        const buf = Buffer.from(await file.arrayBuffer());
        const b64 = buf.toString("base64");
        const mime =
          type && SUPPORTED_IMAGE.includes(type)
            ? type
            : /\.(jpe?g)$/i.test(name)
              ? "image/jpeg"
              : /\.webp$/i.test(name)
                ? "image/webp"
                : "image/png";
        const payload = await extractFromImage(b64, mime, studioRaw);
        return Response.json(payload);
      }

      // PDF / DOCX — non supportés en V1 côté serveur
      if (/\.(pdf|docx)$/i.test(name) || /pdf|word|officedocument/.test(type)) {
        return Response.json(
          {
            error:
              "PDF et DOCX non supportés côté serveur en V1. Copiez-collez le texte dans le champ 'texte source', ou convertissez en .txt / .md.",
            code: "unsupported_format",
          },
          { status: 415 },
        );
      }

      return Response.json(
        {
          error: `Format non reconnu : ${type || name}. Formats acceptés : .txt, .md, .png, .jpg, .webp (PDF/DOCX via copier-coller).`,
          code: "unsupported_format",
        },
        { status: 415 },
      );
    }

    return Response.json(
      {
        error:
          "Content-Type attendu : multipart/form-data (fichier) ou application/json { text }",
      },
      { status: 415 },
    );
  } catch (error: any) {
    console.error(`[import-extract] error for ${studioId}:`, error);
    const status =
      error?.code === "invalid_json" || error?.code === "schema_mismatch"
        ? 502
        : 500;
    return Response.json(
      { error: error?.message || "Erreur d'extraction", code: error?.code },
      { status },
    );
  }
}
