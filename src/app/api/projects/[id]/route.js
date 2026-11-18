import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { queryOne, queryAll, execute, transaction } from '@/lib/db/index.js';
import { getStorageProvider } from '@/lib/storage/index.js';

// GET /api/projects/[id]
export async function GET(request, { params }) {
  try {
    const { id } = params;

    const project = queryOne(
      `SELECT 
        p.*,
        (SELECT COUNT(*) FROM requirements r WHERE r.project_id = p.id) as total_requirements,
        (SELECT COUNT(*) FROM requirements r WHERE r.project_id = p.id AND r.approval_status = 'APPROVED') as approved_requirements,
        (SELECT COUNT(*) FROM verification_results v WHERE v.project_id = p.id AND v.status = 'VERIFIED') as verified_requirements,
        (SELECT COUNT(*) FROM verification_results v WHERE v.project_id = p.id AND v.status = 'PARTIALLY_IMPLEMENTED') as partial_requirements,
        (SELECT COUNT(*) FROM verification_results v WHERE v.project_id = p.id AND v.status = 'NOT_IMPLEMENTED') as missing_requirements,
        (SELECT COUNT(*) FROM verification_results v WHERE v.project_id = p.id AND v.status = 'UNVERIFIED') as unverified_requirements
      FROM projects p
      WHERE p.id = ?`,
      [id]
    );

    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    // Related SRS document
    const srsDoc = queryOne(
      `SELECT id, filename, original_name, file_size, status, created_at 
       FROM srs_documents 
       WHERE project_id = ? 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [id]
    );

    // Latest code submission
    const codeSubmission = queryOne(
      `SELECT id, filename, file_size, total_files, total_lines, languages, status, created_at
       FROM code_submissions
       WHERE project_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [id]
    );

    // Requirements list
    const requirements = queryAll(
      `SELECT * FROM requirements WHERE project_id = ? ORDER BY order_index ASC, req_code ASC`,
      [id]
    );

    return NextResponse.json({
      success: true,
      data: {
        ...project,
        srs: srsDoc || null,
        code: codeSubmission ? {
          ...codeSubmission,
          languages: codeSubmission.languages ? JSON.parse(codeSubmission.languages) : [],
        } : null,
        requirements: requirements || [],
      },
    });
  } catch (error) {
    console.error('Failed to get project details:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve project', message: error.message },
      { status: 500 }
    );
  }
}

// PATCH /api/projects/[id]
export async function PATCH(request, { params }) {
  try {
    const { id } = params;
    const body = await request.json();
    const { name, description, client_name, status } = body;

    const existing = queryOne('SELECT * FROM projects WHERE id = ?', [id]);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const updatedName = name !== undefined ? name.trim() : existing.name;
    const updatedDesc = description !== undefined ? description.trim() : existing.description;
    const updatedClient = client_name !== undefined ? client_name.trim() : existing.client_name;
    const updatedStatus = status !== undefined ? status : existing.status;
    const now = new Date().toISOString();

    execute(
      `UPDATE projects 
       SET name = ?, description = ?, client_name = ?, status = ?, updated_at = ?
       WHERE id = ?`,
      [updatedName, updatedDesc, updatedClient, updatedStatus, now, id]
    );

    return NextResponse.json({
      success: true,
      data: { ...existing, name: updatedName, description: updatedDesc, client_name: updatedClient, status: updatedStatus, updated_at: now },
    });
  } catch (error) {
    console.error('Failed to update project:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update project', message: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id]
export async function DELETE(request, { params }) {
  try {
    const { id } = params;

    // Validate project ID format (prevent path traversal / invalid IDs)
    if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid project ID format.' },
        { status: 400 }
      );
    }

    const existing = queryOne('SELECT * FROM projects WHERE id = ?', [id]);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    // 1. Collect all stored file keys across all phases before DB deletion
    const srsRows = queryAll('SELECT file_path FROM srs_documents WHERE project_id = ?', [id]) || [];
    const codeRows = queryAll('SELECT storage_path FROM code_submissions WHERE project_id = ?', [id]) || [];
    const reportRows = queryAll('SELECT storage_key FROM verification_reports WHERE project_id = ?', [id]) || [];

    const fileKeysToDelete = [
      ...srsRows.map((r) => r.file_path),
      ...codeRows.map((r) => r.storage_path),
      ...reportRows.map((r) => r.storage_key),
    ].filter(Boolean);

    // 2. Safely delete all database records in reverse dependency order inside an ACID transaction
    transaction((txDb) => {
      txDb.prepare('DELETE FROM verification_reports WHERE project_id = ?').run(id);
      txDb.prepare('DELETE FROM verification_results WHERE project_id = ?').run(id);
      txDb.prepare('DELETE FROM verification_runs WHERE project_id = ?').run(id);
      txDb.prepare('DELETE FROM code_evidence WHERE project_id = ?').run(id);
      txDb.prepare('DELETE FROM code_files WHERE project_id = ?').run(id);
      txDb.prepare('DELETE FROM code_submissions WHERE project_id = ?').run(id);
      txDb.prepare('DELETE FROM requirements WHERE project_id = ?').run(id);
      txDb.prepare('DELETE FROM srs_documents WHERE project_id = ?').run(id);
      txDb.prepare('DELETE FROM projects WHERE id = ?').run(id);
    });

    // 3. Storage file cleanup (executed strictly after DB transaction safely commits)
    const storage = getStorageProvider();
    const deletedFiles = [];
    const failedFiles = [];

    for (const key of fileKeysToDelete) {
      try {
        // Enforce safety: key must belong to this project and contain no traversal
        if (key.includes('..') || !key.startsWith(`projects/${id}/`)) {
          console.warn(`[Security Guard] Skipping suspicious storage key during cleanup: "${key}"`);
          continue;
        }

        const deleted = await storage.delete(key);
        if (deleted) {
          deletedFiles.push(key);
        }
      } catch (fileErr) {
        console.warn(`[Storage Cleanup] Error deleting file "${key}":`, fileErr.message);
        failedFiles.push({ key, error: fileErr.message });
      }
    }

    // 4. Safely remove empty project directory in storage if using local storage
    try {
      const baseDir = storage.baseDir || path.resolve(process.env.STORAGE_LOCAL_DIR || path.join(process.cwd(), 'data', 'storage'));
      const projectDir = path.resolve(baseDir, 'projects', id);
      const safePrefix = path.resolve(baseDir, 'projects');

      if (projectDir.startsWith(safePrefix) && projectDir !== safePrefix && fs.existsSync(projectDir)) {
        await fs.promises.rm(projectDir, { recursive: true, force: true });
      }
    } catch (dirErr) {
      console.warn(`[Storage Cleanup] Error removing project directory for "${id}":`, dirErr.message);
    }

    return NextResponse.json({
      success: true,
      message: 'Project and all associated data deleted successfully.',
      deletedId: id,
      cleanedFilesCount: deletedFiles.length,
      failedFilesCount: failedFiles.length,
    });
  } catch (error) {
    console.error('Failed to delete project:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete project', message: error.message },
      { status: 500 }
    );
  }
}

