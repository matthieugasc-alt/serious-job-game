/**
 * collect.ts — collecteur des PRÉ-ANALYSES d'une session (débrief final).
 *
 * Rassemble, depuis l'état du workspace et le journal d'actions, des
 * signaux MESURÉS sur tout ce que le joueur a produit (conversation,
 * documents, décisions, livrable, exposé, négociation, plan, idées).
 *
 * IMPORTANT — non-transparence moteur :
 *   - les clés internes (conversation, documents…) NE sont JAMAIS montrées
 *     au joueur : elles servent uniquement d'entrée à la passe IA finale
 *     qui rédige UN bilan unifié ;
 *   - un signal sans donnée est simplement ABSENT (pas de pénalité, pas de
 *     mention). Le joueur ne sait pas qu'un outil n'a pas été utilisé.
 *
 * PUR / node-safe : aucune dépendance React.
 */

import type { LoggedAction, ThreadMessage, WorkspaceState } from "@/app/lib/engine/workspace";
import type { Json } from "@/app/lib/engine/mechanics";
import { selectAll, selectAllTasks, selectNoteForDocument } from "@/app/workspace/tools/bloc-notes/api";
import { selectAllEntries } from "@/app/workspace/tools/bibliotheque/api";
import { labelOfNode, listBoards, listDecisions, listDependencies } from "@/app/workspace/tools/decision-engine/api";
import { selectNotes } from "@/app/workspace/tools/whiteboard/api";

export interface DebriefBundle {
  scenario: { title: string; objective: string; competencies: string[] };
  signals: Record<string, unknown>;
}

interface DocRef {
  id: string;
  title: string;
}

const trunc = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── Conversation (entretien OU réunion — sans distinction exposée) ─

function richestThread(ws: WorkspaceState): ThreadMessage[] {
  let best: ThreadMessage[] = [];
  for (const t of Object.values(ws.threads ?? {})) {
    const conv = (t.messages ?? []).filter((m) => m.from === "player" || m.from === "actor");
    if (conv.length > best.length) best = t.messages;
  }
  return best;
}

function conversationSignal(ws: WorkspaceState, nameOf: (id: string) => string): unknown | null {
  const msgs = richestThread(ws).filter((m) => m.from === "player" || m.from === "actor");
  if (msgs.length < 2) return null;

  const talk = new Map<string, { name: string; messages: number; words: number; isPlayer: boolean }>();
  let unanswered = 0;
  const questions: string[] = [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const key = m.from === "player" ? "__p" : m.actor_id ?? "a";
    const name = m.from === "player" ? "Vous" : nameOf(m.actor_id ?? "");
    const cur = talk.get(key) ?? { name, messages: 0, words: 0, isPlayer: m.from === "player" };
    cur.messages += 1;
    cur.words += words(m.content);
    talk.set(key, cur);
    if (m.from === "player" && m.content.includes("?")) {
      questions.push(trunc(m.content.trim(), 160));
      let answered = false;
      for (let j = i + 1; j < msgs.length; j++) {
        if (msgs[j].from === "player") break;
        if (msgs[j].from === "actor") { answered = true; break; }
      }
      if (!answered) unanswered += 1;
    }
  }
  const total = [...talk.values()].reduce((s, sp) => s + sp.words, 0) || 1;
  return {
    speakers: [...talk.values()].map((sp) => ({ name: sp.name, messages: sp.messages, share: round2(sp.words / total), isPlayer: sp.isPlayer })),
    questionsAsked: questions.length,
    unanswered,
    sampleQuestions: questions.slice(0, 6),
  };
}

// ─── Documents ────────────────────────────────────────────────────

function documentsSignal(ws: WorkspaceState, docs: DocRef[]): unknown | null {
  if (docs.length === 0) return null;
  const bloc = ws.toolStates?.["bloc-notes"] ?? null;
  const bib = ws.toolStates?.["bibliotheque"] ?? null;
  const entries = bib ? selectAllEntries(bib) : [];
  const opened = new Set<string>();
  for (const [id, d] of Object.entries(ws.documents ?? {})) if (d?.opened) opened.add(id);

  const annCount = (docId: string): number => {
    let c = 0;
    const e = entries.find((x) => x.source?.kind === "scenario_doc" && x.source.document_id === docId);
    if (e) c += e.annotations.length;
    const note = bloc ? selectNoteForDocument(bloc, docId) : null;
    if (note) c += note.blocks.filter((b) => b.kind === "quote").length;
    return c;
  };
  const sources = docs.map((d) => ({ title: d.title, opened: opened.has(d.id), annotations: annCount(d.id) }));
  const totalAnn = sources.reduce((s, x) => s + x.annotations, 0);
  if (opened.size === 0 && totalAnn === 0) return null;
  return {
    opened: opened.size,
    total: docs.length,
    annotations: totalAnn,
    notes: bloc ? selectAll(bloc).length : 0,
    sources: sources.map((s) => ({ title: s.title, depth: !s.opened ? "ignoré" : s.annotations > 0 ? "approfondi" : "parcouru" })),
  };
}

// ─── Décisions structurées ────────────────────────────────────────

function decisionsSignal(ws: WorkspaceState): unknown | null {
  const dec = ws.toolStates?.["decision-engine"] ?? null;
  if (!dec) return null;
  const decisions = listDecisions(dec);
  if (decisions.length === 0) return null;
  return decisions.slice(0, 6).map((d) => {
    const options = d.options.map((o) => {
      let score = 0;
      for (const c of d.criteria) score += (d.scores?.[o.id]?.[c.id]?.value ?? 0) * (c.weight ?? 0);
      return { label: o.label || "(option)", score };
    }).sort((a, b) => b.score - a.score);
    return {
      title: d.title || "(sans titre)",
      status: d.status,
      finalDecision: d.final_decision ?? "",
      justification: trunc(d.justification ?? "", 240),
      criteria: d.criteria.map((c) => `${c.label}×${c.weight}`),
      options: options.slice(0, 5),
      hypotheses: (d.hypotheses ?? []).map((h) => ({ text: trunc(h.text, 120), status: h.status })),
      risks: (d.risks ?? []).map((r) => ({ label: r.label, p: r.probability, i: r.impact, hasResidual: r.residual_probability !== undefined || r.residual_impact !== undefined })),
    };
  });
}

// ─── Livrable ─────────────────────────────────────────────────────

const SECTIONS_DOC = [
  ["Introduction", /introduction|en pr[ée]ambule|objet\b/i],
  ["Contexte", /contexte|situation/i],
  ["Analyse", /analyse|constat|diagnostic/i],
  ["Recommandations", /recommand|pr[ée]conis|proposition/i],
  ["Plan d'action", /plan d.?action|prochaines? [ée]tapes/i],
  ["Conclusion", /conclusion|en r[ée]sum[ée]|pour conclure/i],
] as const;

function deliverableSignal(ws: WorkspaceState): unknown | null {
  const ed = ws.toolStates?.["editeur"] as { title?: string; body?: string } | null | undefined;
  let type = "document", title = "", body = "";
  let hasArtifacts = false;
  if (ed && typeof ed.body === "string" && ed.body.trim()) { title = ed.title || "Document"; body = ed.body; }
  else {
    const sent = ws.mailbox?.sent ?? [];
    if (sent.length > 0) {
      const m = [...sent].sort((a, b) => b.at - a.at)[0];
      type = "mail";
      title = m.subject;
      body = m.body;
      // Vue exhaustive : le contenu intégral des artefacts joints (note,
      // décision, tableau…) fait partie du livrable analysé.
      const arts = m.attachment_artifacts ?? [];
      if (arts.length > 0) {
        hasArtifacts = true;
        body += `\n\n[Artefacts joints — contenu intégral]\n${arts
          .map((a) => `— ${a.title} —\n${a.snapshot}`)
          .join("\n\n")}`;
      }
    }
    else {
      const bloc = ws.toolStates?.["bloc-notes"] ?? null;
      const notes = bloc ? selectAll(bloc) : [];
      if (notes.length > 0) {
        const best = notes.map((n) => ({ n, t: n.blocks.map((b) => b.text).filter(Boolean).join("\n") })).sort((a, b) => b.t.length - a.t.length)[0];
        type = "note"; title = best.n.title || "Note"; body = best.t;
      }
    }
  }
  if (words(body) < 8) return null;
  return {
    type,
    title,
    wordCount: words(body),
    structure: SECTIONS_DOC.filter(([, re]) => re.test(body)).map(([label]) => label),
    sample: trunc(body, hasArtifacts ? 4000 : 1400),
  };
}

// ─── Exposé (réunion / présentation) ──────────────────────────────

function speechSignal(ws: WorkspaceState, actionLog: LoggedAction[]): unknown | null {
  const reunion = ws.toolStates?.["reunion"] as { speech?: string } | null | undefined;
  const speech = typeof reunion?.speech === "string" ? reunion.speech : "";
  if (words(speech) < 8) return null;
  let durationS = 0;
  for (const la of actionLog) {
    if (la.action.type === "deliverable_submitted") {
      const d = (la.action.payload as { duration_s?: unknown })?.duration_s;
      if (typeof d === "number" && d > 0) durationS = d;
    }
  }
  const wc = words(speech);
  return {
    durationS,
    wordsPerMinute: durationS > 0 ? Math.round(wc / (durationS / 60)) : 0,
    structure: SECTIONS_DOC.filter(([, re]) => re.test(speech)).map(([label]) => label),
    sample: trunc(speech, 1200),
  };
}

// ─── Négociation ──────────────────────────────────────────────────

interface TermDef { id: string; label: string; opening?: Json; suffix?: string }

function negotiationSignal(ws: WorkspaceState, terms: TermDef[]): unknown | null {
  const raw = (ws.toolStates?.["contrat"] ?? null) as { values?: Record<string, Json>; proposals?: { at: number; values: Record<string, Json> }[]; status?: string } | null;
  if (!raw) return null;
  const values = raw.values ?? {};
  const proposals = Array.isArray(raw.proposals) ? raw.proposals : [];
  if (terms.length === 0 && proposals.length === 0) return null;
  const scalar = (v: Json | undefined) => (typeof v === "number" || typeof v === "string" ? v : null);
  return {
    status: raw.status === "signed" || raw.status === "rejected" ? raw.status : "open",
    proposalsCount: proposals.length,
    terms: terms.slice(0, 10).map((t) => ({ label: t.label, opening: scalar(t.opening), final: scalar(values[t.id]), suffix: t.suffix })),
  };
}

// ─── Plan / organisation ──────────────────────────────────────────

function planSignal(ws: WorkspaceState): unknown | null {
  const dec = ws.toolStates?.["decision-engine"] ?? null;
  const bloc = ws.toolStates?.["bloc-notes"] ?? null;
  const boards = dec ? listBoards(dec) : [];
  const tasks = bloc ? selectAllTasks(bloc) : [];
  const deps = dec ? listDependencies(dec) : [];
  const planningTools = boards.some((b) => b.engine === "timeline" || b.engine === "kanban" || b.engine === "graph");
  if (!planningTools && tasks.length === 0 && deps.length === 0) return null;
  const items = (data: Json) => (Array.isArray((data as { items?: unknown }).items) ? ((data as { items: unknown[] }).items).length : 0);
  return {
    steps: boards.reduce((s, b) => s + items(b.data), 0) + tasks.length,
    milestones: boards.filter((b) => b.engine === "timeline").reduce((s, b) => s + items(b.data), 0),
    tasks: { todo: tasks.filter((t) => t.status === "todo").length, doing: tasks.filter((t) => t.status === "doing").length, done: tasks.filter((t) => t.status === "done").length },
    dependencies: deps.slice(0, 10).map((d) => `${labelOfNode(dec, d.from)} → ${labelOfNode(dec, d.to)}`),
    tools: [...new Set(boards.map((b) => b.engine))],
  };
}

// ─── Idées / créativité ───────────────────────────────────────────

function ideasSignal(ws: WorkspaceState): unknown | null {
  const wb = ws.toolStates?.["whiteboard"] ?? null;
  const stickies = wb ? selectNotes(wb) : [];
  if (stickies.length === 0) return null;
  const byColor = new Map<string, number>();
  for (const s of stickies) byColor.set(s.color, (byColor.get(s.color) ?? 0) + 1);
  const dec = ws.toolStates?.["decision-engine"] ?? null;
  const bloc = ws.toolStates?.["bloc-notes"] ?? null;
  const decisions = dec ? listDecisions(dec) : [];
  return {
    total: stickies.length,
    byPlayer: stickies.filter((s) => (s.author ?? "player") === "player").length,
    families: [...byColor.entries()].map(([color, count]) => ({ color, count })),
    sample: stickies.slice(0, 12).map((s) => trunc(s.text, 80)),
    convergence: { tasks: bloc ? selectAllTasks(bloc).length : 0, decisions: decisions.length, options: decisions.reduce((s, d) => s + (d.options?.length ?? 0), 0) },
  };
}

// ─── Collecteur principal ─────────────────────────────────────────

export function collectDebrief(
  scenario: { meta?: { title?: string; description?: string }; competencies?: string[]; actors?: { actor_id: string; name: string }[]; documents?: DocRef[]; sequence?: { params?: Json; tools?: { tool: string; config?: Json }[] }[] },
  workspace: WorkspaceState,
  actionLog: LoggedAction[],
): DebriefBundle {
  const nameOf = (id: string) => scenario.actors?.find((a) => a.actor_id === id)?.name ?? id;
  const docs: DocRef[] = (scenario.documents ?? []).map((d) => ({ id: d.id, title: d.title }));

  const negoStep = scenario.sequence?.find((s) => s.tools?.some((t) => t.tool === "contrat"));
  const contratCfg = negoStep?.tools?.find((t) => t.tool === "contrat")?.config as { terms?: TermDef[] } | undefined;
  const terms = contratCfg?.terms ?? [];
  const objective = scenario.sequence?.map((s) => (s.params as { instructions?: string })?.instructions).filter(Boolean).join(" · ") ?? "";

  const signals: Record<string, unknown> = {};
  const add = (key: string, v: unknown | null) => { if (v !== null && v !== undefined) signals[key] = v; };

  add("conversation", conversationSignal(workspace, nameOf));
  add("documents", documentsSignal(workspace, docs));
  add("decisions", decisionsSignal(workspace));
  add("deliverable", deliverableSignal(workspace));
  add("speech", speechSignal(workspace, actionLog));
  add("negotiation", negotiationSignal(workspace, terms));
  add("plan", planSignal(workspace));
  add("ideas", ideasSignal(workspace));

  return {
    scenario: {
      title: scenario.meta?.title ?? "",
      objective: trunc(objective || scenario.meta?.description || "", 600),
      competencies: scenario.competencies ?? [],
    },
    signals,
  };
}
