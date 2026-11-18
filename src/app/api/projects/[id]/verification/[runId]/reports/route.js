import { NextResponse } from 'next/server';
import { createVerificationReport, listReportsForProject } from '@/lib/report/reportService.js';
import { queryOne } from '@/lib/db/index.js';

export const dynamic = 'force-dynamic';

/**
 * POST /api/projects/[id]/verification/[runId]/reports
 * Generates an audit-grade PDF verification report for the specified completed run.
 */
export async function POST(request, { params }) {
  try {
    const { id: projectId, runId } = params;

    if (!projectId || !runId) {
      return NextResponse.json(
        { success: false, error: 'Project ID and Verification Run ID are required.' },
        { status: 400 }
      );
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const report = await createVerificationReport(projectId, runId, body);

    return NextResponse.json(
      {
        success: true,
        message: 'Audit verification report generated successfully.',
        data: report,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Error generating verification report:', err);
    const message = err.message || 'Internal Server Error';

    if (message.includes('not found')) {
      return NextResponse.json({ success: false, error: message }, { status: 404 });
    }
    if (message.includes('does not belong') || message.includes('Cannot generate')) {
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/projects/[id]/verification/[runId]/reports
 * Lists all generated reports associated with the specified verification run.
 */
export async function GET(request, { params }) {
  try {
    const { id: projectId, runId } = params;

    const project = queryOne('SELECT id FROM projects WHERE id = ?', [projectId]);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found.' }, { status: 404 });
    }

    const run = queryOne('SELECT id, project_id FROM verification_runs WHERE id = ?', [runId]);
    if (!run || run.project_id !== projectId) {
      return NextResponse.json(
        { success: false, error: 'Verification run not found for this project.' },
        { status: 404 }
      );
    }

    const allReports = listReportsForProject(projectId);
    const runReports = allReports.filter((r) => r.verificationRunId === runId);

    return NextResponse.json({
      success: true,
      data: runReports,
    });
  } catch (err) {
    console.error('Error listing reports for run:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

