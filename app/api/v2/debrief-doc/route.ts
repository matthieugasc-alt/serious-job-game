import { NextResponse } from "next/server";
import OpenAI from "openai";

/**
 * POST /api/v2/debrief-doc — analyse PÉDAGOGIQUE post-scénario de la
 * mécanique Analyse / Synthèse documentaire. N'existe qu'APRÈS la partie.
 *
 * Reçoit une vue compacte du travail du joueur (sources lues, notes,
 * décisions, usage des outils) et retourne : carte des preuves, chemin de
 * raisonnement, synthèse (forces/axes/outils sous-utilisés). Aucune
 * décision de jeu ici.
 */

const CONF = ["faible", "moyenne", "forte"] as const;

interface Body {
  sources: { title: string; readDepth: string }[];
  notes: { title: string; text: string }[];
  decisions: { title: string; conclusion: string }[];
  toolUsage?: Record<string, number>;
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

  const sourcesBlock =
    (body.sources ?? []).map((s) => `- ${s.title} (${s.readDepth})`).join("\n") || "(aucune source)";
  const notesBlock =
    (body.notes ?? []).map((n) => `• ${n.title || "(note)"} : ${n.text}`).join("\n") || "(aucune note)";
  const decisionsBlock =
    (body.decisions ?? []).map((d) => `• ${d.title} → ${d.conclusion || "(pas de conclusion)"}`).join("\n") ||
    "(aucune décision)";
  const usageBlock = body.toolUsage ? JSON.stringify(body.toolUsage) : "{}";

  const system = [
    `Tu es un COACH pédagogique qui analyse APRÈS coup le travail d'analyse documentaire d'un joueur.`,
    `Tu es factuel et bienveillant. Tu n'attribues pas de note.`,
    ``,
    `Rends UNIQUEMENT un JSON strict :`,
    `- "evidence": pour chaque conclusion/décision, {"conclusion","sources":[titres],"confidence" dans ${JSON.stringify(CONF)}}.`,
    `- "reasoning": un paragraphe court reconstituant le chemin intellectuel jusqu'à la décision.`,
    `- "synthesis": {"strengths":[...],"improvements":[...],"recommendations":[...],"underusedTools":[...]} (phrases courtes).`,
  ].join("\n");

  const user = `SOURCES LUES :\n${sourcesBlock}\n\nNOTES DU JOUEUR :\n${notesBlock}\n\nDÉCISIONS / CONCLUSIONS :\n${decisionsBlock}\n\nUSAGE DES OUTILS :\n${usageBlock}`;

  let raw = "{}";
  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 1100,
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

  const cset = new Set<string>(CONF);
  const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

  const evidence = Array.isArray(parsed.evidence)
    ? (parsed.evidence as Record<string, unknown>[])
        .filter((e) => typeof e?.conclusion === "string")
        .map((e) => ({
          conclusion: e.conclusion as string,
          sources: strArr(e.sources),
          confidence: typeof e.confidence === "string" && cset.has(e.confidence) ? (e.confidence as string) : "moyenne",
        }))
    : [];

  const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning : "";
  const syn = (parsed.synthesis ?? {}) as Record<string, unknown>;
  const synthesis = {
    strengths: strArr(syn.strengths),
    improvements: strArr(syn.improvements),
    recommendations: strArr(syn.recommendations),
    underusedTools: strArr(syn.underusedTools),
  };

  return NextResponse.json({
    evidence,
    reasoning,
    synthesis,
    meta: { model: "gpt-4.1-mini", at: new Date().toISOString() },
  });
}
