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
  /** Garde-fous durs déjà déclenchés (fautes éliminatoires observées :
   *  contradiction avec les données, irrespect…). Non vide ⇒ Défaite. */
  garde_fous?: string[];
}

const VERDICTS = ["victoire_complete", "victoire_partielle", "defaite"] as const;

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

  const gardeFous = (body.garde_fous ?? []).filter((s) => typeof s === "string" && s.trim());

  const system = [
    `Tu es à la fois le JUGE et le COACH d'un joueur après une simulation professionnelle.`,
    `Tu écris pour le joueur, à la deuxième personne, avec bienveillance et franchise.`,
    ``,
    `DOCTRINE D'ÉVALUATION (fondamentale) :`,
    `- Tu évalues avant tout la QUALITÉ DE LA DÉMARCHE (raisonnement, méthode, exploitation des données, structure, mobilisation des bons interlocuteurs), presque JAMAIS le fait d'avoir trouvé "LA bonne réponse".`,
    `- Une démarche solide qui n'aboutit PAS à l'action canonique reste une réussite de la démarche : au pire une VICTOIRE PARTIELLE, jamais une défaite.`,
    `- Tu juges DEUX dimensions distinctes : la DÉMARCHE (prioritaire) et le RÉSULTAT (la substance des conclusions/actions tient-elle).`,
    ``,
    `VERDICT — choisis exactement un niveau parmi : "victoire_complete", "victoire_partielle", "defaite".`,
    `- "victoire_complete" : démarche solide ET résultat juste.`,
    `- "victoire_partielle" : démarche correcte mais résultat incomplet/imparfait (c'est le cas par défaut d'un raisonnement honnête qui n'a pas tout trouvé).`,
    `- "defaite" : démarche faible/absente, OU un garde-fou dur signalé ci-dessous.`,
    gardeFous.length
      ? `- GARDE-FOUS DURS DÉCLENCHÉS (fautes éliminatoires) : ${gardeFous.join(" ; ")}. → le verdict est OBLIGATOIREMENT "defaite", et tu l'expliques franchement.`
      : `- Aucun garde-fou dur déclenché : ne prononce "defaite" que si la démarche est réellement faible.`,
    ``,
    `RÈGLES DE RÉDACTION :`,
    `- Écris UN bilan unique et fluide, comme si tu avais tout observé d'un seul tenant.`,
    `- N'utilise JAMAIS les mots "mécanique", "phase", "outil d'analyse", "module", "critère", "garde-fou", ni aucun jargon technique du jeu.`,
    `- Ne mentionne QUE ce qui est présent dans les données. Ne dis jamais qu'une chose "n'a pas été faite" si elle est simplement absente des données.`,
    `- Appuie-toi sur des EXEMPLES concrets tirés des données.`,
    `- Le récit doit être COHÉRENT avec le verdict : ne présente jamais comme une réussite ce qui a fait échouer, et inversement.`,
    ``,
    `Rends UNIQUEMENT un JSON strict :`,
    `- "verdict": une des trois valeurs ci-dessus.`,
    `- "noteDemarche": entier 0-100 (qualité du raisonnement/méthode).`,
    `- "noteResultat": entier 0-100 (justesse de la substance produite).`,
    `- "competencies": 5 à 7 objets {"label","score" (0-100)} — n'évalue que ce que les données permettent de juger.`,
    `- "summary": un paragraphe d'ouverture (3-4 phrases) qui donne ton impression générale et justifie le verdict.`,
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

  const clampNote = (v: unknown): number | undefined =>
    typeof v === "number" && isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : undefined;
  // Verdict IA, avec garde-fou dur déterministe : une faute éliminatoire
  // observée force la Défaite quoi qu'en dise le modèle.
  let verdict = (VERDICTS as readonly string[]).includes(str(parsed.verdict))
    ? (str(parsed.verdict) as (typeof VERDICTS)[number])
    : "victoire_partielle";
  if (gardeFous.length > 0) verdict = "defaite";

  return NextResponse.json({
    verdict,
    noteDemarche: clampNote(parsed.noteDemarche),
    noteResultat: clampNote(parsed.noteResultat),
    competencies,
    summary: str(parsed.summary),
    wentWell: points(parsed.wentWell),
    wentLess: points(parsed.wentLess),
    recommendations: strArr(parsed.recommendations),
    meta: { model: "gpt-4.1-mini", at: new Date().toISOString() },
  });
}
