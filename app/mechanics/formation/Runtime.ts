/**
 * formation/Runtime — logique pure (node-safe, sans React ni I/O).
 * Parse des objectifs, directive apprenant, normalisation de la
 * couverture, construction de l'output et restauration du scratch.
 */

import type {
  ActorDef,
  JsonObject,
  TranscriptEvent,
} from "@/app/lib/engine/mechanics";

export const DEFAULT_MIN_EXCHANGES = 3;

/**
 * Consigne universelle de l'apprenant — construite par la mécanique,
 * jamais du contenu. Le cadrage scénario s'y ajoute via params.directive.
 */
export const LEARNER_DIRECTIVE =
  "Tu es en position d'apprenant sur ce sujet. Pose des questions quand " +
  "c'est flou, reformule quand tu crois avoir compris.";

export interface ObjectiveDef {
  id: string;
  label: string;
}

/** min_exchanges du step, borné et défensif (défaut : 3). */
export function resolveMinExchanges(params: JsonObject): number {
  const raw = params.min_exchanges;
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 1
    ? raw
    : DEFAULT_MIN_EXCHANGES;
}

/** Parse défensif de params.objectives (ignore les entrées invalides). */
export function parseObjectives(params: JsonObject): ObjectiveDef[] {
  if (!Array.isArray(params.objectives)) return [];
  const out: ObjectiveDef[] = [];
  for (const raw of params.objectives) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) continue;
    const o = raw as JsonObject;
    if (typeof o.id !== "string" || o.id.length === 0) continue;
    if (typeof o.label !== "string" || o.label.length === 0) continue;
    out.push({ id: o.id, label: o.label });
  }
  return out;
}

/** Directive complète : consigne apprenant universelle + cadrage scénario. */
export function buildDirective(params: JsonObject): string {
  const scenario =
    typeof params.directive === "string" ? params.directive.trim() : "";
  return scenario.length > 0
    ? `${LEARNER_DIRECTIVE}\n${scenario}`
    : LEARNER_DIRECTIVE;
}

/** Nombre de messages envoyés par le joueur sur le canal chat. */
export function countPlayerMessages(transcript: TranscriptEvent[]): number {
  return transcript.filter((e) => e.channel === "chat" && e.role === "player")
    .length;
}

/** Transcript texte compact "Vous: … / <Nom>: …", une ligne par message. */
export function buildDialogue(
  transcript: TranscriptEvent[],
  actors: ActorDef[],
): string {
  return transcript
    .filter(
      (e) => e.channel === "chat" && (e.role === "player" || e.role === "actor"),
    )
    .map((e) => {
      const name =
        e.role === "player"
          ? "Vous"
          : (actors.find((a) => a.actor_id === e.actor_id)?.name ?? "Acteur");
      return `${name}: ${e.content}`;
    })
    .join("\n");
}

/**
 * Couverture normalisée : uniquement des ids d'objectifs déclarés,
 * dédupliqués, dans l'ordre de déclaration du scénario.
 */
export function normalizeCovered(
  objectives: ObjectiveDef[],
  coveredIds: readonly string[],
): string[] {
  const set = new Set(coveredIds);
  return objectives.filter((o) => set.has(o.id)).map((o) => o.id);
}

/** Résumé lisible pour le transcript (audit + matière d'observation). */
export function buildSummary(
  objectives: ObjectiveDef[],
  coveredIds: readonly string[],
): string {
  const covered = new Set(normalizeCovered(objectives, coveredIds));
  return objectives
    .map((o) => `${covered.has(o.id) ? "[x]" : "[ ]"} ${o.label}`)
    .join("\n");
}

/** Output conforme au manifest : exactement { dialogue, objectives_covered }. */
export function buildOutput(
  transcript: TranscriptEvent[],
  actors: ActorDef[],
  objectives: ObjectiveDef[],
  coveredIds: readonly string[],
): { dialogue: string; objectives_covered: string[] } {
  return {
    dialogue: buildDialogue(transcript, actors),
    objectives_covered: normalizeCovered(objectives, coveredIds),
  };
}

/** Restaure les objectifs cochés persistés (reprise après refresh). */
export function restoreCovered(scratch: JsonObject): string[] {
  return Array.isArray(scratch.objectives_covered)
    ? scratch.objectives_covered.filter((v): v is string => typeof v === "string")
    : [];
}

/** Garde-fou au validate:scenarios — retourne [] si les params sont valides. */
export function validateParams(params: JsonObject): string[] {
  const errors: string[] = [];
  if (typeof params.actor_id !== "string" || params.actor_id.trim().length === 0) {
    errors.push("params.actor_id doit être une string non vide");
  }
  if (typeof params.topic !== "string" || params.topic.trim().length === 0) {
    errors.push("params.topic doit être une string non vide");
  }
  if (!Array.isArray(params.objectives) || params.objectives.length === 0) {
    errors.push("params.objectives doit être un tableau non vide");
  } else {
    const parsed = parseObjectives(params);
    if (parsed.length !== params.objectives.length) {
      errors.push(
        "chaque entrée de params.objectives doit avoir id et label (strings non vides)",
      );
    }
    const ids = parsed.map((o) => o.id);
    if (new Set(ids).size !== ids.length) {
      errors.push("les id de params.objectives doivent être uniques");
    }
  }
  if (
    params.min_exchanges !== undefined &&
    !(
      typeof params.min_exchanges === "number" &&
      Number.isInteger(params.min_exchanges) &&
      params.min_exchanges >= 1
    )
  ) {
    errors.push("params.min_exchanges doit être un entier >= 1");
  }
  for (const key of ["directive", "opening_message"] as const) {
    if (params[key] !== undefined && typeof params[key] !== "string") {
      errors.push(`params.${key} doit être une string`);
    }
  }
  return errors;
}
