import { NextResponse } from "next/server";
import OpenAI from "openai";

/**
 * POST /api/v2/debrief-production — analyse PÉDAGOGIQUE post-scénario de la
 * mécanique Production. N'existe qu'APRÈS la partie.
 *
 * Reçoit le livrable, la demande initiale et le travail préparatoire.
 * Retourne : complétude (présents/oubliés/superflus), traçabilité des
 * affirmations, qualitatif (clarté, argumentation, cohérence, adéquation),
 * synthèse. N'impose jamais une unique manière de rédiger.
 */

interface Body {
  deliverable: { type: string; title: string; body: string };
  instructions: string;
  supporting?: { notes: string[]; decisions: string[]; documents: string[] };
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
  if (!body?.deliverable || typeof body.deliverable.body !== "string") {
    return NextResponse.json({ error: "deliverable requis" }, { status: 400 });
  }

  const sup = body.supporting;
  const supBlock = sup
    ? `Notes: ${(sup.notes ?? []).join(" | ") || "—"}\nDécisions: ${(sup.decisions ?? []).join(" | ") || "—"}\nDocuments disponibles: ${(sup.documents ?? []).join(" | ") || "—"}`
    : "(non fourni)";

  const system = [
    `Tu es un COACH pédagogique qui analyse APRÈS coup un livrable produit par un joueur.`,
    `Tu évalues le fond et la construction, PAS la grammaire. Tu n'imposes pas un style unique.`,
    ``,
    `Rends UNIQUEMENT un JSON strict :`,
    `- "completeness": {"present":[...],"missing":[...],"superfluous":[...]} vs la demande.`,
    `- "traceability": affirmations importantes {"claim","basis":[sources/notes/décisions citées ou []]}. Max 8.`,
    `- "qualitative": {"clarity","argumentation","coherence","adequacy"} — une phrase chacune (adequacy = répond-il à la demande ?).`,
    `- "synthesis": {"strengths":[...],"improvements":[...],"recommendations":[...],"skillsToWork":[...]}.`,
  ].join("\n");

  const user = `DEMANDE INITIALE :\n${body.instructions || "(non précisée)"}\n\nLIVRABLE (${body.deliverable.type}) — ${body.deliverable.title || "sans titre"} :\n${body.deliverable.body || "(vide)"}\n\nTRAVAIL PRÉPARATOIRE :\n${supBlock}`;

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

  const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const comp = (parsed.completeness ?? {}) as Record<string, unknown>;
  const qual = (parsed.qualitative ?? {}) as Record<string, unknown>;
  const syn = (parsed.synthesis ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");

  const traceability = Array.isArray(parsed.traceability)
    ? (parsed.traceability as Record<string, unknown>[])
        .filter((t) => typeof t?.claim === "string")
        .map((t) => ({ claim: t.claim as string, basis: strArr(t.basis) }))
    : [];

  return NextResponse.json({
    completeness: { present: strArr(comp.present), missing: strArr(comp.missing), superfluous: strArr(comp.superfluous) },
    traceability,
    qualitative: { clarity: str(qual.clarity), argumentation: str(qual.argumentation), coherence: str(qual.coherence), adequacy: str(qual.adequacy) },
    synthesis: { strengths: strArr(syn.strengths), improvements: strArr(syn.improvements), recommendations: strArr(syn.recommendations), skillsToWork: strArr(syn.skillsToWork) },
    meta: { model: "gpt-4.1-mini", at: new Date().toISOString() },
  });
}
