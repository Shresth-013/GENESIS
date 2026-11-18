import { NextResponse } from 'next/server';
import { listReportsForProject, createVerificationReport } from '@/lib/report/reportService.js';
import { queryOne } from '@/lib/db/index.js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/[id]/reports
 * Lists all generated reports for the specified project.
 */
export async function GET(request, { params }) {
  try {
    const { id: projectId } = params;

    const project = queryOne('SELECT id FROM projects WHERE id = ?', [projectId]);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found.' }, { status: 404 });
    }

    const reports = listReportsForProject(projectId);

    return NextResponse.json({
      success: true,
      data: reports,
    });
  } catch (err) {
    console.error('Error listing reports for project:', err);
    const message = err.message || 'Internal Server Error';
    const status = message.includes('not found') ? 404 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

/**
 * POST /api/projects/[id]/reports
 * Generates a report for the project. Accepts JSON body `{ runId, reportName }`.
 */
export async function POST(request, { params }) {
  try {
    const { id: projectId } = params;

    let body = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request body.' },
        { status: 400 }
      );
    }

    const runId = body.runId;
    if (!runId) {
      return NextResponse.json(
        { success: false, error: 'Missing required field: "runId".' },
        { status: 400 }
      );
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
    console.error('Error generating report:', err);
    const message = err.message || 'Internal Server Error';
    if (message.includes('not found')) {
      return NextResponse.json({ success: false, error: message }, { status: 404 });
    }
    if (message.includes('does not belong') || message.includes('Cannot generate')) {
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

