import OpenAI from "openai";

function s(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

/** Replace ALL non-ASCII characters that could break ByteString encoding.
 *  Keeps standard Latin-1 supplement (accents, ñ, etc.) but replaces
 *  anything above U+00FF and common problematic chars. */
function sanitize(input: string): string {
  return input
    .replace(/[\u2018\u2019\u02BC]/g, "'") // curly single quotes + modifier apostrophe
    .replace(/[\u201C\u201D]/g, '"') // curly double quotes
    .replace(/[\u2013\u2014]/g, "-") // en/em dashes
    .replace(/\u2026/g, "...") // ellipsis
    .replace(/\u00A0/g, " ") // non-breaking space
    .replace(/[\u200B-\u200F\uFEFF]/g, ""); // zero-width chars + BOM
}

/** Interpolate variables in a template string.
 *  Supports both {{variable}} and {{object.property}} syntax.
 */
function interpolatePrompt(
  template: string,
  variables: Record<string, any>
): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path: string) => {
    const parts = path.split(".");
    let value: any = variables;
    for (const part of parts) {
      if (value == null || typeof value !== "object") return match;
      value = value[part];
    }
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "object") return JSON.stringify(value, null, 2);
    return String(value);
  });
}

/** Generic fallback prompt for AI character responses */
function getGenericFallbackPrompt(playerName: string): string {
  return sanitize(`
You are a credible colleague in a professional simulation.

Player: ${playerName}

IMPORTANT:
- Do NOT roleplay as the player.
- Stay in character as a realistic colleague.
- Help the player reason through problems.
- Delegate decisions back to the player after clarifying the situation.
- Keep responses concise (1-4 sentences typically).
- Be professional, natural, and credible.

FINAL INSTRUCTION:
Respond ONLY with your character's dialogue in plain text.
`);
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

    // Extract and sanitize standard fields
    const playerName = sanitize(s(body?.playerName, "Player")).trim() || "Player";
    const message = sanitize(s(body?.message, ""));
    const phaseTitle = sanitize(s(body?.phaseTitle, ""));
    const phaseObjective = sanitize(s(body?.phaseObjective, ""));
    const phaseFocus = sanitize(s(body?.phaseFocus, ""));
    const phasePrompt = sanitize(s(body?.phasePrompt, ""));
    const mode = sanitize(s(body?.mode, "guided"));
    const roleplayPromptTemplate = s(body?.roleplayPrompt, "");

    const narrative =
      body?.narrative && typeof body.narrative === "object" ? body.narrative : {};
    const recentConversation = Array.isArray(body?.recentConversation)
      ? body.recentConversation
      : [];
    const criteria = Array.isArray(body?.criteria) ? body.criteria : [];

    // Build mode-specific guidance
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

    // Build or use roleplay prompt
    let finalRoleplayPrompt: string;

    if (roleplayPromptTemplate) {
      // Interpolate variables in the provided template
      const variables = {
        playerName,
        phaseTitle,
        phaseObjective,
        phaseFocus,
        phasePrompt,
        narrative: narrative,
        mode,
        modeGuidance,
        recentConversation,
        message,
      };
      finalRoleplayPrompt = sanitize(
        interpolatePrompt(roleplayPromptTemplate, variables)
      );

      // Inject strict phase focus constraint if defined
      if (phaseFocus) {
        finalRoleplayPrompt += `\n\n=== CONTRAINTE DE PHASE (OBLIGATOIRE) ===\nTu es actuellement dans la phase : "${phaseTitle}"\nFOCUS STRICT : ${phaseFocus}\n\nTu dois STRICTEMENT rester sur ce sujet.\nTu n'as pas le droit :\n- d'anticiper les phases suivantes\n- de parler de sujets non liés à cette phase\n- de mentionner des décisions futures ou des étapes à venir\nToute réponse hors sujet est interdite. Si le joueur aborde un sujet hors périmètre, ramène-le poliment mais fermement au sujet de cette phase.\n=== FIN CONTRAINTE ===`;
      }
    } else {
      // Use generic fallback
      finalRoleplayPrompt = getGenericFallbackPrompt(playerName);
    }

    const roleplayResponse = await client.responses.create({
      model: "gpt-4.1-mini",
      input: finalRoleplayPrompt,
    });

    const reply =
      sanitize(roleplayResponse.output_text || "").trim() ||
      `I'm not sure I'm following you, ${playerName}. Can you clarify?`;

    // Build evaluation prompt — lightweight scoring to allow phase progression
    const evaluationPrompt = sanitize(`
You are an evaluator of a professional serious game. Quick evaluation only.

PHASE: ${phaseTitle}
OBJECTIVE: ${phaseObjective}${phaseFocus ? `\nPHASE FOCUS (strict scope): ${phaseFocus}\nOnly evaluate competencies related to this phase scope. Ignore off-topic content.` : ""}

COMPETENCIES for this phase:
${sanitize(JSON.stringify(criteria, null, 2))}

RECENT CONVERSATION:
${sanitize(JSON.stringify(recentConversation.slice(-6), null, 2))}

LAST PLAYER MESSAGE:
${message}

Evaluate how many competencies (0-3) the player demonstrates in their last message.
Consider conversation context. Be fair, not harsh.

Return STRICT JSON only:
{
  "matched_criteria": ["competency text 1"],
  "score_delta": 1,
  "flags_to_set": {}
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
      ? evaluation.matched_criteria.slice(0, 3)
      : [];

    const flagsToSet =
      evaluation.flags_to_set && typeof evaluation.flags_to_set === "object"
        ? Object.fromEntries(
            Object.entries(evaluation.flags_to_set).filter(
              ([, value]) => value === true
            )
          )
        : {};

    // score_delta must always equal the number of matched criteria (1 point per criterion)
    const scoreDelta =
      typeof evaluation.score_delta === "number" && evaluation.score_delta >= 0
        ? Math.max(evaluation.score_delta, matchedCriteria.length)
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
