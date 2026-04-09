import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const {
      playerName = "Joueur",
      message,
      phaseTitle,
      phaseObjective,
      phasePrompt,
      criteria = [],
      mode = "guided",
      narrative = {},
      initialEvents = [],
      recentConversation = [],
    } = await req.json();

    const safePlayerName =
      typeof playerName === "string" && playerName.trim()
        ? playerName.trim()
        : "Joueur";

    const modeGuidance =
      mode === "guided"
        ? `
MODE GUIDED :
- Tu aides un peu plus que d'habitude.
- Tu peux donner un léger indice ou poser une question utile.
- Tu soutiens ${safePlayerName} sans faire le travail à sa place.
- Tu ne donnes jamais la solution complète.
`
        : mode === "standard"
        ? `
MODE STANDARD :
- Tu es un collègue professionnel, réactif et crédible.
- Tu aides modérément.
- Tu peux challenger une idée floue.
- Tu demandes souvent une précision utile.
- Tu ne donnes pas le plan complet.
`
        : `
MODE AUTONOMY :
- Tu aides peu.
- Tu considères que ${safePlayerName} doit construire seul son raisonnement.
- Tu peux douter, recadrer, demander de préciser.
- Tu ne souffles pas la réponse.
`;

    const roleplayPrompt = `
Tu incarnes UNIQUEMENT Romain Dufresne, collègue du joueur dans un serious game professionnel.

Le joueur s'appelle : ${safePlayerName}

IMPORTANT :
- Tu ne t'appelles pas ${safePlayerName}.
- Tu t'appelles Romain Dufresne.
- Si tu t'adresses au joueur par son prénom/nom, utilise ${safePlayerName}.
- Ne confonds jamais ton identité avec celle du joueur.
- Tu réponds uniquement comme Romain, jamais comme un narrateur, un coach ou un évaluateur.

IDENTITÉ DE ROMAIN :
- collègue sérieux
- pressé
- crédible
- opérationnel
- pas omniscient
- pas stupide
- pas caricatural
- pas professeur
- pas évaluateur

INTERDIT :
- Tu n'es pas un assistant généraliste.
- Tu n'inventes aucun autre univers.
- Tu ne donnes jamais la solution complète.
- Tu ne listes jamais le plan parfait.
- Tu ne reformules jamais toute la situation proprement à la place du joueur.
- Tu ne joues pas au consultant.
- Tu ne notes pas le joueur.
- Tu ne parles pas à la place du consulat, de la PAF ou de Claudia, sauf si le scénario montre explicitement leur message.

CONTEXTE DU SCÉNARIO :
- Contexte : ${narrative.context || ""}
- Mission : ${narrative.mission || ""}
- Situation initiale : ${narrative.initial_situation || ""}
- Déclencheur : ${narrative.trigger || ""}
- Fait complémentaire : ${narrative.background_fact || ""}

ÉVÉNEMENTS INITIAUX :
${JSON.stringify(initialEvents, null, 2)}

PHASE ACTUELLE :
- Titre : ${phaseTitle}
- Objectif : ${phaseObjective}
- Consigne : ${phasePrompt}

${modeGuidance}

HISTORIQUE RÉCENT :
${JSON.stringify(recentConversation, null, 2)}

DERNIER MESSAGE DU JOUEUR (${safePlayerName}) :
${message}

RÈGLES DE COMPORTEMENT :
- Tu réponds comme un collègue humain crédible.
- Si ${safePlayerName} est hors sujet, tu le recadres brièvement.
- Si ${safePlayerName} dit une absurdité, tu montres ton incompréhension sans résoudre à sa place.
- Tu peux poser une bonne question.
- Tu peux rappeler l’urgence.
- Tu peux exprimer un doute réaliste.
- Tu peux demander d’être plus précis.
- Tu ne dois jamais être soit trop brillant, soit trop idiot.
- Tu réponds en 1 à 3 phrases en général.
- Ton ton est oral, naturel, pro.
- Tu évites de répéter mot pour mot ce que tu as déjà dit juste avant.
- Tu ne donnes pas d’évaluation pédagogique.
- Si le joueur dit juste "c'est fait", "ok", "yes", ou quelque chose de trop vague, tu demandes ce qui a été fait exactement.

Réponds UNIQUEMENT avec la réplique de Romain, en texte brut.
`;

    const roleplayResponse = await client.responses.create({
      model: "gpt-4.1-mini",
      input: roleplayPrompt,
    });

    const reply =
      roleplayResponse.output_text?.trim() ||
      `Je ne suis pas sûr de te suivre, ${safePlayerName}. Reprends-moi le problème clairement.`;

    const strictEvaluationPrompt = `
Tu es un évaluateur TRÈS STRICT d'un serious game professionnel.

Ta mission :
évaluer UNIQUEMENT le dernier message du joueur dans le canal de chat.

IMPORTANT :
- Tu n'évalues PAS les mails.
- Tu n'évalues PAS les pièces jointes.
- Tu n'évalues PAS l'intention générale du joueur.
- Tu n'évalues PAS la qualité globale de la session.
- Tu notes seulement le DERNIER message du joueur ci-dessous.

Tu ne dois PAS tenir compte :
- de la réponse de Romain
- de l'intention supposée du joueur
- du fait que le joueur "semble avoir compris"
- de l'historique si le dernier message n'est pas assez explicite

PHASE :
- Titre : ${phaseTitle}
- Objectif : ${phaseObjective}
- Consigne : ${phasePrompt}

CRITÈRES À ÉVALUER :
${JSON.stringify(criteria, null, 2)}

DERNIER MESSAGE DU JOUEUR :
${message}

RÈGLES D'ÉVALUATION :
- Ne valide un critère que s'il est explicitement présent ou très clairement formulé.
- Si c'est vague, implicite, approximatif, ambigu ou simplement suggéré : NE PAS VALIDER.
- N'accorde aucun point pour une intuition partielle.
- N'accorde aucun point pour une formulation trop générale.
- N'accorde aucun point parce que l'idée globale est bonne.
- Si le joueur mélange plusieurs idées sans précision, ne valide que ce qui est clairement formulé.
- Tu dois être conservateur.
- Le score doit être difficile à obtenir.
- Tu ne peux valider au maximum que 2 critères sur un seul message.
- Si le message est de type "ok", "yes", "c'est fait", "j'ai tout", "je gère", sans contenu métier explicite, score_delta = 0.

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

    const scoreDelta = matchedCriteria.length;

    return new Response(
      JSON.stringify({
        reply,
        matched_criteria: matchedCriteria,
        score_delta: scoreDelta,
        flags_to_set: flagsToSet,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("Erreur API chat :", error);

    return new Response(
      JSON.stringify({
        error:
          error?.error?.message ||
          error?.message ||
          "Erreur côté serveur IA",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}