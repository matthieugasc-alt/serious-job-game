/**
 * ═════════════════════════════════════════════════════════════════
 * Moteur — Types fondamentaux partagés (Json, acteurs, documents,
 * transcript, endings, résultats de step)
 * ═════════════════════════════════════════════════════════════════
 *
 * Vocabulaire commun du moteur v3 (workspace.ts, sessionV3.ts,
 * composerV3.ts) et des couches UI. Module PUR : zéro React, zéro I/O.
 *
 * Le contrat v2 (MechanicModule/MechanicIO, ScenarioV2, StepInvocation)
 * a été purgé avec le player v2 — cf. archive/legacy-v2/ARCHIVE.md.
 *
 * Règle absolue inchangée : AUCUN contenu scénario dans le moteur.
 * Tout ce qui nomme un acteur, un produit, une branche métier vit
 * dans le JSON du scénario et arrive via `params`.
 */

import type { StepEvaluationResult } from "./criteria";

/** Valeur JSON sérialisable — tout output de mécanique doit l'être. */
export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

// ─── Acteurs & documents (déclarés par le scénario) ──────────────

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

// ─── Endings (règles de fin, partagées v3) ────────────────────────

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
  /** Optionnel : niveau de verdict que cet ending représente, pour que le
   *  juge IA (doctrine d'évaluation) choisisse l'ending à AFFICHER. */
  verdict?: "victoire_complete" | "victoire_partielle" | "defaite";
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
