import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db/index.js';
import { compareVerificationRuns } from '@/lib/verification/effectiveStatus.js';

// GET /api/projects/[id]/verification/compare?base=<runId>&head=<runId>
export async function GET(request, { params }) {
  try {
    const { id: projectId } = params;

    const project = queryOne('SELECT id FROM projects WHERE id = ?', [projectId]);
    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found.' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const baseRunId = searchParams.get('base');
    const headRunId = searchParams.get('head');

    if (!baseRunId || !headRunId) {
      return NextResponse.json(
        { success: false, error: 'Both "base" and "head" run IDs are required query parameters.' },
        { status: 400 }
      );
    }

    if (baseRunId === headRunId) {
      return NextResponse.json(
        { success: false, error: 'Base and head run IDs must be different runs.' },
        { status: 400 }
      );
    }

    const comparison = compareVerificationRuns(projectId, baseRunId, headRunId);

    return NextResponse.json({
      success: true,
      data: comparison,
    });
  } catch (error) {
    console.error('Failed to compare runs:', error);
    const isValidationError = error.message.includes('must exist') || error.message.includes('COMPLETED');
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isValidationError ? 400 : 500 }
    );
  }
}

