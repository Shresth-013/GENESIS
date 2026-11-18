import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db/index.js';
import { computeEffectiveSummary } from '@/lib/verification/effectiveStatus.js';

// GET /api/projects/[id]/verification/[runId] - Run details & stats
export async function GET(request, { params }) {
  try {
    const { id: projectId, runId } = params;

    const run = queryOne(
      `SELECT vr.*,
              s.filename as submission_filename,
              s.version as submission_version,
              s.archive_hash
       FROM verification_runs vr
       LEFT JOIN code_submissions s ON vr.submission_id = s.id
       WHERE vr.id = ? AND vr.project_id = ?`,
      [runId, projectId]
    );

    if (!run) {
      return NextResponse.json(
        { success: false, error: 'Verification run not found for this project.' },
        { status: 404 }
      );
    }

    const summary = computeEffectiveSummary(runId);

    return NextResponse.json({
      success: true,
      data: {
        ...run,
        effective_counts: summary?.effective || null,
        overridden_count: summary?.overridden_count || 0,
      },
    });
  } catch (error) {
    console.error('Failed to get verification run:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve verification run', message: error.message },
      { status: 500 }
    );
  }
}

