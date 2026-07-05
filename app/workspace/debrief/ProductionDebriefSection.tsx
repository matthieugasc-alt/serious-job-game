"use client";

/**
 * ProductionDebriefSection — section de débrief AUTO-PORTÉE pour la
 * mécanique Production. Reconstitue le livrable (éditeur, sinon dernier
 * mail envoyé, sinon note la plus longue) et le travail préparatoire,
 * calcule le déterministe (structure, métriques, sources), et propose
 * l'analyse IA (complétude, traçabilité, qualitatif, synthèse).
 */

import { useMemo, useState } from "react";
import type { WorkspaceState } from "@/app/lib/engine/workspace";
import { selectAll } from "@/app/workspace/tools/bloc-notes/api";
import { listDecisions } from "@/app/workspace/tools/decision-engine/api";
import {
  analyzeProduction,
  mergeProductionAi,
  type ProductionObservations,
} from "@/app/lib/debrief/production";
import { ProductionDebrief } from "./ProductionDebrief";

interface DocRef {
  id: string;
  title: string;
}

function noteText(blocks: { text: string }[]): string {
  return blocks.map((b) => b.text).filter(Boolean).join("\n");
}

/** Reconstitue le livrable le plus probable depuis la session. */
function extractDeliverable(ws: WorkspaceState, type: string): { type: string; title: string; body: string } {
  const ed = ws.toolStates?.["editeur"] as { title?: string; body?: string } | null | undefined;
  if (ed && typeof ed.body === "string" && ed.body.trim()) {
    return { type: type || "document", title: ed.title || "Document", body: ed.body };
  }
  const sent = ws.mailbox?.sent ?? [];
  if (sent.length > 0) {
    const m = [...sent].sort((a, b) => b.at - a.at)[0];
    return { type: type || "mail", title: m.subject, body: m.body };
  }
  const bloc = ws.toolStates?.["bloc-notes"] ?? null;
  if (bloc) {
    const notes = selectAll(bloc);
    if (notes.length > 0) {
      const best = notes
        .map((n) => ({ n, text: noteText(n.blocks) }))
        .sort((a, b) => b.text.length - a.text.length)[0];
      return { type: type || "note", title: best.n.title || "Note", body: best.text };
    }
  }
  return { type: type || "livrable", title: "", body: "" };
}

export function ProductionDebriefSection({
  workspace,
  instructions,
  deliverableType,
  documents,
}: {
  workspace: WorkspaceState;
  instructions: string;
  deliverableType: string;
  documents: DocRef[];
}) {
  const { base, aiPayload } = useMemo(() => {
    const deliverable = extractDeliverable(workspace, deliverableType);
    const bloc = workspace.toolStates?.["bloc-notes"] ?? null;
    const dec = workspace.toolStates?.["decision-engine"] ?? null;
    const notes = bloc ? selectAll(bloc) : [];
    const decisions = dec ? listDecisions(dec) : [];

    const openedIds = new Set<string>();
    for (const [id, d] of Object.entries(workspace.documents ?? {})) if (d?.opened) openedIds.add(id);

    const base = analyzeProduction({
      deliverable,
      instructions,
      documentsOpened: openedIds.size,
      documentsTotal: documents.length,
      supporting: { notes: notes.length, decisions: decisions.length },
    });
    const aiPayload = {
      deliverable,
      instructions,
      supporting: {
        notes: notes.map((n) => n.title).filter(Boolean),
        decisions: decisions.map((d) => d.title).filter(Boolean),
        documents: documents.map((d) => d.title),
      },
    };
    return { base, aiPayload };
  }, [workspace, instructions, deliverableType, documents]);

  const [enriched, setEnriched] = useState<ProductionObservations | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "error">("idle");
  const observations = enriched ?? base;

  const runAi = async () => {
    setPhase("loading");
    try {
      const res = await fetch("/api/v2/debrief-production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aiPayload),
      });
      if (!res.ok) throw new Error("ai");
      const data = await res.json();
      setEnriched(mergeProductionAi(base, data));
      setPhase("idle");
    } catch {
      setPhase("error");
    }
  };

  if (base.deliverable.wordCount === 0) return null;

  return (
    <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-400">Débrief · Production</p>
          <h2 className="text-base font-semibold text-gray-900">La qualité de votre livrable</h2>
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
          Structure et métriques mesurées automatiquement. Lancez l&apos;analyse IA pour la complétude, la traçabilité et le qualitatif.
        </p>
      )}

      <ProductionDebrief observations={observations} />
    </div>
  );
}
