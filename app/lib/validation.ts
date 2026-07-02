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

// NB : les schémas du player v1 (chatSchema, debriefSchema,
// evaluatePresentationSchema, ttsSchema) ont été supprimés avec leurs
// routes (/api/chat, /api/debrief, /api/evaluate-presentation, /api/tts)
// lors de la purge du legacy — voir archive/legacy-v1/ARCHIVE.md.

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
