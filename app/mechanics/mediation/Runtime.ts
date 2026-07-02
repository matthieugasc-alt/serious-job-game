/**
 * mediation/Runtime — logique pure (node-safe, sans React ni I/O).
 * Résolution des destinataires, directive de médiation, construction
 * de la résolution, de l'output et restauration du scratch.
 */

import type {
  ActorDef,
  JsonObject,
  TranscriptEvent,
} from "@/app/lib/engine/mechanics";

export const DEFAULT_MIN_EXCHANGES = 3;

/**
 * Consigne universelle des parties — construite par la mécanique,
 * jamais du contenu. Le cadrage scénario s'y ajoute via params.directive.
 */
export const MEDIATION_DIRECTIVE =
  "Tu participes à une médiation conduite par le joueur. L'autre partie " +
  "ainsi que le médiateur voient tes messages. Réponds à ce qui t'est adressé.";

/** Destinataire d'un message joueur. */
export type Recipient = "a" | "b" | "both";

/** Résolution structurée — le cœur de l'output de la mécanique. */
export interface Resolution {
  reached: boolean;
  terms: string;
}

/** min_exchanges du step, borné et défensif (défaut : 3). */
export function resolveMinExchanges(params: JsonObject): number {
  const raw = params.min_exchanges;
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 1
    ? raw
    : DEFAULT_MIN_EXCHANGES;
}

/** Directive complète : consigne médiation universelle + cadrage scénario. */
export function buildDirective(params: JsonObject): string {
  const scenario =
    typeof params.directive === "string" ? params.directive.trim() : "";
  return scenario.length > 0
    ? `${MEDIATION_DIRECTIVE}\n${scenario}`
    : MEDIATION_DIRECTIVE;
}

/** Parties adressées par un choix de destinataire, dans l'ordre a → b. */
export function recipientsFor(recipient: Recipient): ("a" | "b")[] {
  if (recipient === "a") return ["a"];
  if (recipient === "b") return ["b"];
  return ["a", "b"];
}

/**
 * Message joueur préfixé de son adressage — visible des acteurs (le
 * transcript est leur seule source) et du replay. Universel : les noms
 * viennent des ActorDef du scénario.
 */
export function formatAddressedMessage(
  text: string,
  recipientNames: readonly string[],
): string {
  return `(À ${recipientNames.join(" et ")}) ${text}`;
}

/** Nombre de messages envoyés par le joueur sur le canal chat. */
export function countPlayerMessages(transcript: TranscriptEvent[]): number {
  return transcript.filter((e) => e.channel === "chat" && e.role === "player")
    .length;
}

/** Transcript texte compact à trois voix "Vous: … / <Nom>: …". */
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

/** Erreurs bloquant la conclusion. [] = résolution prête à être soumise. */
export function validateResolution(resolution: Resolution): string[] {
  return resolution.terms.trim().length === 0
    ? ["Le champ « Termes / constat » est vide."]
    : [];
}

/** Résolution normalisée, conforme au contrat {reached, terms}. */
export function buildResolution(reached: boolean, terms: string): Resolution {
  return { reached, terms: terms.trim() };
}

/** Output conforme au manifest : exactement { dialogue, resolution }. */
export function buildOutput(
  transcript: TranscriptEvent[],
  actors: ActorDef[],
  resolution: Resolution,
): { dialogue: string; resolution: JsonObject } {
  return {
    dialogue: buildDialogue(transcript, actors),
    resolution: { reached: resolution.reached, terms: resolution.terms },
  };
}

/** Restaure le brouillon de résolution persisté (reprise après refresh). */
export function restoreResolution(scratch: JsonObject): Resolution {
  const raw = scratch.resolution;
  if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
    return { reached: true, terms: "" };
  }
  const o = raw as JsonObject;
  return {
    reached: typeof o.reached === "boolean" ? o.reached : true,
    terms: typeof o.terms === "string" ? o.terms : "",
  };
}

/** Garde-fou au validate:scenarios — retourne [] si les params sont valides. */
export function validateParams(params: JsonObject): string[] {
  const errors: string[] = [];
  for (const key of ["party_a_actor", "party_b_actor"] as const) {
    if (typeof params[key] !== "string" || (params[key] as string).trim().length === 0) {
      errors.push(`params.${key} doit être une string non vide`);
    }
  }
  if (
    typeof params.party_a_actor === "string" &&
    typeof params.party_b_actor === "string" &&
    params.party_a_actor.trim().length > 0 &&
    params.party_a_actor === params.party_b_actor
  ) {
    errors.push("params.party_a_actor et params.party_b_actor doivent être distincts");
  }
  if (
    typeof params.conflict_brief !== "string" ||
    params.conflict_brief.trim().length === 0
  ) {
    errors.push("params.conflict_brief doit être une string non vide");
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
  for (const key of ["directive", "opening_message_a", "opening_message_b"] as const) {
    if (params[key] !== undefined && typeof params[key] !== "string") {
      errors.push(`params.${key} doit être une string`);
    }
  }
  return errors;
}
