/**
 * model.ts — le reducer PUR du Decision Engine Universel.
 * Réf : docs/TOOL_DECISION_ENGINE.md §3/§6/§9 ; pattern TOOL_BLOC_NOTES.md §2.
 *
 * `applyDecisionOp(state, op, payload) → state` :
 *   - PUR, node-safe : aucun React, aucun import moteur hors types Json,
 *     aucune horloge (l'horodatage `at` voyage dans le payload) ;
 *   - IMMUTABLE : nouvel objet, ou l'état d'origine si l'op est inconnue /
 *     invalide (no-op défensif journalisé) ;
 *   - DÉFENSIF : payload invalide / entité introuvable → no-op.
 *   - Le score pondéré n'est JAMAIS stocké : il se dérive (spec.weightedScoreOf).
 */

import type { Json, JsonObject } from "@/app/lib/engine/mechanics";
import type {
  Board,
  DecisionCriterion,
  DecisionEngineState,
  DecisionObject,
  DecisionOption,
  DecisionStatus,
  EngineKind,
  Hypothesis,
  HypothesisStatus,
  RiskEntry,
  RiskStatus,
  ScoreCell,
  SourceLink,
} from "./spec";

export const DECISION_OPS = [
  "decision_created",
  "decision_updated",
  "decision_deleted",
  "decision_finalized",
  "decision_source_linked",
  "option_added",
  "option_updated",
  "option_removed",
  "criterion_added",
  "criterion_updated",
  "criterion_weight_updated",
  "criterion_removed",
  "option_scored",
  "risk_created",
  "risk_updated",
  "hypothesis_created",
  "hypothesis_updated",
  "board_created",
  "board_updated",
  "board_deleted",
  "item_added",
  "item_updated",
  "item_moved",
  "item_removed",
  "cell_set",
] as const;
export type DecisionOpName = (typeof DECISION_OPS)[number];

export function emptyDecisionEngineState(): DecisionEngineState {
  return { decisions: {}, boards: {}, ui: {} };
}

// ─── Helpers de parsing défensif ───────────────────────────────────
const ENGINE_KIND_SET = new Set<string>(["table", "matrix", "registry", "graph", "timeline", "kanban"]);
const DECISION_STATUS_SET = new Set<string>(["draft", "in_progress", "finalized", "archived"]);
const RISK_STATUS_SET = new Set<string>(["open", "mitigating", "closed"]);
const HYP_STATUS_SET = new Set<string>(["open", "confirmed", "refuted"]);
const SOURCE_KIND_SET = new Set<string>([
  "document",
  "note",
  "task",
  "mail",
  "message",
  "library",
  "board",
  "decision",
]);

function isObject(v: Json | undefined): v is JsonObject {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}
function asString(v: Json | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function asNumber(v: Json | undefined): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function asStringArray(v: Json | undefined): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x): x is string => typeof x === "string" && x.trim().length > 0))];
}

export function parseSourceLink(v: Json | undefined): SourceLink | undefined {
  if (!isObject(v)) return undefined;
  const kind = asString(v.kind);
  if (kind === undefined || !SOURCE_KIND_SET.has(kind)) return undefined;
  const label = asString(v.label);
  const withLabel = label !== undefined ? { label } : {};
  switch (kind) {
    case "document":
      return v.document_id ? { kind, document_id: String(v.document_id), ...withLabel } : undefined;
    case "note":
      return v.note_id ? { kind, note_id: String(v.note_id), ...withLabel } : undefined;
    case "task":
      return v.task_id ? { kind, task_id: String(v.task_id), ...withLabel } : undefined;
    case "mail": {
      if (!v.mail_id) return undefined;
      const subject = asString(v.subject);
      return { kind, mail_id: String(v.mail_id), ...(subject ? { subject } : {}), ...withLabel };
    }
    case "message":
      return v.thread_id ? { kind, thread_id: String(v.thread_id), ...withLabel } : undefined;
    case "library":
      return v.entry_id ? { kind, entry_id: String(v.entry_id), ...withLabel } : undefined;
    case "board":
      return v.board_id ? { kind, board_id: String(v.board_id), ...withLabel } : undefined;
    case "decision":
      return v.decision_id ? { kind, decision_id: String(v.decision_id), ...withLabel } : undefined;
    default:
      return undefined;
  }
}

function parseLinks(v: Json | undefined): SourceLink[] {
  if (!Array.isArray(v)) return [];
  return v.map(parseSourceLink).filter((l): l is SourceLink => Boolean(l));
}

function parseOption(v: Json | undefined): DecisionOption | null {
  if (!isObject(v)) return null;
  const id = asString(v.id);
  if (id === undefined) return null;
  const note = asString(v.note);
  return { id, label: asString(v.label) ?? "", ...(note !== undefined ? { note } : {}), links: parseLinks(v.links) };
}

function parseCriterion(v: Json | undefined): DecisionCriterion | null {
  if (!isObject(v)) return null;
  const id = asString(v.id);
  if (id === undefined) return null;
  const note = asString(v.note);
  return { id, label: asString(v.label) ?? "", weight: asNumber(v.weight) ?? 1, ...(note !== undefined ? { note } : {}) };
}

function parseScores(v: Json | undefined): Record<string, Record<string, ScoreCell>> {
  const out: Record<string, Record<string, ScoreCell>> = {};
  if (!isObject(v)) return out;
  for (const [optId, row] of Object.entries(v)) {
    if (!isObject(row)) continue;
    const cells: Record<string, ScoreCell> = {};
    for (const [critId, cell] of Object.entries(row)) {
      if (!isObject(cell)) continue;
      const value = asNumber(cell.value);
      if (value === undefined) continue;
      const justification = asString(cell.justification);
      cells[critId] = { value, ...(justification !== undefined ? { justification } : {}) };
    }
    if (Object.keys(cells).length > 0) out[optId] = cells;
  }
  return out;
}

function parseRisk(v: Json | undefined): RiskEntry | null {
  if (!isObject(v)) return null;
  const id = asString(v.id);
  if (id === undefined) return null;
  const status = asString(v.status);
  const mitigation = asString(v.mitigation);
  const owner = asString(v.owner);
  return {
    id,
    label: asString(v.label) ?? "",
    probability: asNumber(v.probability) ?? 1,
    impact: asNumber(v.impact) ?? 1,
    ...(mitigation !== undefined ? { mitigation } : {}),
    ...(owner !== undefined ? { owner } : {}),
    status: status !== undefined && RISK_STATUS_SET.has(status) ? (status as RiskStatus) : "open",
    links: parseLinks(v.links),
  };
}

function parseHypothesis(v: Json | undefined): Hypothesis | null {
  if (!isObject(v)) return null;
  const id = asString(v.id);
  const text = asString(v.text);
  if (id === undefined || text === undefined) return null;
  const status = asString(v.status);
  const confidence = asNumber(v.confidence);
  return {
    id,
    text,
    ...(confidence !== undefined ? { confidence } : {}),
    status: status !== undefined && HYP_STATUS_SET.has(status) ? (status as HypothesisStatus) : "open",
  };
}

function parseDecision(v: Json | undefined): DecisionObject | null {
  if (!isObject(v)) return null;
  const id = asString(v.id);
  if (id === undefined) return null;
  const status = asString(v.status);
  const final_decision = asString(v.final_decision);
  const method = asString(v.method);
  const justification = asString(v.justification);
  const author = asString(v.author);
  const expected = asString(v.expected_impacts);
  const decidedAt = asNumber(v.decided_at);
  const supersedes = asString(v.supersedes);
  return {
    id,
    title: asString(v.title) ?? "",
    context: asString(v.context) ?? "",
    ...(final_decision !== undefined ? { final_decision } : {}),
    options: Array.isArray(v.options) ? v.options.map(parseOption).filter((o): o is DecisionOption => Boolean(o)) : [],
    criteria: Array.isArray(v.criteria)
      ? v.criteria.map(parseCriterion).filter((c): c is DecisionCriterion => Boolean(c))
      : [],
    scores: parseScores(v.scores),
    ...(method !== undefined ? { method } : {}),
    ...(justification !== undefined ? { justification } : {}),
    hypotheses: Array.isArray(v.hypotheses)
      ? v.hypotheses.map(parseHypothesis).filter((h): h is Hypothesis => Boolean(h))
      : [],
    risks: Array.isArray(v.risks) ? v.risks.map(parseRisk).filter((r): r is RiskEntry => Boolean(r)) : [],
    sources: parseLinks(v.sources),
    ...(author !== undefined ? { author } : {}),
    created_at: asNumber(v.created_at) ?? 0,
    updated_at: asNumber(v.updated_at) ?? 0,
    ...(decidedAt !== undefined ? { decided_at: decidedAt } : {}),
    ...(expected !== undefined ? { expected_impacts: expected } : {}),
    status: status !== undefined && DECISION_STATUS_SET.has(status) ? (status as DecisionStatus) : "draft",
    board_ids: asStringArray(v.board_ids),
    ...(supersedes !== undefined ? { supersedes } : {}),
  };
}

function parseBoard(v: Json | undefined): Board | null {
  if (!isObject(v)) return null;
  const id = asString(v.id);
  const engine = asString(v.engine);
  if (id === undefined || engine === undefined || !ENGINE_KIND_SET.has(engine)) return null;
  const presetId = asString(v.preset_id);
  const decisionId = asString(v.decision_id);
  return {
    id,
    title: asString(v.title) ?? "",
    engine: engine as EngineKind,
    ...(presetId !== undefined ? { preset_id: presetId } : {}),
    ...(decisionId !== undefined ? { decision_id: decisionId } : {}),
    config: isObject(v.config) ? v.config : {},
    data: isObject(v.data) ? v.data : {},
    created_at: asNumber(v.created_at) ?? 0,
    updated_at: asNumber(v.updated_at) ?? 0,
  };
}

export function normalizeDecisionEngineState(state: Json): DecisionEngineState {
  if (!isObject(state)) return emptyDecisionEngineState();
  const decisions: Record<string, DecisionObject> = {};
  if (isObject(state.decisions)) {
    for (const [id, raw] of Object.entries(state.decisions)) {
      const d = parseDecision(raw);
      if (d && d.id === id) decisions[id] = d;
    }
  }
  const boards: Record<string, Board> = {};
  if (isObject(state.boards)) {
    for (const [id, raw] of Object.entries(state.boards)) {
      const b = parseBoard(raw);
      if (b && b.id === id) boards[id] = b;
    }
  }
  const ui: DecisionEngineState["ui"] = {};
  if (isObject(state.ui)) {
    const ob = asString(state.ui.open_board_id);
    const od = asString(state.ui.open_decision_id);
    if (ob !== undefined && ob in boards) ui.open_board_id = ob;
    if (od !== undefined && od in decisions) ui.open_decision_id = od;
  }
  return { decisions, boards, ui };
}

// ─── Reducer ───────────────────────────────────────────────────────
export function applyDecisionOp(state: Json, op: string, payload: JsonObject): Json {
  const s = normalizeDecisionEngineState(state);
  const p = isObject(payload) ? payload : {};
  const at = asNumber(p.at) ?? 0;

  let next: DecisionEngineState | null;
  switch (op as DecisionOpName) {
    case "decision_created": next = decisionCreated(s, p, at); break;
    case "decision_updated": next = decisionUpdated(s, p, at); break;
    case "decision_deleted": next = decisionDeleted(s, p); break;
    case "decision_finalized": next = decisionFinalized(s, p, at); break;
    case "decision_source_linked": next = decisionSourceLinked(s, p, at); break;
    case "option_added": next = optionAdded(s, p, at); break;
    case "option_updated": next = optionUpdated(s, p, at); break;
    case "option_removed": next = optionRemoved(s, p, at); break;
    case "criterion_added": next = criterionAdded(s, p, at); break;
    case "criterion_updated": next = criterionUpdated(s, p, at); break;
    case "criterion_weight_updated": next = criterionUpdated(s, p, at); break;
    case "criterion_removed": next = criterionRemoved(s, p, at); break;
    case "option_scored": next = optionScored(s, p, at); break;
    case "risk_created": next = riskCreated(s, p, at); break;
    case "risk_updated": next = riskUpdated(s, p, at); break;
    case "hypothesis_created": next = hypothesisCreated(s, p, at); break;
    case "hypothesis_updated": next = hypothesisUpdated(s, p, at); break;
    case "board_created": next = boardCreated(s, p, at); break;
    case "board_updated": next = boardUpdated(s, p, at); break;
    case "board_deleted": next = boardDeleted(s, p); break;
    case "item_added": next = itemAdded(s, p, at); break;
    case "item_updated": next = itemUpdated(s, p, at); break;
    case "item_moved": next = itemUpdated(s, p, at); break;
    case "item_removed": next = itemRemoved(s, p, at); break;
    case "cell_set": next = cellSet(s, p, at); break;
    default: next = null;
  }
  return (next ?? state) as Json;
}

// ─── Helpers d'immutabilité ────────────────────────────────────────
function withDecision(s: DecisionEngineState, d: DecisionObject): DecisionEngineState {
  return { ...s, decisions: { ...s.decisions, [d.id]: d } };
}
function withBoard(s: DecisionEngineState, b: Board): DecisionEngineState {
  return { ...s, boards: { ...s.boards, [b.id]: b } };
}
function getDecision(s: DecisionEngineState, p: JsonObject): DecisionObject | undefined {
  const id = asString(p.decision_id);
  return id !== undefined ? s.decisions[id] : undefined;
}
function getBoard(s: DecisionEngineState, p: JsonObject): Board | undefined {
  const id = asString(p.board_id);
  return id !== undefined ? s.boards[id] : undefined;
}

// ─── Handlers : Decision ───────────────────────────────────────────
function decisionCreated(s: DecisionEngineState, p: JsonObject, at: number): DecisionEngineState | null {
  const id = asString(p.decision_id);
  if (id === undefined || id.length === 0 || id in s.decisions) return null;
  const author = asString(p.author);
  const supersedes = asString(p.supersedes);
  return withDecision(s, {
    id,
    title: (asString(p.title) ?? "").trim(),
    context: asString(p.context) ?? "",
    options: [],
    criteria: [],
    scores: {},
    hypotheses: [],
    risks: [],
    sources: [],
    ...(author !== undefined ? { author } : {}),
    created_at: at,
    updated_at: at,
    status: "draft",
    board_ids: [],
    ...(supersedes !== undefined && supersedes in s.decisions ? { supersedes } : {}),
  });
}

function decisionUpdated(s: DecisionEngineState, p: JsonObject, at: number): DecisionEngineState | null {
  const d = getDecision(s, p);
  if (!d || !isObject(p.patch)) return null;
  const patch = p.patch;
  const next: DecisionObject = { ...d };
  let changed = false;
  for (const key of ["title", "context", "final_decision", "method", "justification", "author", "expected_impacts"] as const) {
    if (key in patch) {
      const v = asString(patch[key]);
      if (v !== undefined) (next[key] as string) = key === "title" ? v.trim() : v;
      else delete next[key];
      changed = true;
    }
  }
  const status = asString(patch.status);
  if (status !== undefined && DECISION_STATUS_SET.has(status)) {
    next.status = status as DecisionStatus;
    changed = true;
  }
  if (!changed) return null;
  next.updated_at = at;
  return withDecision(s, next);
}

function decisionDeleted(s: DecisionEngineState, p: JsonObject): DecisionEngineState | null {
  const id = asString(p.decision_id);
  if (id === undefined || !(id in s.decisions)) return null;
  const decisions = { ...s.decisions };
  delete decisions[id];
  // Les boards rattachés survivent mais perdent le rattachement.
  let boards = s.boards;
  for (const [bid, b] of Object.entries(s.boards)) {
    if (b.decision_id === id) {
      if (boards === s.boards) boards = { ...s.boards };
      const { decision_id: _drop, ...rest } = b;
      boards[bid] = rest;
    }
  }
  return { ...s, decisions, boards };
}

function decisionFinalized(s: DecisionEngineState, p: JsonObject, at: number): DecisionEngineState | null {
  const d = getDecision(s, p);
  if (!d) return null;
  const final = asString(p.final_decision);
  const justification = asString(p.justification);
  return withDecision(s, {
    ...d,
    ...(final !== undefined ? { final_decision: final } : {}),
    ...(justification !== undefined ? { justification } : {}),
    status: "finalized",
    decided_at: at,
    updated_at: at,
  });
}

function decisionSourceLinked(s: DecisionEngineState, p: JsonObject, at: number): DecisionEngineState | null {
  const d = getDecision(s, p);
  const link = parseSourceLink(p.link);
  if (!d || !link) return null;
  return withDecision(s, { ...d, sources: [...d.sources, link], updated_at: at });
}

function optionAdded(s: DecisionEngineState, p: JsonObject, at: number): DecisionEngineState | null {
  const d = getDecision(s, p);
  const id = asString(p.option_id);
  if (!d || id === undefined || id.length === 0 || d.options.some((o) => o.id === id)) return null;
  const note = asString(p.note);
  const option: DecisionOption = { id, label: (asString(p.label) ?? "").trim(), ...(note !== undefined ? { note } : {}), links: parseLinks(p.links) };
  return withDecision(s, { ...d, options: [...d.options, option], updated_at: at });
}

function optionUpdated(s: DecisionEngineState, p: JsonObject, at: number): DecisionEngineState | null {
  const d = getDecision(s, p);
  const id = asString(p.option_id);
  if (!d || id === undefined) return null;
  const idx = d.options.findIndex((o) => o.id === id);
  if (idx < 0) return null;
  const patch = isObject(p.patch) ? p.patch : {};
  const cur = d.options[idx];
  const label = asString(patch.label);
  const note = asString(patch.note);
  const updated: DecisionOption = {
    ...cur,
    ...(label !== undefined ? { label: label.trim() } : {}),
    ...("note" in patch ? (note !== undefined ? { note } : {}) : {}),
    ...(Array.isArray(patch.links) ? { links: parseLinks(patch.links) } : {}),
  };
  if ("note" in patch && note === undefined) delete updated.note;
  const options = [...d.options];
  options[idx] = updated;
  return withDecision(s, { ...d, options, updated_at: at });
}

function optionRemoved(s: DecisionEngineState, p: JsonObject, at: number): DecisionEngineState | null {
  const d = getDecision(s, p);
  const id = asString(p.option_id);
  if (!d || id === undefined || !d.options.some((o) => o.id === id)) return null;
  const scores = { ...d.scores };
  delete scores[id];
  return withDecision(s, { ...d, options: d.options.filter((o) => o.id !== id), scores, updated_at: at });
}

function criterionAdded(s: DecisionEngineState, p: JsonObject, at: number): DecisionEngineState | null {
  const d = getDecision(s, p);
  const id = asString(p.criterion_id);
  if (!d || id === undefined || id.length === 0 || d.criteria.some((c) => c.id === id)) return null;
  const note = asString(p.note);
  const crit: DecisionCriterion = { id, label: (asString(p.label) ?? "").trim(), weight: asNumber(p.weight) ?? 1, ...(note !== undefined ? { note } : {}) };
  return withDecision(s, { ...d, criteria: [...d.criteria, crit], updated_at: at });
}

function criterionUpdated(s: DecisionEngineState, p: JsonObject, at: number): DecisionEngineState | null {
  const d = getDecision(s, p);
  const id = asString(p.criterion_id);
  if (!d || id === undefined) return null;
  const idx = d.criteria.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  const cur = d.criteria[idx];
  const patch = isObject(p.patch) ? p.patch : p; // criterion_weight_updated passe weight direct
  const label = asString(patch.label);
  const weight = asNumber(patch.weight);
  const note = asString(patch.note);
  if (label === undefined && weight === undefined && note === undefined && !("note" in patch)) return null;
  const updated: DecisionCriterion = {
    ...cur,
    ...(label !== undefined ? { label: label.trim() } : {}),
    ...(weight !== undefined ? { weight } : {}),
    ...(note !== undefined ? { note } : {}),
  };
  if ("note" in patch && note === undefined) delete updated.note;
  const criteria = [...d.criteria];
  criteria[idx] = updated;
  return withDecision(s, { ...d, criteria, updated_at: at });
}

function criterionRemoved(s: DecisionEngineState, p: JsonObject, at: number): DecisionEngineState | null {
  const d = getDecision(s, p);
  const id = asString(p.criterion_id);
  if (!d || id === undefined || !d.criteria.some((c) => c.id === id)) return null;
  const scores: Record<string, Record<string, ScoreCell>> = {};
  for (const [optId, row] of Object.entries(d.scores)) {
    const { [id]: _drop, ...rest } = row;
    if (Object.keys(rest).length > 0) scores[optId] = rest;
  }
  return withDecision(s, { ...d, criteria: d.criteria.filter((c) => c.id !== id), scores, updated_at: at });
}

function optionScored(s: DecisionEngineState, p: JsonObject, at: number): DecisionEngineState | null {
  const d = getDecision(s, p);
  const optId = asString(p.option_id);
  const critId = asString(p.criterion_id);
  const value = asNumber(p.value);
  if (!d || optId === undefined || critId === undefined || value === undefined) return null;
  if (!d.options.some((o) => o.id === optId) || !d.criteria.some((c) => c.id === critId)) return null;
  const justification = asString(p.justification);
  const row = { ...(d.scores[optId] ?? {}), [critId]: { value, ...(justification !== undefined ? { justification } : {}) } };
  return withDecision(s, { ...d, scores: { ...d.scores, [optId]: row }, updated_at: at });
}

function riskCreated(s: DecisionEngineState, p: JsonObject, at: number): DecisionEngineState | null {
  const d = getDecision(s, p);
  const id = asString(p.risk_id);
  if (!d || id === undefined || id.length === 0 || d.risks.some((r) => r.id === id)) return null;
  const mitigation = asString(p.mitigation);
  const owner = asString(p.owner);
  const risk: RiskEntry = {
    id,
    label: (asString(p.label) ?? "").trim(),
    probability: asNumber(p.probability) ?? 1,
    impact: asNumber(p.impact) ?? 1,
    ...(mitigation !== undefined ? { mitigation } : {}),
    ...(owner !== undefined ? { owner } : {}),
    status: "open",
    links: parseLinks(p.links),
  };
  return withDecision(s, { ...d, risks: [...d.risks, risk], updated_at: at });
}

function riskUpdated(s: DecisionEngineState, p: JsonObject, at: number): DecisionEngineState | null {
  const d = getDecision(s, p);
  const id = asString(p.risk_id);
  if (!d || id === undefined) return null;
  const idx = d.risks.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const patch = isObject(p.patch) ? p.patch : {};
  const cur = d.risks[idx];
  const label = asString(patch.label);
  const probability = asNumber(patch.probability);
  const impact = asNumber(patch.impact);
  const mitigation = asString(patch.mitigation);
  const owner = asString(patch.owner);
  const status = asString(patch.status);
  const updated: RiskEntry = {
    ...cur,
    ...(label !== undefined ? { label: label.trim() } : {}),
    ...(probability !== undefined ? { probability } : {}),
    ...(impact !== undefined ? { impact } : {}),
    ...(mitigation !== undefined ? { mitigation } : {}),
    ...(owner !== undefined ? { owner } : {}),
    ...(status !== undefined && RISK_STATUS_SET.has(status) ? { status: status as RiskStatus } : {}),
    ...(Array.isArray(patch.links) ? { links: parseLinks(patch.links) } : {}),
  };
  const risks = [...d.risks];
  risks[idx] = updated;
  return withDecision(s, { ...d, risks, updated_at: at });
}

function hypothesisCreated(s: DecisionEngineState, p: JsonObject, at: number): DecisionEngineState | null {
  const d = getDecision(s, p);
  const id = asString(p.hypothesis_id);
  const text = (asString(p.text) ?? "").trim();
  if (!d || id === undefined || id.length === 0 || text.length === 0 || d.hypotheses.some((h) => h.id === id)) return null;
  const confidence = asNumber(p.confidence);
  const hyp: Hypothesis = { id, text, ...(confidence !== undefined ? { confidence } : {}), status: "open" };
  return withDecision(s, { ...d, hypotheses: [...d.hypotheses, hyp], updated_at: at });
}

function hypothesisUpdated(s: DecisionEngineState, p: JsonObject, at: number): DecisionEngineState | null {
  const d = getDecision(s, p);
  const id = asString(p.hypothesis_id);
  if (!d || id === undefined) return null;
  const idx = d.hypotheses.findIndex((h) => h.id === id);
  if (idx < 0) return null;
  const patch = isObject(p.patch) ? p.patch : {};
  const cur = d.hypotheses[idx];
  const text = asString(patch.text);
  const confidence = asNumber(patch.confidence);
  const status = asString(patch.status);
  const updated: Hypothesis = {
    ...cur,
    ...(text !== undefined && text.trim().length > 0 ? { text: text.trim() } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
    ...(status !== undefined && HYP_STATUS_SET.has(status) ? { status: status as HypothesisStatus } : {}),
  };
  const hypotheses = [...d.hypotheses];
  hypotheses[idx] = updated;
  return withDecision(s, { ...d, hypotheses, updated_at: at });
}

// ─── Handlers : Board & items ──────────────────────────────────────
function boardCreated(s: DecisionEngineState, p: JsonObject, at: number): DecisionEngineState | null {
  const id = asString(p.board_id);
  const engine = asString(p.engine);
  if (id === undefined || id.length === 0 || id in s.boards || engine === undefined || !ENGINE_KIND_SET.has(engine)) return null;
  const presetId = asString(p.preset_id);
  const decisionId = asString(p.decision_id);
  const board: Board = {
    id,
    title: (asString(p.title) ?? "").trim(),
    engine: engine as EngineKind,
    ...(presetId !== undefined ? { preset_id: presetId } : {}),
    ...(decisionId !== undefined && decisionId in s.decisions ? { decision_id: decisionId } : {}),
    config: isObject(p.config) ? p.config : {},
    data: isObject(p.data) ? p.data : { items: [] },
    created_at: at,
    updated_at: at,
  };
  let next = withBoard(s, board);
  // Rattachement : la décision référence le board.
  if (board.decision_id && board.decision_id in next.decisions) {
    const d = next.decisions[board.decision_id];
    if (!d.board_ids.includes(id)) {
      next = withDecision(next, { ...d, board_ids: [...d.board_ids, id], updated_at: at });
    }
  }
  return next;
}

function boardUpdated(s: DecisionEngineState, p: JsonObject, at: number): DecisionEngineState | null {
  const b = getBoard(s, p);
  if (!b) return null;
  const patch = isObject(p.patch) ? p.patch : {};
  const title = asString(patch.title);
  const config = isObject(patch.config) ? patch.config : undefined;
  if (title === undefined && config === undefined) return null;
  return withBoard(s, {
    ...b,
    ...(title !== undefined ? { title: title.trim() } : {}),
    ...(config !== undefined ? { config } : {}),
    updated_at: at,
  });
}

function boardDeleted(s: DecisionEngineState, p: JsonObject): DecisionEngineState | null {
  const id = asString(p.board_id);
  if (id === undefined || !(id in s.boards)) return null;
  const boards = { ...s.boards };
  const board = boards[id];
  delete boards[id];
  let decisions = s.decisions;
  if (board.decision_id && board.decision_id in s.decisions) {
    const d = s.decisions[board.decision_id];
    decisions = { ...s.decisions, [d.id]: { ...d, board_ids: d.board_ids.filter((b) => b !== id) } };
  }
  return { ...s, boards, decisions };
}

/** Items d'un board (data.items), lus défensivement. */
function boardItems(b: Board): JsonObject[] {
  const items = (b.data as JsonObject).items;
  return Array.isArray(items) ? items.filter((i): i is JsonObject => isObject(i)) : [];
}
function setBoardItems(b: Board, items: JsonObject[], at: number): Board {
  return { ...b, data: { ...(b.data as JsonObject), items: items as unknown as Json }, updated_at: at };
}

function itemAdded(s: DecisionEngineState, p: JsonObject, at: number): DecisionEngineState | null {
  const b = getBoard(s, p);
  const item = isObject(p.item) ? p.item : undefined;
  if (!b || !item) return null;
  const id = asString(item.id);
  if (id === undefined || id.length === 0) return null;
  const items = boardItems(b);
  if (items.some((i) => asString(i.id) === id)) return null;
  return withBoard(s, setBoardItems(b, [...items, item], at));
}

function itemUpdated(s: DecisionEngineState, p: JsonObject, at: number): DecisionEngineState | null {
  const b = getBoard(s, p);
  const id = asString(p.item_id);
  const patch = isObject(p.patch) ? p.patch : {};
  if (!b || id === undefined) return null;
  const items = boardItems(b);
  const idx = items.findIndex((i) => asString(i.id) === id);
  if (idx < 0) return null;
  const merged: JsonObject = { ...items[idx], ...patch, id };
  const nextItems = [...items];
  nextItems[idx] = merged;
  return withBoard(s, setBoardItems(b, nextItems, at));
}

function itemRemoved(s: DecisionEngineState, p: JsonObject, at: number): DecisionEngineState | null {
  const b = getBoard(s, p);
  const id = asString(p.item_id);
  if (!b || id === undefined) return null;
  const items = boardItems(b);
  if (!items.some((i) => asString(i.id) === id)) return null;
  return withBoard(s, setBoardItems(b, items.filter((i) => asString(i.id) !== id), at));
}

function cellSet(s: DecisionEngineState, p: JsonObject, at: number): DecisionEngineState | null {
  const b = getBoard(s, p);
  const key = asString(p.key);
  if (!b || key === undefined) return null;
  const data = b.data as JsonObject;
  const cells = isObject(data.cells) ? data.cells : {};
  const value = asString(p.value);
  const nextCells: JsonObject = { ...cells };
  if (value === undefined || value.length === 0) delete nextCells[key];
  else nextCells[key] = value;
  return withBoard(s, { ...b, data: { ...data, cells: nextCells }, updated_at: at });
}
