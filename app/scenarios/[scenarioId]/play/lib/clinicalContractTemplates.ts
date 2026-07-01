/**
 * Clinical contract article templates — S3 phase 3 (founder_03_clinical).
 *
 * Three variants depending on the establishment the player picked:
 *   - "chu"      → CHU de Bordeaux (Pellegrin) — toxic IP + intéressement clauses
 *   - "sm"       → Hôpital Saint-Martin       — moderate ref/validation clauses
 *   - "clinique" → Clinique Saint-Augustin    — clean (default) template
 *
 * Each article carries:
 *   - id           : article_1 … article_N (used by the negotiation parser)
 *   - title/content
 *   - modifiedContent: null (filled when the AI counterpart accepts a modification)
 *   - toxic        : true → flagged as a hard red flag (loses the deal if signed)
 *   - moderate     : true → flagged as moderate concern (warning)
 */

import type { ClinicalArticle } from "../hooks/useClinicalContract";

export type ClinicalEstablishment = "chu" | "sm" | "clinique";

function art(
  id: string,
  title: string,
  content: string,
  toxic = false,
  moderate = false,
): ClinicalArticle {
  return { id, title, content, modifiedContent: null, toxic, moderate };
}

const CHU_ARTICLES: ClinicalArticle[] = [
  art("article_1", "Article 1 — Objet", "Test pilote du logiciel Orisio (planning temps réel + gestion annulations) dans le service de chirurgie orthopédique du CHU, sur une durée de 8 semaines."),
  art("article_2", "Article 2 — Gratuité", "Le test est réalisé à titre gracieux. Aucune facturation n'est émise pendant la période de test."),
  art("article_3", "Article 3 — Données", "Orisio s'engage à héberger les données sur une infrastructure certifiée HDS. Aucune donnée patient nominative n'est traitée."),
  art("article_4", "Article 4 — Durée et renouvellement", "8 semaines à compter de la mise en service. Renouvelable une fois par accord des parties."),
  art("article_5", "Article 5 — Propriété intellectuelle", "Les développements, adaptations et améliorations réalisés pendant la période de test, y compris ceux réalisés sur les données et dans les locaux du CHU, sont la propriété conjointe du CHU et d'Orisio. Le CHU dispose d'une licence perpétuelle, gratuite et irrévocable sur le code source existant d'Orisio utilisé pendant le test.", true),
  art("article_6", "Article 6 — Intéressement", "En contrepartie de l'accès à l'infrastructure du CHU, Orisio versera au CHU : 5% des revenus générés par les ventes d'Orisio aux établissements publics de santé pendant 3 ans ; 1% du post-money en cas de levée de fonds réalisée dans les 24 mois suivant le test.", true),
  art("article_7", "Article 7 — Confidentialité", "Les parties s'engagent à maintenir la confidentialité des informations échangées."),
  art("article_8", "Article 8 — Référence commerciale", "L'utilisation du nom du CHU de Bordeaux à des fins commerciales ou promotionnelles est interdite sans validation préalable du service communication du CHU.", false, true),
  art("article_9", "Article 9 — Hébergement", "L'hébergement doit être certifié SecNumCloud (et pas uniquement HDS).", false, true),
  art("article_10", "Article 10 — Conformité", "Orisio s'engage à respecter l'ensemble des réglementations applicables (RGPD, HDS, etc.)."),
  art("article_11", "Article 11 — Résiliation", "Le CHU peut résilier la convention à tout moment, sans préavis et sans indemnité.", false, true),
];

const SAINT_MARTIN_ARTICLES: ClinicalArticle[] = [
  art("article_1", "Article 1 — Objet", "Test pilote du logiciel Orisio (planning temps réel + gestion annulations) dans les blocs opératoires de l'Hôpital Saint-Martin, sur une durée de 8 semaines."),
  art("article_2", "Article 2 — Gratuité", "Le test est réalisé à titre gracieux."),
  art("article_3", "Article 3 — Propriété intellectuelle", "La propriété intellectuelle du logiciel Orisio reste la propriété exclusive d'Orisio SAS."),
  art("article_4", "Article 4 — Données", "Hébergement certifié HDS. Aucune donnée patient nominative n'est traitée."),
  art("article_5", "Article 5 — Durée", "8 semaines à compter de la mise en service."),
  art("article_6", "Article 6 — Résiliation", "Préavis de 15 jours par l'une ou l'autre des parties."),
  art("article_7", "Article 7 — Référence commerciale", "Référence anonymisée autorisée (« un hôpital privé de 8 salles »). Toute mention nommée requiert l'accord préalable de la direction de la communication du groupe.", false, true),
  art("article_8", "Article 8 — Non-sollicitation", "Orisio s'engage à ne pas solliciter le personnel de l'établissement pendant le test et les 6 mois suivant la fin du test."),
  art("article_9", "Article 9 — Validation groupe", "La signature définitive est soumise à la non-opposition du groupe Ramsay Santé. Délai indicatif : 15 jours ouvrés.", false, true),
];

const CLINIQUE_ARTICLES: ClinicalArticle[] = [
  art("article_1", "Article 1 — Objet", "Test pilote du logiciel Orisio (planning temps réel + gestion annulations) dans les blocs opératoires de la Clinique Saint-Augustin, sur une durée de 8 semaines."),
  art("article_2", "Article 2 — Gratuité", "Le test est réalisé à titre gracieux. Aucune facturation n'est émise."),
  art("article_3", "Article 3 — Propriété intellectuelle", "La propriété intellectuelle du logiciel Orisio reste la propriété exclusive d'Orisio SAS."),
  art("article_4", "Article 4 — Données", "Hébergement certifié HDS. Aucune donnée patient nominative n'est traitée."),
  art("article_5", "Article 5 — Durée", "8 semaines à compter de la mise en service, renouvelable par accord des parties."),
  art("article_6", "Article 6 — Résiliation", "Préavis de 7 jours par l'une ou l'autre des parties."),
  art("article_7", "Article 7 — Référence commerciale", "Orisio est autorisée à mentionner la Clinique Saint-Augustin comme établissement pilote."),
  art("article_8", "Article 8 — Confidentialité", "Les parties s'engagent à maintenir la confidentialité des informations échangées."),
];

/**
 * Build the article list for a given establishment.
 *
 * Data-first policy: prefer scenario.resources.clinical_contract_templates
 * when available. The hardcoded constants above are kept as fallback for
 * (a) scenarios that haven't migrated their JSON yet, (b) unit tests that
 * call this helper without a full scenario object.
 *
 * The scenario-provided articles may omit `modifiedContent`, `toxic` and
 * `moderate` — they default to `null`, `false`, `false` respectively.
 */
export function buildClinicalArticles(
  type: ClinicalEstablishment,
  scenario?: any,
): ClinicalArticle[] {
  // ── Data-first: read from scenario JSON when present ──
  const templates = scenario?.resources?.clinical_contract_templates;
  const jsonList = templates?.[type];
  if (Array.isArray(jsonList) && jsonList.length > 0) {
    return jsonList.map((raw: any) => ({
      id: String(raw.id),
      title: String(raw.title),
      content: String(raw.content),
      modifiedContent: raw.modifiedContent ?? null,
      toxic: !!raw.toxic,
      moderate: !!raw.moderate,
    }));
  }

  // ── Fallback: hardcoded constants (backward-compat) ──
  if (type === "chu") return CHU_ARTICLES.map((a) => ({ ...a }));
  if (type === "sm") return SAINT_MARTIN_ARTICLES.map((a) => ({ ...a }));
  return CLINIQUE_ARTICLES.map((a) => ({ ...a }));
}
