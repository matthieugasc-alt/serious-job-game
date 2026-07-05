import { NextResponse } from "next/server";
import OpenAI from "openai";

/**
 * POST /api/v2/debrief-analysis — analyse PÉDAGOGIQUE post-scénario d'un
 * entretien (mécanique Qualification). N'existe qu'APRÈS la partie.
 *
 * Reçoit le transcript (indexé), le référentiel de dimensions attendues et
 * la liste ordonnée des questions du joueur. Retourne une classification
 * structurée (types de questions, couverture, chronologie de découverte,
 * synthèse, commentaires de replay). Aucune décision de jeu ici.
 */

const QTYPES = ["ouverte", "fermée", "relance", "clarification", "orientée"] as const;
const COVERAGE = ["oui", "partiel", "non"] as const;
const DISCOVERY = ["à temps", "tard", "manquée"] as const;

interface Body {
  transcript: { role: string; actor_id?: string; content: string }[];
  rubric: { dimension: string; label: string }[];
  questions: { content: string }[];
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
  if (!Array.isArray(body?.rubric) || body.rubric.length === 0) {
    return NextResponse.json({ error: "rubric requis" }, { status: 400 });
  }

  const transcriptBlock =
    (body.transcript ?? [])
      .map((e, i) => `#${i} ${e.role}${e.actor_id ? ` (${e.actor_id})` : ""}: ${e.content}`)
      .join("\n") || "(transcript vide)";
  const rubricBlock = body.rubric.map((r) => `- "${r.dimension}" : ${r.label}`).join("\n");
  const questionsBlock = (body.questions ?? []).map((q, i) => `Q${i}: ${q.content}`).join("\n") || "(aucune)";

  const system = [
    `Tu es un COACH pédagogique qui analyse un entretien de qualification APRÈS coup.`,
    `Tu es factuel et bienveillant. Tu ne notes pas, tu observes et conseilles.`,
    ``,
    `Rends UNIQUEMENT un JSON strict avec ces clés :`,
    `- "questionTypes": tableau aligné sur la liste des questions (même ordre), chaque valeur dans ${JSON.stringify(QTYPES)}.`,
    `- "coverage": pour CHAQUE dimension du référentiel, {"dimension","covered" dans ${JSON.stringify(COVERAGE)},"evidence": une phrase}.`,
    `- "discovery": évènements clés {"dimension","label","status" dans ${JSON.stringify(DISCOVERY)},"excerpt"}.`,
    `- "synthesis": {"strengths":[...],"improvements":[...],"recommendations":[...]} (phrases courtes, concrètes).`,
    `- "replayComments": commentaires ponctuels {"index": numéro #… du transcript,"text": conseil d'une phrase}. Max 6.`,
  ].join("\n");

  const user = `RÉFÉRENTIEL (dimensions attendues) :\n${rubricBlock}\n\nQUESTIONS DU JOUEUR (ordre) :\n${questionsBlock}\n\nTRANSCRIPT INDEXÉ :\n${transcriptBlock}`;

  let raw = "{}";
  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 1200,
      temperature: 0,
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

  // Filtres défensifs : on ne laisse passer que des valeurs attendues.
  const qset = new Set<string>(QTYPES);
  const cset = new Set<string>(COVERAGE);
  const dset = new Set<string>(DISCOVERY);
  const dims = new Set(body.rubric.map((r) => r.dimension));
  const labelOf = new Map(body.rubric.map((r) => [r.dimension, r.label]));

  const questionTypes = Array.isArray(parsed.questionTypes)
    ? (parsed.questionTypes as unknown[]).map((v) => (typeof v === "string" && qset.has(v) ? v : null))
    : [];

  const coverage = Array.isArray(parsed.coverage)
    ? (parsed.coverage as Record<string, unknown>[])
        .filter((c) => typeof c?.dimension === "string" && dims.has(c.dimension) && typeof c?.covered === "string" && cset.has(c.covered))
        .map((c) => ({ dimension: c.dimension as string, covered: c.covered as string, evidence: typeof c.evidence === "string" ? c.evidence : undefined }))
    : [];

  const discovery = Array.isArray(parsed.discovery)
    ? (parsed.discovery as Record<string, unknown>[])
        .filter((d) => typeof d?.dimension === "string" && dims.has(d.dimension) && typeof d?.status === "string" && dset.has(d.status))
        .map((d) => ({
          at: null,
          dimension: d.dimension as string,
          label: labelOf.get(d.dimension as string) ?? (d.dimension as string),
          status: d.status as string,
          excerpt: typeof d.excerpt === "string" ? d.excerpt : undefined,
        }))
    : [];

  const syn = (parsed.synthesis ?? {}) as Record<string, unknown>;
  const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const synthesis = { strengths: strArr(syn.strengths), improvements: strArr(syn.improvements), recommendations: strArr(syn.recommendations) };

  const replayComments = Array.isArray(parsed.replayComments)
    ? (parsed.replayComments as Record<string, unknown>[])
        .filter((c) => typeof c?.index === "number" && typeof c?.text === "string")
        .map((c) => ({ index: c.index as number, text: c.text as string }))
    : [];

  return NextResponse.json({
    questionTypes,
    coverage,
    discovery,
    synthesis,
    replayComments,
    meta: { model: "gpt-4.1-mini", at: new Date().toISOString() },
  });
}
