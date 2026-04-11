import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { validateSession } from '@/app/lib/auth';
import { saveRecord, updateRecordPdf, ServerGameRecord } from '@/app/lib/gameRecords';

const execAsync = promisify(exec);

export const runtime = 'nodejs';

// Ensure debriefs directory exists
function ensureDebrifsDir(): void {
  const debrifsDir = path.join(process.cwd(), 'data', 'debriefs');
  if (!fs.existsSync(debrifsDir)) {
    fs.mkdirSync(debrifsDir, { recursive: true });
  }
}

// Generate PDF from debrief data
async function generatePdf(recordId: string, debrief: any): Promise<string | null> {
  try {
    ensureDebrifsDir();

    const dataDir = path.join(process.cwd(), 'data');
    const debriefJsonPath = path.join(dataDir, `debrief_temp_${recordId}.json`);
    const outputPdfPath = path.join(dataDir, 'debriefs', `${recordId}.pdf`);

    // Write debrief JSON to temp file
    fs.writeFileSync(debriefJsonPath, JSON.stringify(debrief, null, 2), 'utf-8');

    // Call Python script to generate PDF
    try {
      await execAsync(`python3 scripts/generate_debrief_pdf.py "${outputPdfPath}" < "${debriefJsonPath}"`, {
        cwd: process.cwd(),
      });

      // Clean up temp file
      if (fs.existsSync(debriefJsonPath)) {
        fs.unlinkSync(debriefJsonPath);
      }

      // Return relative path
      return `debriefs/${recordId}.pdf`;
    } catch (pythonError) {
      console.error('Python script execution failed:', pythonError);
      // Clean up temp file
      if (fs.existsSync(debriefJsonPath)) {
        fs.unlinkSync(debriefJsonPath);
      }
      // Return null if PDF generation fails, but still save the record
      return null;
    }
  } catch (error) {
    console.error('Failed to generate PDF:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Extract token from Authorization header
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
    }

    // Validate session
    const result = validateSession(token);
    if (!result) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    const { user } = result;

    // Parse request body
    const body = await request.json();

    // Validate required fields
    const requiredFields = [
      'scenarioId',
      'scenarioTitle',
      'playerName',
      'ending',
      'avgScore',
      'durationMin',
      'phasesCompleted',
      'totalPhases',
      'debrief',
    ];

    for (const field of requiredFields) {
      if (!(field in body)) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 },
        );
      }
    }

    // Save game record
    const recordData: Omit<ServerGameRecord, 'id' | 'date'> = {
      scenarioId: body.scenarioId,
      scenarioTitle: body.scenarioTitle,
      playerName: body.playerName,
      ending: body.ending,
      avgScore: body.avgScore,
      durationMin: body.durationMin,
      phasesCompleted: body.phasesCompleted,
      totalPhases: body.totalPhases,
      debrief: body.debrief,
    };

    const savedRecord = saveRecord(user.id, recordData);

    // Attempt to generate PDF in the background
    generatePdf(savedRecord.id, body.debrief)
      .then((pdfPath) => {
        if (pdfPath) {
          try {
            updateRecordPdf(user.id, savedRecord.id, pdfPath);
          } catch (error) {
            console.error('Failed to update PDF path in record:', error);
          }
        }
      })
      .catch((error) => {
        console.error('Background PDF generation failed:', error);
      });

    return NextResponse.json(
      { record: savedRecord, message: 'Game record saved successfully' },
      { status: 201 },
    );
  } catch (error) {
    console.error('Failed to save game record:', error);
    return NextResponse.json({ error: 'Failed to save game record' }, { status: 500 });
  }
}
