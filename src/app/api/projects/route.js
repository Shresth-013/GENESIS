import { NextResponse } from 'next/server';
import { queryAll, execute } from '@/lib/db/index.js';
import crypto from 'node:crypto';

// GET /api/projects - List all projects with aggregated metrics
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('q')?.trim() || '';

    let sql = `
      SELECT 
        p.*,
        (SELECT COUNT(*) FROM requirements r WHERE r.project_id = p.id) as total_requirements,
        (SELECT COUNT(*) FROM requirements r WHERE r.project_id = p.id AND r.approval_status = 'APPROVED') as approved_requirements,
        (SELECT COUNT(*) FROM verification_results v WHERE v.project_id = p.id AND v.status = 'VERIFIED') as verified_requirements,
        (SELECT COUNT(*) FROM verification_results v WHERE v.project_id = p.id AND v.status = 'PARTIALLY_IMPLEMENTED') as partial_requirements,
        (SELECT COUNT(*) FROM verification_results v WHERE v.project_id = p.id AND v.status = 'NOT_IMPLEMENTED') as missing_requirements,
        (SELECT COUNT(*) FROM verification_results v WHERE v.project_id = p.id AND v.status = 'UNVERIFIED') as unverified_requirements,
        (SELECT COUNT(*) FROM srs_documents s WHERE s.project_id = p.id) as srs_count,
        (SELECT COUNT(*) FROM code_submissions c WHERE c.project_id = p.id) as code_count
      FROM projects p
    `;
    const params = [];

    if (search) {
      sql += ` WHERE p.name LIKE ? OR p.client_name LIKE ? OR p.description LIKE ?`;
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    sql += ` ORDER BY p.created_at DESC`;

    const projects = queryAll(sql, params);
    return NextResponse.json({ success: true, data: projects });
  } catch (error) {
    console.error('Failed to fetch projects:', error);
    return NextResponse.json(
      { success: false, error: 'Database query failed', message: error.message },
      { status: 500 }
    );
  }
}

// POST /api/projects - Create a new project
export async function POST(request) {
  try {
    const body = await request.json();
    const { name, description, client_name } = body;

    // Validate inputs
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Project name is required and cannot be empty.' },
        { status: 400 }
      );
    }

    if (name.trim().length > 120) {
      return NextResponse.json(
        { success: false, error: 'Project name must be 120 characters or fewer.' },
        { status: 400 }
      );
    }

    const id = `proj_${crypto.randomUUID().replace(/-/g, '').substring(0, 12)}`;
    const now = new Date().toISOString();
    const cleanName = name.trim();
    const cleanDesc = description ? description.trim() : '';
    const cleanClient = client_name ? client_name.trim() : '';

    execute(
      `INSERT INTO projects (id, name, description, client_name, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'CREATED', ?, ?)`,
      [id, cleanName, cleanDesc, cleanClient, now, now]
    );

    const newProject = {
      id,
      name: cleanName,
      description: cleanDesc,
      client_name: cleanClient,
      status: 'CREATED',
      created_at: now,
      updated_at: now,
      total_requirements: 0,
      approved_requirements: 0,
      verified_requirements: 0,
      partial_requirements: 0,
      missing_requirements: 0,
      unverified_requirements: 0,
      srs_count: 0,
      code_count: 0,
    };

    return NextResponse.json({ success: true, data: newProject }, { status: 201 });
  } catch (error) {
    console.error('Failed to create project:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create project', message: error.message },
      { status: 500 }
    );
  }
}

