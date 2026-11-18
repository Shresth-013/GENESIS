import { NextResponse } from 'next/server';
import { getReportBinary } from '@/lib/report/reportService.js';
import { queryOne } from '@/lib/db/index.js';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/[id]/reports/[reportId]/download
 * Securely streams the generated PDF report binary file.
 */
export async function GET(request, { params }) {
  try {
    const { id: projectId, reportId } = params;

    // 1. Validate project existence
    const project = queryOne('SELECT id FROM projects WHERE id = ?', [projectId]);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found.' }, { status: 404 });
    }

    // 2. Validate report existence and project ownership
    const reportRow = queryOne(
      'SELECT id, project_id, verification_run_id FROM verification_reports WHERE id = ?',
      [reportId]
    );

    if (!reportRow) {
      return NextResponse.json({ success: false, error: 'Report not found.' }, { status: 404 });
    }

    if (reportRow.project_id !== projectId) {
      return NextResponse.json(
        { success: false, error: 'Report does not belong to this project.' },
        { status: 403 }
      );
    }

    // 3. Confirm associated verification run belongs to the same project
    if (reportRow.verification_run_id) {
      const runRow = queryOne(
        'SELECT id, project_id FROM verification_runs WHERE id = ?',
        [reportRow.verification_run_id]
      );
      if (runRow && runRow.project_id !== projectId) {
        return NextResponse.json(
          { success: false, error: 'Integrity check failed: verification run belongs to another project.' },
          { status: 403 }
        );
      }
    }

    // 4. Retrieve PDF binary buffer via StorageInterface
    const { buffer, safeFilename } = await getReportBinary(projectId, reportId);

    // 5. Return binary response with secure download headers
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('Error downloading report:', err);
    const message = err.message || 'Internal Server Error';
    const status = message.includes('not found') ? 404 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

