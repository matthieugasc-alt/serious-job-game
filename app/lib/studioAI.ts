/**
 * Shared OpenAI client + schemas for Scenario Studio AI features.
 *
 * All studio AI endpoints (ai-review, ai-patch, actor-generate, assistant,
 * import-extract) import from this module to guarantee:
 *   - a single place for model/temperature choices
 *   - consistent bounded system prompts ("scope = current scenario only")
 *   - stable JSON shapes via Zod schemas (validated before returning to client)
 */

import OpenAI from "openai";
import { z } from "zod";

/* ---------- Client ---------- */

export function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY manquante côté serveur");
  }
  return new OpenAI({ apiKey });
}

/* ---------- Shared system prompt ---------- */

export const STUDIO_SYSTEM_PROMPT = `Tu es l'assistant éditorial du studio de scénarios pédagogiques.

RÈGLES ABSOLUES — non négociables :
1. Ton périmètre est STRICTEMENT le scénario fourni. N'invente ni ne référence aucun scénario externe.
2. Tu produis uniquement du JSON conforme au schéma demandé. Aucun texte en dehors du JSON.
3. Tu ne modifies jamais le runtime ni la structure technique (clés, id, types). Tes propositions doivent rester compatibles avec le compilateur existant.
4. Tu ne proposes jamais d'action irréversible. L'humain valide ensuite.
5. Rédige en français, ton professionnel mais chaleureux, phrases concises.`;

/* ---------- Zod schemas ---------- */

export const ReviewItemSchema = z.object({
  id: z.string(),
  path: z.string(),
  title: z.string(),
  description: z.string(),
  severity: z.enum(["blocker", "warning", "suggestion"]),
  rationale: z.string().optional(),
});
export type ReviewItem = z.infer<typeof ReviewItemSchema>;

export const AIReviewPayloadSchema = z.object({
  blockingErrors: z.array(ReviewItemSchema),
  warnings: z.array(ReviewItemSchema),
  suggestions: z.array(ReviewItemSchema),
});
export type AIReviewPayload = z.infer<typeof AIReviewPayloadSchema>;

/* --- Patch action (correct / improve / harden / smooth / realism) --- */

export const PATCH_ACTIONS = [
  "fix-inconsistency",
  "improve",
  "harden",
  "smooth",
  "realism",
] as const;
export type PatchAction = (typeof PATCH_ACTIONS)[number];

export const ChangeItemSchema = z.object({
  path: z.string(),
  summary: z.string(),
});
export type ChangeItem = z.infer<typeof ChangeItemSchema>;

/**
 * The model returns a full proposed replacement of the scenario (or of a
 * targeted sub-path) plus a human-readable summary + a change list.
 * Frontend previews diff and user clicks "Appliquer" to persist.
 */
export const AIPatchPayloadSchema = z.object({
  summary: z.string(),
  changes: z.array(ChangeItemSchema),
  proposedScenario: z.record(z.string(), z.any()),
});
export type AIPatchPayload = z.infer<typeof AIPatchPayloadSchema>;

/* --- Actor prompt generation --- */

export const ActorBriefingSchema = z.object({
  role: z.string(),
  personalityTraits: z.array(z.string()).default([]),
  backstory: z.string().default(""),
  motivations: z.array(z.string()).default([]),
  fears: z.array(z.string()).default([]),
  biases: z.array(z.string()).default([]),
  relationToPlayer: z.string().default(""),
  personalGoals: z.array(z.string()).default([]),
  openness: z.number().min(0).max(1).default(0.5),
  tension: z.number().min(0).max(1).default(0.5),
  rigidity: z.number().min(0).max(1).default(0.5),
  speechElements: z.string().default(""),
});
export type ActorBriefing = z.infer<typeof ActorBriefingSchema>;

export const ActorGenerationPayloadSchema = z.object({
  prompt: z.string(),
  behaviorRules: z.array(z.string()),
  limits: z.array(z.string()),
  style: z.string(),
});
export type ActorGenerationPayload = z.infer<
  typeof ActorGenerationPayloadSchema
>;

/* --- Assistant (integrated copilot) --- */

export const ASSISTANT_MODES = ["free", "fill", "patch"] as const;
export type AssistantMode = (typeof ASSISTANT_MODES)[number];

export const AssistantMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});
export type AssistantMessage = z.infer<typeof AssistantMessageSchema>;

/**
 * FREE mode — discussion, Q&A, brainstorming. Never returns mutations.
 */
export const AssistantFreeResponseSchema = z.object({
  answer: z.string(),
  followUps: z.array(z.string()).default([]),
});
export type AssistantFreeResponse = z.infer<typeof AssistantFreeResponseSchema>;

/**
 * FILL mode — fills targeted fields of the active section.
 * Returns a list of { path, value } assignments + rationale.
 * Path uses a tiny JSON pointer: "context", "phases[2].objective", etc.
 */
export const FieldAssignmentSchema = z.object({
  path: z.string(),
  value: z.any(),
  summary: z.string(),
});
export type FieldAssignment = z.infer<typeof FieldAssignmentSchema>;

export const AssistantFillResponseSchema = z.object({
  rationale: z.string(),
  fields: z.array(FieldAssignmentSchema),
});
export type AssistantFillResponse = z.infer<
  typeof AssistantFillResponseSchema
>;

/**
 * PATCH mode — structural change. Returns the full proposed scenario,
 * same contract as AIPatchPayloadSchema so the UI can reuse the preview.
 */
export const AssistantPatchResponseSchema = AIPatchPayloadSchema;
export type AssistantPatchResponse = AIPatchPayload;

/* --- Intelligent import (drag-and-drop extraction) --- */

export const ExtractedFieldSchema = z.object({
  path: z.string(),
  value: z.any(),
  summary: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
});
export type ExtractedField = z.infer<typeof ExtractedFieldSchema>;

export const ImportExtractPayloadSchema = z.object({
  confident: z.array(ExtractedFieldSchema),
  uncertain: z.array(ExtractedFieldSchema),
  missing: z.array(z.string()),
  conflicts: z
    .array(
      z.object({
        path: z.string(),
        existingValue: z.any(),
        proposedValue: z.any(),
        note: z.string(),
      }),
    )
    .default([]),
  summary: z.string(),
});
export type ImportExtractPayload = z.infer<typeof ImportExtractPayloadSchema>;

/* ---------- Helpers ---------- */

/**
 * Call the chat completion API with a strict JSON response format and parse it
 * against a Zod schema. Throws a typed error if the model returned invalid JSON
 * or a shape that does not match the schema.
 */
export async function callJSON<T extends z.ZodTypeAny>(
  opts: {
    schema: T;
    system: string;
    user: string;
    temperature?: number;
    model?: string;
  },
): Promise<z.infer<T>> {
  const client = getOpenAIClient();
  const completion = await client.chat.completions.create({
    model: opts.model ?? "gpt-4.1-mini",
    temperature: opts.temperature ?? 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  });

  const raw = completion.choices?.[0]?.message?.content ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const err: any = new Error("La réponse du modèle n'est pas un JSON valide");
    err.code = "invalid_json";
    err.raw = raw;
    throw err;
  }

  const result = opts.schema.safeParse(parsed);
  if (!result.success) {
    const err: any = new Error(
      "La réponse du modèle ne correspond pas au schéma attendu",
    );
    err.code = "schema_mismatch";
    err.issues = result.error.issues;
    err.raw = parsed;
    throw err;
  }

  return result.data;
}
