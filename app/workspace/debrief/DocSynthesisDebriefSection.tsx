"use client";

/**
 * DocSynthesisDebriefSection — section de débrief AUTO-PORTÉE pour la
 * mécanique Analyse / Synthèse documentaire. Extrait le travail du joueur
 * depuis la session (documents ouverts, annotations, notes, décisions,
 * usage des outils), calcule les observations DÉTERMINISTES, et propose
 * une analyse IA optionnelle (preuves, raisonnement, synthèse).
 */

import { useMemo, useState } from "react";
import type { LoggedAction, WorkspaceState } from "@/app/lib/engine/workspace";
import { selectAll, selectNoteForDocument } from "@/app/workspace/tools/bloc-notes/api";
import { selectAllEntries, selectAllTags, selectDesks } from "@/app/workspace/tools/bibliotheque/api";
import { listDecisions } from "@/app/workspace/tools/decision-engine/api";
import {
  analyzeDocSynthesis,
  mergeDocSynthAi,
  type DocSynthInput,
  type DocSynthObservations,
  type RawEvent,
} from "@/app/lib/debrief/docSynthesis";
import { DocSynthesisDebrief } from "./DocSynthesisDebrief";

interface DocRef {
  id: string;
  title: string;
}

/** Construit l'entrée normalisée de l'analyseur depuis la session. */
function buildInput(ws: WorkspaceState, actionLog: LoggedAction[], docs: DocRef[]): {
  input: DocSynthInput;
  aiPayload: { sources: { title: string; readDepth: string }[]; notes: { title: string; text: string }[]; decisions: { title: string; conclusion: string }[]; toolUsage: Record<string, number> };
} {
  const bloc = ws.toolStates?.["bloc-notes"] ?? null;
  const bib = ws.toolStates?.["bibliotheque"] ?? null;
  const dec = ws.toolStates?.["decision-engine"] ?? null;

  const notes = bloc ? selectAll(bloc) : [];
  const entries = bib ? selectAllEntries(bib) : [];
  const tags = bib ? selectAllTags(bib) : [];
  const desks = bib ? selectDesks(bib) : [];
  const decisions = dec ? listDecisions(dec) : [];

  const titleOf = (id: string) => docs.find((d) => d.id === id)?.title ?? id;

  const opened = new Set<string>();
  for (const [id, d] of Object.entries(ws.documents ?? {})) if (d?.opened) opened.add(id);
  for (const la of actionLog) if (la.action.type === "document_opened") opened.add(la.action.document_id);

  const annCount = (docId: string): number => {
    let c = 0;
    const entry = entries.find((e) => e.source?.kind === "scenario_doc" && e.source.document_id === docId);
    if (entry) c += entry.annotations.length;
    const note = bloc ? selectNoteForDocument(bloc, docId) : null;
    if (note) c += note.blocks.filter((b) => b.kind === "quote").length;
    return c;
  };

  const rawDocs = docs.map((d) => ({ id: d.id, title: d.title, opened: opened.has(d.id), annotationCount: annCount(d.id) }));

  const events: RawEvent[] = [];
  for (const la of actionLog) {
    const a = la.action;
    if (a.type === "document_opened") events.push({ at: la.at, category: "lecture", label: titleOf(a.document_id) });
    else if (a.type === "mail_sent") events.push({ at: la.at, category: "livrable", label: a.subject });
    else if (a.type === "tool_op") {
      const op = a.op.toLowerCase();
      if (a.tool_id === "bibliotheque") {
        if (/highlight|comment|bookmark|annot/.test(op)) events.push({ at: la.at, category: "annotation", label: "Annotation" });
        else if (/tag/.test(op)) events.push({ at: la.at, category: "tag", label: "Tag" });
        else if (/desk/.test(op)) events.push({ at: la.at, category: "collection", label: "Collection" });
        else if (/compare|window|beside/.test(op)) events.push({ at: la.at, category: "comparaison", label: "Comparaison" });
      } else if (a.tool_id === "bloc-notes") {
        if (/note_created|annotation_added/.test(op)) events.push({ at: la.at, category: "note", label: "Note" });
      } else if (a.tool_id === "decision-engine") {
        if (/decision_created|decision_finalized/.test(op)) events.push({ at: la.at, category: "décision", label: "Décision" });
      }
    }
  }

  const totalAnnotations = rawDocs.reduce((s, d) => s + d.annotationCount, 0);
  const opCount = (tool: string) =>
    actionLog.filter((la) => la.action.type === "tool_op" && la.action.tool_id === tool).length;

  const counts = {
    notes: notes.length,
    annotations: totalAnnotations,
    tags: tags.length,
    collections: desks.length,
    decisions: decisions.length,
    comparateur: events.filter((e) => e.category === "comparaison").length,
    blocNotesOps: opCount("bloc-notes"),
    bibliothequeOps: opCount("bibliotheque"),
    decisionOps: opCount("decision-engine"),
  };

  const noteText = (blocks: { text: string }[]) => blocks.map((b) => b.text).filter(Boolean).join(" · ").slice(0, 500);
  const aiPayload = {
    sources: rawDocs.filter((d) => d.opened).map((d) => ({ title: d.title, readDepth: d.annotationCount > 0 ? "profond" : "parcouru" })),
    notes: notes.map((n) => ({ title: n.title, text: noteText(n.blocks) })),
    decisions: decisions.map((d) => ({ title: d.title, conclusion: d.final_decision ?? d.justification ?? d.context ?? "" })),
    toolUsage: counts as unknown as Record<string, number>,
  };

  return { input: { documents: rawDocs, events, counts }, aiPayload };
}

export function DocSynthesisDebriefSection({
  workspace,
  actionLog,
  documents,
}: {
  workspace: WorkspaceState;
  actionLog: LoggedAction[];
  documents: DocRef[];
}) {
  const { input, aiPayload } = useMemo(() => buildInput(workspace, actionLog, documents), [workspace, actionLog, documents]);
  const base = useMemo(() => analyzeDocSynthesis(input), [input]);

  const [enriched, setEnriched] = useState<DocSynthObservations | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "error">("idle");
  const observations = enriched ?? base;

  const runAi = async () => {
    setPhase("loading");
    try {
      const res = await fetch("/api/v2/debrief-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aiPayload),
      });
      if (!res.ok) throw new Error("ai");
      const data = await res.json();
      setEnriched(mergeDocSynthAi(base, data));
      setPhase("idle");
    } catch {
      setPhase("error");
    }
  };

  if (documents.length === 0) return null;

  return (
    <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-400">Débrief · Analyse documentaire</p>
          <h2 className="text-base font-semibold text-gray-900">Comment vous avez exploité les documents</h2>
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
          Indicateurs mesurés automatiquement. Lancez l&apos;analyse IA pour la carte des preuves, le raisonnement et la synthèse.
        </p>
      )}

      <DocSynthesisDebrief observations={observations} />
    </div>
  );
}
