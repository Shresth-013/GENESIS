import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { queryOne, queryAll, execute } from '@/lib/db/index.js';
import { VALID_CATEGORIES, VALID_PRIORITIES } from '@/lib/ai/gemini.js';

// GET /api/projects/[id]/requirements - List requirements with filtering & search
export async function GET(request, { params }) {
  try {
    const { id: projectId } = params;

    const project = queryOne('SELECT id, name, status FROM projects WHERE id = ?', [projectId]);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status')?.toUpperCase() || '';
    const category = searchParams.get('category')?.toUpperCase() || '';
    const priority = searchParams.get('priority')?.toUpperCase() || '';
    const search = searchParams.get('q')?.trim() || '';

    let sql = `
      SELECT r.*, d.original_name as document_name
      FROM requirements r
      LEFT JOIN srs_documents d ON r.srs_document_id = d.id
      WHERE r.project_id = ?
    `;
    const queryParams = [projectId];

    if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
      sql += ' AND r.approval_status = ?';
      queryParams.push(status);
    }

    if (category) {
      sql += ' AND r.category = ?';
      queryParams.push(category);
    }

    if (priority) {
      sql += ' AND r.priority = ?';
      queryParams.push(priority);
    }

    if (search) {
      sql += ' AND (r.req_code LIKE ? OR r.description LIKE ? OR r.title LIKE ?)';
      const term = `%${search}%`;
      queryParams.push(term, term, term);
    }

    sql += ' ORDER BY r.order_index ASC, r.req_code ASC';

    const requirements = queryAll(sql, queryParams);

    // Summary counts for the filter tabs
    const summary = queryOne(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN approval_status = 'APPROVED' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN approval_status = 'PENDING' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN approval_status = 'REJECTED' THEN 1 ELSE 0 END) as rejected
       FROM requirements
       WHERE project_id = ?`,
      [projectId]
    ) || { total: 0, approved: 0, pending: 0, rejected: 0 };

    // Format parsed JSON fields for client consumption
    const formatted = requirements.map((r) => ({
      ...r,
      acceptance_criteria: r.acceptance_criteria ? JSON.parse(r.acceptance_criteria) : [],
      source_reference: r.source_reference ? JSON.parse(r.source_reference) : null,
    }));

    return NextResponse.json({
      success: true,
      count: formatted.length,
      summary: {
        total: summary.total || 0,
        approved: summary.approved || 0,
        pending: summary.pending || 0,
        rejected: summary.rejected || 0,
      },
      data: formatted,
    });
  } catch (error) {
    console.error('Failed to retrieve requirements:', error);
    return NextResponse.json(
      { success: false, error: 'Database query failed', message: error.message },
      { status: 500 }
    );
  }
}

// POST /api/projects/[id]/requirements - Manually add a new requirement
export async function POST(request, { params }) {
  try {
    const { id: projectId } = params;

    const project = queryOne('SELECT id, status FROM projects WHERE id = ?', [projectId]);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const body = await request.json();
    const { req_code, description, category, priority, acceptance_criteria, source_reference } = body;

    if (!description || typeof description !== 'string' || !description.trim()) {
      return NextResponse.json(
        { success: false, error: 'Requirement description is mandatory.' },
        { status: 400 }
      );
    }

    // Determine or generate unique req_code
    let code = (req_code || '').trim();
    if (!code) {
      const count = queryOne('SELECT COUNT(*) as c FROM requirements WHERE project_id = ?', [projectId]);
      code = `REQ-${String((count?.c || 0) + 1).padStart(3, '0')}`;
    }

    // Check duplicate code
    const existing = queryOne(
      'SELECT id FROM requirements WHERE project_id = ? AND req_code = ?',
      [projectId, code]
    );
    if (existing) {
      return NextResponse.json(
        { success: false, error: `Requirement code "${code}" already exists in this project.` },
        { status: 400 }
      );
    }

    const normCat = (category || 'FUNCTIONAL').toUpperCase().trim();
    const cleanCat = VALID_CATEGORIES.includes(normCat) ? normCat : 'OTHER';

    const normPri = (priority || 'MEDIUM').toUpperCase().trim();
    const cleanPri = VALID_PRIORITIES.includes(normPri) ? normPri : 'MEDIUM';

    const reqId = `req_${crypto.randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const now = new Date().toISOString();
    const title = description.trim().slice(0, 80);

    // Latest active SRS doc ID
    const activeDoc = queryOne(
      'SELECT id FROM srs_documents WHERE project_id = ? AND is_active = 1 LIMIT 1',
      [projectId]
    );

    const criteriaJson = Array.isArray(acceptance_criteria)
      ? JSON.stringify(acceptance_criteria.filter(Boolean))
      : acceptance_criteria ? JSON.stringify([acceptance_criteria]) : null;

    const sourceJson = source_reference ? JSON.stringify(source_reference) : null;

    execute(
      `INSERT INTO requirements (
        id, project_id, srs_document_id, req_code, title, description, 
        category, priority, type, acceptance_criteria, source_reference, 
        confidence, extraction_notes, approval_status, order_index, 
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'FUNCTIONAL_REQUIREMENT', ?, ?, 'HIGH', 'Manually created', 'PENDING', 999, ?, ?)`,
      [
        reqId,
        projectId,
        activeDoc?.id || null,
        code,
        title,
        description.trim(),
        cleanCat,
        cleanPri,
        criteriaJson,
        sourceJson,
        now,
        now,
      ]
    );

    const created = queryOne('SELECT * FROM requirements WHERE id = ?', [reqId]);

    return NextResponse.json(
      {
        success: true,
        data: {
          ...created,
          acceptance_criteria: created.acceptance_criteria ? JSON.parse(created.acceptance_criteria) : [],
          source_reference: created.source_reference ? JSON.parse(created.source_reference) : null,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to create requirement:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create requirement', message: error.message },
      { status: 500 }
    );
  }
}

