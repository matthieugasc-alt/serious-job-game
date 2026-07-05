import { NextResponse } from "next/server";
import OpenAI from "openai";

/**
 * POST /api/v2/debrief-presentation — analyse PÉDAGOGIQUE post-scénario de
 * la mécanique Présentation. N'existe qu'APRÈS la partie.
 *
 * Reçoit le discours, sa durée, les réactions de l'auditoire et le travail
 * préparatoire. Retourne : clarté, argumentation, confiance perçue,
 * cohérence, impact du discours (réactions reliées aux moments), synthèse.
 * Sans jugement de valeur, sans imposer un style unique.
 */

interface Body {
  speech: string;
  durationS: number;
  qa: { received: number; answered: number };
  audience: { role: string; content: string }[];
  supporting?: { documents: string[]; notes: string[]; decisions: string[] };
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
  if (typeof body?.speech !== "string") {
    return NextResponse.json({ error: "speech requis" }, { status: 400 });
  }

  const audienceBlock =
    (body.audience ?? []).map((e) => `${e.role}: ${e.content}`).join("\n") || "(aucune réaction)";
  const sup = body.supporting;
  const supBlock = sup
    ? `Documents: ${(sup.documents ?? []).join(" | ") || "—"}\nNotes: ${(sup.notes ?? []).join(" | ") || "—"}\nDécisions: ${(sup.decisions ?? []).join(" | ") || "—"}`
    : "(non fourni)";

  const system = [
    `Tu es un COACH pédagogique qui analyse APRÈS coup une présentation orale.`,
    `Tu es factuel, sans jugement de valeur, et tu n'imposes pas un style unique.`,
    ``,
    `Rends UNIQUEMENT un JSON strict :`,
    `- "clarity","argumentation","confidence","coherence" : une phrase chacun.`,
    `  (confidence = assurance perçue via hésitations/rythme ; coherence = cohérence avec notes/décisions/documents).`,
    `- "impact": réactions de l'auditoire {"reaction" (adhésion, scepticisme, objection, demande de précision…),"note": à quel moment}.`,
    `- "synthesis": {"strengths":[...],"improvements":[...],"recommendations":[...],"skillsToWork":[...]}.`,
  ].join("\n");

  const durMin = body.durationS > 0 ? `${Math.round(body.durationS)} s` : "inconnue";
  const user = `DISCOURS (durée ${durMin}) :\n${body.speech || "(vide)"}\n\nQUESTIONS : ${body.qa?.received ?? 0} reçues, ${body.qa?.answered ?? 0} répondues.\n\nRÉACTIONS DE L'AUDITOIRE :\n${audienceBlock}\n\nTRAVAIL PRÉPARATOIRE :\n${supBlock}`;

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

  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const impact = Array.isArray(parsed.impact)
    ? (parsed.impact as Record<string, unknown>[])
        .filter((x) => typeof x?.reaction === "string")
        .map((x) => ({ reaction: x.reaction as string, note: typeof x.note === "string" ? x.note : "" }))
    : [];
  const syn = (parsed.synthesis ?? {}) as Record<string, unknown>;

  return NextResponse.json({
    clarity: str(parsed.clarity),
    argumentation: str(parsed.argumentation),
    confidence: str(parsed.confidence),
    coherence: str(parsed.coherence),
    impact,
    synthesis: { strengths: strArr(syn.strengths), improvements: strArr(syn.improvements), recommendations: strArr(syn.recommendations), skillsToWork: strArr(syn.skillsToWork) },
    meta: { model: "gpt-4.1-mini", at: new Date().toISOString() },
  });
}
