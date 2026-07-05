"use client";

/**
 * NegotiationDebriefSection — section de débrief AUTO-PORTÉE pour la
 * mécanique Négociation. Relit l'outil contrat (termes ouverture → final,
 * propositions, statut), les objections (dialogue) et le contexte
 * stratégique (objectif, décisions, risques), calcule le déterministe et
 * propose l'analyse IA.
 */

import { useMemo, useState } from "react";
import type { Json } from "@/app/lib/engine/mechanics";
import type { ThreadMessage, WorkspaceState } from "@/app/lib/engine/workspace";
import { listDecisions } from "@/app/workspace/tools/decision-engine/api";
import {
  analyzeNegotiation,
  mergeNegotiationAi,
  type NegotiationObservations,
} from "@/app/lib/debrief/negotiation";
import { NegotiationDebrief } from "./NegotiationDebrief";

export interface TermDef {
  id: string;
  label: string;
  opening?: Json;
  suffix?: string;
}

function scalar(v: Json | undefined): number | string | null {
  if (typeof v === "number" || typeof v === "string") return v;
  return null;
}

function mainThread(ws: WorkspaceState): ThreadMessage[] {
  let best: ThreadMessage[] = [];
  for (const t of Object.values(ws.threads ?? {})) {
    const conv = (t.messages ?? []).filter((m) => m.from === "player" || m.from === "actor");
    if (conv.length > best.length) best = t.messages;
  }
  return best;
}

/** Objections de l'acteur (questions/réserves) et réponses du joueur. */
function countObjections(messages: ThreadMessage[]): { received: number; answered: number } {
  const conv = messages.filter((m) => m.from === "player" || m.from === "actor");
  let received = 0;
  let answered = 0;
  for (let i = 0; i < conv.length; i++) {
    if (conv[i].from === "actor" && /[?]|mais |trop |non |impossible|refus|cher/i.test(conv[i].content)) {
      received += 1;
      for (let j = i + 1; j < conv.length; j++) {
        if (conv[j].from === "actor") break;
        if (conv[j].from === "player") { answered += 1; break; }
      }
    }
  }
  return { received, answered };
}

export function NegotiationDebriefSection({
  workspace,
  terms,
  objective,
}: {
  workspace: WorkspaceState;
  terms: TermDef[];
  objective: string;
}) {
  const { base, aiPayload, hasContract } = useMemo(() => {
    const raw = (workspace.toolStates?.["contrat"] ?? null) as { values?: Record<string, Json>; proposals?: { at: number; values: Record<string, Json> }[]; status?: string } | null;
    const values = raw?.values ?? {};
    const proposalsRaw = Array.isArray(raw?.proposals) ? raw!.proposals : [];
    const status = raw?.status === "signed" || raw?.status === "rejected" ? raw.status : "open";

    const termInputs = terms.map((t) => ({ id: t.id, label: t.label, opening: scalar(t.opening), final: scalar(values[t.id]), suffix: t.suffix }));
    const proposals = proposalsRaw.map((p) => ({
      at: p.at,
      values: Object.fromEntries(Object.entries(p.values ?? {}).map(([k, v]) => [k, (typeof v === "number" || typeof v === "string" ? v : String(v)) as number | string])),
    }));

    const messages = mainThread(workspace);
    const objections = countObjections(messages);

    const decState = workspace.toolStates?.["decision-engine"] ?? null;
    const decisions = decState ? listDecisions(decState) : [];

    const base = analyzeNegotiation({ terms: termInputs, proposals, status, objections });
    const aiPayload = {
      status,
      terms: termInputs.map((t) => ({ label: t.label, opening: t.opening, final: t.final, suffix: t.suffix })),
      chronology: base.chronology.map((c) => ({ label: c.label })),
      objections,
      dialogue: messages.filter((m) => m.from !== "system").map((m) => ({ role: m.from, content: m.content })),
      strategy: {
        objective,
        decisions: decisions.map((d) => d.final_decision || d.title).filter(Boolean),
        risks: decisions.flatMap((d) => (d.risks ?? []).map((r) => r.label)),
      },
    };
    const hasContract = terms.length > 0 || proposals.length > 0 || Object.keys(values).length > 0;
    return { base, aiPayload, hasContract };
  }, [workspace, terms, objective]);

  const [enriched, setEnriched] = useState<NegotiationObservations | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "error">("idle");
  const observations = enriched ?? base;

  const runAi = async () => {
    setPhase("loading");
    try {
      const res = await fetch("/api/v2/debrief-negotiation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aiPayload),
      });
      if (!res.ok) throw new Error("ai");
      const data = await res.json();
      setEnriched(mergeNegotiationAi(base, data));
      setPhase("idle");
    } catch {
      setPhase("error");
    }
  };

  if (!hasContract) return null;

  return (
    <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-400">Débrief · Négociation</p>
          <h2 className="text-base font-semibold text-gray-900">La dynamique de votre négociation</h2>
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
          Termes et concessions mesurés automatiquement. Lancez l&apos;analyse IA pour la dynamique et la synthèse.
        </p>
      )}

      <NegotiationDebrief observations={observations} />
    </div>
  );
}
