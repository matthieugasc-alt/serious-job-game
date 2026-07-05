/**
 * planification — spec HEADLESS v3 (capacité du moteur, zéro UI, zéro I/O).
 *
 * Le joueur construit une ORGANISATION d'exécution : plan d'action,
 * roadmap, séquence de tâches, jalons, dépendances, ressources, risques.
 * À NE PAS confondre avec `decision` (choisir QUOI faire) : ici on organise
 * COMMENT exécuter.
 *
 * INVARIANT D'INDÉPENDANCE (docs/TOOL_BLOC_NOTES.md §1, garde-fous des
 * tools transversaux) : une mécanique n'importe JAMAIS bloc-notes /
 * decision-engine / whiteboard et ne lit JAMAIS leur état — ces tools
 * appartiennent au joueur, pas à une mécanique. Le joueur les mobilise
 * librement (timeline, kanban, graphe de dépendances, registre de
 * risques) ; l'observation FINE de ce qu'ils contiennent appartient au
 * collecteur de débrief (app/lib/debrief/collect.ts), hors app/mechanics.
 * Ici, la mécanique observe seulement ce que le joueur FORMALISE (plan
 * rendu par message/mail) et ses notes génériques.
 *
 * PUR / node-safe : aucun React, aucun import de tool.
 */

import type { JsonObject } from "@/app/lib/engine/mechanics";
import type { MechanicSpec } from "@/app/lib/engine/workspace";
import {
  lastFormalisation,
  notesForObservation,
  rawNotes,
  requireInstructions,
} from "../specHelpers";

export const planificationSpec: MechanicSpec = {
  manifest: {
    id: "planification",
    version: "3.0.0",
    title: "Planification / Organisation",
    description:
      "Le joueur organise l'exécution : plan d'action, roadmap, séquence de tâches, jalons, dépendances, ressources et risques. L'observateur regarde la cohérence et le réalisme du plan produit (pas le choix, mais l'organisation).",
    output_keys: ["plan"],
    required_params: ["instructions"],
    default_tools: [],
  },

  directive(params: JsonObject): string {
    const instructions = typeof params.instructions === "string" ? params.instructions : "";
    return [
      "Le joueur construit un plan d'organisation / d'exécution dans son poste de travail.",
      instructions ? `Consigne du moment : ${instructions}` : "",
      "Aide-le à clarifier les contraintes (délais, ressources, dépendances) quand il t'interroge, mais ne construis JAMAIS le plan à sa place : c'est à lui de séquencer, poser les jalons et anticiper les risques.",
    ]
      .filter(Boolean)
      .join("\n");
  },

  buildArtifacts(ws, step, log): JsonObject {
    return {
      instructions: typeof step.params.instructions === "string" ? step.params.instructions : "",
      notes: notesForObservation(ws),
      plan_formalise: lastFormalisation(ws, log, step) || "(aucun plan formalisé)",
    };
  },

  buildOutput(ws, step, _observation, log): JsonObject {
    const formalisation = lastFormalisation(ws, log, step);
    return {
      plan: {
        formalisation: formalisation.length > 0 ? formalisation : rawNotes(ws),
      },
    };
  },

  validateParams(params: JsonObject): string[] {
    const errors: string[] = [];
    requireInstructions(params, errors);
    return errors;
  },
};
