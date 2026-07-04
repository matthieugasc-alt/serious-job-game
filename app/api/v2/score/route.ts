import { NextResponse } from "next/server";
import OpenAI from "openai";

/**
 * POST /api/v2/score — notation IA générique d'un mail contre un brief.
 *
 * Chantier C (scoring à seuil). Route 100% GÉNÉRIQUE : aucun contenu
 * scénario, aucune branche métier. Le brief de notation vient du step
 * (`scoring.brief`), le mail vient du joueur, l'échelle est déclarée.
 *
 *   entrée : { mail: {to?, subject, body}, scoring_brief, scale }
 *   sortie : { score, rationale, meta } — JSON strict, gpt-4.1-mini,
 *            température 0, score borné à [0, scale].
 *
 * Le score est journalisé dans la session (mailScores) et lu par les
 * triggers mail_scored / mail_scored_below. Il n'est JAMAIS montré au
 * joueur — la réponse du monde passe par les events des exits.
 */

interface Body {
  mail: { to?: string[]; subject: string; body: string };
  scoring_brief: string;
  scale?: number;
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY manquant" }, { status: 500 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (
    typeof body?.scoring_brief !== "string" ||
    body.scoring_brief.length === 0 ||
    typeof body?.mail?.body !== "string"
  ) {
    return NextResponse.json(
      { error: "mail.body et scoring_brief requis" },
      { status: 400 },
    );
  }

  const scale =
    typeof body.scale === "number" && body.scale > 0 ? body.scale : 10;

  const system = [
    `Tu es un ÉVALUATEUR froid et factuel dans une simulation professionnelle.`,
    `On te donne un BRIEF DE NOTATION et un MAIL écrit par le joueur.`,
    `Ta seule tâche : noter le mail contre le brief, sur une échelle de 0 à ${scale}.`,
    ``,
    `Règles absolues :`,
    `- Tu notes UNIQUEMENT ce que le brief demande de noter. Rien d'autre.`,
    `- 0 = le mail ne satisfait rien du brief ; ${scale} = il satisfait tout, excellemment.`,
    `- Sois exigeant et constant : le même mail doit toujours recevoir la même note.`,
    `- Le score est un nombre entier entre 0 et ${scale}.`,
    `- Réponds UNIQUEMENT en JSON strict : {"score": <entier>, "rationale": "<une ou deux phrases>"}`,
  ].join("\n");

  const to = Array.isArray(body.mail.to) && body.mail.to.length > 0
    ? `À : ${body.mail.to.join(", ")}\n`
    : "";
  const user =
    `BRIEF DE NOTATION (échelle 0–${scale}) :\n${body.scoring_brief}\n\n` +
    `MAIL DU JOUEUR :\n${to}Objet : ${body.mail.subject ?? ""}\n\n${body.mail.body}`;

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: 300,
    temperature: 0,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: { score?: unknown; rationale?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  // Borne défensive : un score hors échelle ou non numérique vaut 0.
  const numeric = Number(parsed.score);
  const score = Number.isFinite(numeric)
    ? Math.max(0, Math.min(scale, numeric))
    : 0;
  const rationale = typeof parsed.rationale === "string" ? parsed.rationale : "";

  return NextResponse.json({
    score,
    rationale,
    meta: { model: "gpt-4.1-mini", scale, at: new Date().toISOString() },
  });
}
