import OpenAI from "openai";

type CompetencyItem = {
  competency: string;
  level: string;
  justification: string;
};

type DebriefResponse = {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  competency_analysis: CompetencyItem[];
};

function fallbackDebrief(message: string): DebriefResponse {
  return {
    summary: message,
    strengths: [],
    weaknesses: [],
    competency_analysis: [],
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

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");

  if (start !== -1 && end !== -1 && end > start) {
    return tryParseJson(raw.slice(start, end + 1));
  }

  return null;
}

function normalizeDebrief(data: any): DebriefResponse {
  return {
    summary:
      typeof data?.summary === "string" && data.summary.trim()
        ? data.summary.trim()
        : "Le débrief n’a pas pu être généré correctement.",
    strengths: Array.isArray(data?.strengths)
      ? data.strengths.filter((x: any) => typeof x === "string" && x.trim())
      : [],
    weaknesses: Array.isArray(data?.weaknesses)
      ? data.weaknesses.filter((x: any) => typeof x === "string" && x.trim())
      : [],
    competency_analysis: Array.isArray(data?.competency_analysis)
      ? data.competency_analysis
          .filter(
            (item: any) =>
              item &&
              typeof item === "object" &&
              typeof item.competency === "string"
          )
          .map((item: any) => ({
            competency: String(item.competency || "").trim(),
            level: String(item.level || "non évalué").trim(),
            justification: String(item.justification || "").trim(),
          }))
      : [],
  };
}

function buildEvidence(sentMails: any[], actionLog: any[], flags: Record<string, any>) {
  const initialMail = sentMails.find((m) => m.kind === "consulate_initial");
  const replyMail = sentMails.find((m) => m.kind === "consulate_reply");

  return {
    initialMailExists: !!initialMail,
    replyMailExists: !!replyMail,
    initialMailHasBody: !!initialMail?.body?.trim(),
    replyMailHasBody: !!replyMail?.body?.trim(),
    initialAttachments: Array.isArray(initialMail?.attachments) ? initialMail.attachments.length : 0,
    replyAttachments: Array.isArray(replyMail?.attachments) ? replyMail.attachments.length : 0,
    totalChatSent: actionLog.filter((a) => a?.type === "chat_message_sent").length,
    totalChatReceived: actionLog.filter((a) => a?.type === "chat_message_received").length,
    namedConsulateMadrid: !!flags?.named_consulate_madrid,
    identifiedBorderRisk: !!flags?.identified_border_risk,
    mailHasStructure: !!flags?.mail_has_structure,
    mailToneDiplomatic: !!flags?.mail_tone_diplomatic,
    proposedHierarchyNoteLater: !!flags?.proposed_hierarchy_note_later,
    repliedToConsulate: !!flags?.replied_to_consulate,
    emailToConsulateSent: !!flags?.email_to_consulate_sent,
  };
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return Response.json(
        fallbackDebrief("OPENAI_API_KEY manquante côté serveur."),
        { status: 200 }
      );
    }

    const client = new OpenAI({ apiKey });

    const body = await req.json();

    const playerName =
      typeof body?.playerName === "string" && body.playerName.trim()
        ? body.playerName.trim()
        : "Joueur";

    const actionLog = Array.isArray(body?.actionLog) ? body.actionLog : [];
    const sentMails = Array.isArray(body?.sentMails) ? body.sentMails : [];
    const flags =
      body?.flags && typeof body.flags === "object" ? body.flags : {};
    const scores =
      body?.scores && typeof body.scores === "object" ? body.scores : {};
    const totalScore =
      typeof body?.totalScore === "number" ? body.totalScore : 0;
    const competencies = Array.isArray(body?.competencies)
      ? body.competencies
      : [];

    const evidence = buildEvidence(sentMails, actionLog, flags);

    const prompt = `
Tu es un évaluateur expert de serious game professionnel.

Tu dois produire un débrief PERSONNALISÉ, FACTUEL, EXIGEANT et CRÉDIBLE.
Tu évalues la performance de ${playerName} à partir des traces réelles de session.

IMPORTANT :
- Tu ne dois PAS inventer d'actions non présentes dans les données.
- Tu ne dois PAS féliciter le joueur pour quelque chose qui n'est pas démontré.
- Tu dois distinguer :
  1. la qualité du raisonnement oral / messagerie,
  2. la qualité des mails rédigés,
  3. la qualité documentaire / pièces jointes,
  4. la qualité de coordination dans le temps.
- Si le joueur a oublié les pièces jointes dans le mail de phase 4, cela doit être signalé comme une faiblesse importante.
- Si le joueur a bien raisonné à l’oral mais mal exécuté à l’écrit, il faut l’écrire clairement.
- Si le joueur a envoyé un mail de phase 3 sans PJ, ce n’est PAS en soi une faute critique.
- Si le joueur a envoyé un mail de phase 4 sans PJ, c’est une faiblesse majeure.
- Tu dois être spécifique, pas générique.

JOUEUR :
${playerName}

SCORES PAR PHASE :
${JSON.stringify(scores, null, 2)}

SCORE TOTAL :
${JSON.stringify(totalScore, null, 2)}

FLAGS :
${JSON.stringify(flags, null, 2)}

ACTION LOG :
${JSON.stringify(actionLog, null, 2)}

MAILS ENVOYÉS :
${JSON.stringify(sentMails, null, 2)}

FAITS DÉJÀ CALCULÉS :
${JSON.stringify(evidence, null, 2)}

COMPÉTENCES À ÉVALUER :
${JSON.stringify(competencies, null, 2)}

FORMAT DE SORTIE STRICT :
{
  "summary": "texte",
  "strengths": ["point fort 1", "point fort 2"],
  "weaknesses": ["point faible 1", "point faible 2"],
  "competency_analysis": [
    {
      "competency": "nom de la compétence",
      "level": "faible | moyen | bon | excellent",
      "justification": "justification précise"
    }
  ]
}
`;

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt,
    });

    const raw = response.output_text || "";
    const parsed = extractJson(raw);

    if (!parsed) {
      return Response.json(
        fallbackDebrief(
          "Le débrief IA n’a pas pu être structuré correctement."
        ),
        { status: 200 }
      );
    }

    return Response.json(normalizeDebrief(parsed), { status: 200 });
  } catch (error: any) {
    console.error("Erreur debrief route:", error);

    return Response.json(
      fallbackDebrief(
        error?.message ||
          error?.error?.message ||
          "Erreur lors de la génération du débrief."
      ),
      { status: 200 }
    );
  }
}