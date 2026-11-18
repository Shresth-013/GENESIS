import { NextResponse } from 'next/server';
import { getJob } from '@/lib/jobs/jobQueue.js';
import { queryOne } from '@/lib/db/index.js';

// GET /api/projects/[id]/jobs/[jobId] - Status and progress of a background job
export async function GET(request, { params }) {
  try {
    const { id: projectId, jobId } = params;

    const project = queryOne('SELECT id FROM projects WHERE id = ?', [projectId]);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const job = getJob(jobId);
    if (!job || job.projectId !== projectId) {
      return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: job,
    });
  } catch (error) {
    console.error('Failed to get job:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve job status', message: error.message },
      { status: 500 }
    );
  }
}

