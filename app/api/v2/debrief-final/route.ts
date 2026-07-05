import { NextResponse } from "next/server";
import OpenAI from "openai";

/**
 * POST /api/v2/debrief-final — LE bilan unifié du joueur, écrit à 100% par
 * l'IA à partir des pré-analyses mesurées de toute la session.
 *
 * Règles absolues :
 *   - le joueur croit à UNE seule analyse d'un bloc : on ne révèle JAMAIS
 *     les « mécaniques », « phases », « outils » ni aucun vocabulaire du
 *     moteur de jeu ;
 *   - ce qui n'a pas de donnée n'est pas mentionné (aucune pénalité pour un
 *     outil non utilisé) ;
 *   - ton de coach, exemples concrets, plusieurs approches valides.
 */

interface Body {
  scenario: { title: string; objective: string; competencies: string[] };
  signals: Record<string, unknown>;
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY manquant" }, { status: 500 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (!body?.signals || Object.keys(body.signals).length === 0) {
    return NextResponse.json({ error: "aucune donnée à analyser" }, { status: 400 });
  }

  const compHint = body.scenario.competencies?.length
    ? `Axes de compétences suggérés : ${body.scenario.competencies.join(", ")}.`
    : `Choisis 5 à 7 axes de compétences transversales pertinents (ex. analyse, décision, communication, organisation, rigueur, relationnel, créativité).`;

  const system = [
    `Tu es un COACH qui rédige le bilan de performance d'un joueur après une simulation professionnelle.`,
    `Tu écris pour le joueur, à la deuxième personne, avec bienveillance et franchise.`,
    ``,
    `RÈGLES ABSOLUES :`,
    `- Écris UN bilan unique et fluide, comme si tu avais tout observé d'un seul tenant.`,
    `- N'utilise JAMAIS les mots "mécanique", "phase", "outil d'analyse", "module", ni aucun jargon technique du jeu.`,
    `- Ne mentionne QUE ce qui est présent dans les données. Ne dis jamais qu'une chose "n'a pas été faite/utilisée" si elle est simplement absente des données.`,
    `- Appuie-toi sur des EXEMPLES concrets tirés des données (une question posée, une décision, une formulation…).`,
    `- Ne désigne pas une seule bonne manière de faire ; reconnais plusieurs approches valides.`,
    ``,
    `Rends UNIQUEMENT un JSON strict :`,
    `- "competencies": 5 à 7 objets {"label","score" (0-100)} — n'évalue que ce que les données permettent de juger.`,
    `- "summary": un paragraphe d'ouverture (3-4 phrases) qui donne ton impression générale.`,
    `- "wentWell": 3 à 5 points {"point","example"} — ce qui a bien fonctionné, avec un exemple concret.`,
    `- "wentLess": 3 à 5 points {"point","example"} — ce qui peut progresser, avec un exemple concret.`,
    `- "recommendations": 2 à 4 conseils actionnables (chaînes).`,
  ].join("\n");

  const user = `MISSION : ${body.scenario.title}\nOBJECTIF : ${body.scenario.objective || "(non précisé)"}\n\n${compHint}\n\nDONNÉES MESURÉES SUR LA SESSION (usage interne, ne pas citer les catégories telles quelles) :\n${JSON.stringify(body.signals, null, 1)}`;

  let raw = "{}";
  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 1800,
      temperature: 0.3,
      response_format: { type: "json_object" },
    });
    raw = completion.choices[0]?.message?.content ?? "{}";
  } catch {
    return NextResponse.json({ error: "Analyse IA indisponible" }, { status: 502 });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const points = (v: unknown): { point: string; example: string }[] =>
    Array.isArray(v)
      ? (v as Record<string, unknown>[]).filter((x) => typeof x?.point === "string").map((x) => ({ point: x.point as string, example: str(x.example) }))
      : [];
  const competencies = Array.isArray(parsed.competencies)
    ? (parsed.competencies as Record<string, unknown>[])
        .filter((c) => typeof c?.label === "string" && typeof c?.score === "number")
        .map((c) => ({ label: c.label as string, score: Math.max(0, Math.min(100, Math.round(c.score as number))) }))
        .slice(0, 8)
    : [];

  return NextResponse.json({
    competencies,
    summary: str(parsed.summary),
    wentWell: points(parsed.wentWell),
    wentLess: points(parsed.wentLess),
    recommendations: strArr(parsed.recommendations),
    meta: { model: "gpt-4.1-mini", at: new Date().toISOString() },
  });
}
