"use client";

/**
 * PlanningDebriefSection — section de débrief AUTO-PORTÉE pour la mécanique
 * Planification / Organisation. Il n'y a pas de mécanique moteur dédiée :
 * on lit les artefacts de plan (tableaux Timeline/Kanban/graphe, tâches,
 * dépendances, risques). La section ne s'affiche QUE si un plan existe.
 */

import { useMemo, useState } from "react";
import type { Json } from "@/app/lib/engine/mechanics";
import type { WorkspaceState } from "@/app/lib/engine/workspace";
import { selectAllTasks } from "@/app/workspace/tools/bloc-notes/api";
import { labelOfNode, listBoards, listDecisions, listDependencies } from "@/app/workspace/tools/decision-engine/api";
import {
  analyzePlanning,
  mergePlanningAi,
  type PlanningObservations,
} from "@/app/lib/debrief/planning";
import { PlanningDebrief } from "./PlanningDebrief";

const ENGINE_LABEL: Record<string, string> = {
  timeline: "Timeline",
  kanban: "Kanban",
  graph: "Diagramme de dépendances",
  table: "RACI / Table",
  matrix: "Matrice",
  registry: "Registre",
};

function itemsOf(data: Json): number {
  const items = (data as { items?: unknown })?.items;
  return Array.isArray(items) ? items.length : 0;
}

export function PlanningDebriefSection({ workspace }: { workspace: WorkspaceState }) {
  const dec = workspace.toolStates?.["decision-engine"] ?? null;
  const bloc = workspace.toolStates?.["bloc-notes"] ?? null;

  const { base, aiPayload, hasPlan } = useMemo(() => {
    const boards = dec ? listBoards(dec) : [];
    const decisions = dec ? listDecisions(dec) : [];
    const deps = dec ? listDependencies(dec) : [];
    const tasks = bloc ? selectAllTasks(bloc) : [];

    const tasksByStatus = {
      todo: tasks.filter((t) => t.status === "todo").length,
      doing: tasks.filter((t) => t.status === "doing").length,
      done: tasks.filter((t) => t.status === "done").length,
    };
    const boardItems = boards.reduce((s, b) => s + itemsOf(b.data), 0);
    const milestones = boards.filter((b) => b.engine === "timeline").reduce((s, b) => s + itemsOf(b.data), 0);
    const steps = boardItems + tasks.length;

    const byEngine = new Map<string, number>();
    for (const b of boards) byEngine.set(b.engine, (byEngine.get(b.engine) ?? 0) + 1);
    const toolUsage = [...byEngine.entries()].map(([engine, count]) => ({ label: ENGINE_LABEL[engine] ?? engine, count }));

    const dependencies = deps.map((d) => ({ fromLabel: labelOfNode(dec, d.from), toLabel: labelOfNode(dec, d.to) }));
    const risks = decisions.flatMap((d) => (d.risks ?? []).map((r) => ({ label: r.label, probability: r.probability, impact: r.impact })));

    const base = analyzePlanning({ steps, milestones, tasksByStatus, dependencies, risks, toolUsage });

    const planningTools = boards.some((b) => b.engine === "timeline" || b.engine === "kanban" || b.engine === "graph");
    const hasPlan = planningTools || tasks.length > 0 || dependencies.length > 0;

    const aiPayload = { planning: base.planning, dependencies, risks, toolUsage };
    return { base, aiPayload, hasPlan };
  }, [dec, bloc]);

  const [enriched, setEnriched] = useState<PlanningObservations | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "error">("idle");
  const observations = enriched ?? base;

  const runAi = async () => {
    setPhase("loading");
    try {
      const res = await fetch("/api/v2/debrief-planning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aiPayload),
      });
      if (!res.ok) throw new Error("ai");
      const data = await res.json();
      setEnriched(mergePlanningAi(base, data));
      setPhase("idle");
    } catch {
      setPhase("error");
    }
  };

  if (!hasPlan) return null;

  return (
    <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-400">Débrief · Planification</p>
          <h2 className="text-base font-semibold text-gray-900">La solidité de votre organisation</h2>
        </div>
        {!observations.aiEnriched && (
          <button
            type="button"
            disabled={phase === "loading"}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            onClick={runAi}
          >
            {phase === "loading" ? "Analyse en cours…" : "✨ Analyse pédagogique (IA)"}
          </button>
        )}
      </div>

      {phase === "error" && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          L&apos;analyse IA est indisponible — les indicateurs mesurés restent affichés ci-dessous.
        </p>
      )}
      {!observations.aiEnriched && phase !== "error" && (
        <p className="mb-3 text-[11px] text-gray-400">
          Structure du plan mesurée automatiquement. Lancez l&apos;analyse IA pour la cohérence, le réalisme et la robustesse.
        </p>
      )}

      <PlanningDebrief observations={observations} />
    </div>
  );
}
