/**
 * planification — spec HEADLESS v3 (capacité du moteur, zéro UI, zéro I/O).
 *
 * Le joueur construit une ORGANISATION d'exécution : plan d'action,
 * roadmap, séquence de tâches, jalons, dépendances, ressources, risques.
 * À NE PAS confondre avec `decision` (choisir QUOI faire) : ici on organise
 * COMMENT exécuter. S'appuie sur le Decision Engine (timeline / kanban /
 * graphe de dépendances / registre de risques / RACI via table) et le
 * Bloc-notes (tâches). L'observable est le PLAN réellement produit.
 *
 * PUR / node-safe : n'importe que des API de tools pures (aucun React).
 */

import type { JsonObject } from "@/app/lib/engine/mechanics";
import type { MechanicSpec } from "@/app/lib/engine/workspace";
import { listBoards, listDecisions, listDependencies } from "@/app/workspace/tools/decision-engine/api";
import { selectAllTasks } from "@/app/workspace/tools/bloc-notes/api";
import { notesForObservation, requireInstructions } from "../specHelpers";

function planSummary(ws: Parameters<MechanicSpec["buildArtifacts"]>[0]): JsonObject {
  const dec = ws.toolStates?.["decision-engine"] ?? null;
  const bloc = ws.toolStates?.["bloc-notes"] ?? null;
  const boards = dec ? listBoards(dec) : [];
  const tasks = bloc ? selectAllTasks(bloc) : [];
  const deps = dec ? listDependencies(dec) : [];
  const risks = dec ? listDecisions(dec).reduce((s, d) => s + (d.risks?.length ?? 0), 0) : 0;
  return {
    outils: [...new Set(boards.map((b) => b.engine))],
    jalons: boards.filter((b) => b.engine === "timeline").length,
    taches: {
      a_faire: tasks.filter((t) => t.status === "todo").length,
      en_cours: tasks.filter((t) => t.status === "doing").length,
      terminees: tasks.filter((t) => t.status === "done").length,
    },
    dependances: deps.length,
    risques: risks,
  };
}

export const planificationSpec: MechanicSpec = {
  manifest: {
    id: "planification",
    version: "3.0.0",
    title: "Planification / Organisation",
    description:
      "Le joueur organise l'exécution : plan d'action, roadmap, séquence de tâches, jalons, dépendances, ressources et risques. L'observateur regarde la cohérence et le réalisme du plan produit (pas le choix, mais l'organisation).",
    output_keys: ["plan"],
    required_params: ["instructions"],
    default_tools: ["decision-engine", "bloc-notes"],
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

  buildArtifacts(ws, _step, _log): JsonObject {
    return {
      notes: notesForObservation(ws),
      plan: planSummary(ws),
    };
  },

  buildOutput(ws, _step, _observation, _log): JsonObject {
    return { plan: planSummary(ws) };
  },

  validateParams(params: JsonObject): string[] {
    const errors: string[] = [];
    requireInstructions(params, errors);
    return errors;
  },
};
