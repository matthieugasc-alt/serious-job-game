/**
 * api.ts — l'API PUBLIQUE du Decision Engine (contrat §6), LA seule porte
 * d'entrée. Constructeurs d'ops `tool_op` typés (consommés par l'UI et,
 * plus tard, par les boutons hôtes) + sélecteurs purs de lecture.
 * PUR/node-safe : aucun React, aucun import moteur hors types Json.
 */

import type { Json, JsonObject } from "@/app/lib/engine/mechanics";
import type {
  Board,
  BoardId,
  CriterionId,
  DecisionEngineState,
  DecisionId,
  DecisionItem,
  DecisionObject,
  DecisionOption,
  Dependency,
  DependencyRelation,
  DepNodeRef,
  EngineKind,
  GraphEdge,
  OptionId,
  SourceLink,
} from "./spec";
import { DECISION_ENGINE_TOOL_ID, weightedScoreOf } from "./spec";
import type { DecisionOpName } from "./model";
import { normalizeDecisionEngineState } from "./model";
import { resolvePreset } from "./presets";

export { DECISION_OPS, normalizeDecisionEngineState, applyDecisionOp } from "./model";
export type { DecisionOpName } from "./model";
export { PRESETS, resolvePreset, listPresets } from "./presets";
export { weightedScoreOf } from "./spec";

export interface DecisionToolOp {
  type: "tool_op";
  tool_id: typeof DECISION_ENGINE_TOOL_ID;
  op: DecisionOpName;
  payload: JsonObject;
}
export interface OpOptions {
  id?: string;
  at?: number;
}

let uidCounter = 0;
function uid(prefix: string): string {
  uidCounter = (uidCounter + 1) % 1_679_616;
  return `${prefix}_${Date.now().toString(36)}_${uidCounter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}
function op(name: DecisionOpName, payload: JsonObject): DecisionToolOp {
  return { type: "tool_op", tool_id: DECISION_ENGINE_TOOL_ID, op: name, payload };
}
function now(o: OpOptions): number {
  return o.at ?? Date.now();
}

// ─── Decision ──────────────────────────────────────────────────────
export interface CreateDecisionInput {
  title: string;
  context?: string;
  author?: string;
  supersedes?: DecisionId;
}
export function createDecision(input: CreateDecisionInput, opts: OpOptions = {}): DecisionToolOp {
  const payload: JsonObject = { decision_id: opts.id ?? uid("dec"), title: input.title, at: now(opts) };
  if (input.context !== undefined) payload.context = input.context;
  if (input.author !== undefined) payload.author = input.author;
  if (input.supersedes !== undefined) payload.supersedes = input.supersedes;
  return op("decision_created", payload);
}

export type DecisionPatch = Partial<{
  title: string;
  context: string;
  final_decision: string | null;
  method: string | null;
  justification: string | null;
  author: string | null;
  expected_impacts: string | null;
  status: DecisionObject["status"];
}>;
export function updateDecision(decisionId: DecisionId, patch: DecisionPatch, opts: OpOptions = {}): DecisionToolOp {
  return op("decision_updated", { decision_id: decisionId, patch: patch as unknown as Json, at: now(opts) });
}
export function deleteDecision(decisionId: DecisionId): DecisionToolOp {
  return op("decision_deleted", { decision_id: decisionId });
}
export function finalizeDecision(
  decisionId: DecisionId,
  input: { final_decision?: string; justification?: string } = {},
  opts: OpOptions = {},
): DecisionToolOp {
  const payload: JsonObject = { decision_id: decisionId, at: now(opts) };
  if (input.final_decision !== undefined) payload.final_decision = input.final_decision;
  if (input.justification !== undefined) payload.justification = input.justification;
  return op("decision_finalized", payload);
}
export function linkSource(decisionId: DecisionId, link: SourceLink, opts: OpOptions = {}): DecisionToolOp {
  return op("decision_source_linked", { decision_id: decisionId, link: link as unknown as Json, at: now(opts) });
}

// ─── Options / critères / scoring ──────────────────────────────────
export function addOption(decisionId: DecisionId, label: string, opts: OpOptions = {}): DecisionToolOp {
  return op("option_added", { decision_id: decisionId, option_id: opts.id ?? uid("opt"), label, at: now(opts) });
}
export function updateOption(
  decisionId: DecisionId,
  optionId: OptionId,
  patch: Partial<{ label: string; note: string | null; links: SourceLink[] }>,
  opts: OpOptions = {},
): DecisionToolOp {
  return op("option_updated", { decision_id: decisionId, option_id: optionId, patch: patch as unknown as Json, at: now(opts) });
}
export function removeOption(decisionId: DecisionId, optionId: OptionId, opts: OpOptions = {}): DecisionToolOp {
  return op("option_removed", { decision_id: decisionId, option_id: optionId, at: now(opts) });
}
export function addCriterion(
  decisionId: DecisionId,
  input: { label: string; weight?: number },
  opts: OpOptions = {},
): DecisionToolOp {
  return op("criterion_added", {
    decision_id: decisionId,
    criterion_id: opts.id ?? uid("crit"),
    label: input.label,
    weight: input.weight ?? 1,
    at: now(opts),
  });
}
export function updateCriterion(
  decisionId: DecisionId,
  criterionId: CriterionId,
  patch: Partial<{ label: string; weight: number; note: string | null }>,
  opts: OpOptions = {},
): DecisionToolOp {
  return op("criterion_updated", { decision_id: decisionId, criterion_id: criterionId, patch: patch as unknown as Json, at: now(opts) });
}
export function updateCriterionWeight(
  decisionId: DecisionId,
  criterionId: CriterionId,
  weight: number,
  opts: OpOptions = {},
): DecisionToolOp {
  return op("criterion_weight_updated", { decision_id: decisionId, criterion_id: criterionId, weight, at: now(opts) });
}
export function removeCriterion(decisionId: DecisionId, criterionId: CriterionId, opts: OpOptions = {}): DecisionToolOp {
  return op("criterion_removed", { decision_id: decisionId, criterion_id: criterionId, at: now(opts) });
}
export function scoreOption(
  decisionId: DecisionId,
  optionId: OptionId,
  criterionId: CriterionId,
  value: number,
  justification?: string,
  opts: OpOptions = {},
): DecisionToolOp {
  const payload: JsonObject = { decision_id: decisionId, option_id: optionId, criterion_id: criterionId, value, at: now(opts) };
  if (justification !== undefined) payload.justification = justification;
  return op("option_scored", payload);
}

// ─── Risques / hypothèses ──────────────────────────────────────────
export interface CreateRiskInput {
  label: string;
  probability?: number;
  impact?: number;
  mitigation?: string;
  owner?: string;
}
export function createRisk(decisionId: DecisionId, input: CreateRiskInput, opts: OpOptions = {}): DecisionToolOp {
  const payload: JsonObject = {
    decision_id: decisionId,
    risk_id: opts.id ?? uid("risk"),
    label: input.label,
    probability: input.probability ?? 1,
    impact: input.impact ?? 1,
    at: now(opts),
  };
  if (input.mitigation !== undefined) payload.mitigation = input.mitigation;
  if (input.owner !== undefined) payload.owner = input.owner;
  return op("risk_created", payload);
}
export function updateRisk(
  decisionId: DecisionId,
  riskId: string,
  patch: Partial<{
    label: string;
    probability: number;
    impact: number;
    prevention: string;
    cure: string;
    residual_probability: number;
    residual_impact: number;
    mitigation: string;
    owner: string;
    status: string;
  }>,
  opts: OpOptions = {},
): DecisionToolOp {
  return op("risk_updated", { decision_id: decisionId, risk_id: riskId, patch: patch as unknown as Json, at: now(opts) });
}
export function createHypothesis(decisionId: DecisionId, text: string, confidence?: number, opts: OpOptions = {}): DecisionToolOp {
  const payload: JsonObject = { decision_id: decisionId, hypothesis_id: opts.id ?? uid("hyp"), text, at: now(opts) };
  if (confidence !== undefined) payload.confidence = confidence;
  return op("hypothesis_created", payload);
}
export function updateHypothesis(
  decisionId: DecisionId,
  hypothesisId: string,
  patch: Partial<{ text: string; confidence: number; status: string }>,
  opts: OpOptions = {},
): DecisionToolOp {
  return op("hypothesis_updated", { decision_id: decisionId, hypothesis_id: hypothesisId, patch: patch as unknown as Json, at: now(opts) });
}

// ─── Boards & items ────────────────────────────────────────────────
export interface CreateBoardInput {
  engine: EngineKind;
  title?: string;
  config?: JsonObject;
  data?: JsonObject;
  preset_id?: string;
  decision_id?: DecisionId;
}
export function createBoard(input: CreateBoardInput, opts: OpOptions = {}): DecisionToolOp {
  const payload: JsonObject = {
    board_id: opts.id ?? uid("board"),
    engine: input.engine,
    title: input.title ?? "",
    config: input.config ?? {},
    data: input.data ?? { items: [] },
    at: now(opts),
  };
  if (input.preset_id !== undefined) payload.preset_id = input.preset_id;
  if (input.decision_id !== undefined) payload.decision_id = input.decision_id;
  return op("board_created", payload);
}

/** Crée un board depuis un preset (≡ createWorkspace/openPreset du brief). */
export function openPreset(
  presetId: string,
  input: { title?: string; decision_id?: DecisionId } = {},
  opts: OpOptions = {},
): DecisionToolOp | null {
  const preset = resolvePreset(presetId);
  if (!preset) return null;
  const seed = preset.seed && typeof preset.seed === "object" ? preset.seed : { items: [] };
  return createBoard(
    {
      engine: preset.engine,
      title: input.title ?? preset.title,
      config: preset.config,
      data: seed as JsonObject,
      preset_id: preset.id,
      decision_id: input.decision_id,
    },
    opts,
  );
}
/** Rattache un tableau à une décision, ou le détache (decisionId = null). */
export function reparentBoard(boardId: BoardId, decisionId: DecisionId | null, opts: OpOptions = {}): DecisionToolOp {
  return op("board_reparented", { board_id: boardId, decision_id: decisionId, at: now(opts) });
}

export function updateBoard(boardId: BoardId, patch: Partial<{ title: string; config: JsonObject }>, opts: OpOptions = {}): DecisionToolOp {
  return op("board_updated", { board_id: boardId, patch: patch as unknown as Json, at: now(opts) });
}
export function deleteBoard(boardId: BoardId): DecisionToolOp {
  return op("board_deleted", { board_id: boardId });
}

export interface ItemInput {
  label: string;
  fields?: Record<string, string | number | boolean | null>;
  tags?: string[];
  color?: string;
  comment?: string;
  links?: SourceLink[];
  zone_id?: string;
  x?: number;
  y?: number;
  status?: string;
}
function buildItem(input: ItemInput, id: string): JsonObject {
  const item: JsonObject = {
    id,
    label: input.label,
    fields: (input.fields ?? {}) as unknown as Json,
    tags: input.tags ?? [],
    links: (input.links ?? []) as unknown as Json,
  };
  if (input.color !== undefined) item.color = input.color;
  if (input.comment !== undefined) item.comment = input.comment;
  if (input.zone_id !== undefined) item.zone_id = input.zone_id;
  if (input.x !== undefined) item.x = input.x;
  if (input.y !== undefined) item.y = input.y;
  if (input.status !== undefined) item.status = input.status;
  return item;
}
export function addItem(boardId: BoardId, input: ItemInput, opts: OpOptions = {}): DecisionToolOp {
  return op("item_added", { board_id: boardId, item: buildItem(input, opts.id ?? uid("item")), at: now(opts) });
}
export function updateItem(boardId: BoardId, itemId: string, patch: Partial<ItemInput>, opts: OpOptions = {}): DecisionToolOp {
  return op("item_updated", { board_id: boardId, item_id: itemId, patch: patch as unknown as Json, at: now(opts) });
}
export function moveItem(
  boardId: BoardId,
  itemId: string,
  pos: { x?: number; y?: number; zone_id?: string; status?: string },
  opts: OpOptions = {},
): DecisionToolOp {
  return op("item_moved", { board_id: boardId, item_id: itemId, patch: pos as unknown as Json, at: now(opts) });
}
export function removeItem(boardId: BoardId, itemId: string, opts: OpOptions = {}): DecisionToolOp {
  return op("item_removed", { board_id: boardId, item_id: itemId, at: now(opts) });
}
export function setCell(boardId: BoardId, key: string, value: string, opts: OpOptions = {}): DecisionToolOp {
  return op("cell_set", { board_id: boardId, key, value, at: now(opts) });
}

// ─── Arêtes (moteur Graph) ─────────────────────────────────────────
export function addEdge(
  boardId: BoardId,
  input: { from: string; to: string; label?: string; kind?: string; directed?: boolean },
  opts: OpOptions = {},
): DecisionToolOp {
  const edge: JsonObject = { id: opts.id ?? uid("edge"), from: input.from, to: input.to };
  if (input.label !== undefined) edge.label = input.label;
  if (input.kind !== undefined) edge.kind = input.kind;
  if (input.directed !== undefined) edge.directed = input.directed;
  return op("edge_added", { board_id: boardId, edge, at: now(opts) });
}
export function updateEdge(boardId: BoardId, edgeId: string, patch: Partial<{ label: string; kind: string; directed: boolean }>, opts: OpOptions = {}): DecisionToolOp {
  return op("edge_updated", { board_id: boardId, edge_id: edgeId, patch: patch as unknown as Json, at: now(opts) });
}
// ─── Dépendances entre objets (décisions ↔ tableaux) ──────────────

export function addDependency(
  from: DepNodeRef,
  to: DepNodeRef,
  relation: DependencyRelation,
  opts: OpOptions = {},
): DecisionToolOp {
  return op("dependency_added", {
    dependency_id: opts.id ?? uid("dep"),
    from: from as unknown as Json,
    to: to as unknown as Json,
    relation,
    at: now(opts),
  });
}

export function removeDependency(dependencyId: string, opts: OpOptions = {}): DecisionToolOp {
  return op("dependency_removed", { dependency_id: dependencyId, at: now(opts) });
}

/** Toutes les dépendances. */
export function listDependencies(state: Json): Dependency[] {
  return normalizeDecisionEngineState(state).dependencies;
}

const sameRef = (a: DepNodeRef, b: DepNodeRef): boolean => a.type === b.type && a.id === b.id;

/** Voisins d'un nœud : mères (parents), filles (enfants), sœurs. */
export function selectDependenciesFor(
  state: Json,
  node: DepNodeRef,
): {
  parents: { dep: Dependency; ref: DepNodeRef }[];
  children: { dep: Dependency; ref: DepNodeRef }[];
  siblings: { dep: Dependency; ref: DepNodeRef }[];
} {
  const deps = normalizeDecisionEngineState(state).dependencies;
  const parents: { dep: Dependency; ref: DepNodeRef }[] = [];
  const children: { dep: Dependency; ref: DepNodeRef }[] = [];
  const siblings: { dep: Dependency; ref: DepNodeRef }[] = [];
  for (const dep of deps) {
    if (dep.relation === "parent-child") {
      if (sameRef(dep.to, node)) parents.push({ dep, ref: dep.from });
      else if (sameRef(dep.from, node)) children.push({ dep, ref: dep.to });
    } else {
      if (sameRef(dep.from, node)) siblings.push({ dep, ref: dep.to });
      else if (sameRef(dep.to, node)) siblings.push({ dep, ref: dep.from });
    }
  }
  return { parents, children, siblings };
}

/** Titre lisible d'un nœud (décision ou tableau). */
export function labelOfNode(state: Json, ref: DepNodeRef): string {
  const s = normalizeDecisionEngineState(state);
  if (ref.type === "decision") return s.decisions[ref.id]?.title || "(décision)";
  return s.boards[ref.id]?.title || s.boards[ref.id]?.engine || "(tableau)";
}

export function removeEdge(boardId: BoardId, edgeId: string, opts: OpOptions = {}): DecisionToolOp {
  return op("edge_removed", { board_id: boardId, edge_id: edgeId, at: now(opts) });
}

// ─── Sélecteurs purs ───────────────────────────────────────────────
export function selectState(state: Json): DecisionEngineState {
  return normalizeDecisionEngineState(state);
}
export function getDecisionById(state: Json, id: DecisionId): DecisionObject | null {
  return normalizeDecisionEngineState(state).decisions[id] ?? null;
}
export function listDecisions(state: Json): DecisionObject[] {
  return Object.values(normalizeDecisionEngineState(state).decisions).sort(
    (a, b) => b.updated_at - a.updated_at || a.id.localeCompare(b.id),
  );
}
export function getBoard(state: Json, id: BoardId): Board | null {
  return normalizeDecisionEngineState(state).boards[id] ?? null;
}
export function listBoards(state: Json): Board[] {
  return Object.values(normalizeDecisionEngineState(state).boards).sort(
    (a, b) => b.updated_at - a.updated_at || a.id.localeCompare(b.id),
  );
}
export function selectBoardsForDecision(state: Json, decisionId: DecisionId): Board[] {
  return listBoards(state).filter((b) => b.decision_id === decisionId);
}

/** Options classées par score pondéré DÉCROISSANT (arbitrage du joueur). */
export function rankedOptions(decision: DecisionObject): { option: DecisionOption; score: number }[] {
  return decision.options
    .map((option) => ({ option, score: weightedScoreOf(decision, option.id) }))
    .sort((a, b) => b.score - a.score);
}

/** Criticité d'un risque = proba × impact + bande (vert/jaune/rouge, 5×5). */
export function riskLevel(probability: number, impact: number): { score: number; band: "low" | "moderate" | "high" } {
  const score = probability * impact;
  const band = score <= 6 ? "low" : score <= 14 ? "moderate" : "high";
  return { score, band };
}

/** Items d'un board (lecture typée depuis data.items). */
export function boardItemsOf(board: Board): DecisionItem[] {
  const items = (board.data as JsonObject).items;
  if (!Array.isArray(items)) return [];
  return items
    .filter((i): i is JsonObject => Boolean(i) && typeof i === "object" && !Array.isArray(i))
    .map((i) => ({
      id: String(i.id ?? ""),
      label: typeof i.label === "string" ? i.label : "",
      fields: (i.fields && typeof i.fields === "object" && !Array.isArray(i.fields) ? i.fields : {}) as DecisionItem["fields"],
      tags: Array.isArray(i.tags) ? i.tags.filter((t): t is string => typeof t === "string") : [],
      links: Array.isArray(i.links) ? (i.links as unknown as SourceLink[]) : [],
      ...(typeof i.color === "string" ? { color: i.color } : {}),
      ...(typeof i.comment === "string" ? { comment: i.comment } : {}),
      ...(typeof i.zone_id === "string" ? { zone_id: i.zone_id } : {}),
      ...(typeof i.x === "number" ? { x: i.x } : {}),
      ...(typeof i.y === "number" ? { y: i.y } : {}),
      ...(typeof i.status === "string" ? { status: i.status } : {}),
    }))
    .filter((i) => i.id.length > 0);
}

/** Arêtes d'un board Graph (lecture typée depuis data.edges). */
export function boardEdgesOf(board: Board): GraphEdge[] {
  const edges = (board.data as JsonObject).edges;
  if (!Array.isArray(edges)) return [];
  return edges
    .filter((e): e is JsonObject => Boolean(e) && typeof e === "object" && !Array.isArray(e))
    .map((e) => ({
      id: String(e.id ?? ""),
      from: String(e.from ?? ""),
      to: String(e.to ?? ""),
      ...(typeof e.label === "string" ? { label: e.label } : {}),
      ...(typeof e.kind === "string" ? { kind: e.kind } : {}),
      ...(typeof e.directed === "boolean" ? { directed: e.directed } : {}),
    }))
    .filter((e) => e.id.length > 0 && e.from.length > 0 && e.to.length > 0);
}
