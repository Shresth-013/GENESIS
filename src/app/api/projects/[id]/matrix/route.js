import { NextResponse } from 'next/server';
import { queryOne, queryAll } from '@/lib/db/index.js';
import { checkVerificationEligibility } from '@/lib/verification/runOrchestrator.js';

function parseJson(val, fallback) {
  if (!val) return fallback;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

// GET /api/projects/[id]/matrix - Complete traceability matrix dataset
export async function GET(request, { params }) {
  try {
    const { id: projectId } = params;

    const project = queryOne('SELECT * FROM projects WHERE id = ?', [projectId]);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const selectedRunId = searchParams.get('runId');

    // 1. Fetch verification runs
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

    // Target run: either user selected or latest completed run
    const targetRun = selectedRunId
      ? runs.find((r) => r.id === selectedRunId)
      : runs[0] || null;

    // 2. Fetch approved requirements
    const approvedRequirements = queryAll(
      `SELECT r.id, r.project_id, r.req_code, r.title, r.description,
              r.category, r.priority, r.type, r.acceptance_criteria,
              r.source_reference, r.confidence, r.extraction_notes,
              r.approval_status, r.order_index
       FROM requirements r
       WHERE r.project_id = ? AND r.approval_status = 'APPROVED'
       ORDER BY r.order_index ASC, r.req_code ASC`,
      [projectId]
    );

    // 3. Fetch verification results for target run (if any)
    const verificationResultsMap = new Map();
    const activeOverridesMap = new Map();
    if (targetRun) {
      const results = queryAll(
        `SELECT * FROM verification_results WHERE run_id = ? AND project_id = ?`,
        [targetRun.id, projectId]
      );
      for (const res of results) {
        verificationResultsMap.set(res.requirement_id, res);
      }

      const activeOverrides = queryAll(
        `SELECT * FROM result_overrides
         WHERE run_id = ? AND project_id = ? AND revoked_at IS NULL
         ORDER BY created_at ASC`,
        [targetRun.id, projectId]
      );
      for (const ov of activeOverrides) {
        activeOverridesMap.set(ov.result_id, ov);
      }
    }

    // 4. Combine requirements with their verification results
    let verifiedCount = 0;
    let partialCount = 0;
    let notImplCount = 0;
    let unverifiedCount = 0;

    let effVerifiedCount = 0;
    let effPartialCount = 0;
    let effNotImplCount = 0;
    let effUnverifiedCount = 0;
    let overriddenCount = 0;

    const matrixRows = approvedRequirements.map((req) => {
      const vr = verificationResultsMap.get(req.id) || null;
      const status = vr ? vr.status : 'PENDING_VERIFICATION';

      if (status === 'VERIFIED') verifiedCount++;
      else if (status === 'PARTIALLY_IMPLEMENTED') partialCount++;
      else if (status === 'NOT_IMPLEMENTED') notImplCount++;
      else if (status === 'UNVERIFIED') unverifiedCount++;

      const ov = vr ? activeOverridesMap.get(vr.id) || null : null;
      const isOverridden = Boolean(ov);
      const effectiveStatus = isOverridden ? ov.new_status : status;

      if (effectiveStatus === 'VERIFIED') effVerifiedCount++;
      else if (effectiveStatus === 'PARTIALLY_IMPLEMENTED') effPartialCount++;
      else if (effectiveStatus === 'NOT_IMPLEMENTED') effNotImplCount++;
      else if (effectiveStatus === 'UNVERIFIED') effUnverifiedCount++;

      if (isOverridden) overriddenCount++;

      const evidenceRefs = vr ? parseJson(vr.evidence_references, []) : [];
      const criteriaAssessment = vr ? parseJson(vr.criteria_assessment, []) : [];
      const limitations = vr ? parseJson(vr.limitations, []) : [];

      return {
        id: req.id,
        reqCode: req.req_code,
        title: req.title,
        description: req.description,
        category: req.category,
        priority: req.priority,
        type: req.type,
        acceptanceCriteria: parseJson(req.acceptance_criteria, []),
        sourceReference: parseJson(req.source_reference, null),
        verification: vr
          ? {
              id: vr.id,
              runId: vr.run_id,
              status: vr.status,
              effective_status: effectiveStatus,
              effectiveStatus,
              is_overridden: isOverridden,
              isOverridden,
              override: isOverridden
                ? {
                    id: ov.id,
                    previous_status: ov.previous_status,
                    new_status: ov.new_status,
                    reason: ov.reason,
                    reviewer_name: ov.reviewer_name,
                    created_at: ov.created_at,
                  }
                : null,
              confidenceScore: vr.confidence_score,
              confidenceReason: vr.confidence_reason,
              explanation: vr.ai_explanation,
              method: vr.method || 'AI',
              fallbackReason: vr.fallback_reason || null,
              carriedOverFrom: vr.carried_over_from_result_id || null,
              evidenceReferences: evidenceRefs,
              evidenceCount: evidenceRefs.length,
              contradictingEvidence: parseJson(vr.contradicting_evidence, []),
              criteriaAssessment,
              limitations,
              modelName: vr.model_name,
              verifiedAt: vr.created_at,
            }
          : null,
      };
    });

    const eligibility = checkVerificationEligibility(projectId);

    const totalApproved = approvedRequirements.length;
    const evaluatedTotal = verifiedCount + partialCount + notImplCount + unverifiedCount;
    const completionRate = totalApproved > 0 ? Math.round((evaluatedTotal / totalApproved) * 100) : 0;

    return NextResponse.json({
      success: true,
      data: {
        project: {
          id: project.id,
          name: project.name,
          status: project.status,
        },
        eligibility: {
          isEligible: eligibility.isEligible,
          reason: eligibility.reason || null,
        },
        activeRun: targetRun,
        availableRuns: runs,
        summary: {
          totalApproved,
          verified: verifiedCount,
          partiallyImplemented: partialCount,
          notImplemented: notImplCount,
          unverified: unverifiedCount,
          pending: totalApproved - evaluatedTotal,
          completionRate,
          aiCount: targetRun?.ai_count || 0,
          rulesCount: targetRun?.rules_count || 0,
          aiMode: targetRun?.ai_mode || 'LIVE',
          overridden_count: overriddenCount,
          overriddenCount,
          effective_counts: {
            verified: effVerifiedCount,
            partiallyImplemented: effPartialCount,
            notImplemented: effNotImplCount,
            unverified: effUnverifiedCount,
          },
          effectiveCounts: {
            verified: effVerifiedCount,
            partiallyImplemented: effPartialCount,
            notImplemented: effNotImplCount,
            unverified: effUnverifiedCount,
          },
        },
        matrix: matrixRows,
      },
    });
  } catch (error) {
    console.error('Failed to load traceability matrix data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve traceability matrix', message: error.message },
      { status: 500 }
    );
  }
}

