import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { queryOne, execute, transaction } from '@/lib/db/index.js';
import { VALID_STATUSES } from '@/lib/verification/effectiveStatus.js';

// POST /api/projects/[id]/verification/[runId]/results/[resultId]/override - Create an override
export async function POST(request, { params }) {
  try {
    const { id: projectId, runId, resultId } = params;

    const body = await request.json().catch(() => ({}));
    const { new_status, reason, reviewer_name } = body;

    // Validate reviewer_name (2-60 chars)
    const reviewer = typeof reviewer_name === 'string' ? reviewer_name.trim() : '';
    if (reviewer.length < 2 || reviewer.length > 60) {
      return NextResponse.json(
        { success: false, error: 'Reviewer name is required and must be between 2 and 60 characters.' },
        { status: 400 }
      );
    }

    // Validate reason (20-1000 chars)
    const justification = typeof reason === 'string' ? reason.trim() : '';
    if (justification.length < 20 || justification.length > 1000) {
      return NextResponse.json(
        { success: false, error: 'Justification reason is required and must be between 20 and 1000 characters.' },
        { status: 400 }
      );
    }

    // Validate new_status
    if (!VALID_STATUSES.includes(new_status)) {
      return NextResponse.json(
        { success: false, error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    // Verify result ownership
    const result = queryOne(
      `SELECT vr.*, p.id as p_id, r.id as r_id
       FROM verification_results vr
       JOIN projects p ON vr.project_id = p.id
       JOIN requirements r ON vr.requirement_id = r.id
       WHERE vr.id = ? AND vr.run_id = ? AND vr.project_id = ?`,
      [resultId, runId, projectId]
    );

    if (!result) {
      return NextResponse.json(
        { success: false, error: 'Verification result not found for this project and run.' },
        { status: 404 }
      );
    }

    // Verify project has no active RUNNING job for this project/run
    const activeJob = queryOne(
      `SELECT * FROM jobs WHERE project_id = ? AND status = 'RUNNING'`,
      [projectId]
    );
    if (activeJob) {
      return NextResponse.json(
        { success: false, error: 'Cannot override results while a verification job is currently running on this project.' },
        { status: 409 }
      );
    }

    // Check current effective status
    const latestActiveOverride = queryOne(
      `SELECT * FROM result_overrides
       WHERE result_id = ? AND revoked_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [resultId]
    );

    const currentEffectiveStatus = latestActiveOverride
      ? latestActiveOverride.new_status
      : result.status;

    if (new_status === currentEffectiveStatus) {
      return NextResponse.json(
        {
          success: false,
          error: `New status (${new_status}) must differ from the current effective status (${currentEffectiveStatus}).`,
        },
        { status: 400 }
      );
    }

    const overrideId = `ovr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();

    execute(
      `INSERT INTO result_overrides (
         id, project_id, run_id, result_id, requirement_id,
         previous_status, new_status, reason, reviewer_name, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        overrideId,
        projectId,
        runId,
        resultId,
        result.requirement_id,
        currentEffectiveStatus,
        new_status,
        justification,
        reviewer,
        now,
      ]
    );

    const created = queryOne('SELECT * FROM result_overrides WHERE id = ?', [overrideId]);

    return NextResponse.json({
      success: true,
      data: created,
    }, { status: 201 });
  } catch (error) {
    console.error('Failed to create result override:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create result override', message: error.message },
      { status: 500 }
    );
  }
}

