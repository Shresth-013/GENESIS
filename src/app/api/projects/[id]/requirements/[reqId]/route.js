import { NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db/index.js';
import { VALID_CATEGORIES, VALID_PRIORITIES } from '@/lib/ai/gemini.js';

// PATCH /api/projects/[id]/requirements/[reqId] - Update requirement details or approval status
export async function PATCH(request, { params }) {
  try {
    const { id: projectId, reqId } = params;

    const existing = queryOne(
      'SELECT * FROM requirements WHERE id = ? AND project_id = ?',
      [reqId, projectId]
    );

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Requirement not found.' }, { status: 404 });
    }

    const body = await request.json();
    const { approval_status, description, category, priority, req_code, acceptance_criteria } = body;

    let updatedCode = existing.req_code;
    if (req_code && req_code.trim() && req_code.trim() !== existing.req_code) {
      // Check duplicate code
      const dup = queryOne(
        'SELECT id FROM requirements WHERE project_id = ? AND req_code = ? AND id != ?',
        [projectId, req_code.trim(), reqId]
      );
      if (dup) {
        return NextResponse.json(
          { success: false, error: `Requirement code "${req_code.trim()}" is already in use.` },
          { status: 400 }
        );
      }
      updatedCode = req_code.trim();
    }

    let updatedStatus = existing.approval_status;
    if (approval_status) {
      const normStatus = String(approval_status).toUpperCase().trim();
      if (!['PENDING', 'APPROVED', 'REJECTED'].includes(normStatus)) {
        return NextResponse.json(
          { success: false, error: `Invalid status "${approval_status}". Must be PENDING, APPROVED, or REJECTED.` },
          { status: 400 }
        );
      }
      updatedStatus = normStatus;
    }

    const updatedDesc = description !== undefined ? description.trim() : existing.description;
    const updatedTitle = updatedDesc.slice(0, 80);

    let updatedCat = existing.category;
    if (category) {
      const norm = String(category).toUpperCase().trim();
      if (VALID_CATEGORIES.includes(norm)) updatedCat = norm;
    }

    let updatedPri = existing.priority;
    if (priority) {
      const norm = String(priority).toUpperCase().trim();
      if (VALID_PRIORITIES.includes(norm)) updatedPri = norm;
    }

    let criteriaJson = existing.acceptance_criteria;
    if (acceptance_criteria !== undefined) {
      criteriaJson = Array.isArray(acceptance_criteria)
        ? JSON.stringify(acceptance_criteria.filter(Boolean))
        : acceptance_criteria ? JSON.stringify([acceptance_criteria]) : null;
    }

    const now = new Date().toISOString();

    execute(
      `UPDATE requirements 
       SET req_code = ?, title = ?, description = ?, category = ?, priority = ?, 
           acceptance_criteria = ?, approval_status = ?, updated_at = ?
       WHERE id = ?`,
      [updatedCode, updatedTitle, updatedDesc, updatedCat, updatedPri, criteriaJson, updatedStatus, now, reqId]
    );

    // If requirement was approved, ensure project status indicates approved requirements exist
    if (updatedStatus === 'APPROVED') {
      const proj = queryOne('SELECT status FROM projects WHERE id = ?', [projectId]);
      if (proj && proj.status !== 'REQUIREMENTS_APPROVED' && proj.status !== 'CODE_ANALYZED' && proj.status !== 'VERIFIED') {
        execute(
          `UPDATE projects SET status = 'REQUIREMENTS_APPROVED', updated_at = ? WHERE id = ?`,
          [now, projectId]
        );
      }
    }

    const updated = queryOne('SELECT * FROM requirements WHERE id = ?', [reqId]);

    return NextResponse.json({
      success: true,
      data: {
        ...updated,
        acceptance_criteria: updated.acceptance_criteria ? JSON.parse(updated.acceptance_criteria) : [],
        source_reference: updated.source_reference ? JSON.parse(updated.source_reference) : null,
      },
    });
  } catch (error) {
    console.error('Failed to update requirement:', error);
    return NextResponse.json(
      { success: false, error: 'Update failed', message: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id]/requirements/[reqId] - Delete single requirement
export async function DELETE(request, { params }) {
  try {
    const { id: projectId, reqId } = params;

    const existing = queryOne(
      'SELECT id FROM requirements WHERE id = ? AND project_id = ?',
      [reqId, projectId]
    );

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Requirement not found.' }, { status: 404 });
    }

    execute('DELETE FROM requirements WHERE id = ?', [reqId]);

    return NextResponse.json({ success: true, message: 'Requirement deleted successfully.' });
  } catch (error) {
    console.error('Failed to delete requirement:', error);
    return NextResponse.json(
      { success: false, error: 'Delete failed', message: error.message },
      { status: 500 }
    );
  }
}

