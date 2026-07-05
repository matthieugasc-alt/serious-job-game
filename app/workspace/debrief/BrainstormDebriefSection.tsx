"use client";

/**
 * BrainstormDebriefSection — section de débrief AUTO-PORTÉE pour la
 * mécanique Créativité / Brainstorming. Il n'y a pas de mécanique moteur
 * dédiée : on lit les post-it du whiteboard (idées) + la convergence
 * (idées → tâches / options / décisions). La section ne s'affiche QUE si
 * des idées ont été produites.
 */

import { useMemo, useState } from "react";
import type { WorkspaceState } from "@/app/lib/engine/workspace";
import { selectAll, selectAllTasks } from "@/app/workspace/tools/bloc-notes/api";
import { listDecisions } from "@/app/workspace/tools/decision-engine/api";
import { selectNotes } from "@/app/workspace/tools/whiteboard/api";
import {
  analyzeBrainstorm,
  mergeBrainstormAi,
  type BrainstormObservations,
} from "@/app/lib/debrief/brainstorm";
import { BrainstormDebrief } from "./BrainstormDebrief";

interface BlockLike {
  children?: BlockLike[];
}

function hasNested(blocks: BlockLike[]): boolean {
  return blocks.some((b) => (Array.isArray(b.children) && b.children.length > 0) || (b.children ? hasNested(b.children) : false));
}

export function BrainstormDebriefSection({ workspace, brief }: { workspace: WorkspaceState; brief: string }) {
  const { base, aiPayload, hasIdeas } = useMemo(() => {
    const wb = workspace.toolStates?.["whiteboard"] ?? null;
    const bloc = workspace.toolStates?.["bloc-notes"] ?? null;
    const dec = workspace.toolStates?.["decision-engine"] ?? null;

    const stickies = wb ? selectNotes(wb) : [];
    const ideas = stickies.map((s) => ({ text: s.text, author: s.author ?? "player", color: s.color, at: s.created_at }));

    const notes = bloc ? selectAll(bloc) : [];
    const tasks = bloc ? selectAllTasks(bloc) : [];
    const decisions = dec ? listDecisions(dec) : [];
    const options = decisions.reduce((s, d) => s + (d.options?.length ?? 0), 0);
    const hasMindmap = notes.some((n) => hasNested(n.blocks as unknown as BlockLike[]));

    const toolUsage = [
      { label: "Whiteboard (post-it)", used: ideas.length > 0 },
      { label: "Mind map", used: hasMindmap },
      { label: "Bloc-notes", used: notes.length > 0 },
      { label: "Decision Toolbox", used: decisions.length > 0 },
    ];

    const base = analyzeBrainstorm({ ideas, convergence: { tasks: tasks.length, decisions: decisions.length, options }, toolUsage });
    const aiPayload = {
      ideas: ideas.map((i) => ({ text: i.text, color: i.color, author: i.author })),
      brief,
      convergence: { tasks: tasks.length, decisions: decisions.length, options },
    };
    return { base, aiPayload, hasIdeas: ideas.length > 0 };
  }, [workspace, brief]);

  const [enriched, setEnriched] = useState<BrainstormObservations | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "error">("idle");
  const observations = enriched ?? base;

  const runAi = async () => {
    setPhase("loading");
    try {
      const res = await fetch("/api/v2/debrief-brainstorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aiPayload),
      });
      if (!res.ok) throw new Error("ai");
      const data = await res.json();
      setEnriched(mergeBrainstormAi(base, data));
      setPhase("idle");
    } catch {
      setPhase("error");
    }
  };

  if (!hasIdeas) return null;

  return (
    <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-400">Débrief · Créativité / Brainstorming</p>
          <h2 className="text-base font-semibold text-gray-900">La richesse de vos idées</h2>
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
          Volume et structuration mesurés automatiquement. Lancez l&apos;analyse IA pour la diversité, l&apos;originalité et la pertinence.
        </p>
      )}

      <BrainstormDebrief observations={observations} />
    </div>
  );
}
