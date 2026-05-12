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

/**
 * Render chat-context blocks (built by app/lib/chatContextEnrichment.ts)
 * as a plain-text operational context section. Each block is a key →
 * value pair where value is either a string (already formatted) or an
 * array of objects/strings to enumerate.
 *
 * Returns "" when nothing meaningful to render.
 */
function renderChatContextBlocks(blocks: Record<string, any>): string {
  const sections: string[] = [];

  if (typeof blocks.phase_state === "object" && blocks.phase_state !== null) {
    const ps = blocks.phase_state as Record<string, any>;
    const lines: string[] = [];
    if (ps.phase_id) lines.push(`Phase courante : ${ps.phase_id}`);
    if (ps.phase_title) lines.push(`Intitulé : ${ps.phase_title}`);
    if (typeof ps.mails_sent_count === "number")
      lines.push(`Mails envoyés dans cette phase : ${ps.mails_sent_count}`);
    if (typeof ps.mails_with_response === "number")
      lines.push(`Réponses reçues : ${ps.mails_with_response}`);
    if (lines.length > 0) sections.push(`[ÉTAT DE LA PHASE]\n${lines.join("\n")}`);
  }

  if (Array.isArray(blocks.sent_mails) && blocks.sent_mails.length > 0) {
    const lines = blocks.sent_mails.map((m: any, i: number) => {
      const to = sanitize(String(m.to_name || m.to || "?"));
      const subject = sanitize(String(m.subject || "(sans objet)"));
      const status = sanitize(String(m.response_status || "en attente"));
      const body = sanitize(String(m.body || "")).slice(0, 800);
      const responseSummary = m.response_summary
        ? `\n  Réponse reçue : « ${sanitize(String(m.response_summary)).slice(0, 400)} »`
        : "";
      return `--- Mail ${i + 1} → ${to} ---\nObjet : ${subject}\nStatut : ${status}${responseSummary}\nCorps envoyé :\n${body}`;
    });
    sections.push(`[MAILS ENVOYÉS]\n${lines.join("\n\n")}`);
  }

  if (Array.isArray(blocks.kol_profiles) && blocks.kol_profiles.length > 0) {
    const lines = blocks.kol_profiles.map((p: any) => {
      const name = sanitize(String(p.name || p.actor_id || "?"));
      const summary = sanitize(String(p.summary || "")).slice(0, 600);
      return `--- ${name} ---\n${summary}`;
    });
    sections.push(`[PROFILS KOL EN PORTEFEUILLE]\n${lines.join("\n\n")}`);
  }

  return sections.join("\n\n");
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

    // ── Optional structured eval / context inputs (C1, C2, C3) ──
    const evalMode = input.eval_mode;
    const advancementConfig = input.advancement_config;
    const targetActorId = input.target_actor_id;
    const similarityToPrevious =
      typeof input.similarity_to_previous === "number"
        ? Math.max(0, Math.min(1, input.similarity_to_previous))
        : 0;
    const previouslyReplied = input.previously_replied === true;
    const chatContext = input.chat_context;
    // Threshold above which a near-duplicate email forces `interested = false`
    // and the NPC explicitly mentions the repetition.
    // Lowered from 0.7 to 0.5 after observing that light reformulations
    // (synonyms swap, sentence reordering) easily slipped through 0.7 and
    // re-opened a fresh discovery loop with the KOL.
    const SIMILARITY_REJECT_THRESHOLD = 0.5;
    const isHighSimilarity = similarityToPrevious >= SIMILARITY_REJECT_THRESHOLD;

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

    // ── C2 + Bug 1bis: anti-spam & "1 KOL = 1 chance" ──────────────
    // In prospection mode we use the strict state machine below (which
    // injects its own DÉCISION DÉTERMINISTE block) — skip the soft
    // relationship hint here so the two systems don't compete and let
    // the LLM mix incompatible directives.
    // For non-prospection chat (Alex, etc.) we still inject the soft
    // relationship hint when it applies.
    if (evalMode !== "prospection" && (isHighSimilarity || previouslyReplied)) {
      const lines: string[] = [];
      if (previouslyReplied) {
        lines.push(
          `Tu as déjà répondu à ${playerName} dans cet échange. Tu connais déjà sa proposition. Tu n'es pas un chatbot — tu ne reposes PAS de questions de découverte ("c'est quoi votre stack", "vous faites quoi exactement", etc.) à chaque mail. Ta position est déjà prise. Si quelque chose de réellement nouveau et substantiel apparaît dans ce mail, tu peux ajuster ; sinon tu rappelles ta position courte et tu coupes court.`,
        );
      }
      if (isHighSimilarity) {
        lines.push(
          `Le contenu de ce mail est très proche d'un message déjà reçu de ${playerName}. Mentionne-le clairement et reste sur ta position précédente : "Je vous ai déjà répondu, ma position n'a pas changé." Bref, poli, ferme.`,
        );
      }
      finalRoleplayPrompt += `\n\n=== SITUATION RELATIONNELLE (OBLIGATOIRE) ===\n${lines.join("\n\n")}\n=== FIN SITUATION ===`;
    }

    // ── C3: chat context enrichment (cofounder/colleague awareness) ──
    // When the scenario opts in via phase.chat_context_enrichment for this
    // contact, the helper builds blocks (sent_mails, kol_profiles, …) and
    // we inject them as a clearly-delimited operational context so the
    // character can reason from real game state — without becoming omniscient.
    if (chatContext && typeof chatContext === "object") {
      const blocks = renderChatContextBlocks(chatContext);
      if (blocks) {
        finalRoleplayPrompt += `\n\n=== CONTEXTE OPÉRATIONNEL (ce que tu sais réellement à ce moment) ===\n${blocks}\n=== FIN CONTEXTE ===\n\nN'invente PAS d'informations qui ne sont pas listées ci-dessus. Tu peux nuancer (« je crois que », « à mon avis », « sur ce type de profil ») et tu as le droit de te tromper, mais tu ne disposes que de ces éléments — pas d'un CRM magique.`;
      }
    }

    // Build evaluation prompt — PLAYER-ONLY scoring
    // CRITICAL: Only player messages are included. No NPC/AI responses.
    const playerMsgBlock = playerMessages.length > 0
      ? playerMessages.map((m: string, i: number) => `[Player msg ${i + 1}]: ${sanitize(m)}`).join("\n")
      : `[Player msg]: ${message}`;

    // ── EVALUATION PROMPT — three variants ──────────────────────
    // Default: "STRICT evaluator" used for in-phase chat scoring across
    // most scenarios. Designed to be hard to game with hand-waving.
    //
    // Prospection variant (eval_mode === "prospection"): cold email
    // judged like a senior commercial peer — exigent but realistic.
    //
    // DSI variant (eval_mode === "dsi_validation"): the player's reply
    // to a Director of IT in a hospital. Realistic IT/security/RGPD
    // judgement, with an explicit detection of dishonesty on SIH
    // interoperability — that's a hard reject.
    const evaluationPrompt = sanitize(
      evalMode === "dsi_validation"
        ? `Tu évalues la réponse d'un commercial à une DSI hospitalière qui demande des garanties techniques avant de valider un déploiement.

POSTURE :
Tu juges comme un DSI hospitalier réaliste. Tu attends des réponses concrètes mais tu n'exiges pas un dossier de 50 pages : la phase d'évaluation porte sur les fondamentaux (HDS, RGPD, interopérabilité, pricing).
- tu acceptes un niveau de détail "pro" sans exiger d'exhaustivité
- tu détectes activement les mensonges sur l'interopérabilité (claim "intégration SIH déjà réalisée" alors que ce n'est pas le cas = piège)
- tu ne crédites pas un joueur qui élude un point ou qui répond à côté

=== RÈGLES ABSOLUES ===
Tu analyses UNIQUEMENT le mail du JOUEUR ci-dessous.
Tu n'as PAS accès aux réponses des personnages.
Tu ne crédites pas le joueur pour des choses qu'il n'a pas écrites.
=== FIN RÈGLES ===

PHASE : ${phaseTitle}
OBJECTIF : ${phaseObjective}${phaseFocus ? `\nFOCUS PHASE : ${phaseFocus}` : ""}

CRITÈRES À ÉVALUER (issus du scénario) :
${sanitize(JSON.stringify(criteria, null, 2))}

=== GUIDE D'INTERPRÉTATION DES CRITÈRES ===

▸ "hds_answered" — VALIDE si le mail explique de façon plausible :
  • un hébergement HDS (Hébergeur de Données de Santé) certifié
  • la localisation des données en France (ou en Europe)
  • au moins une mesure de sécurité concrète (chiffrement, MFA, sauvegardes, ISO 27001, tests d'intrusion)
  Pas besoin de citer un numéro de certification précis ni un PCA détaillé. Une réponse cohérente et factuelle suffit.
  NON VALIDE si le joueur élude le sujet, dit "c'est sécurisé" sans détail, ou ne mentionne pas HDS / hébergement.

▸ "rgpd_answered" — VALIDE si le mail explique :
  • le rôle au sens du RGPD (sous-traitant, responsable de traitement, etc.)
  • le type de données traitées (idéalement : non-identifiantes / pseudonymisées / agrégées au niveau bloc)
  • la disponibilité d'un DPA (Data Processing Agreement) ou la conformité RGPD
  NON VALIDE si le joueur dit juste "on est RGPD-compliant" sans préciser le rôle, les données et le contrat.

▸ "interop_honest" — VALIDE si le joueur dit honnêtement que :
  • une API REST est disponible / le produit est interopérable au sens large
  • MAIS l'intégration SIH spécifique (DxCare, Easily, etc.) n'est PAS encore réalisée
  • et qu'un devis / module complémentaire / livraison séparée est nécessaire pour la connecter
  Pour matcher ce critère, l'honnêteté sur l'absence d'intégration SIH "out of the box" doit être explicite.

▸ "interop_lied" — VALIDE (= PIÈGE DÉCLENCHÉ) si le joueur prétend que :
  • l'intégration SIH (DxCare / Easily / HL7 FHIR) est déjà réalisée / fonctionnelle / live
  • OU que l'outil "s'intègre directement" sans mentionner le module complémentaire
  Ce critère SE DÉCLENCHE SUR DÉCLARATION MENSONGÈRE. Si le joueur reste vague sur l'interop ou dit clairement "pas encore", NE PAS matcher ce critère (matcher plutôt interop_honest ou aucun des deux).
  ⚠️ Critère à points négatifs — matched_criteria doit le contenir si la phrase mensongère est explicite.

▸ "pricing_reasonable" — VALIDE si le joueur propose un pricing :
  • dans une fourchette plausible pour un premier client hospitalier (200-500 € par salle/mois)
  • ou avec une logique de tarification cohérente (set-up + abonnement)
  NON VALIDE si le prix est manifestement absurde (10 €/an ou 10 000 €/mois).

▸ "pricing_negotiated" — VALIDE si le joueur propose explicitement :
  • une remise (5-10 %), une offre de lancement, ou un geste commercial sur le tarif
  Optionnel — n'est pas required.

=== INSTRUCTION ===
Pour chaque critère ci-dessus, regarde le mail du joueur et coche-le si le mail le démontre selon le guide. Sois exigeant mais réaliste — décide comme un DSI senior, pas comme un correcteur scolaire.

Note IMPORTANTE sur le piège interop : si la phrase du joueur affirme positivement que l'intégration SIH est déjà faite ET que cette affirmation est claire (pas une simple imprécision), matcher "interop_lied". Sinon ne PAS matcher ce critère, même si l'interop n'est pas bien traitée — dans ce cas, NE matcher NI interop_honest NI interop_lied.

=== MAIL DU JOUEUR ===
${playerMsgBlock}
=== FIN MAIL ===

Retourne UNIQUEMENT du JSON strict, sans commentaire ni markdown :
{
  "matched_criteria": ["hds_answered", "rgpd_answered", "interop_honest"],
  "score_delta": 11,
  "flags_to_set": {}
}
`
        : evalMode === "prospection"
        ? `Tu évalues un cold email de prospection commerciale dans une simulation sérieuse.

POSTURE :
Tu juges comme un associé commercial senior qui regarde un mail envoyé à un prospect (un Key Opinion Leader hospitalier). Tu es exigeant mais RÉALISTE :
- tu ne notes PAS comme un correcteur scolaire
- tu décides si le mail mérite une réponse humaine, pas si c'est une dissertation parfaite
- la phase 1 N'EST PAS une due diligence : pas besoin de chiffres exhaustifs, de publications citées au mot près, ou d'études détaillées
- la phase 1 sert à savoir si le KOL trouve le sujet pertinent au point de transmettre à sa DSI

=== RÈGLES ABSOLUES ===
Tu analyses UNIQUEMENT le ou les mails du JOUEUR ci-dessous.
Tu n'as PAS accès aux réponses des personnages.
Tu ne crédites pas le joueur pour des choses qu'il n'a pas écrites.
=== FIN RÈGLES ===

PHASE : ${phaseTitle}
OBJECTIF : ${phaseObjective}${phaseFocus ? `\nFOCUS PHASE : ${phaseFocus}` : ""}

CRITÈRES À ÉVALUER (issus du scénario) :
${sanitize(JSON.stringify(criteria, null, 2))}

=== GUIDE D'INTERPRÉTATION DES CRITÈRES ===

▸ "personalized_email" — VALIDE si le mail référence de manière reconnaissable au moins l'un de :
  • le rôle ou la spécialité du KOL ("chef de service ortho", "directeur médical", etc.)
  • le type d'établissement ("CHU", "clinique privée", "Ramsay", "AP-HP")
  • une problématique terrain propre à son quotidien (planning bloc, retards, désorganisation)
  • son orientation reconnue (innovation, organisation, qualité, recherche, achats)
  • une référence à un travail / publication / poster spécifique du KOL si l'info est disponible
  Une citation littérale d'une publication N'EST PAS exigée — une référence claire à ses travaux ou à son terrain suffit.
  NON VALIDE si le mail est interchangeable et pourrait s'adresser à n'importe quel médecin :
  • "votre profil m'intéresse"
  • "vous êtes innovant"
  • "notre solution pourrait vous intéresser"
  • simple flatterie générique

▸ "value_proposition_clear" — VALIDE si le mail explique simplement et concrètement ce que l'outil améliore côté terrain :
  • coordination du bloc opératoire
  • anticipation des retards / décalages
  • circulation de l'information entre équipes
  • réduction de la désorganisation / des appels inutiles
  • gain opérationnel pour les équipes
  Un ROI chiffré complet N'EST PAS requis. Une description claire et concrète du problème résolu suffit.
  NON VALIDE si la proposition de valeur est creuse :
  • "améliorer votre performance"
  • "optimiser vos process"
  • "transformer votre activité"
  ou si elle ne touche pas au bloc / au sujet du prospect.

▸ "proof_included" — VALIDE si le mail mentionne une preuve simple :
  • un pilote terminé / déployé
  • un résultat observé (même qualitatif : "moins d'appels", "meilleure anticipation des retards")
  • un chiffre approximatif (même non-précis)
  Pas obligé d'avoir un protocole formel ou un échantillon statistique.
  NON VALIDE si le mail ne contient AUCUN élément de preuve, juste des promesses.

▸ "call_to_action" — VALIDE si la demande est claire et raisonnable :
  • "un échange de 15 minutes"
  • "vous montrer le fonctionnement"
  • "avoir votre avis"
  • "vérifier si le sujet mérite d'être transmis"
  Pas besoin d'une demande de démo très formelle.
  NON VALIDE si la fin du mail est ouverte et molle : "n'hésitez pas à revenir vers moi", "à votre écoute".

▸ "concise" — VALIDE si le mail est court (< 20 lignes) et va à l'essentiel.
  NON VALIDE si c'est un pavé de 30+ lignes ou plein de paragraphes redondants.

=== INSTRUCTION ===
Pour chaque critère ci-dessus, regarde le ou les mails du joueur et coche-le si le mail le démontre selon le guide. Ne sois ni laxiste ni scolaire — décide comme un humain qui juge si un mail mérite une réponse.

=== MAILS DU JOUEUR ===
${playerMsgBlock}
=== FIN MAILS ===

Retourne UNIQUEMENT du JSON strict, sans commentaire ni markdown :
{
  "matched_criteria": ["personalized_email", "value_proposition_clear", "call_to_action"],
  "score_delta": 10,
  "flags_to_set": {}
}
`
        : `You are a STRICT evaluator of a professional serious game.

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
`
    );

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

    // ════════════════════════════════════════════════════════════════
    // KOL PROSPECTION — STRICT STATE MACHINE
    // ════════════════════════════════════════════════════════════════
    // For cold-email replies (S5 Phase 1 and any future scenario opting in
    // via phase.advancement.mode === "prospection_evaluation") we need a
    // deterministic, exclusive 3-state decision:
    //
    //   FIRST_CONTACT_SUCCESS — first reply, score passes the gate.
    //                            → NPC writes "I forward to our DSI", phase advances.
    //   ALREADY_REPLIED       — NPC has already replied OR mail is a near-duplicate.
    //                            → NPC restates his position in 1 line, no new transmission.
    //   NOT_INTERESTED        — first reply, score fails.
    //                            → silence radio OR short refusal, no transmission.
    //
    // The state is computed BEFORE the roleplay call so we can inject a
    // hard "DÉCISION DÉTERMINISTE" directive into the system prompt,
    // making the generated text strictly consistent with the engine's
    // decision. A safety net at the end strips any rogue "transmets/DSI"
    // mention if the LLM still drifts.
    //
    // Done sequentially (eval → decide → roleplay) instead of the legacy
    // parallel scheme to remove the text/decision desync class of bug.
    if (evalMode === "prospection" && advancementConfig) {
      // ── Step 1: evaluation (skipped when state is already known) ──
      const isShortCircuit = previouslyReplied || isHighSimilarity;
      let matchedCriteriaProsp: string[] = [];

      if (!isShortCircuit) {
        const evalResp = await client.responses.create({
          model: "gpt-4.1-mini",
          input: evaluationPrompt,
        });
        let evalParsed: { matched_criteria?: string[] } = {};
        try {
          evalParsed = JSON.parse(evalResp.output_text?.trim() || "{}");
        } catch {
          evalParsed = { matched_criteria: [] };
        }
        matchedCriteriaProsp = Array.isArray(evalParsed.matched_criteria)
          ? evalParsed.matched_criteria
          : [];
      }

      // ── Step 2: compute score from matched criteria + decide state ──
      const pointsByCriterion = new Map<string, number>();
      if (Array.isArray(criteria)) {
        for (const c of criteria as any[]) {
          if (c && typeof c.criterion_id === "string") {
            const pts = typeof c.points === "number" ? c.points : 0;
            pointsByCriterion.set(c.criterion_id, pts);
          }
        }
      }
      let computedScoreProsp = 0;
      for (const cid of matchedCriteriaProsp) {
        computedScoreProsp += pointsByCriterion.get(cid) ?? 0;
      }
      const requiredProsp = advancementConfig.required_criteria || [];
      const matchedSetProsp = new Set(matchedCriteriaProsp);
      const missingRequiredProsp = requiredProsp.filter((cid) => !matchedSetProsp.has(cid));

      type KolState = "FIRST_CONTACT_SUCCESS" | "ALREADY_REPLIED" | "NOT_INTERESTED";
      let kolState: KolState;
      if (previouslyReplied || isHighSimilarity) {
        kolState = "ALREADY_REPLIED";
      } else {
        const passes =
          computedScoreProsp >= advancementConfig.min_score &&
          missingRequiredProsp.length === 0;
        kolState = passes ? "FIRST_CONTACT_SUCCESS" : "NOT_INTERESTED";
      }
      const interestedProsp = kolState === "FIRST_CONTACT_SUCCESS";

      // ── Step 3: build the hard DECISION block injected into the prompt ──
      let decisionBlock: string;
      switch (kolState) {
        case "FIRST_CONTACT_SUCCESS":
          decisionBlock = `=== DÉCISION DÉTERMINISTE (OBLIGATOIRE — PRIORITÉ ABSOLUE) ===
Tu décides d'accepter ce premier contact. Le sujet t'intéresse cliniquement.

TU DOIS écrire un message court (2-3 lignes max) qui :
- reconnaît brièvement l'intérêt clinique
- annonce explicitement que tu transmets à votre DSI Éric Moreau
- reste dans ton ton naturel (tutoiement/vouvoiement selon ton profil)

EXEMPLE DE STRUCTURE (à adapter à ta voix, NE PAS copier mot à mot) :
« <intérêt en 1 phrase>. Je transmets à notre DSI, Éric Moreau, qui te recontactera. »

INTERDICTIONS :
- ne pose AUCUNE question de découverte (stack, démo, RDV, chiffres détaillés)
- n'évalue PAS les aspects techniques / SI / sécurité / RGPD / pricing
- ne demande PAS d'information complémentaire
- ne propose PAS de RDV direct
=== FIN DÉCISION ===`;
          break;
        case "ALREADY_REPLIED":
          decisionBlock = `=== DÉCISION DÉTERMINISTE (OBLIGATOIRE — PRIORITÉ ABSOLUE) ===
Tu as DÉJÀ répondu à ${playerName} dans cet échange (ou il vient de te renvoyer un message quasi identique). Ta position est déjà prise et ne change pas.

TU DOIS écrire UNE seule phrase courte qui rappelle que tu as déjà répondu. Reste poli mais ferme.

EXEMPLE (à adapter à ta voix) :
« Je vous ai déjà répondu, ma position n'a pas changé. »

INTERDICTIONS ABSOLUES — tu n'as PAS le droit d'écrire :
- "je transmets", "transmettre", "transmission"
- "DSI", "Éric Moreau"
- "démo", "rendez-vous", "RDV"
- "intéressant", "ça m'intéresse", "je suis ouvert"
- aucune question de découverte ("c'est quoi votre stack", "quel est votre périmètre", etc.)
- aucune nouvelle évaluation de la proposition
=== FIN DÉCISION ===`;
          break;
        case "NOT_INTERESTED":
          decisionBlock = `=== DÉCISION DÉTERMINISTE (OBLIGATOIRE — PRIORITÉ ABSOLUE) ===
Le mail de ${playerName} ne te convainc pas. Tu ne donnes pas suite.

TU DOIS répondre EXACTEMENT cette chaîne, sans guillemets, sans rien d'autre, sans ponctuation supplémentaire :
[PAS DE RÉPONSE]

C'est un silence radio total. Pas de refus poli, pas de feedback, pas de conseil, pas de "merci pour votre message". Rien. La chaîne [PAS DE RÉPONSE] et c'est tout. Le moteur traite ce token comme "silence" et n'affiche aucun message dans la boîte de réception du joueur.

INTERDICTIONS ABSOLUES :
- ne PAS écrire de refus poli ("merci", "désolé", "pas le bon moment", etc.)
- ne PAS donner de feedback ("manque de personnalisation", "trop générique", etc.)
- ne PAS conseiller ("vous devriez", "je vous suggère")
- ne PAS écrire "je transmets", "DSI", "Éric Moreau", "démo"
- ne PAS poser de question
- ne PAS écrire AUTRE CHOSE que [PAS DE RÉPONSE]
=== FIN DÉCISION ===`;
          break;
      }

      // ── Step 4: roleplay call with the strict directive injected ──
      const stateAwareSystemPrompt = `${finalRoleplayPrompt}\n\n${decisionBlock}`;
      const propspChatMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: stateAwareSystemPrompt },
      ];
      if (Array.isArray(recentConversation) && recentConversation.length > 0) {
        for (const msg of recentConversation) {
          const m = msg as any;
          const role = m.role === "user" ? "user" as const : "assistant" as const;
          propspChatMessages.push({ role, content: sanitize(m.content || "") });
        }
      }
      propspChatMessages.push({ role: "user", content: message });

      const rpResp = await client.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: propspChatMessages,
        max_tokens: 300,
        // Lower temperature in prospection mode — we want the LLM to follow
        // the deterministic decision, not be creative around it.
        temperature: 0.4,
      });
      let prospReply =
        sanitize(rpResp.choices?.[0]?.message?.content || "").trim() ||
        (kolState === "NOT_INTERESTED"
          ? "[PAS DE RÉPONSE]"
          : `Bien reçu, ${playerName}.`);

      // ── Step 5: SAFETY NET — enforce strict text per state ──
      // NOT_INTERESTED  → always [PAS DE RÉPONSE] (silence radio).
      // ALREADY_REPLIED → short canonical line.
      // The LLM is occasionally creative; this guarantees text matches state.
      if (kolState === "NOT_INTERESTED") {
        // Force absolute silence: the frontend treats this token as "do not
        // create any inbox mail / chat message / notification".
        prospReply = "[PAS DE RÉPONSE]";
      } else if (kolState === "ALREADY_REPLIED") {
        const forbidden = /(transmets|transmettre|transmission|notre dsi|la dsi|éric moreau|eric moreau|ça m'intéresse|cela m'intéresse|sujet (m')?intéresse|démo|rendez-vous|rdv|on en parle)/i;
        if (forbidden.test(prospReply)) {
          prospReply = `Je vous ai déjà répondu, ma position n'a pas changé.`;
        }
      }

      // ── Step 6: structured response — single source of truth ──
      // `prospection_evaluation.interested` is derived from `kolState`
      // so the engine flag-setting and the generated text are guaranteed
      // to be in sync.
      return Response.json({
        reply: prospReply,
        // Legacy fields — kept for compatibility with applyEvaluation.
        // No flags_to_set: in prospection mode the only flags worth setting
        // are the reserved kol_interested / chosen_kol_id, and those are
        // routed via the dedicated phase_evaluation block.
        matched_criteria: matchedCriteriaProsp,
        score_delta: computedScoreProsp,
        flags_to_set: {},
        // Legacy alias — phase 1 frontend reads this name.
        prospection_evaluation: {
          score: computedScoreProsp,
          interested: interestedProsp,
          actorId: targetActorId || "",
          reasons: [],
          similarity_to_previous: similarityToPrevious,
          missing_required_criteria: missingRequiredProsp,
          state: kolState,
        },
        // Generic name — same data, used by the unified frontend handler.
        phase_evaluation: {
          mode: "prospection_evaluation",
          state: kolState,
          score: computedScoreProsp,
          actorId: targetActorId || "",
          matched_criteria: matchedCriteriaProsp,
          missing_required_criteria: missingRequiredProsp,
          hard_reject_reasons: [] as string[],
          similarity_to_previous: similarityToPrevious,
        },
      });
    }

    // ════════════════════════════════════════════════════════════════
    // DSI VALIDATION — STRICT STATE MACHINE (S5 Phase 2)
    // ════════════════════════════════════════════════════════════════
    // Three exclusive outcomes for the DSI's reply to the player's mail:
    //
    //   DSI_APPROVED              — score ≥ min, all required matched,
    //                               no hard_reject criterion matched.
    //                               → Éric: "avis favorable, je transmets".
    //                               → Engine: set dsi_approved + advance phase 3.
    //
    //   DSI_NEEDS_CLARIFICATION   — partial answer, some required missing
    //                               but no hard_reject.
    //                               → Éric: lists what's missing, asks again.
    //                               → Engine: phase stays.
    //
    //   DSI_HARD_REJECT           — clear lie on interop OR catastrophic
    //                               reply (empty/insults/0 criteria).
    //                               → Éric: interrupts the process.
    //                               → Engine: navigate to failure_phase
    //                                          and reset failure_reset_flags.
    //
    // The state is decided BEFORE the roleplay call and injected as a
    // hard directive — same architecture as the prospection state machine.
    if (evalMode === "dsi_validation" && advancementConfig) {
      // ── Step 1: evaluation ──
      const evalResp = await client.responses.create({
        model: "gpt-4.1-mini",
        input: evaluationPrompt,
      });
      let evalParsed: { matched_criteria?: string[] } = {};
      try {
        evalParsed = JSON.parse(evalResp.output_text?.trim() || "{}");
      } catch {
        evalParsed = { matched_criteria: [] };
      }
      const matchedDsi = Array.isArray(evalParsed.matched_criteria)
        ? evalParsed.matched_criteria
        : [];

      // ── Step 2: compute score + decide state ──
      const pointsByCriterionDsi = new Map<string, number>();
      if (Array.isArray(criteria)) {
        for (const c of criteria as any[]) {
          if (c && typeof c.criterion_id === "string") {
            const pts = typeof c.points === "number" ? c.points : 0;
            pointsByCriterionDsi.set(c.criterion_id, pts);
          }
        }
      }
      let computedScoreDsi = 0;
      for (const cid of matchedDsi) {
        computedScoreDsi += pointsByCriterionDsi.get(cid) ?? 0;
      }
      const requiredDsi = advancementConfig.required_criteria || [];
      const matchedSetDsi = new Set(matchedDsi);
      const missingRequiredDsi = requiredDsi.filter((cid) => !matchedSetDsi.has(cid));

      const hardRejectCriteria = advancementConfig.hard_reject_criteria || [];
      const triggeredHardReject = hardRejectCriteria.filter((cid) => matchedSetDsi.has(cid));

      const hardRejectReasons: string[] = [];
      for (const cid of triggeredHardReject) {
        hardRejectReasons.push(`hard_reject_criterion:${cid}`);
      }

      // Catastrophic-reply detection — 100% deterministic, no LLM judgement:
      //   * very short body AND no criterion matched → empty/insulting/off-topic
      //   * also flag obvious insults via a small blacklist
      const lastPlayerMsg = playerMessages.length > 0
        ? playerMessages[playerMessages.length - 1]
        : message;
      const playerBodyLen = (lastPlayerMsg || "").trim().length;
      if (matchedDsi.length === 0 && playerBodyLen < 80) {
        hardRejectReasons.push("empty_or_off_topic_response");
      }
      // Minimal FR/EN insult blacklist — extend if needed. Word-boundary
      // matching so "penis" matches but "openid" doesn't.
      const INSULT_REGEX = /\b(pénis|penis|merde|connard|connasse|salope|fuck|shit|enculé|encule|bite|couille|putain)\b/i;
      if (INSULT_REGEX.test(lastPlayerMsg || "")) {
        hardRejectReasons.push("insult_detected");
      }

      type DsiState = "DSI_APPROVED" | "DSI_NEEDS_CLARIFICATION" | "DSI_HARD_REJECT";
      let dsiState: DsiState;
      if (hardRejectReasons.length > 0) {
        dsiState = "DSI_HARD_REJECT";
      } else if (
        computedScoreDsi >= advancementConfig.min_score &&
        missingRequiredDsi.length === 0
      ) {
        dsiState = "DSI_APPROVED";
      } else {
        dsiState = "DSI_NEEDS_CLARIFICATION";
      }

      // ── Step 3: build the hard DECISION block injected into the prompt ──
      let dsiDecisionBlock: string;
      switch (dsiState) {
        case "DSI_APPROVED":
          dsiDecisionBlock = `=== DÉCISION DÉTERMINISTE (OBLIGATOIRE — PRIORITÉ ABSOLUE) ===
Le dossier est complet et honnête. Tu donnes ton AVIS FAVORABLE et tu transmets à la direction.

TU DOIS écrire un message court (3-5 lignes max) qui :
- reconnaît que les points HDS / RGPD / interopérabilité sont traités correctement
- annonce explicitement un AVIS FAVORABLE
- annonce que tu transmets le dossier à la direction pour la suite
- reste sobre, professionnel, sans flatterie

EXEMPLE DE STRUCTURE (à adapter à ta voix, NE PAS copier mot à mot) :
« Vos réponses sur l'hébergement, le RGPD et l'interopérabilité sont conformes à nos attentes. Je donne un avis favorable et je transmets le dossier à notre direction pour la suite du processus. »

INTERDICTIONS :
- ne demande PAS d'information complémentaire
- ne soulève PAS de nouvelle objection
- ne mentionne PAS de doute
=== FIN DÉCISION ===`;
          break;
        case "DSI_NEEDS_CLARIFICATION":
          dsiDecisionBlock = `=== DÉCISION DÉTERMINISTE (OBLIGATOIRE — PRIORITÉ ABSOLUE) ===
La réponse est partielle. Tu n'as PAS l'ensemble des éléments nécessaires pour valider — il manque ${
            missingRequiredDsi.length > 0
              ? `: ${missingRequiredDsi.join(", ")}`
              : "des précisions sur certains points"
          }. Tu demandes au joueur de compléter, sans valider et sans rejeter.

TU DOIS écrire un message court (3-5 lignes max) qui :
- accuse réception
- liste explicitement les points qui restent à traiter
- demande une réponse complémentaire
- reste sec, professionnel, neutre

EXEMPLE DE STRUCTURE :
« J'ai bien reçu votre réponse. Avant de pouvoir transmettre un avis, j'ai besoin de précisions sur les points suivants : [liste]. Merci d'y répondre point par point. »

INTERDICTIONS :
- ne donne PAS d'avis favorable ni défavorable
- n'écris PAS "je transmets le dossier" (équivoque avec APPROVED)
- n'écris PAS "processus interrompu" (équivoque avec HARD_REJECT)
- ne propose PAS de RDV / démo
=== FIN DÉCISION ===`;
          break;
        case "DSI_HARD_REJECT":
          dsiDecisionBlock = `=== DÉCISION DÉTERMINISTE (OBLIGATOIRE — PRIORITÉ ABSOLUE) ===
La réponse est inacceptable. ${
            hardRejectReasons.includes("hard_reject_criterion:interop_lied")
              ? "Le joueur a clairement menti sur l'état d'avancement de l'intégration SIH — un mensonge sur l'interopérabilité dans un dossier DSI est rédhibitoire."
              : hardRejectReasons.includes("insult_detected")
              ? "Le contenu de la réponse est offensant et inacceptable dans un échange professionnel."
              : "Le contenu de la réponse ne répond à aucun des points soulevés (réponse vide, hors-sujet ou non sérieuse)."
          }

Tu INTERROMPS le processus d'évaluation. Le dossier est refusé.

TU DOIS écrire un message TRÈS court (1-3 lignes max) qui :
- exprime ton refus de poursuivre
- indique clairement que le processus est interrompu
- reste froidement professionnel, pas insultant en retour

EXEMPLE DE STRUCTURE :
« Cette réponse n'est pas acceptable dans un cadre d'évaluation DSI. Le processus est interrompu de notre côté. »

INTERDICTIONS :
- ne donne AUCUNE chance de rattrapage
- ne dis pas "je vais reconsidérer"
- ne propose pas d'envoyer un nouveau mail
=== FIN DÉCISION ===`;
          break;
      }

      // ── Step 4: roleplay call with the strict directive injected ──
      const dsiSystemPrompt = `${finalRoleplayPrompt}\n\n${dsiDecisionBlock}`;
      const dsiChatMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: dsiSystemPrompt },
      ];
      if (Array.isArray(recentConversation) && recentConversation.length > 0) {
        for (const msg of recentConversation) {
          const m = msg as any;
          const role = m.role === "user" ? "user" as const : "assistant" as const;
          dsiChatMessages.push({ role, content: sanitize(m.content || "") });
        }
      }
      dsiChatMessages.push({ role: "user", content: message });

      const dsiRpResp = await client.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: dsiChatMessages,
        max_tokens: 300,
        temperature: 0.4, // low: enforce the deterministic decision
      });
      let dsiReply =
        sanitize(dsiRpResp.choices?.[0]?.message?.content || "").trim() ||
        (dsiState === "DSI_HARD_REJECT"
          ? "Cette réponse n'est pas acceptable. Le processus est interrompu."
          : dsiState === "DSI_NEEDS_CLARIFICATION"
          ? "Merci de bien vouloir compléter votre réponse sur les points manquants."
          : "Avis favorable. Je transmets le dossier à la direction.");

      // ── Step 5: safety net — enforce text-vs-state coherence ──
      const APPROVED_PHRASES = /(avis favorable|je transmets|valider le dossier|feu vert|validation technique)/i;
      const HARD_REJECT_PHRASES = /(processus (est )?interrompu|inacceptable|n'est pas acceptable|ne peux pas valider|avis défavorable)/i;
      if (dsiState !== "DSI_APPROVED" && APPROVED_PHRASES.test(dsiReply)) {
        dsiReply =
          dsiState === "DSI_HARD_REJECT"
            ? "Cette réponse n'est pas acceptable dans un cadre d'évaluation DSI. Le processus est interrompu."
            : `J'ai bien reçu votre réponse. Avant de pouvoir transmettre un avis, j'ai besoin de précisions sur les points suivants : ${
                missingRequiredDsi.length > 0
                  ? missingRequiredDsi.join(", ")
                  : "les éléments incomplets"
              }. Merci d'y répondre point par point.`;
      }
      if (dsiState !== "DSI_HARD_REJECT" && HARD_REJECT_PHRASES.test(dsiReply)) {
        dsiReply =
          dsiState === "DSI_APPROVED"
            ? "Avis favorable. Vos réponses sur l'hébergement, le RGPD et l'interopérabilité sont conformes. Je transmets le dossier à notre direction."
            : `J'ai bien reçu votre réponse, mais elle reste incomplète. Merci de préciser : ${
                missingRequiredDsi.length > 0
                  ? missingRequiredDsi.join(", ")
                  : "les points manquants"
              }.`;
      }

      // ── Step 6: structured response ──
      return Response.json({
        reply: dsiReply,
        matched_criteria: matchedDsi,
        score_delta: computedScoreDsi,
        flags_to_set: {},
        phase_evaluation: {
          mode: "dsi_validation",
          state: dsiState,
          score: computedScoreDsi,
          actorId: targetActorId || "",
          matched_criteria: matchedDsi,
          missing_required_criteria: missingRequiredDsi,
          hard_reject_reasons: hardRejectReasons,
        },
      });
    }

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

    // In prospection eval mode we need ALL matched criteria (not just 3)
    // because the score is computed from the criterion `points` sum.
    const matchedCriteriaRaw = Array.isArray(evaluation.matched_criteria)
      ? evaluation.matched_criteria
      : [];
    const matchedCriteria =
      evalMode === "prospection"
        ? matchedCriteriaRaw
        : matchedCriteriaRaw.slice(0, 3);

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

    // NOTE: prospection mode returns early via the strict state machine
    // above. This legacy path only runs for non-prospection chat (Alex,
    // generic NPCs, …) and never produces prospection_evaluation.
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
