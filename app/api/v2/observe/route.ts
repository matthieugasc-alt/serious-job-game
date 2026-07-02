import { NextResponse } from "next/server";
import OpenAI from "openai";

/**
 * POST /api/v2/observe — observation IA des critères d'un step.
 *
 * L'IA OBSERVE, LE MOTEUR DÉCIDE (côté client/moteur via
 * applyStepObservation). Cette route :
 *   - reçoit les critères déclaratifs (descriptions incluses — severity,
 *     competencies, error_type guident l'attention de l'observateur),
 *   - reçoit le transcript et les artefacts produits,
 *   - retourne UNIQUEMENT { criteria: {id: bool}, evidence: {id: string} }.
 * Aucune décision, aucun score, aucune branche scénario.
 */

interface CriterionBody {
  id: string;
  description: string;
  expected?: boolean;
  severity?: string;
  competencies?: string[];
  error_type?: string;
}

interface Body {
  criteria: CriterionBody[];
  transcript: { channel: string; role: string; actor_id?: string; content: string }[];
  artifacts?: Record<string, unknown> | null;
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
  if (!Array.isArray(body?.criteria) || body.criteria.length === 0) {
    return NextResponse.json({ error: "criteria requis" }, { status: 400 });
  }

  const criteriaBlock = body.criteria
    .map((c) => {
      const hints: string[] = [];
      if (c.severity) hints.push(`sévérité: ${c.severity}`);
      if (c.competencies?.length) hints.push(`compétences: ${c.competencies.join(", ")}`);
      if (c.error_type) hints.push(`famille d'erreur: ${c.error_type}`);
      return `- "${c.id}" : ${c.description}${hints.length ? ` (${hints.join(" · ")})` : ""}`;
    })
    .join("\n");

  const transcriptBlock =
    (body.transcript ?? [])
      .map((e) => `[${e.channel}] ${e.role}${e.actor_id ? ` (${e.actor_id})` : ""}: ${e.content}`)
      .join("\n") || "(transcript vide)";

  const artifactsBlock = body.artifacts
    ? `\n\nARTEFACTS PRODUITS PAR LE JOUEUR:\n${JSON.stringify(body.artifacts, null, 2)}`
    : "";

  const system = [
    `Tu es un OBSERVATEUR froid et factuel d'une simulation professionnelle.`,
    `Ta seule tâche : pour chaque critère listé, observer s'il est factuellement`,
    `présent (true) ou absent (false) dans le transcript et les artefacts.`,
    ``,
    `Règles absolues :`,
    `- Tu OBSERVES. Tu ne juges pas, tu ne notes pas, tu ne décides pas si l'étape est réussie.`,
    `- true = le comportement/élément décrit par le critère est observable. false = il ne l'est pas.`,
    `- Un critère de sévérité "critical" décrit une faute : true seulement si la faute a réellement eu lieu.`,
    `- Fournis pour chaque critère une justification d'une phrase (evidence), citation à l'appui si possible.`,
    `- Réponds UNIQUEMENT en JSON strict : {"criteria": {"<id>": bool, ...}, "evidence": {"<id>": "…", ...}}`,
  ].join("\n");

  const user = `CRITÈRES À OBSERVER:\n${criteriaBlock}\n\nTRANSCRIPT:\n${transcriptBlock}${artifactsBlock}`;

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: 900,
    temperature: 0,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: { criteria?: Record<string, boolean>; evidence?: Record<string, string> };
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  // Filtre défensif : on ne retourne que les critères déclarés, en booléens stricts.
  const declared = new Set(body.criteria.map((c) => c.id));
  const criteria: Record<string, boolean> = {};
  for (const [id, v] of Object.entries(parsed.criteria ?? {})) {
    if (declared.has(id)) criteria[id] = v === true;
  }
  const evidence: Record<string, string> = {};
  for (const [id, v] of Object.entries(parsed.evidence ?? {})) {
    if (declared.has(id) && typeof v === "string") evidence[id] = v;
  }

  return NextResponse.json({
    criteria,
    evidence,
    meta: { model: "gpt-4.1-mini", at: new Date().toISOString() },
  });
}
