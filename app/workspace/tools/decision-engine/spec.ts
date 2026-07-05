/**
 * Spec PURE du Tool decision-engine (Decision Engine Universel) —
 * node-safe, importable par le moteur et les tests.
 * Réf : docs/TOOL_DECISION_ENGINE.md (contrat §3) ; modèle architectural
 * docs/TOOL_BLOC_NOTES.md (mêmes règles, même pattern tool_op / reducer
 * pur / API publique / garde-fous).
 *
 * Règles de pureté (garde-fous testés) :
 *   - AUCUN React, AUCUN import moteur hors types Json ;
 *   - ne connaît NI le scénario, NI les mécaniques, NI le moteur ;
 *   - l'outil est un outil d'AUTEUR : il ne lit JAMAIS les critères
 *     d'évaluation du scénario et ne calcule aucune « bonne réponse ».
 *     describeForObservation = résumé NEUTRE (zéro évaluation).
 */

import type { Json, JsonObject } from "@/app/lib/engine/mechanics";
import { applyDecisionOp, emptyDecisionEngineState, normalizeDecisionEngineState } from "./model";

export const DECISION_ENGINE_TOOL_ID = "decision-engine";

// ─── Identifiants ──────────────────────────────────────────────────
export type DecisionId = string;
export type BoardId = string;
export type OptionId = string;
export type CriterionId = string;
export type ItemId = string;

// ─── Liaison universelle (documents / notes / mails / messages / …) ─
export type SourceLink =
  | { kind: "document"; document_id: string; label?: string }
  | { kind: "note"; note_id: string; label?: string }
  | { kind: "task"; task_id: string; label?: string }
  | { kind: "mail"; mail_id: string; subject?: string; label?: string }
  | { kind: "message"; thread_id: string; label?: string }
  | { kind: "library"; entry_id: string; label?: string }
  | { kind: "board"; board_id: string; label?: string }
  | { kind: "decision"; decision_id: string; label?: string };

export const SOURCE_LINK_KINDS = [
  "document",
  "note",
  "task",
  "mail",
  "message",
  "library",
  "board",
  "decision",
] as const;
export type SourceLinkKind = (typeof SOURCE_LINK_KINDS)[number];

// ─── Carte générique partagée par les moteurs (permet les conversions) ─
export type ItemFieldValue = string | number | boolean | null;
export type DecisionItem = {
  id: ItemId;
  label: string;
  fields: Record<string, ItemFieldValue>;
  tags: string[];
  color?: string;
  comment?: string;
  links: SourceLink[];
  zone_id?: string; // Table : zone/colonne
  x?: number; // Matrix : placement 0..1
  y?: number;
  status?: string; // Kanban / Registry
};

// ─── Decision Object (ADR-like, cœur métier) ───────────────────────
export type DecisionOption = { id: OptionId; label: string; note?: string; links: SourceLink[] };
export type DecisionCriterion = { id: CriterionId; label: string; weight: number; note?: string };
export type ScoreCell = { value: number; justification?: string };

export const RISK_STATUSES = ["open", "mitigating", "closed"] as const;
export type RiskStatus = (typeof RISK_STATUSES)[number];
export type RiskEntry = {
  id: string;
  label: string;
  probability: number; // 1..5 (brut, avant mesures)
  impact: number; // 1..5 (brut, avant mesures)
  /** Moyen de PRÉVENIR — vise à réduire la probabilité. */
  prevention?: string;
  /** Moyen de GUÉRIR / réduire l'impact si le risque survient. */
  cure?: string;
  /** Cotations RÉSIDUELLES après mesures (1..5) — undefined = pas recoté. */
  residual_probability?: number;
  residual_impact?: number;
  /** @deprecated remplacé par prevention/cure — conservé pour l'existant. */
  mitigation?: string;
  owner?: string;
  status: RiskStatus;
  links: SourceLink[];
};

export const HYPOTHESIS_STATUSES = ["open", "confirmed", "refuted"] as const;
export type HypothesisStatus = (typeof HYPOTHESIS_STATUSES)[number];
export type Hypothesis = { id: string; text: string; confidence?: number; status: HypothesisStatus };

export const DECISION_STATUSES = ["draft", "in_progress", "finalized", "archived"] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export type DecisionObject = {
  id: DecisionId;
  title: string;
  context: string;
  final_decision?: string;
  options: DecisionOption[];
  criteria: DecisionCriterion[];
  /** scores[optionId][criterionId] = { value, justification? } */
  scores: Record<OptionId, Record<CriterionId, ScoreCell>>;
  method?: string;
  justification?: string;
  hypotheses: Hypothesis[];
  risks: RiskEntry[];
  sources: SourceLink[];
  author?: string;
  created_at: number;
  updated_at: number;
  decided_at?: number;
  expected_impacts?: string;
  status: DecisionStatus;
  board_ids: BoardId[];
  supersedes?: DecisionId;
};

// ─── Moteurs (widgets génériques) et leurs données ─────────────────
export const ENGINE_KINDS = ["table", "matrix", "registry", "graph", "timeline", "kanban"] as const;
export type EngineKind = (typeof ENGINE_KINDS)[number];

export type AxisDef = { label: string; min_label?: string; max_label?: string; scale?: number };

/** Arête du moteur Graph (les nœuds sont des DecisionItem ; les arêtes
 *  vivent dans board.data.edges — ops dédiées, contrat §4 V2). */
export type GraphEdge = {
  id: string;
  from: ItemId;
  to: ItemId;
  label?: string;
  kind?: string;
  directed?: boolean;
};

export const MATRIX_SCORINGS = ["weighted", "axis", "rice"] as const;
export type MatrixScoring = (typeof MATRIX_SCORINGS)[number];

/** Config = gabarit (issu du preset, MODIFIABLE) ; Data = contenu produit. */
export type EngineConfig = JsonObject; // union souple selon engine (validée par moteur)
export type EngineData = JsonObject; // idem — items/cells/axes selon engine

export type Board = {
  id: BoardId;
  title: string;
  engine: EngineKind;
  preset_id?: string;
  decision_id?: DecisionId;
  config: EngineConfig;
  data: EngineData;
  created_at: number;
  updated_at: number;
};

export type DecisionEngineState = {
  decisions: Record<DecisionId, DecisionObject>;
  boards: Record<BoardId, Board>;
  ui: { open_board_id?: BoardId; open_decision_id?: DecisionId };
};

// ─── Preset (configuration déclarative d'un moteur) ────────────────
export type Preset = {
  id: string;
  title: string;
  description?: string;
  engine: EngineKind;
  config: EngineConfig;
  seed?: JsonObject;
};

// ─── Contrat Tool ──────────────────────────────────────────────────
export function initialDecisionEngineState(_config: JsonObject): DecisionEngineState {
  return emptyDecisionEngineState();
}

const STATUS_LABELS: Record<DecisionStatus, string> = {
  draft: "brouillon",
  in_progress: "en cours",
  finalized: "actée",
  archived: "archivée",
};

function truncate(text: string, max: number): string {
  const s = text.replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Somme pondérée d'une option (dérivée, jamais stockée). PUR. */
export function weightedScoreOf(decision: DecisionObject, optionId: OptionId): number {
  const row = decision.scores[optionId] ?? {};
  let total = 0;
  for (const c of decision.criteria) {
    const cell = row[c.id];
    if (cell) total += cell.value * c.weight;
  }
  return total;
}

/**
 * Résumé LISIBLE et NEUTRE pour l'observateur IA : décisions, options,
 * critères, arbitrage du JOUEUR (jamais un jugement du moteur, jamais un
 * critère de scénario). Pur, déterministe.
 */
export function describeDecisionEngineForObservation(state: Json): string {
  const s = normalizeDecisionEngineState(state);
  const decisions = Object.values(s.decisions);
  const boards = Object.values(s.boards);
  if (decisions.length === 0 && boards.length === 0) {
    return "Decision Engine vide : aucune décision, aucun tableau.";
  }

  const lines: string[] = [
    `Decision Engine : ${decisions.length} décision(s), ${boards.length} tableau(x).`,
  ];

  for (const d of decisions.slice(0, 10)) {
    const parts = [`« ${truncate(d.title, 80) || "(sans titre)"} » (${STATUS_LABELS[d.status]})`];
    if (d.options.length > 0) parts.push(`${d.options.length} option(s)`);
    if (d.criteria.length > 0) parts.push(`${d.criteria.length} critère(s)`);
    if (d.risks.length > 0) parts.push(`${d.risks.length} risque(s)`);
    lines.push(`- ${parts.join(", ")}.`);
    if (d.final_decision) {
      lines.push(`  Décision retenue par le joueur : ${truncate(d.final_decision, 160)}.`);
    } else if (d.options.length > 0 && d.criteria.length > 0) {
      // Arbitrage courant du joueur (sa propre pondération), sans jugement.
      const ranked = [...d.options]
        .map((o) => ({ o, sc: weightedScoreOf(d, o.id) }))
        .sort((a, b) => b.sc - a.sc);
      const top = ranked[0];
      if (top && top.sc > 0) {
        lines.push(`  En tête du scoring du joueur : « ${truncate(top.o.label, 80)} ».`);
      }
    }
  }
  if (decisions.length > 10) lines.push(`… et ${decisions.length - 10} autre(s) décision(s).`);

  return lines.join("\n");
}

export const decisionEngineSpec = {
  id: DECISION_ENGINE_TOOL_ID,
  title: "Decision Engine",
  icon: "🧭",
  initialState: initialDecisionEngineState,
  describeForObservation: describeDecisionEngineForObservation,
  applyOp: applyDecisionOp,
} as const;
