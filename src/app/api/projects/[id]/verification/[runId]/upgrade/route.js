import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db/index.js';
import {
  executeVerificationUpgrade,
  checkVerificationEligibility,
} from '@/lib/verification/runOrchestrator.js';
import { enqueueJob, getActiveJobForProject, ensureJobWorker } from '@/lib/jobs/jobQueue.js';
import { getAiStatus } from '@/lib/ai/gateway.js';
import { AI_CONFIG } from '@/lib/ai/config.js';

// POST /api/projects/[id]/verification/[runId]/upgrade - Upgrade a RULES-evaluated run to Gemini AI
export async function POST(request, { params }) {
  try {
    const { id: projectId, runId: baseRunId } = params;

    const project = queryOne('SELECT id, name FROM projects WHERE id = ?', [projectId]);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const baseRun = queryOne(
      `SELECT * FROM verification_runs WHERE id = ? AND project_id = ?`,
      [baseRunId, projectId]
    );
    if (!baseRun) {
      return NextResponse.json(
        { success: false, error: `Base verification run "${baseRunId}" not found for this project.` },
        { status: 404 }
      );
    }

    // 1. Refuse if AI Gateway is in RULES_ONLY mode or disabled
    const aiStatus = getAiStatus();
    if (aiStatus.mode === 'RULES_ONLY' || AI_CONFIG.forceRulesMode) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Cannot upgrade verification run to AI while AI Gateway is running in rules-only mode or disabled.',
          reason: aiStatus.lastErrorReason || 'RULES_ONLY_MODE',
        },
        { status: 400 }
      );
    }

    // 2. Check eligibility
    const eligibility = checkVerificationEligibility(projectId);
    if (!eligibility.isEligible) {
      return NextResponse.json({ success: false, error: eligibility.reason }, { status: 400 });
    }

    // 3. Check for in-flight jobs or runs on this project
    const activeJob = getActiveJobForProject(projectId);
    const activeRun = queryOne(
      `SELECT id FROM verification_runs WHERE project_id = ? AND status = 'RUNNING'`,
      [projectId]
    );

    if (activeJob || activeRun) {
      return NextResponse.json(
        {
          success: false,
          error: 'An active verification run or job is already in progress for this project.',
        },
        { status: 409 }
      );
    }

    // 4. Synchronous execution flag check
    const url = new URL(request.url);
    const isInline =
      process.env.JOBS_INLINE === 'true' || url.searchParams.get('inline') === 'true';

    if (isInline) {
      const upgradeResult = await executeVerificationUpgrade(projectId, baseRunId);
      return NextResponse.json(
        {
          success: true,
          message: 'Verification run upgrade completed successfully.',
          data: upgradeResult,
        },
        { status: 201 }
      );
    }

    // 5. Async Job path
    const newRunId = `vrun_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const now = new Date().toISOString();
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

    execute(
      `INSERT INTO verification_runs (
        id, project_id, srs_document_id, submission_id, status,
        total_requirements, model_name, base_run_id, started_at
      ) VALUES (?, ?, ?, ?, 'RUNNING', ?, ?, ?, ?)`,
      [
        newRunId,
        projectId,
        eligibility.srsDoc?.id || null,
        eligibility.activeSubmission.id,
        eligibility.approvedReqs.length,
        modelName,
        baseRunId,
        now,
      ]
    );

    await ensureJobWorker();
    const job = enqueueJob({
      type: 'VERIFICATION_UPGRADE',
      projectId,
      payload: { baseRunId },
      metadata: { runId: newRunId, baseRunId },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Verification upgrade queued successfully.',
        data: {
          jobId: job.id,
          runId: newRunId,
          baseRunId,
          status: 'QUEUED',
        },
      },
      { status: 202 }
    );
  } catch (error) {
    console.error('Failed to initiate verification upgrade:', error);
    return NextResponse.json(
      { success: false, error: 'Verification upgrade failed', message: error.message },
      { status: error.status || 400 }
    );
  }
}

