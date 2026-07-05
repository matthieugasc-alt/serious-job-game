import { NextResponse } from "next/server";
import OpenAI from "openai";

/**
 * POST /api/v2/debrief-brainstorm — analyse PÉDAGOGIQUE post-scénario de la
 * mécanique Créativité / Brainstorming. N'existe qu'APRÈS la partie.
 *
 * Reçoit les idées produites, le problème initial et la convergence.
 * Retourne : diversité, originalité, pertinence, exploration/fixation,
 * regroupement, qualité de la convergence, synthèse. Sans imposer une
 * méthode unique de créativité, sans dire que plus d'idées = mieux.
 */

interface Body {
  ideas: { text: string; color: string; author: string }[];
  brief: string;
  convergence: { tasks: number; decisions: number; options: number };
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

  const ideasBlock = (body.ideas ?? []).map((i, n) => `${n + 1}. [${i.color}] ${i.text}${i.author && i.author !== "player" ? ` (${i.author})` : ""}`).join("\n") || "(aucune idée)";
  const c = body.convergence ?? { tasks: 0, decisions: 0, options: 0 };

  const system = [
    `Tu es un COACH pédagogique qui analyse APRÈS coup une phase de brainstorming.`,
    `Tu n'imposes pas une méthode unique et tu ne dis jamais que plus d'idées = meilleure performance.`,
    ``,
    `Rends UNIQUEMENT un JSON strict :`,
    `- "qualitative": {"diversity","originality","relevance","exploration","grouping","convergenceQuality"} — une phrase chacun.`,
    `  (relevance = idées vs problème initial ; exploration = a-t-il divergé ou est-il resté fixé ; grouping = a-t-il structuré en familles.)`,
    `- "synthesis": {"strengths":[...],"improvements":[...],"methodsToTry":[...],"underusedTools":[...]}.`,
  ].join("\n");

  const user = `PROBLÈME INITIAL :\n${body.brief || "(non précisé)"}\n\nIDÉES PRODUITES :\n${ideasBlock}\n\nCONVERGENCE : ${c.tasks} tâches, ${c.options} options, ${c.decisions} décisions issues des idées.`;

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

  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const q = (parsed.qualitative ?? {}) as Record<string, unknown>;
  const syn = (parsed.synthesis ?? {}) as Record<string, unknown>;

  return NextResponse.json({
    qualitative: {
      diversity: str(q.diversity),
      originality: str(q.originality),
      relevance: str(q.relevance),
      exploration: str(q.exploration),
      grouping: str(q.grouping),
      convergenceQuality: str(q.convergenceQuality),
    },
    synthesis: {
      strengths: strArr(syn.strengths),
      improvements: strArr(syn.improvements),
      methodsToTry: strArr(syn.methodsToTry),
      underusedTools: strArr(syn.underusedTools),
    },
    meta: { model: "gpt-4.1-mini", at: new Date().toISOString() },
  });
}
