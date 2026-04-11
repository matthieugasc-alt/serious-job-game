import OpenAI from "openai";

/**
 * Lightweight presentation evaluation endpoint.
 * Only does scoring — no roleplay response needed.
 * Much faster than the full /api/chat route.
 */

function s(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function sanitize(input: string): string {
  return input
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B-\u200F\uFEFF]/g, "");
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "OPENAI_API_KEY manquante" }, { status: 500 });
    }

    const client = new OpenAI({ apiKey });
    const body = await req.json();

    const transcript = sanitize(s(body?.transcript, "")).trim();
    const phaseTitle = sanitize(s(body?.phaseTitle, ""));
    const phaseObjective = sanitize(s(body?.phaseObjective, ""));
    const criteria = Array.isArray(body?.criteria) ? body.criteria : [];

    if (!transcript) {
      return Response.json({
        reply: "Aucune transcription détectée.",
        matched_criteria: [],
        score_delta: 0,
        flags_to_set: {},
      });
    }

    // Single fast evaluation — no roleplay needed
    const evaluationPrompt = sanitize(`Évalue rapidement cette présentation orale dans un serious game.

PHASE: ${phaseTitle}
OBJECTIF: ${phaseObjective}

CRITÈRES D'ÉVALUATION:
${sanitize(JSON.stringify(criteria, null, 2))}

TRANSCRIPTION DE LA PRÉSENTATION DU JOUEUR:
${transcript.slice(0, 2000)}

Évalue combien de critères (0-${criteria.length}) le joueur démontre dans sa présentation.
Sois juste et bienveillant. Donne aussi un bref feedback constructif en français (2-3 phrases max).

Retourne UNIQUEMENT du JSON valide:
{
  "feedback": "Ton feedback constructif ici en français",
  "matched_criteria": ["critère 1", "critère 2"],
  "score_delta": 2,
  "flags_to_set": {}
}`);

    const evalResponse = await client.responses.create({
      model: "gpt-4.1-mini",
      input: evaluationPrompt,
    });

    let evaluation: any = {};
    try {
      const text = evalResponse.output_text?.trim() || "{}";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      evaluation = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      evaluation = { feedback: "Évaluation en cours.", matched_criteria: [], score_delta: 0, flags_to_set: {} };
    }

    const matchedCriteria = Array.isArray(evaluation.matched_criteria)
      ? evaluation.matched_criteria.slice(0, criteria.length)
      : [];

    const scoreDelta = typeof evaluation.score_delta === "number" && evaluation.score_delta >= 0
      ? Math.max(evaluation.score_delta, matchedCriteria.length)
      : matchedCriteria.length;

    const feedback = typeof evaluation.feedback === "string" ? evaluation.feedback : "Présentation évaluée.";

    return Response.json({
      reply: feedback,
      matched_criteria: matchedCriteria,
      score_delta: scoreDelta,
      flags_to_set: evaluation.flags_to_set || {},
    });
  } catch (error: any) {
    console.error("Erreur évaluation présentation:", error);
    return Response.json({ error: s(error?.message, "Erreur serveur") }, { status: 500 });
  }
}
