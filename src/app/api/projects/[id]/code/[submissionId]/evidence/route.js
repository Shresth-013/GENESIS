import { NextResponse } from 'next/server';
import { queryOne, queryAll } from '@/lib/db/index.js';

// GET /api/projects/[id]/code/[submissionId]/evidence - Paginated & filterable evidence records
export async function GET(request, { params }) {
  try {
    const { id: projectId, submissionId } = params;

    const submission = queryOne(
      'SELECT id, project_id FROM code_submissions WHERE id = ? AND project_id = ?',
      [submissionId, projectId]
    );

    if (!submission) {
      return NextResponse.json(
        { success: false, error: 'Code submission not found for this project.' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const offset = (page - 1) * limit;

    const evidenceType = searchParams.get('evidence_type');
    const language = searchParams.get('language');
    const q = searchParams.get('q');

    // Build dynamic SQL filters
    const whereConditions = ['submission_id = ?', 'project_id = ?'];
    const queryParams = [submissionId, projectId];

    if (evidenceType && evidenceType !== 'ALL') {
      whereConditions.push('evidence_type = ?');
      queryParams.push(evidenceType.toUpperCase());
    }

    if (language && language !== 'ALL') {
      whereConditions.push('language = ?');
      queryParams.push(language.toLowerCase());
    }

    if (q && q.trim()) {
      const searchTerm = `%${q.trim()}%`;
      whereConditions.push('(identifier LIKE ? OR file_path LIKE ? OR context_summary LIKE ?)');
      queryParams.push(searchTerm, searchTerm, searchTerm);
    }

    const whereClause = whereConditions.join(' AND ');

    // Count total matching records
    const countRow = queryOne(
      `SELECT COUNT(*) as total FROM code_evidence WHERE ${whereClause}`,
      queryParams
    );
    const total = countRow?.total || 0;
    const totalPages = Math.ceil(total / limit) || 1;

    // Fetch paginated results
    const evidence = queryAll(
      `SELECT id, submission_id, project_id, file_path, language, evidence_type,
              identifier, start_line, end_line, code_snippet, context_summary,
              analysis_method, confidence, created_at
       FROM code_evidence
       WHERE ${whereClause}
       ORDER BY file_path ASC, start_line ASC
       LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    return NextResponse.json({
      success: true,
      data: evidence,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Failed to get code evidence:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve code evidence', message: error.message },
      { status: 500 }
    );
  }
}

