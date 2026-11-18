import { NextResponse } from 'next/server';
import { queryOne, queryAll } from '@/lib/db/index.js';

// GET /api/projects/[id]/code/[submissionId]/files - Discovered source file catalog
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
    const language = searchParams.get('language');

    const whereConditions = ['submission_id = ?', 'project_id = ?'];
    const queryParams = [submissionId, projectId];

    if (language && language !== 'ALL') {
      whereConditions.push('language = ?');
      queryParams.push(language.toLowerCase());
    }

    const whereClause = whereConditions.join(' AND ');

    const files = queryAll(
      `SELECT id, submission_id, project_id, file_path, extension, language,
              file_size, line_count, file_hash, status, created_at
       FROM code_files
       WHERE ${whereClause}
       ORDER BY file_path ASC`,
      queryParams
    );

    return NextResponse.json({
      success: true,
      data: files,
      count: files.length,
    });
  } catch (error) {
    console.error('Failed to get code files:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve code files', message: error.message },
      { status: 500 }
    );
  }
}

