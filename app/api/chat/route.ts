import OpenAI from "openai";
import { requireAuth } from "@/app/lib/auth";
import { checkRateLimit, getRateLimitId, RATE_LIMITS } from "@/app/lib/rateLimit";
import { parseBody, chatSchema } from "@/app/lib/validation";

function s(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

/** Replace ALL non-ASCII characters that could break ByteString encoding.
 *  Keeps standard Latin-1 supplement (accents, ñ, etc.) but replaces
 *  anything above U+00FF and common problematic chars. */
function sanitize(input: string): string {
  return input
    .replace(/[\u2018\u2019\u02BC]/g, "'") // curly single quotes + modifier apostrophe
    .replace(/[\u201C\u201D]/g, '"') // curly double quotes
    .replace(/[\u2013\u2014]/g, "-") // en/em dashes
    .replace(/\u2026/g, "...") // ellipsis
    .replace(/\u00A0/g, " ") // non-breaking space
    .replace(/[\u200B-\u200F\uFEFF]/g, ""); // zero-width chars + BOM
}

/** Interpolate variables in a template string.
 *  Supports both {{variable}} and {{object.property}} syntax.
 */
function interpolatePrompt(
  template: string,
  variables: Record<string, any>
): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path: string) => {
    const parts = path.split(".");
    let value: any = variables;
    for (const part of parts) {
      if (value == null || typeof value !== "object") return match;
      value = value[part];
    }
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "object") return JSON.stringify(value, null, 2);
    return String(value);
  });
}

// ═══════════════════════════════════════════════════════════════════════
// CONVERSATION CONTRACT — global rules injected into EVERY AI generation
// This is the single source of truth for AI character behavior.
// It applies to all scenarios, all characters, present and future.
// ═══════════════════════════════════════════════════════════════════════

const CONVERSATION_CONTRACT = `
=== CONTRAT CONVERSATIONNEL (OBLIGATOIRE — S'APPLIQUE À CHAQUE MESSAGE) ===

A. IDENTITÉ STABLE
- Tu connais PARFAITEMENT ta propre biographie, ton passé, tes experiences.
- Tu ne redécouvres JAMAIS ta propre vie. Tu ne poses JAMAIS de question sur ton propre parcours.
- Si on te demande quelque chose sur TOI, tu RÉPONDS avec ce que tu sais — tu ne poses pas la question en retour.
- Exemple INTERDIT : poser "Pourquoi avez-vous quitté X ?" alors que c'est TOI qui as quitté X.

B. POSITION STABLE
- Tu gardes ton rôle à chaque message. Tu ne changes JAMAIS de rôle.
- Si tu es un candidat : tu RÉPONDS aux questions du joueur. Tu ne mènes PAS l'entretien.
- Si tu es un collègue/associé : tu réagis, tu donnes un avis. Tu ne décides PAS à la place du joueur.
- Tu ne prends JAMAIS le rôle du joueur. Tu ne rédiges PAS de mail, de document ou de décision à sa place.
- Tu ne prends JAMAIS le rôle d'un autre personnage.

C. CONTINUITÉ STRICTE — ANTI-BOUCLE
- Tu te souviens de TOUT l'historique de la conversation fourni.
- Tu ne te réintroduis JAMAIS. Pas de "Bonjour", "Pour commencer", ou toute forme de redémarrage.
- Tu ne répètes JAMAIS une information que tu as déjà donnée.
- Tu ne reposes JAMAIS une question que tu as déjà posée.
- Tu ne reformules JAMAIS la même objection ou le même argument. Si tu l'as déjà dit, tu passes à autre chose.
- Tu réagis TOUJOURS au dernier message du joueur en le prenant en compte EXPLICITEMENT.
- Si le joueur répond à ta question : tu ACCEPTES sa réponse (accord ou désaccord) et tu AVANCES. Tu ne répètes PAS ta question.
- Si le joueur te contredit : tu peux contre-argumenter UNE FOIS puis tu changes d'angle ou tu cèdes.
- BOUCLER SUR LE MÊME SUJET EST INTERDIT. Après 2 échanges sur un sujet, tu dois OBLIGATOIREMENT passer au suivant.

D. UNE SEULE INTENTION PAR MESSAGE
Chaque message fait UNE SEULE chose :
- Répondre à ce qu'on te demande
- OU poser UNE question de clarification ponctuelle
- OU réagir / commenter brièvement
- OU challenger une idée
JAMAIS DEUX À LA FOIS. Jamais répondre ET poser une question. Jamais commenter ET relancer.

E. LONGUEUR ET FORMAT
- Maximum 2 phrases par message. JAMAIS plus.
- Texte brut uniquement. Pas de markdown, pas de listes, pas de tirets, pas de bullet points.
- Pas de mise en forme spéciale.

F. INTERDICTIONS ABSOLUES
- INTERDIT de poser plusieurs questions d'affilée sans réponse du joueur.
- INTERDIT de répondre à ta propre question.
- INTERDIT de reformuler ce que le joueur a dit.
- INTERDIT de simuler un dialogue ou de parler au nom du joueur.
- INTERDIT de développer, expliquer ou contextualiser en longueur.
- INTERDIT de monologuer.

=== FIN CONTRAT ===
`;

/** Generic fallback prompt for AI character responses */
function getGenericFallbackPrompt(playerName: string): string {
  return sanitize(`
You are a credible colleague in a professional simulation.

Player: ${playerName}

IMPORTANT:
- Do NOT roleplay as the player.
- Stay in character as a realistic colleague.
- Help the player reason through problems.
- Delegate decisions back to the player after clarifying the situation.
- Keep responses concise (1-2 sentences).
- Be professional, natural, and credible.

${CONVERSATION_CONTRACT}

FINAL INSTRUCTION:
Respond ONLY with your character's dialogue in plain text. 2 sentences max.
`);
}

/** Format conversation history as readable dialogue */
function formatConversation(
  recentConversation: any[],
  playerName: string
): string {
  if (!Array.isArray(recentConversation) || recentConversation.length === 0) {
    return "(début de conversation — premier échange)";
  }
  return recentConversation
    .map((m: any) => `[${m.role === "user" ? playerName : "Toi"}] : ${m.content}`)
    .join("\n");
}

export async function POST(req: Request) {
  try {
    // ── Auth guard ──
    const auth = requireAuth(req);
    if (auth.error) return auth.error;

    // ── Rate limit ──
    const rlId = getRateLimitId(req, auth.user.id);
    const rl = checkRateLimit(rlId, "chat", RATE_LIMITS.chat);
    if (rl.blocked) return Response.json(rl.body, { status: 429 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "OPENAI_API_KEY manquante côté serveur." },
        { status: 500 }
      );
    }

    const client = new OpenAI({ apiKey });

    const body = await req.json();

    // ── Input validation ──
    const parsed = parseBody(body, chatSchema);
    if (parsed.error) return Response.json(parsed.error, { status: 400 });
    const input = parsed.data;

    // Extract and sanitize validated fields
    const playerName = sanitize(input.playerName) || "CEO";
    const message = sanitize(input.message);
    const phaseTitle = sanitize(input.phaseTitle);
    const phaseObjective = sanitize(input.phaseObjective);
    const phaseFocus = sanitize(input.phaseFocus);
    const phasePrompt = sanitize(input.phasePrompt);
    const mode = input.mode;
    const roleplayPromptTemplate = input.roleplayPrompt;

    const narrative = input.narrative;
    const recentConversation = input.recentConversation;
    const criteria = input.criteria;
    const playerMessages = input.playerMessages;

    // Build mode-specific guidance
    const modeGuidance =
      mode === "guided"
        ? `
MODE GUIDED:
- You help a bit more than usual.
- You may give a light hint or ask one useful question.
- You support ${playerName} without doing the work in their place.
- You never give the full solution.
`
        : mode === "standard"
          ? `
MODE STANDARD:
- You are a professional, reactive, credible colleague.
- You help moderately.
- You may challenge vague ideas.
- You often ask for useful clarification.
- You do not give the full plan.
`
          : `
MODE AUTONOMY:
- You help little.
- You assume ${playerName} must build the reasoning alone.
- You may doubt, reframe, ask for precision.
- You do not give away the answer.
`;

    // ── Build final roleplay prompt ──────────────────────────────────
    // Structure: character prompt (from scenario) + conversation contract (global)
    let finalRoleplayPrompt: string;

    // Format conversation history as readable dialogue
    const formattedConversation = formatConversation(
      recentConversation,
      playerName
    );

    if (roleplayPromptTemplate) {
      // Interpolate variables in the provided template
      // NOTE: recentConversation and message are now passed as structured
      // chat messages (user/assistant), NOT interpolated into the prompt.
      // This prevents the LLM from ignoring conversation context.
      const variables = {
        playerName,
        phaseTitle,
        phaseObjective,
        phaseFocus,
        phasePrompt,
        narrative: narrative,
        mode,
        modeGuidance,
        recentConversation: "(voir historique de conversation ci-dessous)",
        message: "(voir dernier message du joueur ci-dessous)",
      };
      finalRoleplayPrompt = sanitize(
        interpolatePrompt(roleplayPromptTemplate, variables)
      );

      // Inject strict phase focus constraint if defined
      if (phaseFocus) {
        finalRoleplayPrompt += `\n\n=== CONTRAINTE DE PHASE (OBLIGATOIRE) ===\nTu es actuellement dans la phase : "${phaseTitle}"\nFOCUS STRICT : ${phaseFocus}\n\nTu dois STRICTEMENT rester sur ce sujet.\nTu n'as pas le droit :\n- d'anticiper les phases suivantes\n- de parler de sujets non liés à cette phase\n- de mentionner des décisions futures ou des étapes à venir\nToute réponse hors sujet est interdite. Si le joueur aborde un sujet hors périmètre, ramène-le poliment mais fermement au sujet de cette phase.\n=== FIN CONTRAINTE ===`;
      }
    } else {
      // Use generic fallback
      finalRoleplayPrompt = getGenericFallbackPrompt(playerName);
    }

    // ── GLOBAL CONVERSATION CONTRACT — injected into EVERY prompt ──
    // This is the structural fix: no matter what the scenario prompt says,
    // the contract enforces identity stability, role boundaries, continuity,
    // and single-intent messages for ALL characters in ALL scenarios.
    finalRoleplayPrompt += "\n\n" + CONVERSATION_CONTRACT;

    // Build evaluation prompt — PLAYER-ONLY scoring
    // CRITICAL: Only player messages are included. No NPC/AI responses.
    const playerMsgBlock = playerMessages.length > 0
      ? playerMessages.map((m: string, i: number) => `[Player msg ${i + 1}]: ${sanitize(m)}`).join("\n")
      : `[Player msg]: ${message}`;

    const evaluationPrompt = sanitize(`
You are a STRICT evaluator of a professional serious game.

=== RULE ABSOLUE ===
Tu dois analyser UNIQUEMENT les messages du JOUEUR ci-dessous.
Tu n'as PAS accès aux réponses des personnages (PNJ/IA).
Tu n'as PAS LE DROIT d'utiliser des réponses de l'IA pour compléter ou déduire une réponse correcte.
Tu n'as PAS LE DROIT de créditer le joueur pour une connaissance qu'il n'a pas explicitement formulée lui-même.
Si le joueur pose une question sans y répondre, ce n'est PAS une compétence démontrée.
Si le joueur reformule ce qu'un PNJ lui a dit, ce n'est PAS une compétence démontrée.
Seule la PRODUCTION PROPRE du joueur compte.
=== FIN RULE ===

PHASE: ${phaseTitle}
OBJECTIVE: ${phaseObjective}${phaseFocus ? `\nPHASE FOCUS (strict scope): ${phaseFocus}\nOnly evaluate competencies related to this phase scope. Ignore off-topic content.` : ""}

COMPETENCIES for this phase:
${sanitize(JSON.stringify(criteria, null, 2))}

=== MESSAGES DU JOUEUR UNIQUEMENT ===
${playerMsgBlock}
=== FIN MESSAGES JOUEUR ===

Evaluate how many competencies (0-3) the player demonstrates across ALL their messages above.
Be EXTREMELY STRICT:
- score_delta = 0 if the player's messages are vague, generic, or merely ask questions.
- score_delta = 0 if the player only acknowledges or agrees without adding substance.
- score_delta > 0 ONLY if the player provides SPECIFIC, CONCRETE evidence: numbers, rules, criteria, analysis, or clear professional reasoning.
- Each matched competency must be backed by an EXPLICIT statement in the player's messages.
- Do NOT infer or assume knowledge the player hasn't stated.

Return STRICT JSON only:
{
  "matched_criteria": ["competency text 1"],
  "score_delta": 1,
  "flags_to_set": {}
}
`);

    // ── Build structured messages for the LLM ──
    // Instead of a single string, we pass the system prompt + conversation
    // history as proper messages. This prevents the LLM from ignoring
    // player responses and looping on the same reply.
    const chatMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: finalRoleplayPrompt },
    ];

    // Add conversation history as proper user/assistant messages
    if (Array.isArray(recentConversation) && recentConversation.length > 0) {
      for (const msg of recentConversation) {
        const m = msg as any;
        const role = m.role === "user" ? "user" as const : "assistant" as const;
        chatMessages.push({ role, content: sanitize(m.content || "") });
      }
    }

    // Always end with the current player message
    chatMessages.push({ role: "user", content: message });

    // ── Extract last AI messages for anti-repetition check ──
    const lastAiMessages = chatMessages
      .filter(m => m.role === "assistant")
      .slice(-3)
      .map(m => m.content.trim().toLowerCase());

    // ── PARALLEL AI calls: roleplay + evaluation run simultaneously ──
    const [roleplayResponse, evalResponse] = await Promise.all([
      client.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: chatMessages,
        max_tokens: 300,
        temperature: 0.8,
      }),
      client.responses.create({
        model: "gpt-4.1-mini",
        input: evaluationPrompt,
      }),
    ]);

    let reply =
      sanitize(roleplayResponse.choices?.[0]?.message?.content || "").trim() ||
      `Je ne suis pas sûr de bien comprendre, ${playerName}. Pouvez-vous préciser ?`;

    // ── ANTI-REPETITION GUARD ──
    // If the reply is nearly identical to any of the last 3 AI messages,
    // force a retry with an explicit anti-repetition instruction.
    const replyNorm = reply.trim().toLowerCase();
    const isRepetition = lastAiMessages.some(prev => {
      if (!prev) return false;
      // Exact match or >80% overlap (Jaccard on words)
      if (prev === replyNorm) return true;
      const wordsA = new Set(prev.split(/\s+/));
      const wordsB = new Set(replyNorm.split(/\s+/));
      const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
      const union = new Set([...wordsA, ...wordsB]).size;
      return union > 0 && intersection / union > 0.8;
    });

    if (isRepetition) {
      // Retry with explicit anti-repetition constraint
      const retryMessages = [
        ...chatMessages,
        {
          role: "system" as const,
          content: `ATTENTION : ta réponse précédente était IDENTIQUE à un message que tu as déjà envoyé. C'est INTERDIT.
Tu DOIS :
1. Réagir SPÉCIFIQUEMENT à ce que ${playerName} vient de dire : "${message}"
2. Dire quelque chose de NOUVEAU que tu n'as jamais dit avant
3. Faire AVANCER la conversation
4. Si tu es d'accord avec le joueur, DIS-LE et passe au sujet suivant
5. Ne JAMAIS répéter ta question ou ton objection précédente

Si le joueur a répondu à ta question, ACCEPTE sa réponse et enchaîne.`,
        },
      ];
      const retryResponse = await client.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: retryMessages,
        max_tokens: 300,
        temperature: 1.0, // higher temp to force diversity
      });
      const retryReply = sanitize(retryResponse.choices?.[0]?.message?.content || "").trim();
      if (retryReply) {
        reply = retryReply;
      }
    }

    let evaluation: {
      matched_criteria?: string[];
      score_delta?: number;
      flags_to_set?: Record<string, boolean>;
    } = {};

    try {
      evaluation = JSON.parse(evalResponse.output_text?.trim() || "{}");
    } catch {
      evaluation = {
        matched_criteria: [],
        score_delta: 0,
        flags_to_set: {},
      };
    }

    const matchedCriteria = Array.isArray(evaluation.matched_criteria)
      ? evaluation.matched_criteria.slice(0, 3)
      : [];

    const flagsToSet =
      evaluation.flags_to_set && typeof evaluation.flags_to_set === "object"
        ? Object.fromEntries(
            Object.entries(evaluation.flags_to_set).filter(
              ([, value]) => value === true
            )
          )
        : {};

    // score_delta must always equal the number of matched criteria (1 point per criterion)
    const scoreDelta =
      typeof evaluation.score_delta === "number" && evaluation.score_delta >= 0
        ? Math.max(evaluation.score_delta, matchedCriteria.length)
        : matchedCriteria.length;

    return Response.json({
      reply,
      matched_criteria: matchedCriteria,
      score_delta: scoreDelta,
      flags_to_set: flagsToSet,
    });
  } catch (error: any) {
    console.error("Erreur chat route:", error);
    return Response.json(
      {
        error: s(error?.message, "Erreur cote serveur IA"),
      },
      { status: 500 }
    );
  }
}
