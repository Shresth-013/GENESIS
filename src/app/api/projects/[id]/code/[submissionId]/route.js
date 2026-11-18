import { NextResponse } from 'next/server';
import { queryOne, execute, transaction } from '@/lib/db/index.js';

function sanitizeSubmission(sub) {
  if (!sub) return null;
  const { storage_path, ...safe } = sub;
  let parsedLanguages = {};
  let parsedSummary = {};
  try {
    parsedLanguages = safe.languages ? JSON.parse(safe.languages) : {};
  } catch {}
  try {
    parsedSummary = safe.analysis_summary ? JSON.parse(safe.analysis_summary) : {};
  } catch {}

  return {
    ...safe,
    languages: parsedLanguages,
    analysis_summary: parsedSummary,
  };
}

// GET /api/projects/[id]/code/[submissionId] - Submission details & metrics
export async function GET(request, { params }) {
  try {
    const { id: projectId, submissionId } = params;

    const submission = queryOne(
      `SELECT * FROM code_submissions WHERE id = ? AND project_id = ?`,
      [submissionId, projectId]
    );

    if (!submission) {
      return NextResponse.json(
        { success: false, error: 'Code submission not found for this project.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: sanitizeSubmission(submission),
    });
  } catch (error) {
    console.error('Failed to get code submission:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve code submission', message: error.message },
      { status: 500 }
    );
  }
}

// PATCH /api/projects/[id]/code/[submissionId] - Activate submission or update status
export async function PATCH(request, { params }) {
  try {
    const { id: projectId, submissionId } = params;

    const submission = queryOne(
      `SELECT * FROM code_submissions WHERE id = ? AND project_id = ?`,
      [submissionId, projectId]
    );

    if (!submission) {
      return NextResponse.json(
        { success: false, error: 'Code submission not found for this project.' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const now = new Date().toISOString();

    // Check if activating this submission
    if (body.is_active === true || body.is_active === 1) {
      transaction((txDb) => {
        // Deactivate all others in this project
        txDb
          .prepare('UPDATE code_submissions SET is_active = 0 WHERE project_id = ?')
          .run(projectId);

        // Activate this submission
        txDb
          .prepare('UPDATE code_submissions SET is_active = 1, updated_at = ? WHERE id = ?')
          .run(now, submissionId);
      });
    }

    const updated = queryOne('SELECT * FROM code_submissions WHERE id = ?', [submissionId]);

    return NextResponse.json({
      success: true,
      message: 'Code submission updated successfully.',
      data: sanitizeSubmission(updated),
    });
  } catch (error) {
    console.error('Failed to update code submission:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update code submission', message: error.message },
      { status: 500 }
    );
  }
}

