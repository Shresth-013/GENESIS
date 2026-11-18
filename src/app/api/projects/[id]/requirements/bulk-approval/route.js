import { NextResponse } from 'next/server';
import { queryOne, queryAll, execute, transaction } from '@/lib/db/index.js';

// POST /api/projects/[id]/requirements/bulk-approval - Bulk approve or reject requirements
export async function POST(request, { params }) {
  try {
    const { id: projectId } = params;

    const project = queryOne('SELECT id, status FROM projects WHERE id = ?', [projectId]);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const body = await request.json();
    const { ids, action = 'APPROVE' } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Please provide an array of requirement IDs to update.' },
        { status: 400 }
      );
    }

    const targetStatus = action.toUpperCase() === 'REJECT' ? 'REJECTED' : 'APPROVED';
    const now = new Date().toISOString();

    const affected = transaction(() => {
      let count = 0;
      for (const id of ids) {
        const res = execute(
          `UPDATE requirements 
           SET approval_status = ?, updated_at = ? 
           WHERE id = ? AND project_id = ?`,
          [targetStatus, now, id, projectId]
        );
        count += res.changes;
      }

      // If requirements were approved, update project status
      if (targetStatus === 'APPROVED' && count > 0) {
        if (project.status === 'CREATED' || project.status === 'SRS_UPLOADED' || project.status === 'REQUIREMENTS_EXTRACTED') {
          execute(
            `UPDATE projects SET status = 'REQUIREMENTS_APPROVED', updated_at = ? WHERE id = ?`,
            [now, projectId]
          );
        }
      }

      return count;
    });

    return NextResponse.json({
      success: true,
      action: targetStatus,
      count: affected,
      message: `Successfully set ${affected} requirement(s) to ${targetStatus}.`,
    });
  } catch (error) {
    console.error('Bulk approval failed:', error);
    return NextResponse.json(
      { success: false, error: 'Bulk update failed', message: error.message },
      { status: 500 }
    );
  }
}

