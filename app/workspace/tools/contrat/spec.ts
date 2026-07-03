/**
 * Spec PURE du Tool contrat — importable par le moteur (AUCUN React).
 * Config déclarée par le step : { terms: [{ id, label, type?, opening?, suffix? }] }.
 * Le garde-fou workspace.gardefou.test.ts vérifie cette pureté.
 */

import type { Json, JsonObject } from "@/app/lib/engine/mechanics";

export const CONTRAT_TOOL_ID = "contrat";

export type ContratTermDef = {
  id: string;
  label: string;
  /** "number" | "text" | "textarea" — défaut "text". */
  type?: string;
  /** Valeur d'ouverture (position de départ affichée). */
  opening?: Json;
  /** Unité affichée à côté du champ ("€", "mois", "%"…). */
  suffix?: string;
};

export type ContratProposal = { at: number; values: Record<string, Json> };

export type ContratToolState = {
  values: Record<string, Json>;
  proposals: ContratProposal[];
  status: "open" | "signed" | "rejected";
};

/** Lecture défensive de la config déclarée par le step. */
export function parseContratTerms(config: JsonObject): ContratTermDef[] {
  const raw = config.terms;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (t): t is ContratTermDef & JsonObject =>
      Boolean(t) &&
      typeof t === "object" &&
      !Array.isArray(t) &&
      typeof (t as JsonObject).id === "string" &&
      typeof (t as JsonObject).label === "string",
  );
}

export function initialContratState(config: JsonObject): ContratToolState {
  const values: Record<string, Json> = {};
  for (const term of parseContratTerms(config)) {
    values[term.id] = term.opening ?? "";
  }
  return { values, proposals: [], status: "open" };
}

/** Relit un état sérialisé (Json) en état contrat bien formé. */
export function normalizeContratState(state: Json, config: JsonObject): ContratToolState {
  const base = initialContratState(config);
  if (!state || typeof state !== "object" || Array.isArray(state)) return base;
  const s = state as Partial<ContratToolState> & JsonObject;
  return {
    values:
      s.values && typeof s.values === "object" && !Array.isArray(s.values)
        ? { ...base.values, ...(s.values as Record<string, Json>) }
        : base.values,
    proposals: Array.isArray(s.proposals) ? (s.proposals as ContratProposal[]) : [],
    status: s.status === "signed" || s.status === "rejected" ? s.status : "open",
  };
}

/** Résumé lisible par l'observateur IA — jamais de logique d'évaluation. */
export function describeContratForObservation(state: Json): string {
  const s = normalizeContratState(state, {});
  const statusLabel =
    s.status === "signed"
      ? "contrat signé"
      : s.status === "rejected"
        ? "contrat refusé"
        : "négociation en cours";
  const terms = Object.entries(s.values)
    .map(([id, v]) => `${id}=${v === "" || v === null ? "(non renseigné)" : String(v)}`)
    .join(", ");
  const lines = [`Statut : ${statusLabel}.`];
  lines.push(terms ? `Termes affichés : ${terms}.` : "Aucun terme affiché.");
  lines.push(`Propositions envoyées par le joueur : ${s.proposals.length}.`);
  const last = s.proposals[s.proposals.length - 1];
  if (last) {
    const lastTerms = Object.entries(last.values)
      .map(([id, v]) => `${id}=${String(v)}`)
      .join(", ");
    lines.push(`Dernière proposition : ${lastTerms}.`);
  }
  return lines.join(" ");
}

export const contratSpec = {
  id: CONTRAT_TOOL_ID,
  title: "Contrat",
  icon: "🧾",
  initialState: initialContratState,
  describeForObservation: describeContratForObservation,
} as const;
