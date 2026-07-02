/**
 * ═════════════════════════════════════════════════════════════════
 * Moteur v2 — La Mécanique comme entité de premier ordre
 * ═════════════════════════════════════════════════════════════════
 *
 * Une Mécanique = une expérience joueur complète et universelle
 * (qualifier, produire, négocier, présenter…). Elle embarque :
 *   - un manifest pur (id, version, contrat d'entrée/sortie)
 *   - une UI React (Component)
 *   - sa logique d'observation (l'IA observe, le moteur décide)
 *   - ses tests, sa doc
 *
 * Règle absolue : AUCUN contenu scénario dans une mécanique.
 * Tout ce qui nomme un acteur, un produit, une branche métier vit
 * dans le JSON du scénario et arrive ici via `params`.
 */

import type { FC } from "react";
import type {
  StepCriterion,
  StepCompletionRules,
  StepObservation,
  StepEvaluationResult,
} from "./criteria";

/** Valeur JSON sérialisable — tout output de mécanique doit l'être. */
export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

// ─── Manifest (pur, importable côté node/tests/validateurs) ──────

export interface MechanicManifest {
  /** Identifiant stable, utilisé par le JSON scénario. */
  id: string;
  version: string;
  title: string;
  description: string;
  /** Clés garanties présentes dans l'output — contrat pour `inputs_from`. */
  output_keys: readonly string[];
  /** Clés de params obligatoires (garde-fou de validation scénario). */
  required_params: readonly string[];
  /** Canaux utilisés (informatif : capabilities, UI). */
  channels: readonly ("chat" | "mail" | "voice" | "documents" | "editor")[];
}

// ─── Contexte d'exécution ─────────────────────────────────────────

/** Acteur tel que déclaré par le scénario (le moteur ne connaît aucun nom). */
export interface ActorDef {
  actor_id: string;
  name: string;
  role: string;
  /** Prompt système complet de l'acteur — 100% contenu scénario. */
  prompt: string;
  avatar?: string;
}

export interface DocumentDef {
  id: string;
  title: string;
  /** Soit un fichier servi, soit un contenu inline markdown. */
  file_path?: string;
  content?: string;
}

/** Événement de transcript — trace universelle de tout ce qui se passe. */
export interface TranscriptEvent {
  at: number;
  channel: "chat" | "mail" | "voice" | "system" | "editor";
  role: "player" | "actor" | "system";
  actor_id?: string;
  content: string;
  meta?: JsonObject;
}

/**
 * I/O fournies par le runner à la mécanique. La mécanique ne fait
 * JAMAIS de fetch direct : tout passe par ce contrat (testable,
 * mockable, et le moteur garde la main sur l'audit).
 */
export interface MechanicIO {
  /** Fait répondre un acteur IA (prompt scénario + historique + consigne mécanique). */
  actorRespond(input: {
    actor: ActorDef;
    transcript: TranscriptEvent[];
    /** Consigne de cadrage propre à la mécanique (universelle, jamais du contenu). */
    directive?: string;
  }): Promise<string>;
  /** Demande à l'IA d'observer les critères sur le transcript. Ne décide rien. */
  observe(input: {
    criteria: StepCriterion[];
    transcript: TranscriptEvent[];
    /** Artefacts produits (livrable, accord…) soumis à observation. */
    artifacts?: JsonObject;
  }): Promise<StepObservation>;
  /** Enregistre un événement dans le transcript du step (audit + replay). */
  record(event: Omit<TranscriptEvent, "at">): void;
  /** Persiste l'état interne de la mécanique (reprise après crash). */
  saveScratch(scratch: JsonObject): void;
}

export interface MechanicContext<P extends JsonObject = JsonObject> {
  scenarioId: string;
  stepId: string;
  /** Params déclarés par le step — TOUT le contenu passe par là. */
  params: P;
  /** Acteurs du scénario visibles pour ce step. */
  actors: ActorDef[];
  documents: DocumentDef[];
  /** Outputs des steps précédents, résolus par le composer via `inputs`. */
  inputs: JsonObject;
  criteria: StepCriterion[];
  /** Transcript courant du step (reprise). */
  transcript: TranscriptEvent[];
  /** Scratch persisté (reprise). */
  scratch: JsonObject;
  timeLimitS?: number;
  io: MechanicIO;
}

/** Ce qu'une mécanique rend au runner quand le joueur termine. */
export interface MechanicResult<O extends JsonObject = JsonObject> {
  /** Observation IA (ou déterministe) des critères. Le moteur décidera. */
  observation: StepObservation;
  /** Output typé, sérialisable, consommable par les steps suivants. */
  output: O;
}

export interface MechanicProps<
  P extends JsonObject = JsonObject,
  O extends JsonObject = JsonObject,
> {
  context: MechanicContext<P>;
  onComplete: (result: MechanicResult<O>) => void;
}

/** Le module complet d'une mécanique (manifest + UI + validation). */
export interface MechanicModule<
  P extends JsonObject = JsonObject,
  O extends JsonObject = JsonObject,
> {
  manifest: MechanicManifest;
  Component: FC<MechanicProps<P, O>>;
  /** Garde-fou : erreurs de params au validate:scenarios (retourne []). */
  validateParams(params: JsonObject): string[];
}

// ─── Scénario v2 ──────────────────────────────────────────────────

export interface StepInvocation {
  step_id: string;
  mechanic: string;
  title?: string;
  /** Contenu scénario injecté dans la mécanique. */
  params: JsonObject;
  /**
   * Références aux outputs des steps précédents :
   * { "brief": "s1.summary" } → context.inputs.brief = stepOutputs.s1.summary
   * { "tout": "s1" }          → context.inputs.tout = stepOutputs.s1 (entier)
   */
  inputs?: Record<string, string>;
  evaluation: { observed_criteria: StepCriterion[] };
  completion_rules: StepCompletionRules;
  time_limit_s?: number;
  /** Politique d'échec : retry (défaut, borné), advance, end_scenario. */
  on_failure?: "retry" | "advance" | "end_scenario";
  max_attempts?: number;
}

export interface EndingRule {
  id: string;
  label: string;
  content: string;
  /** Steps qui doivent être passés pour matcher (tous). */
  requires_passed?: string[];
  /** Nombre minimal de steps passés pour matcher. */
  min_passed?: number;
  /** Ending par défaut si rien d'autre ne matche (un seul autorisé). */
  default?: boolean;
}

export interface ScenarioV2 {
  format: "v2";
  scenario_id: string;
  version: string;
  locale: string;
  meta: {
    title: string;
    description: string;
    difficulty?: string;
    estimated_minutes?: number;
  };
  actors: ActorDef[];
  documents: DocumentDef[];
  competencies?: string[];
  sequence: StepInvocation[];
  endings: EndingRule[];
}

// ─── Résultat de step persisté ────────────────────────────────────

export interface StepResult {
  stepId: string;
  mechanic: string;
  evaluation: StepEvaluationResult;
  output: JsonObject;
  attempts: number;
  /** true si le step a fini par passer (dernier verdict). */
  passed: boolean;
}
