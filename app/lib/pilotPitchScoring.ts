/**
 * Pure scoring helper for the S3 (founder_03_clinical) pilot pitch mail.
 *
 * Extracted from MailModule.handlePilotPitchMail so the same logic can be
 * exercised by automated grader scripts without spinning up the React
 * runtime. ANY change here changes the game decision — keep this module
 * the single source of truth.
 *
 * Decision tree:
 *  - Target = Clinique Saint-Augustin  →  auto-pass UNLESS broken
 *      (broken = empty / <50 chars / insult / single short word)
 *  - Target = CHU or Saint-Martin       →  keyword-score ≥ 3 (out of 9)
 *
 * What the surrounding code (MailModule) does with this verdict :
 *  - isGood + target = clinique               →  contrat Clinique
 *  - isGood + target = chu / sm                →  contrat de l'établissement
 *  - !isGood + target = chu / sm               →  pivot forcé vers Clinique
 *                                                 (alex sauve la mise)
 *  - !isGood + target = clinique               →  GAME OVER (total failure)
 */

export type PitchTarget = "chu" | "saint_martin" | "clinique";

export type PitchScoringResult = {
  /** Numerical score 0..9 (only meaningful for chu / saint_martin). */
  score: number;
  /** Per-category breakdown of where the score came from. */
  breakdown: {
    gratuit: number;
    valueProp: number;
    data: number;
    duration: number;
    length: number;
    politeness: number;
  };
  /** True when the mail is too broken to even land on the clinique. */
  cliniqueBroken: boolean;
  /** Final verdict the engine will act on. */
  isGood: boolean;
  /** Game-flow outcome the caller will trigger. */
  outcome: "ACCEPT" | "PIVOT_TO_CLINIQUE" | "GAME_OVER";
  /** Why the verdict went the way it did (one-line, for logs). */
  reason: string;
};

// ── Keyword sets ──────────────────────────────────────────────────────
// Public so the grader can show them in the report.
export const KEYWORDS = {
  gratuit: [
    "gratuit", "sans engagement", "offert", "sans frais",
    "aucun coût", "0 €", "0€", "à nos frais", "pas de coût",
  ],
  valueProp: [
    "planning", "bloc", "opératoire", "annulation", "créneau",
    "optimis", "gestion", "occupation", "rotation", "fluidifier",
    "coordination", "salles",
  ],
  data: [
    "données", "hds", "hébergement", "certifié", "patient",
    "sécurité", "rgpd", "confidentiel", "souveraineté",
    "anonymis", "chiffrement",
  ],
  duration: [
    "8 semaines", "deux mois", "2 mois", "semaines", "durée",
    "pilote", "test", "poc", "essai", "expérimentation", "mvp",
  ],
  greeting: ["bonjour", "madame", "monsieur", "docteur", "cher", "chère"],
  signoff: [
    "cordialement", "bien à vous", "respectueusement",
    "salutations", "à disposition",
  ],
};

// Insult / nonsense regex used by the "broken mail" detector for the
// Clinique branch. Match is case-insensitive and accent-tolerant.
export const INSULT_REGEX =
  /\b(p[éeè]nis|merde|putain|connard|salope|nique|encul[eé]|nul à chier|caca|pipi|fuck|shit|bordel)\b/i;

const PASS_THRESHOLD = 3;
const CLINIQUE_MIN_LENGTH = 50;

export function scorePilotPitch(body: string, target: PitchTarget): PitchScoringResult {
  const bodyLower = body.toLowerCase();

  // Keyword categories.
  const gratuit = KEYWORDS.gratuit.some((k) => bodyLower.includes(k)) ? 2 : 0;
  const valuePropHits = KEYWORDS.valueProp.filter((k) => bodyLower.includes(k)).length;
  const valueProp = valuePropHits >= 2 ? 2 : 0;
  const data = KEYWORDS.data.some((k) => bodyLower.includes(k)) ? 2 : 0;
  const duration = KEYWORDS.duration.some((k) => bodyLower.includes(k)) ? 1 : 0;
  const length = body.length > 150 ? 1 : 0;
  const hasGreeting = KEYWORDS.greeting.some((k) => bodyLower.includes(k));
  const hasSignoff = KEYWORDS.signoff.some((k) => bodyLower.includes(k));
  const politeness = hasGreeting && hasSignoff ? 1 : 0;

  const score = gratuit + valueProp + data + duration + length + politeness;

  // "Broken" detector — only matters for the Clinique branch.
  const trimmed = body.trim();
  const cliniqueBroken =
    trimmed.length < CLINIQUE_MIN_LENGTH
    || INSULT_REGEX.test(body)
    || /^[a-zA-Z]{1,15}$/.test(trimmed); // single short word

  let isGood: boolean;
  let reason: string;
  let outcome: PitchScoringResult["outcome"];

  if (target === "clinique") {
    isGood = !cliniqueBroken;
    if (cliniqueBroken) {
      outcome = "GAME_OVER";
      reason = trimmed.length < CLINIQUE_MIN_LENGTH
        ? `mail trop court (${trimmed.length}<${CLINIQUE_MIN_LENGTH}) → clinique refuse`
        : INSULT_REGEX.test(body)
          ? "insulte/grossièreté détectée → clinique refuse"
          : "mail réduit à un seul mot → clinique refuse";
    } else {
      outcome = "ACCEPT";
      reason = "clinique = filet de sécurité, mail non cassé → accepté direct";
    }
  } else {
    isGood = score >= PASS_THRESHOLD;
    if (isGood) {
      outcome = "ACCEPT";
      reason = `score ${score}/9 ≥ ${PASS_THRESHOLD} → ${target.toUpperCase()} accepte`;
    } else {
      outcome = "PIVOT_TO_CLINIQUE";
      reason = `score ${score}/9 < ${PASS_THRESHOLD} → ${target.toUpperCase()} refuse, Alex pivote sur Clinique`;
    }
  }

  return {
    score,
    breakdown: { gratuit, valueProp, data, duration, length, politeness },
    cliniqueBroken,
    isGood,
    outcome,
    reason,
  };
}
