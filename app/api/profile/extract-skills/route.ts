import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/app/lib/auth';
import { getRecord, updateRecordSkills, ExtractedSkill } from '@/app/lib/gameRecords';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    const result = validateSession(token);
    if (!result) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    const { user } = result;
    const body = await request.json();
    const { recordId } = body;

    if (!recordId) {
      return NextResponse.json({ error: 'Missing recordId' }, { status: 400 });
    }

    const record = getRecord(user.id, recordId);
    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    // Build the prompt from debrief data
    const debrief = record.debrief;
    const scenarioTitle = record.scenarioTitle;
    const scenarioCompetencies = debrief?.scenarioCompetencies || [];

    const debriefSummary = debrief?.phases
      ? debrief.phases.map((p: any) => `Phase "${p.title}": ${p.evaluation || ''}`).join('\n')
      : 'Aucune donnée de phase';

    const predefinedCompetencies = scenarioCompetencies.length > 0
      ? `\nCompétences prédéfinies du scénario:\n${scenarioCompetencies.map((c: any) => `- ${c.competency}: ${c.description}`).join('\n')}`
      : '';

    const systemPrompt = `Tu es un expert en évaluation de compétences professionnelles.
Analyse le debrief suivant d'un serious game et extrais les compétences clés démontrées par le joueur.

Pour chaque compétence, indique:
- Le nom de la compétence
- Le niveau: "acquise" (bien maîtrisée), "en_cours" (partiellement démontrée), ou "a_travailler" (à améliorer)
- Une courte preuve/extrait du debrief qui justifie ce niveau (1-2 phrases max)

Réponds UNIQUEMENT en JSON valide, sous la forme d'un array:
[{"skill": "...", "level": "acquise|en_cours|a_travailler", "evidence": "..."}]

Extrais entre 3 et 6 compétences pertinentes.`;

    const userMessage = `Scénario: ${scenarioTitle}
Score moyen: ${record.avgScore}%
Résultat: ${record.ending}
${predefinedCompetencies}

Évaluation par phase:
${debriefSummary}`;

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
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!aiResponse.ok) {
      console.error('Anthropic API error:', await aiResponse.text());
      return NextResponse.json({ error: 'AI extraction failed' }, { status: 500 });
    }

    const aiData = await aiResponse.json();
    const textContent = aiData.content?.[0]?.text || '[]';

    // Parse JSON from response
    let skills: ExtractedSkill[] = [];
    try {
      const jsonMatch = textContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        skills = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      console.error('Failed to parse AI skills response:', parseErr);
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
    }

    // Save skills to record
    updateRecordSkills(user.id, recordId, skills);

    return NextResponse.json({ skills });
  } catch (error) {
    console.error('Failed to extract skills:', error);
    return NextResponse.json({ error: 'Failed to extract skills' }, { status: 500 });
  }
}
