/**
 * validation.ts — Zod schemas for API input validation
 *
 * Centralized schemas for all critical routes.
 * Each schema trims strings and normalizes where needed.
 *
 * Usage:
 *   const parsed = parseBody(body, chatSchema);
 *   if (parsed.error) return Response.json(parsed.error, { status: 400 });
 *   const data = parsed.data;
 */

import { z } from "zod";

// ─── Helper ────────────────────────────────────────────────────

export interface ParseResult<T> {
  data: T;
  error?: never;
}
export interface ParseError {
  data?: never;
  error: { error: string; message: string };
}

/**
 * Validate a body against a Zod schema.
 * Returns { data } on success, { error } on failure.
 */
export function parseBody<T>(
  body: unknown,
  schema: z.ZodType<T>,
): ParseResult<T> | ParseError {
  const result = schema.safeParse(body);
  if (result.success) {
    return { data: result.data };
  }

  // Format first error into a clear message
  const firstIssue = result.error.issues[0];
  const path = firstIssue.path.length > 0 ? firstIssue.path.join(".") : "body";
  const message = `Le champ '${path}' est invalide : ${firstIssue.message}`;

  return {
    error: {
      error: "invalid_input",
      message,
    },
  };
}

// ─── Reusable primitives ──────────────────────────────────────

const trimmedString = z.string().trim();
const nonEmptyString = z.string().trim().min(1, "requis et ne peut pas être vide");
const emailString = z
  .string()
  .trim()
  .toLowerCase()
  .email("doit être un email valide");

// ─── Auth Schemas ─────────────────────────────────────────────

export const loginSchema = z.object({
  email: emailString,
  password: nonEmptyString,
});

export const registerSchema = z.object({
  email: emailString,
  name: nonEmptyString.min(2, "doit contenir au moins 2 caractères"),
  password: nonEmptyString.min(8, "doit contenir au moins 8 caractères"),
});

// ─── Chat Schema ──────────────────────────────────────────────

export const chatSchema = z.object({
  playerName: trimmedString.default("Player"),
  message: trimmedString.default(""),
  phaseTitle: trimmedString.default(""),
  phaseObjective: trimmedString.default(""),
  phaseFocus: trimmedString.default(""),
  phasePrompt: trimmedString.default(""),
  mode: z.enum(["guided", "standard", "autonomy"]).default("guided"),
  roleplayPrompt: trimmedString.default(""),
  narrative: z.record(z.string(), z.unknown()).default({}),
  recentConversation: z.array(z.unknown()).default([]),
  criteria: z.array(z.unknown()).default([]),
  playerMessages: z.array(z.string()).default([]),
  // ── Optional: structured evaluation modes ──────────────────────
  // When set, the API computes an additional `prospection_evaluation`
  // block in the response (used for score-based phase advancement).
  eval_mode: z.enum(["prospection"]).optional(),
  // Phase advancement configuration (mirrors PhaseDefinition.advancement
  // in app/lib/types.ts). Only consumed when eval_mode is set.
  advancement_config: z
    .object({
      mode: z.enum(["prospection_evaluation"]),
      min_score: z.number(),
      required_criteria: z.array(z.string()),
      set_flag: z.string(),
      set_actor_flag: z.string().optional(),
    })
    .optional(),
  // Actor id targeted by the player's action (e.g. cold email recipient).
  // Echoed back in prospection_evaluation.actorId.
  target_actor_id: trimmedString.optional(),
  // 0..1 jaccard similarity vs previous mails to the same recipient.
  // When >= SIMILARITY_REJECT_THRESHOLD the API forces interested = false
  // and adapts the NPC reply.
  similarity_to_previous: z.number().min(0).max(1).optional(),
  // True when the targeted NPC has already replied at least once during
  // the current phase. Encodes the "1 KOL = 1 chance" gameplay rule:
  // once the NPC has taken a position, follow-ups cannot flip him to
  // interested = true. Forwarded by page.tsx for cold-email retries.
  previously_replied: z.boolean().optional(),
  // Optional context blocks (sent_mails, kol_profiles, phase_state, …)
  // injected into the system prompt. Provided by chatContextEnrichment helper.
  chat_context: z.record(z.string(), z.unknown()).optional(),
});

// ─── Debrief Schema ───────────────────────────────────────────

export const debriefSchema = z.object({
  scenarioTitle: nonEmptyString,
  playerName: trimmedString.default("Joueur"),
  // phases come from scenario.phases — passthrough to keep all fields (title, objective, scoring, etc.)
  phases: z.array(z.record(z.string(), z.unknown())).min(1, "au moins une phase requise"),
  // Extra fields sent by frontend: conversation, sentMails, inboxMails, endings, defaultEnding
}).passthrough();

// ─── Evaluate Presentation Schema ─────────────────────────────

export const evaluatePresentationSchema = z.object({
  transcript: nonEmptyString,
  phaseTitle: trimmedString.default(""),
  phaseObjective: trimmedString.default(""),
  criteria: z.array(z.unknown()).default([]),
});

// ─── TTS Schema ───────────────────────────────────────────────

const VALID_VOICES = [
  "alloy", "ash", "ballad", "coral", "echo",
  "fable", "nova", "onyx", "sage", "shimmer",
] as const;

export const ttsSchema = z.object({
  text: nonEmptyString.max(4096, "max 4096 caractères"),
  voice: z.enum(VALID_VOICES).default("nova"),
  speed: z.number().min(0.25).max(4.0).default(1.0),
});

// ─── Organization Schemas ─────────────────────────────────────

export const createOrgSchema = z.object({
  name: nonEmptyString.min(2, "doit contenir au moins 2 caractères"),
  type: z.enum(["enterprise", "coach"]),
  adminUserId: nonEmptyString,
  settings: z.object({
    description: trimmedString.optional(),
    logoUrl: trimmedString.optional(),
  }).optional(),
});

export const updateOrgSchema = z.object({
  name: nonEmptyString.min(2).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  settings: z.object({
    description: trimmedString.optional(),
    logoUrl: trimmedString.optional(),
  }).optional(),
});

// ─── Members Schema ───────────────────────────────────────────

export const addMemberSchema = z
  .object({
    userId: trimmedString.optional(),
    email: emailString.optional(),
    name: nonEmptyString.min(2).optional(),
    role: z.enum(["admin", "member"]).default("member"),
  })
  .refine(
    (d) => d.userId || (d.email && d.name),
    { message: "Fournir userId (utilisateur existant) ou email + name (nouveau compte)" },
  );

// ─── Assignments Schema ───────────────────────────────────────

export const createAssignmentSchema = z.object({
  type: z.enum(["visible", "mandatory"]),
  // Single mode
  scenarioId: trimmedString.optional(),
  userId: trimmedString.optional(),
  // Batch mode
  scenarioIds: z.array(nonEmptyString).optional(),
  userIds: z.array(nonEmptyString).optional(),
}).refine(
  (d) => (d.scenarioId && d.userId) || (d.scenarioIds && d.userIds),
  { message: "Fournir scenarioId+userId ou scenarioIds[]+userIds[] pour le batch" },
);

// ─── Feature Flags Schema ─────────────────────────────────────

export const updateFeaturesSchema = z.object({
  custom_scenarios: z.boolean().optional(),
  studio_access: z.boolean().optional(),
  max_managed_users: z.number().int().min(1).max(10000).optional(),
  advanced_analytics: z.boolean().optional(),
});

// ─── Admin Schemas ────────────────────────────────────────────

export const saveScenarioSchema = z.object({
  scenario: z.object({
    scenario_id: nonEmptyString,
  }).passthrough(),
});

export const scenarioConfigSchema = z.object({
  scenarioId: nonEmptyString,
  adminLocked: z.boolean(),
  lockMessage: trimmedString.optional(),
  prerequisites: z.array(z.string()).optional(),
  category: trimmedString.optional(),
  order: z.number().int().min(0).optional(),
  featured: z.boolean().optional(),
});

// ─── Job Families Schema ──────────────────────────────────────

export const createJobFamilySchema = z.object({
  label: nonEmptyString.min(2, "doit contenir au moins 2 caractères"),
  active: z.boolean().default(true),
  order: z.number().int().min(0).optional(),
});
