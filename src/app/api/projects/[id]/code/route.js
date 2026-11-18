import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import path from 'node:path';
import { queryOne, queryAll, execute, transaction } from '@/lib/db/index.js';
import { getStorageProvider } from '@/lib/storage/index.js';
import { validateZip, getZipLimits } from '@/lib/code/zipValidator.js';
import { extractZipSafely, cleanupExtraction } from '@/lib/code/zipExtractor.js';
import { collectSubmissionEvidence } from '@/lib/code/evidenceCollector.js';

// Allowed MIME types for ZIP archives
const ALLOWED_ZIP_MIMES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
  'multipart/x-zip',
  'application/zip-compressed',
]);

/**
 * Sanitizes a submission record for public API response.
 * Strips internal server storage paths.
 */
function sanitizeSubmission(sub) {
  if (!sub) return null;
  const { storage_path, ...safe } = sub;
  let parsedLanguages = {};
  let parsedSummary = {};
  try {
    parsedLanguages = safe.languages ? JSON.parse(safe.languages) : {};
  } catch {}
  try {
    parsedSummary = safe.analysis_summary ? JSON.parse(safe.analysis_summary) : {};
  } catch {}

  return {
    ...safe,
    languages: parsedLanguages,
    analysis_summary: parsedSummary,
  };
}

// GET /api/projects/[id]/code - List all code submissions for a project
export async function GET(request, { params }) {
  try {
    const { id: projectId } = params;

    const project = queryOne('SELECT id, name FROM projects WHERE id = ?', [projectId]);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const rows = queryAll(
      `SELECT id, project_id, filename, file_size, archive_hash, version, is_active,
              total_files, analyzed_files, skipped_files, total_lines, evidence_count,
              languages, analysis_summary, error_message, status, created_at, updated_at
       FROM code_submissions
       WHERE project_id = ?
       ORDER BY version DESC, created_at DESC`,
      [projectId]
    );

    const submissions = rows.map(sanitizeSubmission);

    return NextResponse.json({ success: true, data: submissions });
  } catch (error) {
    console.error('Failed to list code submissions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve code submissions', message: error.message },
      { status: 500 }
    );
  }
}

// POST /api/projects/[id]/code - Upload source-code ZIP, extract securely, and run static analysis
export async function POST(request, { params }) {
  let extractDir = null;

  try {
    const { id: projectId } = params;

    const project = queryOne('SELECT * FROM projects WHERE id = ?', [projectId]);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return NextResponse.json(
        { success: false, error: 'No file provided. Please select a valid source code ZIP archive.' },
        { status: 400 }
      );
    }

    const originalName = file.name || 'archive.zip';
    const ext = path.extname(originalName).toLowerCase();
    const mimeType = file.type || 'application/octet-stream';
    const sizeBytes = file.size || 0;

    // Validate extension
    if (ext !== '.zip') {
      return NextResponse.json(
        { success: false, error: `Unsupported file type "${ext}". Only .zip archives are accepted.` },
        { status: 400 }
      );
    }

    // Convert file to Node Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate ZIP buffer (magic bytes, encryption, bombs, zip slip)
    try {
      await validateZip(buffer);
    } catch (valErr) {
      return NextResponse.json({ success: false, error: valErr.message }, { status: 400 });
    }

    // Compute archive hash
    const archiveHash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Generate unique submission ID and determine sequential version
    const submissionId = `sub_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    const verRow = queryOne(
      'SELECT COALESCE(MAX(version), 0) + 1 AS next_ver FROM code_submissions WHERE project_id = ?',
      [projectId]
    );
    const version = verRow?.next_ver || 1;

    // Store raw archive in storage abstraction
    const storageKey = `projects/${projectId}/code/${submissionId}.zip`;
    const storage = getStorageProvider();
    await storage.save(storageKey, buffer, {
      mimeType: 'application/zip',
      originalName,
    });

    const now = new Date().toISOString();

    // Mark previous submissions inactive, insert new submission
    transaction((txDb) => {
      txDb
        .prepare('UPDATE code_submissions SET is_active = 0 WHERE project_id = ?')
        .run(projectId);

      txDb
        .prepare(`
          INSERT INTO code_submissions (
            id, project_id, filename, file_size, storage_path, archive_hash,
            version, is_active, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'EXTRACTING', ?, ?)
        `)
        .run(
          submissionId,
          projectId,
          originalName,
          sizeBytes,
          storageKey,
          archiveHash,
          version,
          now,
          now
        );
    });

    // Safely extract archive
    const extractResult = await extractZipSafely(buffer, submissionId);
    extractDir = extractResult.extractDir;

    // Run static AST & pattern analysis and collect evidence
    const analysisReport = await collectSubmissionEvidence(submissionId, projectId, extractDir);

    // Clean up temporary extraction folder
    cleanupExtraction(extractDir);
    extractDir = null;

    // Retrieve updated submission record
    const updatedSub = queryOne('SELECT * FROM code_submissions WHERE id = ?', [submissionId]);

    return NextResponse.json(
      {
        success: true,
        message: 'Code submission uploaded and analyzed successfully.',
        data: sanitizeSubmission(updatedSub),
      },
      { status: 201 }
    );
  } catch (error) {
    if (extractDir) {
      cleanupExtraction(extractDir);
    }
    console.error('Code upload and analysis failed:', error);
    return NextResponse.json(
      { success: false, error: 'Code analysis failed', message: error.message },
      { status: 500 }
    );
  }
}

