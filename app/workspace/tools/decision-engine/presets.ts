/**
 * presets.ts — configurations DÉCLARATIVES des moteurs (contrat §5).
 * Un preset = { id, title, engine, config, seed? } — AUCUN code. Ajouter
 * un framework = ajouter une entrée ici, pas du code moteur. PUR/node-safe.
 *
 * V1 : presets Matrix (weighted / impact_effort / prob_impact) branchés en
 * Lot A ; SWOT (Table), risk.analysis (Registry) et registry.decisions
 * (Registry) préparés pour le Lot B.
 */

import type { Preset } from "./spec";

export const PRESETS: Record<string, Preset> = {
  // ── Matrix ───────────────────────────────────────────────────────
  "matrix.weighted": {
    id: "matrix.weighted",
    title: "Matrice multicritère",
    description: "Arbitrer des options selon des critères pondérés (4 à 8 critères).",
    engine: "matrix",
    config: {
      scoring: "weighted",
      criteria: [
        { id: "c_impact", label: "Impact", weight: 3 },
        { id: "c_faisabilite", label: "Faisabilité", weight: 2 },
        { id: "c_cout", label: "Coût", weight: 2 },
        { id: "c_risque", label: "Risque", weight: 1 },
      ],
    },
  },
  "matrix.impact_effort": {
    id: "matrix.impact_effort",
    title: "Impact / Effort",
    description: "Placer des initiatives selon leur impact et l'effort requis.",
    engine: "matrix",
    config: {
      scoring: "axis",
      axes: {
        x: { label: "Effort", min_label: "Faible", max_label: "Élevé" },
        y: { label: "Impact", min_label: "Faible", max_label: "Élevé" },
      },
      quadrants: [
        { id: "q_quickwin", label: "Quick wins", color: "#bbf7d0" },
        { id: "q_bigbet", label: "Gros paris", color: "#bfdbfe" },
        { id: "q_avoid", label: "À éviter", color: "#fecaca" },
        { id: "q_fill", label: "Bouche-trous", color: "#e5e7eb" },
      ],
    },
  },
  "matrix.prob_impact": {
    id: "matrix.prob_impact",
    title: "Probabilité / Impact",
    description: "Cartographier des risques selon leur probabilité et leur impact.",
    engine: "matrix",
    config: {
      scoring: "axis",
      axes: {
        x: { label: "Probabilité", min_label: "Rare", max_label: "Très probable" },
        y: { label: "Impact", min_label: "Mineur", max_label: "Majeur" },
      },
      quadrants: [
        { id: "q_watch", label: "À surveiller", color: "#fde68a" },
        { id: "q_critical", label: "Critique", color: "#fecaca" },
        { id: "q_low", label: "Négligeable", color: "#e5e7eb" },
        { id: "q_contain", label: "À contenir", color: "#bfdbfe" },
      ],
    },
  },

  // ── Table (Lot B) ────────────────────────────────────────────────
  swot: {
    id: "swot",
    title: "SWOT",
    description: "Forces, faiblesses, opportunités, menaces.",
    engine: "table",
    config: {
      mode: "zones",
      zones: [
        { id: "s", label: "Forces", color: "#bbf7d0" },
        { id: "w", label: "Faiblesses", color: "#fecaca" },
        { id: "o", label: "Opportunités", color: "#bfdbfe" },
        { id: "t", label: "Menaces", color: "#fde68a" },
      ],
    },
  },

  // ── Registry (Lot B) ─────────────────────────────────────────────
  "risk.analysis": {
    id: "risk.analysis",
    title: "Analyse de risques",
    description: "Registre des risques (probabilité, impact, mitigation, propriétaire).",
    engine: "registry",
    config: {
      fields: [
        { id: "label", label: "Risque", type: "text" },
        {
          id: "probability",
          label: "Probabilité",
          type: "select",
          options: [
            { value: "1", label: "1 · Rare" },
            { value: "2", label: "2 · Peu probable" },
            { value: "3", label: "3 · Possible" },
            { value: "4", label: "4 · Probable" },
            { value: "5", label: "5 · Quasi certain" },
          ],
        },
        {
          id: "impact",
          label: "Impact",
          type: "select",
          options: [
            { value: "1", label: "1 · Mineur" },
            { value: "2", label: "2 · Faible" },
            { value: "3", label: "3 · Moyen" },
            { value: "4", label: "4 · Fort" },
            { value: "5", label: "5 · Majeur" },
          ],
        },
        { id: "mitigation", label: "Mitigation", type: "text" },
        { id: "owner", label: "Propriétaire", type: "user" },
        {
          id: "status",
          label: "Statut",
          type: "select",
          options: [
            { value: "open", label: "Ouvert", color: "#fecaca" },
            { value: "mitigating", label: "En traitement", color: "#fde68a" },
            { value: "closed", label: "Clôturé", color: "#bbf7d0" },
          ],
        },
      ],
    },
  },
  "registry.decisions": {
    id: "registry.decisions",
    title: "Registre des décisions",
    description: "Tracer les décisions prises (statut, propriétaire, date).",
    engine: "registry",
    config: {
      fields: [
        { id: "label", label: "Décision", type: "text" },
        {
          id: "status",
          label: "Statut",
          type: "select",
          options: [
            { value: "draft", label: "Brouillon" },
            { value: "final", label: "Actée", color: "#bbf7d0" },
          ],
        },
        { id: "owner", label: "Propriétaire", type: "user" },
        { id: "date", label: "Date", type: "date" },
      ],
    },
  },
};

export function resolvePreset(id: string): Preset | undefined {
  return PRESETS[id];
}

export function listPresets(engine?: string): Preset[] {
  return Object.values(PRESETS).filter((p) => (engine ? p.engine === engine : true));
}
