/**
 * Logique pure de la mécanique "qa" — aucune I/O, aucun React.
 * La directive envoyée à l'acteur est UNIVERSELLE : elle ne contient
 * jamais de contenu scénario, seulement le cadrage "pose la question
 * n/total" ; le cadrage métier optionnel (params.directive) y est
 * concaténé tel quel.
 */

import type {
  ActorDef,
  JsonObject,
  TranscriptEvent,
} from "@/app/lib/engine/mechanics";

/**
 * Directive universelle d'interrogation, question n sur total.
 * `extra` = params.directive (contenu scénario, concaténé tel quel).
 */
export function buildQaDirective(
  n: number,
  total: number,
  extra?: string,
): string {
  const base = `Tu poses des questions au joueur, une à la fois. Pose maintenant la question ${n}/${total}.`;
  const trimmed = extra?.trim();
  return trimmed ? `${base} ${trimmed}` : base;
}

/** question_count du step, défensif (retourne 0 si invalide). */
export function resolveQuestionCount(params: JsonObject): number {
  const raw = params.question_count;
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 1 ? raw : 0;
}

/** Nombre de réponses données par le joueur sur le canal chat. */
export function countPlayerAnswers(transcript: TranscriptEvent[]): number {
  return transcript.filter((e) => e.channel === "chat" && e.role === "player")
    .length;
}

/** Nombre de messages (questions) déjà posés par l'acteur sur le canal chat. */
export function countActorMessages(transcript: TranscriptEvent[]): number {
  return transcript.filter((e) => e.channel === "chat" && e.role === "actor")
    .length;
}

/**
 * Transcript texte compact "Vous: … / <Nom>: …", une ligne par message.
 */
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

/** Output conforme au manifest : exactement { dialogue, answers_count }. */
export function buildOutput(
  transcript: TranscriptEvent[],
  actors: ActorDef[],
): { dialogue: string; answers_count: number } {
  return {
    dialogue: buildDialogue(transcript, actors),
    answers_count: countPlayerAnswers(transcript),
  };
}

/** Garde-fou de validation scénario (retourne [] si tout est valide). */
export function validateParams(params: JsonObject): string[] {
  const errors: string[] = [];
  if (typeof params.actor_id !== "string" || params.actor_id.trim() === "") {
    errors.push("params.actor_id doit être une string non vide");
  }
  if (
    !(
      typeof params.question_count === "number" &&
      Number.isInteger(params.question_count) &&
      params.question_count >= 1
    )
  ) {
    errors.push("params.question_count doit être un entier >= 1");
  }
  if (params.directive !== undefined && typeof params.directive !== "string") {
    errors.push("params.directive doit être une string");
  }
  if (
    params.context_hint !== undefined &&
    typeof params.context_hint !== "string"
  ) {
    errors.push("params.context_hint doit être une string");
  }
  return errors;
}
