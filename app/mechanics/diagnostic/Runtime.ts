/**
 * diagnostic/Runtime — logique pure (node-safe, sans React ni I/O).
 * Parse des hypothèses, validation du diagnostic, construction de
 * l'output et restauration du scratch.
 */

import type {
  ActorDef,
  JsonObject,
  TranscriptEvent,
} from "@/app/lib/engine/mechanics";

export const DEFAULT_MIN_EXCHANGES = 2;

/**
 * Consigne universelle de cadrage du témoin — jamais du contenu :
 * le scénario ajoute son propre cadrage via le prompt de l'acteur.
 */
export const WITNESS_DIRECTIVE =
  "Le joueur enquête sur la cause d'un problème. Réponds en témoin : " +
  "ce que tu sais, ce que tu as constaté — sans conclure à sa place.";

export interface HypothesisDef {
  id: string;
  label: string;
}

/** Diagnostic structuré — le cœur de l'output de la mécanique. */
export interface Diagnosis {
  cause: string;
  evidence: string;
  eliminated: string;
}

/** min_exchanges du step, borné et défensif (défaut : 2). */
export function resolveMinExchanges(params: JsonObject): number {
  const raw = params.min_exchanges;
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 1
    ? raw
    : DEFAULT_MIN_EXCHANGES;
}

/** Parse défensif de params.hypotheses (ignore les entrées invalides). */
export function parseHypotheses(params: JsonObject): HypothesisDef[] {
  if (!Array.isArray(params.hypotheses)) return [];
  const out: HypothesisDef[] = [];
  for (const raw of params.hypotheses) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) continue;
    const o = raw as JsonObject;
    if (typeof o.id !== "string" || o.id.length === 0) continue;
    if (typeof o.label !== "string" || o.label.length === 0) continue;
    out.push({ id: o.id, label: o.label });
  }
  return out;
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
 * Erreurs bloquant le rendu du diagnostic. [] = diagnostic prêt.
 * Si des hypothèses sont déclarées, la cause retenue doit être l'une
 * d'elles (sélection) ; sinon champ libre non vide.
 */
export function validateDiagnosis(
  hypotheses: HypothesisDef[],
  diagnosis: Diagnosis,
): string[] {
  const errors: string[] = [];
  const cause = diagnosis.cause.trim();
  if (cause.length === 0) {
    errors.push("La cause retenue est vide.");
  } else if (
    hypotheses.length > 0 &&
    !hypotheses.some((h) => h.id === cause)
  ) {
    errors.push("La cause retenue doit être l'une des hypothèses déclarées.");
  }
  if (diagnosis.evidence.trim().length === 0) {
    errors.push("Les éléments à l'appui sont vides.");
  }
  return errors;
}

/** Diagnostic normalisé (trim), conforme au contrat {cause, evidence, eliminated}. */
export function buildDiagnosis(
  cause: string,
  evidence: string,
  eliminated: string,
): Diagnosis {
  return {
    cause: cause.trim(),
    evidence: evidence.trim(),
    eliminated: eliminated.trim(),
  };
}

/** Résumé lisible pour le transcript (audit + matière d'observation). */
export function buildSummary(
  diagnosis: Diagnosis,
  hypotheses: HypothesisDef[],
): string {
  const causeLabel =
    hypotheses.find((h) => h.id === diagnosis.cause)?.label ?? diagnosis.cause;
  const parts = [
    `Cause retenue : ${causeLabel}`,
    `Éléments à l'appui : ${diagnosis.evidence}`,
  ];
  if (diagnosis.eliminated.length > 0) {
    parts.push(`Causes écartées : ${diagnosis.eliminated}`);
  }
  return parts.join("\n");
}

/** Output conforme au manifest : exactement { diagnosis, dialogue }. */
export function buildOutput(
  transcript: TranscriptEvent[],
  actors: ActorDef[],
  diagnosis: Diagnosis,
): { diagnosis: JsonObject; dialogue: string } {
  return {
    diagnosis: {
      cause: diagnosis.cause,
      evidence: diagnosis.evidence,
      eliminated: diagnosis.eliminated,
    },
    dialogue: buildDialogue(transcript, actors),
  };
}

/** Restaure le brouillon de diagnostic persisté (reprise après refresh). */
export function restoreDiagnosis(scratch: JsonObject): Diagnosis {
  const raw = scratch.diagnosis;
  const empty: Diagnosis = { cause: "", evidence: "", eliminated: "" };
  if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
    return empty;
  }
  const o = raw as JsonObject;
  return {
    cause: typeof o.cause === "string" ? o.cause : "",
    evidence: typeof o.evidence === "string" ? o.evidence : "",
    eliminated: typeof o.eliminated === "string" ? o.eliminated : "",
  };
}

/** Garde-fou au validate:scenarios — retourne [] si les params sont valides. */
export function validateParams(params: JsonObject): string[] {
  const errors: string[] = [];
  if (typeof params.situation !== "string" || params.situation.trim().length === 0) {
    errors.push("params.situation doit être une string non vide");
  }
  if (typeof params.actor_id !== "string" || params.actor_id.trim().length === 0) {
    errors.push("params.actor_id doit être une string non vide");
  }
  if (params.hypotheses !== undefined) {
    if (!Array.isArray(params.hypotheses) || params.hypotheses.length === 0) {
      errors.push("params.hypotheses doit être un tableau non vide si présent");
    } else {
      const parsed = parseHypotheses(params);
      if (parsed.length !== params.hypotheses.length) {
        errors.push(
          "chaque entrée de params.hypotheses doit avoir id et label (strings non vides)",
        );
      }
      const ids = parsed.map((h) => h.id);
      if (new Set(ids).size !== ids.length) {
        errors.push("les id de params.hypotheses doivent être uniques");
      }
    }
  }
  if (
    params.document_ids !== undefined &&
    (!Array.isArray(params.document_ids) ||
      params.document_ids.some((d) => typeof d !== "string"))
  ) {
    errors.push("params.document_ids doit être un tableau de strings");
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
  if (
    params.opening_message !== undefined &&
    typeof params.opening_message !== "string"
  ) {
    errors.push("params.opening_message doit être une string");
  }
  return errors;
}
