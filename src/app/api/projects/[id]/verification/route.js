import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { queryOne, queryAll, execute } from '@/lib/db/index.js';
import { executeVerificationRun, checkVerificationEligibility } from '@/lib/verification/runOrchestrator.js';
import { enqueueJob, getActiveJobForProject, ensureJobWorker } from '@/lib/jobs/jobQueue.js';

// GET /api/projects/[id]/verification - List verification runs and latest audit summary
export async function GET(request, { params }) {
  try {
    const { id: projectId } = params;

    const project = queryOne('SELECT id, name, status FROM projects WHERE id = ?', [projectId]);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const runs = queryAll(
      `SELECT vr.*, 
              s.filename as submission_filename,
              s.version as submission_version
       FROM verification_runs vr
       LEFT JOIN code_submissions s ON vr.submission_id = s.id
       WHERE vr.project_id = ?
       ORDER BY vr.started_at DESC`,
      [projectId]
    );

    const eligibility = checkVerificationEligibility(projectId);

    return NextResponse.json({
      success: true,
      data: {
        runs,
        latestRun: runs[0] || null,
        eligibility: {
          isEligible: eligibility.isEligible,
          reason: eligibility.reason || null,
          approvedReqCount: eligibility.approvedReqs?.length || 0,
          activeSubmission: eligibility.activeSubmission
            ? {
                id: eligibility.activeSubmission.id,
                filename: eligibility.activeSubmission.filename,
                version: eligibility.activeSubmission.version,
                status: eligibility.activeSubmission.status,
              }
            : null,
        },
      },
    });
  } catch (error) {
    console.error('Failed to list verification runs:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve verification runs', message: error.message },
      { status: 500 }
    );
  }
}

// POST /api/projects/[id]/verification - Start a new evidence-grounded verification run
export async function POST(request, { params }) {
  try {
    const { id: projectId } = params;

    const project = queryOne('SELECT id, name FROM projects WHERE id = ?', [projectId]);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    // Eligibility check
    const eligibility = checkVerificationEligibility(projectId);
    if (!eligibility.isEligible) {
      return NextResponse.json({ success: false, error: eligibility.reason }, { status: 400 });
    }

    // Check if there is already a running execution or active background job
    const activeJob = getActiveJobForProject(projectId);
    const activeRun = queryOne(
      `SELECT id FROM verification_runs WHERE project_id = ? AND status = 'RUNNING'`,
      [projectId]
    );

    if (activeJob || activeRun) {
      return NextResponse.json(
        {
          success: false,
          error: 'A verification run is currently in progress for this project. Please wait for it to complete.',
        },
        { status: 409 }
      );
    }

    // Check synchronous execution flag (preserves backward compatibility for inline test modes)
    const url = new URL(request.url);
    const isInline =
      process.env.JOBS_INLINE === 'true' || url.searchParams.get('inline') === 'true';

    if (isInline) {
      const runResult = await executeVerificationRun(projectId);
      return NextResponse.json(
        {
          success: true,
          message: 'Requirement verification completed successfully.',
          data: runResult,
        },
        { status: 201 }
      );
    }

    // Async Job path
    const runId = `vrun_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const now = new Date().toISOString();
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

    // Pre-insert verification run in RUNNING state
    execute(
      `INSERT INTO verification_runs (
        id, project_id, srs_document_id, submission_id, status,
        total_requirements, model_name, started_at
      ) VALUES (?, ?, ?, ?, 'RUNNING', ?, ?, ?)`,
      [
        runId,
        projectId,
        eligibility.srsDoc?.id || null,
        eligibility.activeSubmission.id,
        eligibility.approvedReqs.length,
        modelName,
        now,
      ]
    );

    await ensureJobWorker();
    const job = enqueueJob({
      type: 'VERIFICATION_RUN',
      projectId,
      payload: {},
      metadata: { runId },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Verification run queued successfully.',
        data: {
          jobId: job.id,
          runId,
          status: 'QUEUED',
        },
      },
      { status: 202 }
    );
  } catch (error) {
    console.error('Verification run failed:', error);
    return NextResponse.json(
      { success: false, error: 'Verification run failed', message: error.message },
      { status: error.status || 400 }
    );
  }
}

