import { NextResponse } from 'next/server';
import { queryOne, queryAll } from '@/lib/db/index.js';

function parseJsonField(val, fallback) {
  if (!val) return fallback;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

// GET /api/projects/[id]/verification/[runId]/results - Paginated & filterable results for a run
export async function GET(request, { params }) {
  try {
    const { id: projectId, runId } = params;

    const run = queryOne(
      'SELECT id FROM verification_runs WHERE id = ? AND project_id = ?',
      [runId, projectId]
    );

    if (!run) {
      return NextResponse.json(
        { success: false, error: 'Verification run not found for this project.' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25', 10)));
    const offset = (page - 1) * limit;

    const statusFilter = searchParams.get('status');
    const categoryFilter = searchParams.get('category');
    const q = searchParams.get('q');

    const whereConditions = ['vr.run_id = ?', 'vr.project_id = ?'];
    const queryParams = [runId, projectId];

    if (statusFilter && statusFilter !== 'ALL') {
      whereConditions.push('vr.status = ?');
      queryParams.push(statusFilter.toUpperCase());
    }

    if (categoryFilter && categoryFilter !== 'ALL') {
      whereConditions.push('r.category = ?');
      queryParams.push(categoryFilter.toUpperCase());
    }

    if (q && q.trim()) {
      const searchTerm = `%${q.trim()}%`;
      whereConditions.push('(r.req_code LIKE ? OR r.title LIKE ? OR r.description LIKE ? OR vr.ai_explanation LIKE ?)');
      queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    const whereClause = whereConditions.join(' AND ');

    // Count matching results
    const countRow = queryOne(
      `SELECT COUNT(*) as total
       FROM verification_results vr
       JOIN requirements r ON vr.requirement_id = r.id
       WHERE ${whereClause}`,
      queryParams
    );
    const total = countRow?.total || 0;
    const totalPages = Math.ceil(total / limit) || 1;

    // Fetch paginated rows
    const rows = queryAll(
      `SELECT vr.*,
              r.req_code,
              r.title as req_title,
              r.description as req_description,
              r.category as req_category,
              r.priority as req_priority,
              r.type as req_type,
              r.acceptance_criteria as req_criteria,
              r.source_reference as req_source_ref
       FROM verification_results vr
       JOIN requirements r ON vr.requirement_id = r.id
       WHERE ${whereClause}
       ORDER BY r.order_index ASC, r.req_code ASC
       LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    // Fetch active overrides for this run
    const activeOverrides = queryAll(
      `SELECT * FROM result_overrides
       WHERE run_id = ? AND revoked_at IS NULL
       ORDER BY created_at ASC`,
      [runId]
    );
    const overrideMap = new Map();
    for (const ov of activeOverrides) {
      overrideMap.set(ov.result_id, ov);
    }

    const data = rows.map((row) => {
      const ov = overrideMap.get(row.id) || null;
      const isOverridden = Boolean(ov);
      const effectiveStatus = isOverridden ? ov.new_status : row.status;

      return {
        ...row,
        status: row.status,
        effective_status: effectiveStatus,
        is_overridden: isOverridden,
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
        evidence_references: parseJsonField(row.evidence_references, []),
        contradicting_evidence: parseJsonField(row.contradicting_evidence, []),
        criteria_assessment: parseJsonField(row.criteria_assessment, []),
        limitations: parseJsonField(row.limitations, []),
        req_criteria: parseJsonField(row.req_criteria, []),
        req_source_ref: parseJsonField(row.req_source_ref, null),
      };
    });

    return NextResponse.json({
      success: true,
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Failed to list verification results:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve verification results', message: error.message },
      { status: 500 }
    );
  }
}

