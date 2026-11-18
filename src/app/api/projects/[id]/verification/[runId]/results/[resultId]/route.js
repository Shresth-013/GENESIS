import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db/index.js';

function parseJsonField(val, fallback) {
  if (!val) return fallback;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

// GET /api/projects/[id]/verification/[runId]/results/[resultId] - Single result with full evidence
export async function GET(request, { params }) {
  try {
    const { id: projectId, runId, resultId } = params;

    const row = queryOne(
      `SELECT vr.*,
              r.req_code,
              r.title as req_title,
              r.description as req_description,
              r.category as req_category,
              r.priority as req_priority,
              r.type as req_type,
              r.acceptance_criteria as req_criteria,
              r.source_reference as req_source_ref,
              s.filename as submission_filename,
              s.version as submission_version
       FROM verification_results vr
       JOIN requirements r ON vr.requirement_id = r.id
       LEFT JOIN code_submissions s ON vr.submission_id = s.id
       WHERE vr.id = ? AND vr.run_id = ? AND vr.project_id = ?`,
      [resultId, runId, projectId]
    );

    if (!row) {
      return NextResponse.json(
        { success: false, error: 'Verification result not found.' },
        { status: 404 }
      );
    }

    const activeOverride = queryOne(
      `SELECT * FROM result_overrides
       WHERE result_id = ? AND revoked_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [resultId]
    );

    const isOverridden = Boolean(activeOverride);
    const effectiveStatus = isOverridden ? activeOverride.new_status : row.status;

    const data = {
      ...row,
      status: row.status,
      effective_status: effectiveStatus,
      is_overridden: isOverridden,
      override: isOverridden
        ? {
            id: activeOverride.id,
            previous_status: activeOverride.previous_status,
            new_status: activeOverride.new_status,
            reason: activeOverride.reason,
            reviewer_name: activeOverride.reviewer_name,
            created_at: activeOverride.created_at,
          }
        : null,
      evidence_references: parseJsonField(row.evidence_references, []),
      contradicting_evidence: parseJsonField(row.contradicting_evidence, []),
      criteria_assessment: parseJsonField(row.criteria_assessment, []),
      limitations: parseJsonField(row.limitations, []),
      req_criteria: parseJsonField(row.req_criteria, []),
      req_source_ref: parseJsonField(row.req_source_ref, null),
    };

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Failed to get verification result detail:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve result detail', message: error.message },
      { status: 500 }
    );
  }
}

