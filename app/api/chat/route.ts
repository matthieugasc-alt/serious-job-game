import OpenAI from "openai";

function s(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function safeJsonResponse(payload: any, status = 200) {
  return Response.json(payload, { status });
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return safeJsonResponse(
        { error: "OPENAI_API_KEY manquante côté serveur." },
        500
      );
    }

    const client = new OpenAI({ apiKey });

    const body = await req.json();

    const playerName = s(body?.playerName, "Joueur").trim() || "Joueur";
    const message = s(body?.message, "");
    const phaseTitle = s(body?.phaseTitle, "");
    const phaseObjective = s(body?.phaseObjective, "");
    const phasePrompt = s(body?.phasePrompt, "");
    const mode = s(body?.mode, "guided");
    const narrative =
      body?.narrative && typeof body.narrative === "object" ? body.narrative : {};
    const initialEvents = Array.isArray(body?.initialEvents) ? body.initialEvents : [];
    const recentConversation = Array.isArray(body?.recentConversation)
      ? body.recentConversation
      : [];
    const criteria = Array.isArray(body?.criteria) ? body.criteria : [];

    const modeGuidance =
      mode === "guided"
        ? `
MODE GUIDED:
- Tu aides un peu plus que d'habitude.
- Tu peux donner un léger indice ou poser une question utile.
- Tu soutiens ${playerName} sans faire le travail à sa place.
- Tu ne donnes jamais la solution complète.
`
        : mode === "standard"
        ? `
MODE STANDARD:
- Tu es un collègue professionnel, réactif et crédible.
- Tu aides modérément.
- Tu peux challenger une idée floue.
- Tu demandes souvent une précision utile.
- Tu ne donnes pas le plan complet.
`
        : `
MODE AUTONOMY:
- Tu aides peu.
- Tu considères que ${playerName} doit construire seul son raisonnement.
- Tu peux douter, recadrer, demander de préciser.
- Tu ne souffles pas la réponse.
`;

    const roleplayPrompt = `
Tu incarnes UNIQUEMENT Romain Dufresne, collègue du joueur dans un serious game professionnel.

Le joueur s'appelle : ${playerName}

IMPORTANT :
- Tu ne t'appelles pas ${playerName}.
- Tu t'appelles Romain Dufresne.
- Si tu t'adresses au joueur par son prénom/nom, utilise ${playerName}.
- Ne confonds jamais ton identité avec celle du joueur.
- Tu réponds uniquement comme Romain, jamais comme un narrateur, un coach ou un évaluateur.

CONTEXTE DU SCÉNARIO :
- Contexte : ${s(narrative?.context, "")}
- Mission : ${s(narrative?.mission, "")}
- Situation initiale : ${s(narrative?.initial_situation, "")}
- Déclencheur : ${s(narrative?.trigger, "")}
- Fait complémentaire : ${s(narrative?.background_fact, "")}

ÉVÉNEMENTS INITIAUX :
${JSON.stringify(initialEvents, null, 2)}

PHASE ACTUELLE :
- Titre : ${phaseTitle}
- Objectif : ${phaseObjective}
- Consigne : ${phasePrompt}

${modeGuidance}

HISTORIQUE RÉCENT :
${JSON.stringify(recentConversation, null, 2)}

DERNIER MESSAGE DU JOUEUR (${playerName}) :
${message}

RÈGLES :
- Réponds comme un collègue humain crédible.
- Si le joueur est hors sujet, recadre brièvement.
- Si le joueur dit une absurdité, montre ton incompréhension sans résoudre à sa place.
- Tu peux poser une bonne question.
- Tu peux rappeler l’urgence.
- Tu ne donnes jamais la solution complète.
- Tu réponds en 1 à 3 phrases.
- Ton ton est oral, naturel, professionnel.

Réponds UNIQUEMENT avec la réplique de Romain, en texte brut.
`;

    const roleplayResponse = await client.responses.create({
      model: "gpt-4.1-mini",
      input: roleplayPrompt,
    });

    const reply =
      roleplayResponse.output_text?.trim() ||
      `Je ne suis pas sûr de te suivre, ${playerName}. Reprends-moi le problème clairement.`;

    const strictEvaluationPrompt = `
Tu es un évaluateur TRÈS STRICT d'un serious game professionnel.

Ta mission :
évaluer UNIQUEMENT le dernier message du joueur dans le canal de chat.

IMPORTANT :
- Tu n'évalues PAS les mails.
- Tu n'évalues PAS les pièces jointes.
- Tu notes seulement le DERNIER message du joueur.

PHASE :
- Titre : ${phaseTitle}
- Objectif : ${phaseObjective}
- Consigne : ${phasePrompt}

CRITÈRES :
${JSON.stringify(criteria, null, 2)}

DERNIER MESSAGE DU JOUEUR :
${message}

RÈGLES :
- Ne valide un critère que s'il est explicite.
- Si c'est vague ou implicite : NE PAS VALIDER.
- Maximum 2 critères validés.
- Si le message est vide, vague ou non opérationnel : score_delta = 0.

Réponds STRICTEMENT au format JSON :
{
  "matched_criteria": ["criterion_id_1"],
  "score_delta": 1,
  "flags_to_set": {
    "flag_name": true
  }
}
`;

    const evaluationResponse = await client.responses.create({
      model: "gpt-4.1-mini",
      input: strictEvaluationPrompt,
    });

    let evaluation: {
      matched_criteria?: string[];
      score_delta?: number;
      flags_to_set?: Record<string, boolean>;
    } = {};

    try {
      evaluation = JSON.parse(evaluationResponse.output_text?.trim() || "{}");
    } catch {
      evaluation = {
        matched_criteria: [],
        score_delta: 0,
        flags_to_set: {},
      };
    }

    const matchedCriteria = Array.isArray(evaluation.matched_criteria)
      ? evaluation.matched_criteria.slice(0, 2)
      : [];

    const flagsToSet =
      evaluation.flags_to_set && typeof evaluation.flags_to_set === "object"
        ? Object.fromEntries(
            Object.entries(evaluation.flags_to_set).filter(
              ([, value]) => value === true
            )
          )
        : {};

    const scoreDelta =
      typeof evaluation.score_delta === "number"
        ? evaluation.score_delta
        : matchedCriteria.length;

    return safeJsonResponse(
      {
        reply,
        matched_criteria: matchedCriteria,
        score_delta: scoreDelta,
        flags_to_set: flagsToSet,
      },
      200
    );
  } catch (error: any) {
    console.error("Erreur API chat:", error);

    return safeJsonResponse(
      {
        error:
          s(error?.message) ||
          s(error?.error?.message) ||
          "Erreur côté serveur IA",
      },
      500
    );
  }
}