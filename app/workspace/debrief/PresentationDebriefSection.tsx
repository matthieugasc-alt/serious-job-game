"use client";

/**
 * PresentationDebriefSection — section de débrief AUTO-PORTÉE pour la
 * mécanique Présentation. Relit le discours (outil réunion) et sa durée
 * (deliverable_submitted), les réactions de l'auditoire (fil de messages)
 * et le travail préparatoire ; calcule le déterministe et propose l'IA.
 */

import { useMemo, useState } from "react";
import type { LoggedAction, ThreadMessage, WorkspaceState } from "@/app/lib/engine/workspace";
import { selectAll } from "@/app/workspace/tools/bloc-notes/api";
import { listDecisions } from "@/app/workspace/tools/decision-engine/api";
import {
  analyzePresentation,
  mergePresentationAi,
  type PresentationObservations,
} from "@/app/lib/debrief/presentation";
import { PresentationDebrief } from "./PresentationDebrief";

interface DocRef {
  id: string;
  title: string;
}

/** Le fil avec le plus d'échanges joueur↔acteur (l'auditoire / Q&A). */
function audienceThread(ws: WorkspaceState): ThreadMessage[] {
  let best: ThreadMessage[] = [];
  for (const t of Object.values(ws.threads ?? {})) {
    const conv = (t.messages ?? []).filter((m) => m.from === "player" || m.from === "actor");
    if (conv.length > best.length) best = t.messages;
  }
  return best;
}

/** Questions posées par l'auditoire et réponses du joueur (heuristique). */
function countQa(messages: ThreadMessage[]): { received: number; answered: number } {
  const conv = messages.filter((m) => m.from === "player" || m.from === "actor");
  let received = 0;
  let answered = 0;
  for (let i = 0; i < conv.length; i++) {
    if (conv[i].from === "actor" && conv[i].content.includes("?")) {
      received += 1;
      for (let j = i + 1; j < conv.length; j++) {
        if (conv[j].from === "actor") break;
        if (conv[j].from === "player") { answered += 1; break; }
      }
    }
  }
  return { received, answered };
}

function durationFromLog(actionLog: LoggedAction[]): number {
  let dur = 0;
  for (const la of actionLog) {
    if (la.action.type === "deliverable_submitted") {
      const d = (la.action.payload as { duration_s?: unknown })?.duration_s;
      if (typeof d === "number" && d > 0) dur = d;
    }
  }
  return dur;
}

export function PresentationDebriefSection({
  workspace,
  actionLog,
  documents,
}: {
  workspace: WorkspaceState;
  actionLog: LoggedAction[];
  documents: DocRef[];
}) {
  const { base, aiPayload, hasSpeech } = useMemo(() => {
    const reunion = workspace.toolStates?.["reunion"] as { speech?: string } | null | undefined;
    const speech = typeof reunion?.speech === "string" ? reunion.speech : "";
    const messages = audienceThread(workspace);
    const qa = countQa(messages);
    const durationS = durationFromLog(actionLog);

    const bloc = workspace.toolStates?.["bloc-notes"] ?? null;
    const dec = workspace.toolStates?.["decision-engine"] ?? null;
    const notes = bloc ? selectAll(bloc) : [];
    const decisions = dec ? listDecisions(dec) : [];
    const opened = Object.values(workspace.documents ?? {}).filter((d) => d?.opened).length;

    const base = analyzePresentation({
      speech,
      durationS,
      qa,
      supporting: { documents: opened, notes: notes.length, decisions: decisions.length },
    });
    const aiPayload = {
      speech,
      durationS,
      qa,
      audience: messages.filter((m) => m.from !== "system").map((m) => ({ role: m.from, content: m.content })),
      supporting: {
        documents: documents.map((d) => d.title),
        notes: notes.map((n) => n.title).filter(Boolean),
        decisions: decisions.map((d) => d.title).filter(Boolean),
      },
    };
    return { base, aiPayload, hasSpeech: speech.trim().length > 0 };
  }, [workspace, actionLog, documents]);

  const [enriched, setEnriched] = useState<PresentationObservations | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "error">("idle");
  const observations = enriched ?? base;

  const runAi = async () => {
    setPhase("loading");
    try {
      const res = await fetch("/api/v2/debrief-presentation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aiPayload),
      });
      if (!res.ok) throw new Error("ai");
      const data = await res.json();
      setEnriched(mergePresentationAi(base, data));
      setPhase("idle");
    } catch {
      setPhase("error");
    }
  };

  if (!hasSpeech) return null;

  return (
    <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-400">Débrief · Présentation</p>
          <h2 className="text-base font-semibold text-gray-900">Comment vous avez défendu votre travail</h2>
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
          Métriques mesurées automatiquement. Lancez l&apos;analyse IA pour le qualitatif et l&apos;impact sur l&apos;auditoire.
        </p>
      )}

      <PresentationDebrief observations={observations} />
    </div>
  );
}
