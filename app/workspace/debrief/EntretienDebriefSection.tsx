"use client";

/**
 * EntretienDebriefSection — section de débrief AUTO-PORTÉE pour la
 * mécanique Qualification / Entretien, à monter sur la page de fin de
 * scénario. Elle :
 *   1) calcule immédiatement les observations DÉTERMINISTES (sans IA) ;
 *   2) propose une « analyse pédagogique (IA) » optionnelle qui enrichit
 *      (types de questions, couverture, synthèse, commentaires de replay) ;
 *   3) offre un replay commenté.
 * Le déterministe marche toujours : l'IA ne fait qu'enrichir.
 */

import { useMemo, useState } from "react";
import type { ThreadMessage, WorkspaceState } from "@/app/lib/engine/workspace";
import { listDecisions } from "@/app/workspace/tools/decision-engine/api";
import {
  analyzeQualification,
  mergeAiClassification,
  QUALIFICATION_RUBRIC,
  type QualificationObservations,
} from "@/app/lib/debrief/qualification";
import { QualificationDebrief } from "./QualificationDebrief";
import { EntretienReplay, type ReplayComment } from "./EntretienReplay";

const HYP_STATUS: Record<string, string> = { open: "ouverte", confirmed: "confirmée", refuted: "infirmée" };

/** Le fil « entretien » = celui qui porte le plus d'échanges joueur↔acteur. */
function mainThreadMessages(ws: WorkspaceState): ThreadMessage[] {
  let best: ThreadMessage[] = [];
  for (const t of Object.values(ws.threads ?? {})) {
    const conv = (t.messages ?? []).filter((m) => m.from === "player" || m.from === "actor");
    if (conv.length > best.length) best = t.messages;
  }
  return best;
}

function readHypotheses(ws: WorkspaceState): { text: string; status: string }[] {
  const state = ws.toolStates?.["decision-engine"] ?? null;
  if (!state) return [];
  return listDecisions(state).flatMap((d) =>
    (d.hypotheses ?? []).map((h) => ({ text: h.text, status: HYP_STATUS[h.status] ?? "ouverte" })),
  );
}

export function EntretienDebriefSection({
  workspace,
  nameOf,
}: {
  workspace: WorkspaceState;
  nameOf?: (actorId: string) => string;
}) {
  const messages = useMemo(() => mainThreadMessages(workspace), [workspace]);
  const base = useMemo(
    () => analyzeQualification(messages, { hypotheses: readHypotheses(workspace) }),
    [messages, workspace],
  );

  const [enriched, setEnriched] = useState<QualificationObservations | null>(null);
  const [replayComments, setReplayComments] = useState<ReplayComment[]>([]);
  const [phase, setPhase] = useState<"idle" | "loading" | "error">("idle");
  const [showReplay, setShowReplay] = useState(false);

  const observations = enriched ?? base;

  const runAiAnalysis = async () => {
    setPhase("loading");
    try {
      const transcript = messages
        .filter((m) => m.from !== "system")
        .map((m) => ({ role: m.from, actor_id: m.actor_id, content: m.content }));
      const res = await fetch("/api/v2/debrief-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, rubric: QUALIFICATION_RUBRIC, questions: base.questions.map((q) => ({ content: q.content })) }),
      });
      if (!res.ok) throw new Error("ai");
      const data = await res.json();
      setEnriched(mergeAiClassification(base, data));
      setReplayComments(Array.isArray(data.replayComments) ? data.replayComments : []);
      setPhase("idle");
    } catch {
      setPhase("error");
    }
  };

  if (messages.filter((m) => m.from === "player" || m.from === "actor").length === 0) return null;

  return (
    <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-400">Débrief · Qualification</p>
          <h2 className="text-base font-semibold text-gray-900">Comment vous avez conduit l&apos;entretien</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100"
            onClick={() => setShowReplay((v) => !v)}
          >
            {showReplay ? "Masquer le replay" : "▶ Replay commenté"}
          </button>
          {!observations.aiEnriched && (
            <button
              type="button"
              disabled={phase === "loading"}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
              onClick={runAiAnalysis}
            >
              {phase === "loading" ? "Analyse en cours…" : "✨ Analyse pédagogique (IA)"}
            </button>
          )}
        </div>
      </div>

      {phase === "error" && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          L&apos;analyse IA est indisponible pour le moment — les indicateurs mesurés restent affichés ci-dessous.
        </p>
      )}
      {!observations.aiEnriched && phase !== "error" && (
        <p className="mb-3 text-[11px] text-gray-400">
          Indicateurs mesurés automatiquement. Lancez l&apos;analyse IA pour la classification des questions, la couverture et la synthèse.
        </p>
      )}

      <QualificationDebrief observations={observations} />

      {showReplay && (
        <div className="mt-5 border-t border-gray-100 pt-4">
          <h3 className="mb-2 text-sm font-semibold text-gray-800">Replay {replayComments.length > 0 ? "commenté" : ""}</h3>
          <EntretienReplay messages={messages} comments={replayComments} nameOf={nameOf} />
        </div>
      )}
    </div>
  );
}
