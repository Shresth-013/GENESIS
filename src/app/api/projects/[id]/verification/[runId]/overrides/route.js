import { NextResponse } from 'next/server';
import { queryAll, queryOne } from '@/lib/db/index.js';

// GET /api/projects/[id]/verification/[runId]/overrides - Run-level audit log of all overrides
export async function GET(request, { params }) {
  try {
    const { id: projectId, runId } = params;

    const run = queryOne(
      'SELECT id FROM verification_runs WHERE id = ? AND project_id = ?',
      [runId, projectId]
    );

    if (!run) {
      return NextResponse.json(
        { success: false, error: 'Verification run not found.' },
        { status: 404 }
      );
    }

    const overrides = queryAll(
      `SELECT ro.*, r.req_code, r.title as requirement_title
       FROM result_overrides ro
       JOIN requirements r ON ro.requirement_id = r.id
       WHERE ro.run_id = ? AND ro.project_id = ?
       ORDER BY ro.created_at DESC`,
      [runId, projectId]
    );

    return NextResponse.json({
      success: true,
      data: overrides,
    });
  } catch (error) {
    console.error('Failed to get run overrides audit log:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve overrides audit log', message: error.message },
      { status: 500 }
    );
  }
}

