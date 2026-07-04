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
  "matrix.urgency_importance": {
    id: "matrix.urgency_importance",
    title: "Urgence / Importance",
    description: "Matrice d'Eisenhower : arbitrer par urgence et importance.",
    engine: "matrix",
    config: {
      scoring: "axis",
      axes: {
        x: { label: "Urgence", min_label: "Faible", max_label: "Élevée" },
        y: { label: "Importance", min_label: "Faible", max_label: "Élevée" },
      },
      quadrants: [
        { id: "q_plan", label: "Planifier", color: "#bfdbfe" },
        { id: "q_do", label: "Faire maintenant", color: "#bbf7d0" },
        { id: "q_drop", label: "Abandonner", color: "#e5e7eb" },
        { id: "q_delegate", label: "Déléguer", color: "#fde68a" },
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

  moscow: {
    id: "moscow",
    title: "MoSCoW",
    description: "Prioriser : Must / Should / Could / Won't.",
    engine: "table",
    config: {
      mode: "zones",
      zones: [
        { id: "must", label: "Must have", color: "#bbf7d0" },
        { id: "should", label: "Should have", color: "#bfdbfe" },
        { id: "could", label: "Could have", color: "#fde68a" },
        { id: "wont", label: "Won't have", color: "#e5e7eb" },
      ],
    },
  },
  bmc: {
    id: "bmc",
    title: "Business Model Canvas",
    description: "9 blocs du modèle économique.",
    engine: "table",
    config: {
      mode: "zones",
      zones: [
        { id: "kp", label: "Partenaires clés" },
        { id: "ka", label: "Activités clés" },
        { id: "kr", label: "Ressources clés" },
        { id: "vp", label: "Proposition de valeur", color: "#bbf7d0" },
        { id: "cr", label: "Relations clients" },
        { id: "ch", label: "Canaux" },
        { id: "cs", label: "Segments clients", color: "#bfdbfe" },
        { id: "co", label: "Structure de coûts", color: "#fecaca" },
        { id: "rs", label: "Sources de revenus", color: "#fde68a" },
      ],
    },
  },
  pestel: {
    id: "pestel",
    title: "PESTEL",
    description: "Facteurs Politiques, Économiques, Sociaux, Technologiques, Environnementaux, Légaux.",
    engine: "table",
    config: {
      mode: "zones",
      zones: [
        { id: "p", label: "Politique" },
        { id: "e", label: "Économique" },
        { id: "s", label: "Social" },
        { id: "t", label: "Technologique" },
        { id: "en", label: "Environnemental" },
        { id: "l", label: "Légal" },
      ],
    },
  },
  raci: {
    id: "raci",
    title: "RACI",
    description: "Qui est Responsable, Approbateur, Consulté, Informé pour chaque tâche.",
    engine: "table",
    config: {
      mode: "grid",
      cell_options: ["R", "A", "C", "I"],
      columns: [
        { id: "role_1", label: "Rôle 1" },
        { id: "role_2", label: "Rôle 2" },
        { id: "role_3", label: "Rôle 3" },
      ],
      rows: [
        { id: "task_1", label: "Tâche 1" },
        { id: "task_2", label: "Tâche 2" },
      ],
    },
  },
  comparatif: {
    id: "comparatif",
    title: "Tableau comparatif",
    description: "Comparer des options selon des critères.",
    engine: "table",
    config: {
      mode: "grid",
      columns: [
        { id: "opt_1", label: "Option A" },
        { id: "opt_2", label: "Option B" },
      ],
      rows: [
        { id: "crit_1", label: "Critère 1" },
        { id: "crit_2", label: "Critère 2" },
      ],
    },
  },

  // ── Kanban ───────────────────────────────────────────────────────
  "kanban.board": {
    id: "kanban.board",
    title: "Kanban",
    description: "Organiser des éléments actionnables par statut.",
    engine: "kanban",
    config: {
      columns: [
        { id: "todo", label: "À faire" },
        { id: "doing", label: "En cours" },
        { id: "done", label: "Terminé" },
      ],
    },
  },
  "kanban.backlog": {
    id: "kanban.backlog",
    title: "Backlog priorisé",
    description: "Backlog → sélectionné → en cours → terminé.",
    engine: "kanban",
    config: {
      columns: [
        { id: "backlog", label: "Backlog" },
        { id: "selected", label: "Sélectionné" },
        { id: "doing", label: "En cours" },
        { id: "done", label: "Terminé" },
      ],
    },
  },

  // ── Timeline / Process ───────────────────────────────────────────
  "timeline.roadmap": {
    id: "timeline.roadmap",
    title: "Roadmap",
    description: "Plan séquentiel : étapes, jalons, livrables.",
    engine: "timeline",
    config: {
      statuses: [
        { value: "planned", label: "Prévu", color: "#e5e7eb" },
        { value: "doing", label: "En cours", color: "#fde68a" },
        { value: "done", label: "Fait", color: "#bbf7d0" },
      ],
    },
  },
  "timeline.waterfall": {
    id: "timeline.waterfall",
    title: "Waterfall",
    description: "Phases séquentielles classiques.",
    engine: "timeline",
    config: { statuses: [{ value: "planned", label: "Prévu" }, { value: "doing", label: "En cours" }, { value: "done", label: "Fait", color: "#bbf7d0" }] },
    seed: {
      items: [
        { id: "wf_1", label: "Analyse", fields: { order: 1 }, tags: [], links: [], status: "planned" },
        { id: "wf_2", label: "Conception", fields: { order: 2 }, tags: [], links: [], status: "planned" },
        { id: "wf_3", label: "Réalisation", fields: { order: 3 }, tags: [], links: [], status: "planned" },
        { id: "wf_4", label: "Tests", fields: { order: 4 }, tags: [], links: [], status: "planned" },
        { id: "wf_5", label: "Déploiement", fields: { order: 5, milestone: true }, tags: [], links: [], status: "planned" },
      ],
    },
  },
  "timeline.cycle_v": {
    id: "timeline.cycle_v",
    title: "Cycle en V",
    description: "Branches descendante (spécification) et montante (validation).",
    engine: "timeline",
    config: { statuses: [{ value: "planned", label: "Prévu" }, { value: "doing", label: "En cours" }, { value: "done", label: "Fait", color: "#bbf7d0" }] },
    seed: {
      items: [
        { id: "v_1", label: "Besoins", fields: { order: 1 }, tags: [], links: [], status: "planned" },
        { id: "v_2", label: "Spécifications", fields: { order: 2 }, tags: [], links: [], status: "planned" },
        { id: "v_3", label: "Conception", fields: { order: 3 }, tags: [], links: [], status: "planned" },
        { id: "v_4", label: "Codage", fields: { order: 4, milestone: true }, tags: [], links: [], status: "planned" },
        { id: "v_5", label: "Tests unitaires", fields: { order: 5 }, tags: [], links: [], status: "planned" },
        { id: "v_6", label: "Intégration", fields: { order: 6 }, tags: [], links: [], status: "planned" },
        { id: "v_7", label: "Recette", fields: { order: 7 }, tags: [], links: [], status: "planned" },
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
