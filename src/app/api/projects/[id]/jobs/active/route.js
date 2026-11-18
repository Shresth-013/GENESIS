import { NextResponse } from 'next/server';
import { getActiveJobForProject } from '@/lib/jobs/jobQueue.js';
import { queryOne } from '@/lib/db/index.js';

// GET /api/projects/[id]/jobs/active - Retrieve current active job for project if any
export async function GET(request, { params }) {
  try {
    const { id: projectId } = params;

    const project = queryOne('SELECT id FROM projects WHERE id = ?', [projectId]);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const activeJob = getActiveJobForProject(projectId);

    return NextResponse.json({
      success: true,
      data: activeJob,
    });
  } catch (error) {
    console.error('Failed to get active job:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve active job', message: error.message },
      { status: 500 }
    );
  }
}

