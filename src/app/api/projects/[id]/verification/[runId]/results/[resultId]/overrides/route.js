import { NextResponse } from 'next/server';
import { queryAll, queryOne } from '@/lib/db/index.js';

// GET /api/projects/[id]/verification/[runId]/results/[resultId]/overrides - Full override history
export async function GET(request, { params }) {
  try {
    const { id: projectId, runId, resultId } = params;

    const result = queryOne(
      'SELECT id FROM verification_results WHERE id = ? AND run_id = ? AND project_id = ?',
      [resultId, runId, projectId]
    );

    if (!result) {
      return NextResponse.json(
        { success: false, error: 'Verification result not found.' },
        { status: 404 }
      );
    }

    const overrides = queryAll(
      `SELECT * FROM result_overrides
       WHERE result_id = ? AND run_id = ? AND project_id = ?
       ORDER BY created_at DESC`,
      [resultId, runId, projectId]
    );

    return NextResponse.json({
      success: true,
      data: overrides,
    });
  } catch (error) {
    console.error('Failed to get result override history:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get override history', message: error.message },
      { status: 500 }
    );
  }
}

