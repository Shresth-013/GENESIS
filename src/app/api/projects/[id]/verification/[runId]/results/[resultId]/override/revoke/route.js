import { NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db/index.js';

// POST /api/projects/[id]/verification/[runId]/results/[resultId]/override/revoke - Revoke active override
export async function POST(request, { params }) {
  try {
    const { id: projectId, runId, resultId } = params;

    const body = await request.json().catch(() => ({}));
    const { reviewer_name, revoke_reason } = body;

    const reviewer = typeof reviewer_name === 'string' ? reviewer_name.trim() : '';
    if (reviewer.length < 2 || reviewer.length > 60) {
      return NextResponse.json(
        { success: false, error: 'Reviewer name is required (2-60 characters).' },
        { status: 400 }
      );
    }

    const reason = typeof revoke_reason === 'string' ? revoke_reason.trim() : '';
    if (reason.length < 5 || reason.length > 1000) {
      return NextResponse.json(
        { success: false, error: 'Revoke reason is required (5-1000 characters).' },
        { status: 400 }
      );
    }

    // Find latest active override
    const activeOverride = queryOne(
      `SELECT * FROM result_overrides
       WHERE result_id = ? AND run_id = ? AND project_id = ? AND revoked_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [resultId, runId, projectId]
    );

    if (!activeOverride) {
      return NextResponse.json(
        { success: false, error: 'No active override found to revoke for this result.' },
        { status: 404 }
      );
    }

    const now = new Date().toISOString();

    execute(
      `UPDATE result_overrides
       SET revoked_at = ?, revoked_by = ?, revoke_reason = ?
       WHERE id = ?`,
      [now, reviewer, reason, activeOverride.id]
    );

    const updated = queryOne('SELECT * FROM result_overrides WHERE id = ?', [activeOverride.id]);

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('Failed to revoke override:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to revoke override', message: error.message },
      { status: 500 }
    );
  }
}

