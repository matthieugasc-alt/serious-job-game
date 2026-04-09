function s(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function ascii(input: string) {
  return input
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00A0/g, " ");
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json(
        {
          error: "OPENAI_API_KEY manquante côté serveur.",
        },
        { status: 500 }
      );
    }

    const body = await req.json();

    const playerName = ascii(s(body?.playerName, "Joueur")).trim() || "Joueur";
    const message = ascii(s(body?.message, ""));
    const phaseTitle = ascii(s(body?.phaseTitle, ""));
    const phaseObjective = ascii(s(body?.phaseObjective, ""));
    const phasePrompt = ascii(s(body?.phasePrompt, ""));
    const mode = ascii(s(body?.mode, "guided"));
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

    const roleplayPrompt = ascii(`
You are ONLY Romain Dufresne, colleague of the player in a professional serious game.

The player is named: ${playerName}

IMPORTANT:
- You are not named ${playerName}.
- You are Romain Dufresne.
- If you address the player by name, use ${playerName}.
- Never confuse your identity with the player's.
- You reply only as Romain.

SCENARIO CONTEXT:
- Context: ${ascii(s((narrative as any)?.context, ""))}
- Mission: ${ascii(s((narrative as any)?.mission, ""))}
- Initial situation: ${ascii(s((narrative as any)?.initial_situation, ""))}
- Trigger: ${ascii(s((narrative as any)?.trigger, ""))}
- Background fact: ${ascii(s((narrative as any)?.background_fact, ""))}

INITIAL EVENTS:
${ascii(JSON.stringify(initialEvents, null, 2))}

CURRENT PHASE:
- Title: ${phaseTitle}
- Objective: ${phaseObjective}
- Instruction: ${phasePrompt}

${modeGuidance}

RECENT HISTORY:
${ascii(JSON.stringify(recentConversation, null, 2))}

LAST PLAYER MESSAGE (${playerName}):
${message}

RULES:
- Reply like a credible human colleague.
- If the player is off topic, reframe briefly.
- If the player says something absurd, show you do not follow, without solving it for them.
- You may ask one good question.
- You may remind the urgency.
- You never give the complete solution.
- Reply in 1 to 3 sentences.
- Tone: natural, spoken, professional.

Return ONLY Romain's reply in plain text.
`);

    const roleplayRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: roleplayPrompt,
      }),
    });

    const roleplayData = await roleplayRes.json();

    if (!roleplayRes.ok) {
      return Response.json(
        {
          error:
            roleplayData?.error?.message ||
            "Erreur OpenAI sur la réponse de Romain.",
        },
        { status: 500 }
      );
    }

    const reply = ascii(roleplayData?.output_text || "").trim() ||
      `Je ne suis pas sur de te suivre, ${playerName}. Reprends-moi le probleme clairement.`;

    const evaluationPrompt = ascii(`
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
${ascii(JSON.stringify(criteria, null, 2))}

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

    const evalRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: evaluationPrompt,
      }),
    });

    const evalData = await evalRes.json();

    let evaluation: {
      matched_criteria?: string[];
      score_delta?: number;
      flags_to_set?: Record<string, boolean>;
    } = {};

    if (evalRes.ok) {
      try {
        evaluation = JSON.parse(evalData?.output_text?.trim() || "{}");
      } catch {
        evaluation = {
          matched_criteria: [],
          score_delta: 0,
          flags_to_set: {},
        };
      }
    } else {
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
    return Response.json(
      {
        error: s(error?.message, "Erreur cote serveur IA"),
      },
      { status: 500 }
    );
  }
}