import { NextResponse } from "next/server";
import OpenAI from "openai";

/**
 * POST /api/v2/debrief-negotiation — analyse PÉDAGOGIQUE post-scénario de
 * la mécanique Négociation. N'existe qu'APRÈS la partie.
 *
 * Reçoit les termes (ouverture → final), la chronologie des propositions,
 * le statut, le dialogue et le contexte stratégique. Retourne le
 * qualitatif : équilibre, positions/intérêts, objections, création de
 * valeur, rapport de force, cohérence, robustesse, synthèse. Sans imposer
 * une méthode unique de négociation.
 */

interface Body {
  status: string;
  terms: { label: string; opening: unknown; final: unknown; suffix?: string }[];
  chronology: { label: string }[];
  objections: { received: number; answered: number };
  dialogue?: { role: string; content: string }[];
  strategy?: { objective: string; decisions: string[]; risks: string[] };
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

  const termsBlock = (body.terms ?? []).map((t) => `- ${t.label} : ${t.opening ?? "?"} → ${t.final ?? "?"}${t.suffix ? " " + t.suffix : ""}`).join("\n") || "(aucun)";
  const chronoBlock = (body.chronology ?? []).map((c, i) => `${i + 1}. ${c.label}`).join("\n") || "(aucune proposition)";
  const dialogueBlock = (body.dialogue ?? []).map((e) => `${e.role}: ${e.content}`).join("\n") || "(aucun dialogue)";
  const strat = body.strategy;
  const stratBlock = strat
    ? `Objectif: ${strat.objective || "—"}\nDécisions: ${(strat.decisions ?? []).join(" | ") || "—"}\nRisques: ${(strat.risks ?? []).join(" | ") || "—"}`
    : "(non fourni)";

  const system = [
    `Tu es un COACH pédagogique qui analyse APRÈS coup une négociation.`,
    `Tu es factuel, tu montres plusieurs stratégies crédibles, tu n'imposes pas une méthode unique.`,
    ``,
    `Rends UNIQUEMENT un JSON strict :`,
    `- "qualitative": {"balance","interests","objections","valueCreation","powerBalance","coherence","robustness"} — une phrase chacun.`,
    `  (interests = a-t-il distingué positions et intérêts ? valueCreation = a-t-il agrandi le gâteau ou juste partagé ? coherence = cohérence avec objectif/décisions/risques.)`,
    `- "synthesis": {"strengths":[...],"improvements":[...],"techniquesUnderused":[...],"recurringErrors":[...],"recommendations":[...]}.`,
  ].join("\n");

  const user = `STATUT : ${body.status}\n\nTERMES (ouverture → final) :\n${termsBlock}\n\nCHRONOLOGIE DES PROPOSITIONS :\n${chronoBlock}\n\nOBJECTIONS : ${body.objections?.received ?? 0} reçues, ${body.objections?.answered ?? 0} traitées.\n\nDIALOGUE :\n${dialogueBlock}\n\nCONTEXTE STRATÉGIQUE :\n${stratBlock}`;

  let raw = "{}";
  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 1300,
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
      balance: str(q.balance),
      interests: str(q.interests),
      objections: str(q.objections),
      valueCreation: str(q.valueCreation),
      powerBalance: str(q.powerBalance),
      coherence: str(q.coherence),
      robustness: str(q.robustness),
    },
    synthesis: {
      strengths: strArr(syn.strengths),
      improvements: strArr(syn.improvements),
      techniquesUnderused: strArr(syn.techniquesUnderused),
      recurringErrors: strArr(syn.recurringErrors),
      recommendations: strArr(syn.recommendations),
    },
    meta: { model: "gpt-4.1-mini", at: new Date().toISOString() },
  });
}
