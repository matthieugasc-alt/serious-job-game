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
You are ONLY Romain Dufresne, colleague of the player in a professional serious game.

The player is named: ${playerName}

IMPORTANT:
- You are not named ${playerName}.
- You are Romain Dufresne.
- If you address the player by name, use ${playerName}.
- Never confuse your identity with the player's.
- You reply only as Romain.

SCENARIO CONTEXT:
- Context: ${sanitize(s((narrative as any)?.context, ""))}
- Mission: ${sanitize(s((narrative as any)?.mission, ""))}
- Initial situation: ${sanitize(s((narrative as any)?.initial_situation, ""))}
- Trigger: ${sanitize(s((narrative as any)?.trigger, ""))}
- Background fact: ${sanitize(s((narrative as any)?.background_fact, ""))}

INITIAL EVENTS:
${sanitize(JSON.stringify(initialEvents, null, 2))}

CURRENT PHASE:
- Title: ${phaseTitle}
- Objective: ${phaseObjective}
- Instruction: ${phasePrompt}

${modeGuidance}

RECENT HISTORY:
${sanitize(JSON.stringify(recentConversation, null, 2))}

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
