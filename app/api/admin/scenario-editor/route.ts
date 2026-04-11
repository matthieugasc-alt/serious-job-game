import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { validateSession } from '@/app/lib/auth';

export const runtime = 'nodejs';

/**
 * AI-powered scenario editor. Allows admin to modify scenario fields
 * via natural language conversation with Claude.
 *
 * Only modifies "safe" fields: texts, prompts, objectives, criteria,
 * actor names/personalities, mail content, narrative, meta fields.
 * Does NOT modify structural fields (phase IDs, channel definitions, etc.)
 */

const EDITABLE_PATHS = [
  'meta.title', 'meta.subtitle', 'meta.description', 'meta.pedagogical_goals',
  'meta.tags', 'meta.competencies', 'meta.difficulty', 'meta.estimated_duration_min',
  'narrative.context', 'narrative.mission', 'narrative.initial_situation',
  'narrative.trigger', 'narrative.background_fact',
  'introduction.header.tag', 'introduction.header.title', 'introduction.header.subtitle',
  'introduction.cards',
  // Per-phase fields (dynamic)
  'phases.*.title', 'phases.*.objective', 'phases.*.intro_message',
  'phases.*.scoring.criteria', 'phases.*.entry_events.*.content',
  'phases.*.interruptions.*.content', 'phases.*.mail_config.defaults',
  'phases.*.mail_config.send_label',
  'phases.*.presentation_config.instructions',
  'phases.*.voice_qa_config.children_names',
  // Per-actor fields
  'actors.*.name', 'actors.*.role', 'actors.*.personality',
  'actors.*.avatar.color', 'actors.*.avatar.initials',
  'actors.*.contact_preview', 'actors.*.availability',
  // Initial events
  'initial_events.*.content', 'initial_events.*.subject',
  // Endings
  'endings.*.label', 'endings.*.content',
  'default_ending.label', 'default_ending.content',
];

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    const result = validateSession(token);
    if (!result || result.user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { scenarioId, message, conversationHistory } = body;

    if (!scenarioId || !message) {
      return NextResponse.json({ error: 'Missing scenarioId or message' }, { status: 400 });
    }

    // Load current scenario JSON
    const scenarioDir = path.join(process.cwd(), 'scenarios', scenarioId);
    const scenarioFile = path.join(scenarioDir, 'scenario.json');

    if (!fs.existsSync(scenarioFile)) {
      return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
    }

    const scenarioJson = JSON.parse(fs.readFileSync(scenarioFile, 'utf-8'));

    // Build system prompt
    const systemPrompt = `Tu es un assistant expert en conception de serious games.
Tu aides l'administrateur à modifier un scénario de jeu sérieux.

RÈGLES STRICTES:
1. Tu ne peux modifier QUE les champs textuels et de contenu (titres, descriptions, objectifs, critères, dialogues, prompts IA, compétences, tags, instructions).
2. Tu ne peux PAS modifier la structure (IDs de phases, canaux, types de triggers, conditions de completion, flags).
3. Quand tu proposes des modifications, tu dois retourner un JSON avec la structure suivante:
{
  "explanation": "Explication en français de ce que tu vas modifier",
  "changes": [
    {
      "path": "chemin.vers.le.champ",
      "old_value": "ancienne valeur (ou null si trop long)",
      "new_value": "nouvelle valeur"
    }
  ]
}
4. Si l'utilisateur demande quelque chose d'impossible ou hors du périmètre, explique pourquoi et propose une alternative.
5. Si la demande est ambiguë, pose une question de clarification AVANT de proposer des changements.
6. TOUJOURS répondre en français.
7. Pour les chemins dans les arrays, utilise l'index numérique: phases.0.title, actors.1.name, etc.

Voici les chemins modifiables autorisés:
${EDITABLE_PATHS.join('\n')}

Voici le scénario actuel (JSON complet):
${JSON.stringify(scenarioJson, null, 2)}`;

    // Build conversation
    const messages: Array<{ role: string; content: string }> = [];

    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: 'user', content: message });

    // Call Anthropic API
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 });
    }

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('Anthropic API error:', errText);
      return NextResponse.json({ error: 'AI request failed' }, { status: 500 });
    }

    const aiData = await aiResponse.json();
    const reply = aiData.content?.[0]?.text || '';

    // Try to parse changes from reply
    let changes: any[] | null = null;
    let explanation = reply;

    try {
      const jsonMatch = reply.match(/\{[\s\S]*"changes"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.changes && Array.isArray(parsed.changes)) {
          changes = parsed.changes;
          explanation = parsed.explanation || reply;
        }
      }
    } catch {
      // No valid JSON — just a text response (question or explanation)
    }

    return NextResponse.json({
      reply: explanation,
      changes,
      rawReply: reply,
    });
  } catch (error) {
    console.error('Scenario editor error:', error);
    return NextResponse.json({ error: 'Editor failed' }, { status: 500 });
  }
}

/**
 * Apply changes to scenario JSON
 */
export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    const result = validateSession(token);
    if (!result || result.user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { scenarioId, changes } = body;

    if (!scenarioId || !changes || !Array.isArray(changes)) {
      return NextResponse.json({ error: 'Missing scenarioId or changes' }, { status: 400 });
    }

    const scenarioDir = path.join(process.cwd(), 'scenarios', scenarioId);
    const scenarioFile = path.join(scenarioDir, 'scenario.json');

    if (!fs.existsSync(scenarioFile)) {
      return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
    }

    const scenarioJson = JSON.parse(fs.readFileSync(scenarioFile, 'utf-8'));

    // Apply changes
    const applied: string[] = [];
    const failed: string[] = [];

    for (const change of changes) {
      try {
        const pathParts = change.path.split('.');
        let obj = scenarioJson;

        // Navigate to parent
        for (let i = 0; i < pathParts.length - 1; i++) {
          const key = isNaN(Number(pathParts[i])) ? pathParts[i] : Number(pathParts[i]);
          if (obj[key] === undefined) {
            throw new Error(`Path not found: ${change.path}`);
          }
          obj = obj[key];
        }

        // Set value
        const lastKey = isNaN(Number(pathParts[pathParts.length - 1]))
          ? pathParts[pathParts.length - 1]
          : Number(pathParts[pathParts.length - 1]);

        obj[lastKey] = change.new_value;
        applied.push(change.path);
      } catch (err: any) {
        failed.push(`${change.path}: ${err.message}`);
      }
    }

    // Save updated scenario
    fs.writeFileSync(scenarioFile, JSON.stringify(scenarioJson, null, 2), 'utf-8');

    return NextResponse.json({
      message: 'Changes applied',
      applied,
      failed,
    });
  } catch (error) {
    console.error('Failed to apply changes:', error);
    return NextResponse.json({ error: 'Failed to apply changes' }, { status: 500 });
  }
}
