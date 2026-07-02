/**
 * Logique pure de la mécanique "entretien" — aucune I/O, aucun React.
 * Tout ce qui est testable en node vit ici ; Component.tsx ne fait
 * que l'orchestration UI.
 */

import type {
  ActorDef,
  JsonObject,
  TranscriptEvent,
} from "@/app/lib/engine/mechanics";

export const DEFAULT_MIN_EXCHANGES = 3;

/** min_exchanges du step, borné et défensif (défaut : 3). */
export function resolveMinExchanges(params: JsonObject): number {
  const raw = params.min_exchanges;
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 1
    ? raw
    : DEFAULT_MIN_EXCHANGES;
}

/** Nombre de messages envoyés par le joueur sur le canal chat. */
export function countPlayerMessages(transcript: TranscriptEvent[]): number {
  return transcript.filter((e) => e.channel === "chat" && e.role === "player")
    .length;
}

/**
 * Transcript texte compact "Vous: … / <Nom>: …", une ligne par message.
 * Seuls les échanges chat joueur/acteur comptent (le bruit system est exclu).
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

/** Output conforme au manifest : exactement { dialogue, exchange_count }. */
export function buildOutput(
  transcript: TranscriptEvent[],
  actors: ActorDef[],
): { dialogue: string; exchange_count: number } {
  return {
    dialogue: buildDialogue(transcript, actors),
    exchange_count: countPlayerMessages(transcript),
  };
}

/** Garde-fou de validation scénario (retourne [] si tout est valide). */
export function validateParams(params: JsonObject): string[] {
  const errors: string[] = [];
  if (typeof params.actor_id !== "string" || params.actor_id.trim() === "") {
    errors.push("params.actor_id doit être une string non vide");
  }
  if (typeof params.objective !== "string" || params.objective.trim() === "") {
    errors.push("params.objective doit être une string non vide");
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
  if (params.directive !== undefined && typeof params.directive !== "string") {
    errors.push("params.directive doit être une string");
  }
  if (
    params.opening_message !== undefined &&
    typeof params.opening_message !== "string"
  ) {
    errors.push("params.opening_message doit être une string");
  }
  return errors;
}
