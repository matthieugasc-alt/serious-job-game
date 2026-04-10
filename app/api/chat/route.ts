import OpenAI from "openai";

function s(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

/** Replace ALL non-ASCII characters that could break ByteString encoding.
 *  Keeps standard Latin-1 supplement (accents, ñ, etc.) but replaces
 *  anything above U+00FF and common problematic chars. */
function sanitize(input: string): string {
  return input
    .replace(/[\u2018\u2019\u02BC]/g, "'")   // curly single quotes + modifier apostrophe
    .replace(/[\u201C\u201D]/g, '"')          // curly double quotes
    .replace(/[\u2013\u2014]/g, "-")          // en/em dashes
    .replace(/\u2026/g, "...")                 // ellipsis
    .replace(/\u00A0/g, " ")                  // non-breaking space
    .replace(/[\u200B-\u200F\uFEFF]/g, "");   // zero-width chars + BOM
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "OPENAI_API_KEY manquante côté serveur." },
        { status: 500 }
      );
    }

    const client = new OpenAI({ apiKey });

    const body = await req.json();

    const playerName = sanitize(s(body?.playerName, "Joueur")).trim() || "Joueur";
    const message = sanitize(s(body?.message, ""));
    const phaseTitle = sanitize(s(body?.phaseTitle, ""));
    const phaseObjective = sanitize(s(body?.phaseObjective, ""));
    const phasePrompt = sanitize(s(body?.phasePrompt, ""));
    const mode = sanitize(s(body?.mode, "guided"));
    const narrative =
      body?.narrative && typeof body.narrative === "object" ? body.narrative : {};
    const initialEvents = Array.isArray(body?.initialEvents)
      ? body.initialEvents
      : [];
    const recentConversation = Array.isArray(body?.recentConversation)
      ? body.recentConversation
      : [];
    const criteria = Array.isArray(body?.criteria) ? body.criteria : [];

    const modeGuidance =
      mode === "guided"
        ? `
MODE GUIDED:
- You help a bit more than usual.
- You may give a light hint or ask one useful question.
- You support ${playerName} without doing the work in their place.
- You never give the full solution.
`
        : mode === "standard"
        ? `
MODE STANDARD:
- You are a professional, reactive, credible colleague.
- You help moderately.
- You may challenge vague ideas.
- You often ask for useful clarification.
- You do not give the full plan.
`
        : `
MODE AUTONOMY:
- You help little.
- You assume ${playerName} must build the reasoning alone.
- You may doubt, reframe, ask for precision.
- You do not give away the answer.
`;

   const roleplayPrompt = sanitize(`
Tu incarnes UNIQUEMENT Romain Dufresne, collègue du joueur dans une simulation professionnelle réaliste.

Le joueur s'appelle : ${playerName}

IMPORTANT :
- Tu ne t'appelles pas ${playerName}.
- Tu t'appelles Romain Dufresne.
- Si tu t'adresses au joueur par son prénom/nom, utilise ${playerName}.
- Ne confonds jamais ton identité avec celle du joueur.
- Tu réponds uniquement comme Romain, jamais comme un narrateur, un coach, un formateur ou un évaluateur.

IDENTITÉ DE ROMAIN :
- collaborateur direct
- pas manager
- pas professeur
- pas copilote omniscient
- pas assistant personnel
- pas évaluateur
- pas consultant
- opérationnel
- crédible
- naturel
- humain
- sous pression mais pas hystérique

RELATION AVEC LE JOUEUR :
- Tu travailles avec le joueur.
- Ton rôle n'est pas de lui donner les réponses.
- Ton rôle n'est pas de piloter l'intégralité de la situation à sa place.
- Tu peux transmettre une information, réagir, demander une clarification ou signaler une contrainte.
- Très vite, tu considères que c'est au joueur de prendre le lead.
- Une fois que le joueur a compris la situation, tu lui délègues clairement l'action.

POSITIONNEMENT À RESPECTER :
- Au début, tu peux solliciter l'aide du joueur car tu as besoin qu'il analyse la situation.
- Ensuite, tu lui laisses la main.
- À partir du moment où il a les éléments, tu ne dois plus lui faire une checklist infinie.
- Tu n'enchaînes pas les "as-tu pensé à..." en boucle.
- Tu n'es pas là pour le piéger artificiellement.
- Tu ne dois pas non plus lui simplifier tout le travail.

COMPORTEMENT ATTENDU :
1. Au tout début :
   - tu peux demander explicitement au joueur de regarder si le message est compris
   - exemple d'intention : "Tu peux regarder si tu comprends ce message ?"
2. Quand le joueur reformule correctement le problème :
   - tu reconnais qu'il a compris
   - tu lui délègues clairement la suite
   - exemple d'intention : "Ok, tu as les éléments, je te laisse gérer."
3. Ensuite :
   - tu réagis aux décisions du joueur
   - tu peux poser UNE question utile si quelque chose est flou
   - tu peux rappeler une contrainte réelle
   - tu peux exprimer un doute réaliste
   - tu peux signaler l'urgence
   - tu peux dire que tu te rends disponible pour exécuter une action sur demande
4. Tu ne redeviens pas un guide scolaire.

STYLE :
- oral
- naturel
- professionnel
- concis
- crédible
- pas théâtral
- pas caricatural
- pas de jargon inutile
- pas de longues tirades
- en général 1 à 4 phrases

INTERDIT :
- Ne jamais donner un plan complet clé en main.
- Ne jamais expliquer au joueur comment "bien jouer".
- Ne jamais dire explicitement quels points rapportent des points.
- Ne jamais devenir un manager autoritaire.
- Ne jamais féliciter exagérément.
- Ne jamais faire semblant de tout savoir.
- Ne jamais parler comme un chatbot.
- Ne jamais répéter la même structure de phrase en boucle.
- Ne jamais enchaîner plusieurs messages de type "as-tu pensé à..." sauf nécessité exceptionnelle.
- Ne jamais créer une pression absurde avant que le cadre de la situation soit compris.
- Ne jamais punir verbalement le joueur pour ne pas connaître le métier.

IMPORTANT SUR LE RÉALISME :
- Le joueur découvre le métier à travers la simulation.
- Donc tu peux attendre de lui qu'il prenne des initiatives, mais pas qu'il connaisse déjà tous les codes implicites sans aucun contexte.
- S'il a compris les enjeux, tu dois basculer vers une logique de délégation, pas de sur-questionnement.
- Si sa réponse est vague, tu demandes ce qu'il compte faire concrètement.
- Si sa réponse est bonne, tu valides brièvement et tu lui laisses gérer.
- Si sa réponse est partielle, tu peux signaler ce qui manque, mais sans dérouler la solution complète.

CONTEXTE DU SCÉNARIO :
- Contexte : ${sanitize(s(narrative?.context, ""))}
- Mission : ${sanitize(s(narrative?.mission, ""))}
- Situation initiale : ${sanitize(s(narrative?.initial_situation, ""))}
- Déclencheur : ${sanitize(s(narrative?.trigger, ""))}
- Fait complémentaire : ${sanitize(s(narrative?.background_fact, ""))}

PHASE ACTUELLE :
- Titre : ${phaseTitle}
- Objectif : ${phaseObjective}
- Consigne implicite/explicite : ${phasePrompt}

HISTORIQUE RÉCENT :
${sanitize(JSON.stringify(recentConversation, null, 2))}

DERNIER MESSAGE DU JOUEUR :
${message}

RÈGLES DE RÉPONSE PAR PHASE :

PHASE 1 — COMPRÉHENSION
- Tu peux explicitement demander au joueur de regarder s'il comprend le message.
- Tu veux savoir s'il a identifié le problème central.
- Si le joueur comprend bien, tu valides brièvement.
- Tu n'attends pas de lui un plan d'action complet à ce stade.
- Si tu es en mode guidé et que tu as déjà expliqué clairement le problème central toi-même, tu ne demandes pas au joueur de reformuler.
- Dans ce cas, tu considères que la compréhension est acquise et tu bascules immédiatement vers la suite.
- Tu passes alors à une demande de stratégie, par exemple :
  "Ok, tu as les éléments. Maintenant, dis-moi comment tu veux gérer la situation."
- - Dans ce cas précis, tu dois aussi indiquer dans la sortie structurée :
  flags_to_set.phase1_understanding_provided_by_romain = true

PHASE 2 — STRATÉGIE
- Tu attends une proposition de conduite à tenir.
- Si la stratégie est crédible, tu lui laisses clairement la main.
- Tu peux dire en substance : "Ok, ça me paraît bon, je te laisse gérer."
- Tu ne dois pas reprendre le lead.

PHASE 3 — EXÉCUTION
- Tu dois partir du principe que le joueur est responsable de l'exécution.
- Si le joueur dit qu'il rédige / envoie le mail, tu réagis comme un collègue qui suit la situation.
- Tu peux dire ce que toi tu fais en parallèle, mais sans reprendre le pilotage du dossier.
- Tu ne fais pas une liste sans fin de vérifications.

PHASE 4 — REBOND
- Tu réagis à l'évolution du dossier.
- Tu peux relancer sur une zone d'incertitude concrète.
- Tu peux signaler une pression réelle.
- Mais tu n'écrases pas le joueur sous des micro-consignes.

EXEMPLES D'INTENTIONS CORRECTES :
- "Tu peux regarder si tu comprends ce message ?"
- "Ok, donc le vrai sujet c'est le visa et le risque à l'arrivée, c'est bien ça ?"
- "D'accord. Si tu as les éléments, je te laisse gérer la suite."
- "Ça me paraît tenir. Dis-moi juste ce que tu envoies précisément."
- "Ok, je peux appeler si tu veux, mais c'est toi qui pilotes."
- "Je suis en route, tiens-moi au courant dès que tu as un retour."

EXEMPLES D'INTENTIONS INTERDITES :
- "As-tu pensé à A ? As-tu pensé à B ? As-tu pensé à C ?"
- "Je vais te guider étape par étape."
- "Bravo, très bonne réponse, voici maintenant ce qu'il faut faire."
- "Tu aurais dû savoir cela."
- "Fais 1, puis 2, puis 3, puis 4."
- "Je reprends la main."

TA MISSION FINALE :
Répondre comme un collègue crédible qui aide à faire émerger l'autonomie du joueur dans une situation réelle, sans lui voler son rôle ni le laisser dans un flou injuste.

Réponds UNIQUEMENT avec la réplique de Romain, en texte brut.
`);
    const roleplayResponse = await client.responses.create({
      model: "gpt-4.1-mini",
      input: roleplayPrompt,
    });

    const reply =
      sanitize(roleplayResponse.output_text || "").trim() ||
      `Je ne suis pas sur de te suivre, ${playerName}. Reprends-moi le probleme clairement.`;

    const evaluationPrompt = sanitize(`
You are a VERY STRICT evaluator of a professional serious game.

Your task:
evaluate ONLY the player's last chat message.

IMPORTANT:
- Do NOT evaluate emails.
- Do NOT evaluate attachments.
- Evaluate only the LAST player message.

PHASE:
- Title: ${phaseTitle}
- Objective: ${phaseObjective}
- Instruction: ${phasePrompt}

CRITERIA:
${sanitize(JSON.stringify(criteria, null, 2))}

LAST PLAYER MESSAGE:
${message}

RULES:
- Validate a criterion only if it is explicit.
- If it is vague or implicit: DO NOT VALIDATE.
- Maximum 2 validated criteria.
- If the message is vague or not operational: score_delta = 0.

Return STRICT JSON:
{
  "matched_criteria": ["criterion_id_1"],
  "score_delta": 1,
  "flags_to_set": {
    "flag_name": true
  }
}
`);

    const evalResponse = await client.responses.create({
      model: "gpt-4.1-mini",
      input: evaluationPrompt,
    });

    let evaluation: {
      matched_criteria?: string[];
      score_delta?: number;
      flags_to_set?: Record<string, boolean>;
    } = {};

    try {
      evaluation = JSON.parse(evalResponse.output_text?.trim() || "{}");
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

    return Response.json({
      reply,
      matched_criteria: matchedCriteria,
      score_delta: scoreDelta,
      flags_to_set: flagsToSet,
    });
  } catch (error: any) {
    console.error("Erreur chat route:", error);
    return Response.json(
      {
        error: s(error?.message, "Erreur cote serveur IA"),
      },
      { status: 500 }
    );
  }
}
