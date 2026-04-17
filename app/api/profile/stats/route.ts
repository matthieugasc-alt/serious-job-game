import { NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/app/lib/auth';
import {
  calculateStreak,
  getJobFamilyStats,
  getAggregatedSkills,
  getRecordsForUser,
} from '@/app/lib/gameRecords';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
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
    const records = getRecordsForUser(user.id);
    const streak = calculateStreak(user.id);
    const jobFamilyStats = getJobFamilyStats(user.id);
    const skills = getAggregatedSkills(user.id);

    // Unique completed scenario IDs
    const completedScenarioIds = Array.from(new Set<string>(records.map((r) => r.scenarioId)));

    // Total play time
    const totalPlayTime = records.reduce((sum, r) => sum + (r.durationMin || 0), 0);

    // Win counting: "success" = fully won, "partial_success" = partially won
    const gamesWon = records.filter((r) => r.ending === 'success').length;
    const gamesSuccessful = records.filter((r) => r.ending === 'success' || r.ending === 'partial_success').length;
    const successRate = records.length > 0 ? Math.round((gamesSuccessful / records.length) * 100) : 0;

    return NextResponse.json({
      streak,
      jobFamilyStats,
      skills,
      completedScenarioIds,
      totalPlayTime,
      successRate,
      gamesPlayed: records.length,
      gamesWon,
    });
  } catch (error) {
    console.error('Failed to get profile stats:', error);
    return NextResponse.json({ error: 'Failed to get profile stats' }, { status: 500 });
  }
}
