import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function s(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function ascii(input: string) {
  return input
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x00-\x7F]/g, (ch) => {
      const map: Record<string, string> = {
        e: "e",
        E: "E",
        a: "a",
        A: "A",
        i: "i",
        I: "I",
        o: "o",
        O: "O",
        u: "u",
        U: "U",
        c: "c",
        C: "C",
      };
      return map[ch] || "";
    });
}

function safeJsonResponse(payload: any, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export async function POST(req: Request) {
  try {
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
- You reply only as Romain, never as narrator, coach or evaluator.

IDENTITY OF ROMAIN:
- serious colleague
- under time pressure
- credible
- operational
- not omniscient
- not stupid
- not caricatural
- not a teacher
- not an evaluator

FORBIDDEN:
- You are not a general assistant.
- Do not invent any other universe.
- Never give the complete solution.
- Never list the perfect plan.
- Never restate the whole situation cleanly in place of the player.
- Do not act like a consultant.
- Do not grade the player.
- Do not speak on behalf of the consulate, border police or Claudia unless the scenario explicitly shows their message.

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

BEHAVIOR RULES:
- Reply like a credible human colleague.
- If ${playerName} is off topic, reframe briefly.
- If ${playerName} says something absurd, show you do not follow, without solving it for them.
- You may ask one good question.
- You may remind the urgency.
- You may express realistic doubt.
- You may ask for more precision.
- You must never be too brilliant or too stupid.
- Reply in 1 to 3 sentences generally.
- Tone: natural, spoken, professional.
- Avoid repeating exactly what you already said.
- Do not give pedagogical evaluation.
- If the player says only "ok", "yes", "done", or something too vague, ask what was done exactly.

Return ONLY Romain's line in plain text.
`);

    const roleplayResponse = await client.responses.create({
      model: "gpt-4.1-mini",
      input: roleplayPrompt,
    });

    const reply =
      ascii(roleplayResponse.output_text?.trim() || "") ||
      `I am not sure I follow you, ${playerName}. Rephrase the problem clearly.`;

    const strictEvaluationPrompt = ascii(`
You are a VERY STRICT evaluator of a professional serious game.

Your task:
evaluate ONLY the player's last chat message.

IMPORTANT:
- Do NOT evaluate emails.
- Do NOT evaluate attachments.
- Do NOT evaluate overall intent.
- Do NOT evaluate the overall quality of the session.
- Evaluate only the LAST player message below.

Ignore:
- Romain's reply
- supposed player intention
- whether the player seems to have understood
- the history if the last message is not explicit enough

PHASE:
- Title: ${phaseTitle}
- Objective: ${phaseObjective}
- Instruction: ${phasePrompt}

CRITERIA:
${ascii(JSON.stringify(criteria, null, 2))}

LAST PLAYER MESSAGE:
${message}

EVALUATION RULES:
- Validate a criterion only if it is explicit or very clearly formulated.
- If vague, implicit, approximate, ambiguous or merely suggested: DO NOT VALIDATE.
- No points for partial intuition.
- No points for overly general wording.
- No points just because the overall idea is good.
- If the player mixes several ideas without precision, validate only what is clearly stated.
- Be conservative.
- The score should be hard to obtain.
- At most 2 validated criteria in one message.
- If the message is like "ok", "yes", "done", "I have everything", "I got it", without explicit business content, score_delta = 0.

Return STRICT JSON only:
{
  "matched_criteria": ["criterion_id_1"],
  "score_delta": 1,
  "flags_to_set": {
    "flag_name": true
  }
}
`);

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
      ? evaluation.matched_criteria.slice(0, 2).map((x) => ascii(String(x)))
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
        error: ascii(
          s(error?.message) ||
            s(error?.error?.message) ||
            "Erreur cote serveur IA"
        ),
      },
      500
    );
  }
}