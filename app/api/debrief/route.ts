/** ═══════════════════════════════════════════════════════════════════
 *  /api/debrief — AI-powered debrief using Claude (Anthropic API)
 *
 *  Receives the full game session data and asks Claude to evaluate
 *  the player's performance phase-by-phase against competencies.
 *  Returns a structured debrief with per-phase analysis + overall verdict.
 *
 *  Requires ANTHROPIC_API_KEY in .env.local
 *  Falls back to OpenAI (OPENAI_API_KEY) if Anthropic key is absent.
 * ═══════════════════════════════════════════════════════════════════ */

function sanitize(input: string): string {
  return input
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B-\u200F\uFEFF]/g, "");
}

// ── Types ──────────────────────────────────────────────────────────

export type PhaseEvaluation = {
  phase_title: string;
  competencies: Array<{
    name: string;
    rating: "non_acquis" | "en_cours" | "acquis" | "maitrise";
    justification: string;
  }>;
  phase_summary: string;
  phase_score: number; // 0-100
};

export type DebriefResponse = {
  overall_summary: string;
  ending: "success" | "partial_success" | "failure";
  ending_narrative: string;
  phases: PhaseEvaluation[];
  strengths: string[];
  improvements: string[];
  pedagogical_advice: string;
};

function fallbackDebrief(message: string): DebriefResponse {
  return {
    overall_summary: message,
    ending: "failure",
    ending_narrative: "",
    phases: [],
    strengths: [],
    improvements: [],
    pedagogical_advice: "",
  };
}

function tryParseJson(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractJson(raw: string) {
  const direct = tryParseJson(raw);
  if (direct) return direct;

  // Try to find JSON object in text
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return tryParseJson(raw.slice(start, end + 1));
  }
  return null;
}

function normalizeDebrief(data: any): DebriefResponse {
  const validEndings = ["success", "partial_success", "failure"];
  return {
    overall_summary:
      typeof data?.overall_summary === "string" && data.overall_summary.trim()
        ? data.overall_summary.trim()
        : "Le débrief n'a pas pu être généré correctement.",
    ending: validEndings.includes(data?.ending) ? data.ending : "failure",
    ending_narrative:
      typeof data?.ending_narrative === "string"
        ? data.ending_narrative.trim()
        : "",
    phases: Array.isArray(data?.phases)
      ? data.phases.map((p: any) => ({
          phase_title: String(p?.phase_title || "Phase"),
          competencies: Array.isArray(p?.competencies)
            ? p.competencies.map((c: any) => ({
                name: String(c?.name || ""),
                rating: ["non_acquis", "en_cours", "acquis", "maitrise"].includes(
                  c?.rating
                )
                  ? c.rating
                  : "non_acquis",
                justification: String(c?.justification || ""),
              }))
            : [],
          phase_summary: String(p?.phase_summary || ""),
          phase_score: typeof p?.phase_score === "number" ? p.phase_score : 0,
        }))
      : [],
    strengths: Array.isArray(data?.strengths)
      ? data.strengths.filter((s: any) => typeof s === "string" && s.trim())
      : [],
    improvements: Array.isArray(data?.improvements)
      ? data.improvements.filter((s: any) => typeof s === "string" && s.trim())
      : [],
    pedagogical_advice:
      typeof data?.pedagogical_advice === "string"
        ? data.pedagogical_advice.trim()
        : "",
  };
}

// ── Build the evaluation prompt ────────────────────────────────────

function buildPrompt(body: any): string {
  const playerName = body?.playerName || "Joueur";
  const scenarioTitle = body?.scenarioTitle || "Scénario";

  // Extract phases with their competencies from scenario definition
  const phases = Array.isArray(body?.phases) ? body.phases : [];
  const phasesForEval = phases.map((p: any) => ({
    title: p.title,
    objective: p.objective,
    competencies: Array.isArray(p.competencies)
      ? p.competencies
      : (p.scoring?.criteria || []).map((c: any) => c.description),
  }));

  // Conversation history
  const conversation = Array.isArray(body?.conversation) ? body.conversation : [];
  const convSummary = conversation
    .map((m: any) => {
      const role = m.role === "player" ? playerName : m.actor || "PNJ";
      const type = m.type && m.type !== "chat" ? ` [${m.type}]` : "";
      return `[${role}${type}]: ${m.content}`;
    })
    .join("\n");

  // Sent mails
  const sentMails = Array.isArray(body?.sentMails) ? body.sentMails : [];
  const mailsSummary = sentMails
    .map(
      (m: any) =>
        `--- MAIL ENVOYÉ ---\nÀ: ${m.to}\nCc: ${m.cc || ""}\nObjet: ${m.subject}\nCorps:\n${m.body}\nPJ: ${(m.attachments || []).map((a: any) => a.label).join(", ") || "aucune"}\n--- FIN MAIL ---`
    )
    .join("\n\n");

  // Inbox mails (received)
  const inboxMails = Array.isArray(body?.inboxMails) ? body.inboxMails : [];
  const inboxSummary = inboxMails
    .map(
      (m: any) =>
        `[De: ${m.from}] Objet: ${m.subject} — ${(m.body || "").slice(0, 200)}`
    )
    .join("\n");

  // Endings defined in scenario
  const endings = Array.isArray(body?.endings) ? body.endings : [];
  const defaultEnding = body?.defaultEnding || null;

  return sanitize(`Tu es un évaluateur pédagogique expert pour un serious game professionnel.

SCENARIO : "${scenarioTitle}"
JOUEUR : ${playerName}

═══ PHASES ET COMPÉTENCES À ÉVALUER ═══
${JSON.stringify(phasesForEval, null, 2)}

═══ CONVERSATION COMPLÈTE (chat/messages) ═══
${convSummary || "(aucune conversation)"}

═══ MAILS ENVOYÉS PAR LE JOUEUR ═══
${mailsSummary || "(aucun mail envoyé)"}

═══ MAILS REÇUS ═══
${inboxSummary || "(aucun mail reçu)"}

═══ FINS POSSIBLES ═══
${JSON.stringify(
  endings.map((e: any) => ({
    id: e.ending_id,
    label: e.label,
    description: e.content,
  })),
  null,
  2
)}
${defaultEnding ? `Fin par défaut (échec) : ${defaultEnding.label} — ${defaultEnding.content}` : ""}

═══ INSTRUCTIONS ═══

Analyse la performance du joueur phase par phase. Pour chaque phase :
1. Évalue CHAQUE compétence listée (les descriptions textuelles) selon 4 niveaux :
   - "non_acquis" : Le joueur n'a pas du tout abordé cette compétence
   - "en_cours" : Le joueur a effleuré le sujet mais de manière incomplète ou imprécise
   - "acquis" : Le joueur a clairement démontré cette compétence
   - "maitrise" : Le joueur a excellé, avec une compréhension fine et des actions précises

2. Pour chaque compétence, donne une justification CONCRÈTE basée sur ce que le joueur a réellement dit ou fait (cite des éléments précis de la conversation ou des mails).

3. Donne un score de 0 à 100 pour la phase.

4. Rédige un court résumé de la performance sur cette phase.

Ensuite, détermine la fin appropriée :
- "success" si le joueur a globalement bien géré la crise (majorité de compétences acquises/maîtrisées, mails envoyés et pertinents)
- "partial_success" si le joueur a fait des choses correctes mais avec des lacunes significatives
- "failure" si le joueur n'a pas réussi à gérer la situation

Rédige un récit de fin personnalisé qui reflète EXACTEMENT ce que le joueur a fait (pas un texte générique).

IMPORTANT :
- Ne valide PAS une compétence si le joueur ne l'a pas démontrée concrètement.
- Sois exigeant mais juste. Un joueur qui a envoyé les bons mails avec les bonnes PJ et a bien communiqué mérite un succès.
- Évalue aussi les MAILS ENVOYÉS, pas uniquement le chat. Le mail au consulat est un élément central.
- Tiens compte du contexte : si le joueur a bien identifié le problème, proposé une stratégie, rédigé un mail structuré et répondu au consulat, c'est un bon parcours.
- Réponds UNIQUEMENT en français.

FORMAT JSON STRICT (pas de texte avant ou après) :
{
  "overall_summary": "Résumé global de la performance du joueur en 2-3 phrases",
  "ending": "success | partial_success | failure",
  "ending_narrative": "Récit personnalisé de la fin du scénario (3-5 phrases) qui reflète les actions concrètes du joueur",
  "phases": [
    {
      "phase_title": "Nom de la phase",
      "competencies": [
        {
          "name": "La description textuelle de la compétence (reprise telle quelle de la liste)",
          "rating": "non_acquis | en_cours | acquis | maitrise",
          "justification": "Explication précise basée sur les actions du joueur"
        }
      ],
      "phase_summary": "Résumé court de la performance sur cette phase",
      "phase_score": 85
    }
  ],
  "strengths": ["Point fort 1", "Point fort 2"],
  "improvements": ["Axe d'amélioration 1", "Axe d'amélioration 2"],
  "pedagogical_advice": "Conseil pédagogique personnalisé pour progresser"
}`);
}

// ── Call Anthropic (Claude) API directly via fetch ─────────────────

async function callClaude(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errorText}`);
  }

  const data = await res.json();
  // Extract text from the response
  const textBlock = data.content?.find((b: any) => b.type === "text");
  return textBlock?.text || "";
}

// ── Fallback: call OpenAI if Anthropic key not available ──────────

async function callOpenAI(prompt: string, apiKey: string): Promise<string> {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey });
  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
  });
  return response.output_text || "";
}

// ── Route handler ──────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!anthropicKey && !openaiKey) {
      return Response.json(
        fallbackDebrief("Aucune clé API configurée (ANTHROPIC_API_KEY ou OPENAI_API_KEY)."),
        { status: 200 }
      );
    }

    const body = await req.json();
    const prompt = buildPrompt(body);

    let raw: string;

    if (anthropicKey) {
      raw = await callClaude(prompt, anthropicKey);
    } else {
      raw = await callOpenAI(prompt, openaiKey!);
    }

    const parsed = extractJson(raw);

    if (!parsed) {
      console.error("Failed to parse debrief JSON. Raw output:", raw.slice(0, 500));
      return Response.json(
        fallbackDebrief("Le débrief IA n'a pas pu être structuré correctement."),
        { status: 200 }
      );
    }

    return Response.json(normalizeDebrief(parsed), { status: 200 });
  } catch (error: any) {
    console.error("Erreur debrief route:", error);

    return Response.json(
      fallbackDebrief(
        error?.message || "Erreur lors de la génération du débrief."
      ),
      { status: 200 }
    );
  }
}
