/**
 * fixtures.ts — jeu d'observations d'exemple pour le rendu du débrief
 * (démo / tests visuels), indépendant de toute session réelle.
 */

import type { QualificationObservations } from "./qualification";

export const SAMPLE_QUALIFICATION: QualificationObservations = {
  stats: {
    playerTurns: 11,
    actorTurns: 12,
    playerChars: 1420,
    actorChars: 3180,
    talkRatioPlayer: 1420 / (1420 + 3180),
    questionCount: 9,
    unansweredCount: 2,
    interruptions: 1,
    durationMs: 8 * 60 * 1000,
  },
  questions: [
    { at: 1, content: "Qu'est-ce qui vous a poussé à lancer ce chantier maintenant ?", answered: true, type: "ouverte" },
    { at: 2, content: "Vous avez déjà un budget alloué ?", answered: true, type: "fermée" },
    { at: 3, content: "Vous pouvez m'en dire plus sur ce point ?", answered: true, type: "relance" },
    { at: 4, content: "Quand vous dites « bientôt », c'est quel horizon exactement ?", answered: true, type: "clarification" },
    { at: 5, content: "Donc ce serait plutôt une solution clé en main, non ?", answered: false, type: "orientée" },
    { at: 6, content: "Qui valide au final la décision ?", answered: true, type: "ouverte" },
    { at: 7, content: "Il y a d'autres personnes impliquées ?", answered: true, type: "fermée" },
    { at: 8, content: "Quels sont les risques que vous voyez ?", answered: false, type: "ouverte" },
    { at: 9, content: "Ça vous convient comme approche ?", answered: true, type: "orientée" },
  ],
  coverage: [
    { dimension: "besoins", label: "Besoins", covered: "oui", evidence: "Besoins fonctionnels explorés en profondeur." },
    { dimension: "contraintes", label: "Contraintes", covered: "partiel", evidence: "Contraintes techniques abordées, mais pas les contraintes internes." },
    { dimension: "budget", label: "Budget", covered: "oui", evidence: "Enveloppe confirmée par l'interlocuteur." },
    { dimension: "decideurs", label: "Décideurs", covered: "oui", evidence: "Le décideur final a été identifié." },
    { dimension: "risques", label: "Risques", covered: "non", evidence: "Question posée mais restée sans réponse." },
    { dimension: "delais", label: "Délais", covered: "partiel", evidence: "Horizon flou (« bientôt ») partiellement clarifié." },
    { dimension: "parties_prenantes", label: "Parties prenantes", covered: "non", evidence: "Angle mort : autres parties non explorées." },
  ],
  discovery: [
    { at: 1, dimension: "besoins", label: "Besoins", status: "à temps", excerpt: "Migration bloquée depuis 6 mois." },
    { at: 3, dimension: "budget", label: "Budget", status: "à temps", excerpt: "Enveloppe ~45 k€." },
    { at: 6, dimension: "decideurs", label: "Décideurs", status: "tard", excerpt: "Le DAF tranche in fine." },
    { at: null, dimension: "risques", label: "Risques", status: "manquée" },
    { at: null, dimension: "parties_prenantes", label: "Parties prenantes", status: "manquée" },
  ],
  hypotheses: [
    { text: "L'interlocuteur n'est pas le décideur final", status: "confirmée" },
    { text: "Le budget est le vrai frein", status: "infirmée" },
    { text: "Le délai est contraint par un audit externe", status: "ouverte" },
  ],
  synthesis: {
    strengths: [
      "Bonne exploration des besoins avec des questions ouvertes en ouverture.",
      "Identification claire du décideur final.",
    ],
    improvements: [
      "Deux questions clés (risques, approche) laissées sans réponse : relancer.",
      "Tendance aux questions orientées en fin d'entretien qui ferment la découverte.",
    ],
    recommendations: [
      "Travailler la relance quand une réponse reste vague.",
      "Systématiser un tour « risques + parties prenantes » avant de conclure.",
    ],
  },
  aiEnriched: true,
};
