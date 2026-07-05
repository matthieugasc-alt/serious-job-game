import { NextResponse } from "next/server";
import OpenAI from "openai";

/**
 * POST /api/v2/debrief-planning — analyse PÉDAGOGIQUE post-scénario de la
 * mécanique Planification / Organisation. N'existe qu'APRÈS la partie.
 *
 * Reçoit une vue compacte du plan (étapes, jalons, tâches, dépendances,
 * risques, outils). Retourne : cohérence/séquencement, réalisme temporel,
 * priorités, robustesse aux imprévus, adaptabilité, synthèse. Sans imposer
 * une méthode unique de gestion de projet.
 */

interface Body {
  planning: { steps: number; milestones: number; tasksByStatus: { todo: number; doing: number; done: number }; dependencies: number; risks: number };
  dependencies?: { fromLabel: string; toLabel: string }[];
  risks?: { label: string; probability: number; impact: number }[];
  toolUsage?: { label: string; count: number }[];
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

  const p = body.planning ?? { steps: 0, milestones: 0, tasksByStatus: { todo: 0, doing: 0, done: 0 }, dependencies: 0, risks: 0 };
  const depsBlock = (body.dependencies ?? []).map((d) => `${d.fromLabel} → ${d.toLabel}`).join("\n") || "(aucune)";
  const risksBlock = (body.risks ?? []).map((r) => `${r.label} (P${r.probability}·I${r.impact})`).join("\n") || "(aucun)";
  const toolsBlock = (body.toolUsage ?? []).map((t) => `${t.label} (${t.count})`).join(", ") || "aucun";

  const system = [
    `Tu es un COACH pédagogique qui analyse APRÈS coup le plan / l'organisation construit par un joueur.`,
    `Tu n'imposes pas une méthode unique de gestion de projet. Tu es factuel.`,
    ``,
    `Rends UNIQUEMENT un JSON strict :`,
    `- "coherence","realism","priorities","robustness","adaptability" : une phrase chacun.`,
    `  (robustness = le plan tient-il si retard/indisponibilité/changement de priorité/nouvelle contrainte ?)`,
    `- "synthesis": {"strengths":[...],"improvements":[...],"recurringErrors":[...],"recommendations":[...]}.`,
  ].join("\n");

  const user = `PLAN :\n- Étapes/items : ${p.steps}\n- Jalons : ${p.milestones}\n- Tâches : ${p.tasksByStatus.done} terminées, ${p.tasksByStatus.doing} en cours, ${p.tasksByStatus.todo} à faire\n\nDÉPENDANCES :\n${depsBlock}\n\nRISQUES :\n${risksBlock}\n\nOUTILS DE PLANIFICATION : ${toolsBlock}`;

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
  const syn = (parsed.synthesis ?? {}) as Record<string, unknown>;

  return NextResponse.json({
    coherence: str(parsed.coherence),
    realism: str(parsed.realism),
    priorities: str(parsed.priorities),
    robustness: str(parsed.robustness),
    adaptability: str(parsed.adaptability),
    synthesis: { strengths: strArr(syn.strengths), improvements: strArr(syn.improvements), recurringErrors: strArr(syn.recurringErrors), recommendations: strArr(syn.recommendations) },
    meta: { model: "gpt-4.1-mini", at: new Date().toISOString() },
  });
}
