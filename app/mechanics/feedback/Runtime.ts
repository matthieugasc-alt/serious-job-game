/**
 * feedback/Runtime — logique pure (node-safe, sans React ni I/O).
 * Résolution des params, comptage des rounds, construction de
 * l'output et restauration du scratch.
 */

import type {
  ActorDef,
  JsonObject,
  TranscriptEvent,
} from "@/app/lib/engine/mechanics";

export const DEFAULT_MIN_ROUNDS = 2;

/** min_rounds du step — nb de messages joueur avant clôture (défaut : 2). */
export function resolveMinRounds(params: JsonObject): number {
  const raw = params.min_rounds;
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 1
    ? raw
    : DEFAULT_MIN_ROUNDS;
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

/** Erreurs bloquant la clôture. [] = engagements prêts à être soumis. */
export function validateCommitments(commitments: string): string[] {
  return commitments.trim().length === 0
    ? ["Le champ « Engagements convenus » est vide."]
    : [];
}

/** Output conforme au manifest : exactement { dialogue, commitments }. */
export function buildOutput(
  transcript: TranscriptEvent[],
  actors: ActorDef[],
  commitments: string,
): { dialogue: string; commitments: string } {
  return {
    dialogue: buildDialogue(transcript, actors),
    commitments: commitments.trim(),
  };
}

/** Restaure le brouillon d'engagements persisté (reprise après refresh). */
export function restoreCommitments(scratch: JsonObject): string {
  return typeof scratch.commitments === "string" ? scratch.commitments : "";
}

/** Garde-fou au validate:scenarios — retourne [] si les params sont valides. */
export function validateParams(params: JsonObject): string[] {
  const errors: string[] = [];
  if (typeof params.actor_id !== "string" || params.actor_id.trim().length === 0) {
    errors.push("params.actor_id doit être une string non vide");
  }
  if (
    typeof params.context_brief !== "string" ||
    params.context_brief.trim().length === 0
  ) {
    errors.push("params.context_brief doit être une string non vide");
  }
  if (
    params.min_rounds !== undefined &&
    !(
      typeof params.min_rounds === "number" &&
      Number.isInteger(params.min_rounds) &&
      params.min_rounds >= 1
    )
  ) {
    errors.push("params.min_rounds doit être un entier >= 1");
  }
  for (const key of ["directive", "framework_hint", "opening_message"] as const) {
    if (params[key] !== undefined && typeof params[key] !== "string") {
      errors.push(`params.${key} doit être une string`);
    }
  }
  return errors;
}
