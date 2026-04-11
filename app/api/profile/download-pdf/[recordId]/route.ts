import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { validateSession } from '@/app/lib/auth';
import { getRecord } from '@/app/lib/gameRecords';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: { recordId: string } },
) {
  try {
    const { recordId } = params;

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

    // Get the record to verify ownership and get PDF path
    const record = getRecord(user.id, recordId);

    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    if (!record.pdfPath) {
      return NextResponse.json(
        { error: 'PDF not yet generated for this record' },
        { status: 404 },
      );
    }

    // Construct full path to PDF
    const pdfPath = path.join(process.cwd(), 'data', record.pdfPath);

    // Check if file exists
    if (!fs.existsSync(pdfPath)) {
      return NextResponse.json({ error: 'PDF file not found' }, { status: 404 });
    }

    // Read PDF file
    const fileContent = fs.readFileSync(pdfPath);

    // Return PDF with proper headers
    return new NextResponse(fileContent, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="debrief_${recordId}.pdf"`,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    console.error('Failed to download PDF:', error);
    return NextResponse.json({ error: 'Failed to download PDF' }, { status: 500 });
  }
}
