import { NextResponse } from 'next/server';
import { getReportById } from '@/lib/report/reportService.js';
import { queryOne } from '@/lib/db/index.js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/[id]/reports/[reportId]
 * Retrieves safe metadata for a specific report.
 */
export async function GET(request, { params }) {
  try {
    const { id: projectId, reportId } = params;

    const project = queryOne('SELECT id FROM projects WHERE id = ?', [projectId]);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found.' }, { status: 404 });
    }

    const report = getReportById(projectId, reportId);

    return NextResponse.json({
      success: true,
      data: report,
    });
  } catch (err) {
    console.error('Error fetching report metadata:', err);
    const message = err.message || 'Internal Server Error';
    const status = message.includes('not found') ? 404 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

