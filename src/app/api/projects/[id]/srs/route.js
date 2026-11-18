import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import path from 'node:path';
import { queryOne, queryAll, execute, transaction } from '@/lib/db/index.js';
import { getStorageProvider } from '@/lib/storage/index.js';
import { validateDocumentUpload, parseDocument, DEFAULT_MAX_FILE_SIZE } from '@/lib/document/parser.js';

// GET /api/projects/[id]/srs - List all SRS document versions for a project
export async function GET(request, { params }) {
  try {
    const { id: projectId } = params;

    const project = queryOne('SELECT id, name FROM projects WHERE id = ?', [projectId]);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const documents = queryAll(
      `SELECT id, project_id, filename, original_name, file_size, mime_type, 
              page_count, paragraph_count, status, error_message, is_active, created_at, updated_at,
              SUBSTR(extracted_text, 1, 500) as text_preview
       FROM srs_documents
       WHERE project_id = ?
       ORDER BY created_at DESC`,
      [projectId]
    );

    return NextResponse.json({ success: true, data: documents });
  } catch (error) {
    console.error('Failed to retrieve SRS documents:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve SRS documents', message: error.message },
      { status: 500 }
    );
  }
}

// POST /api/projects/[id]/srs - Upload an SRS document (PDF or DOCX)
export async function POST(request, { params }) {
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
        { success: false, error: 'No file provided. Please select a PDF or DOCX document.' },
        { status: 400 }
      );
    }

    const originalName = file.name || 'unnamed_document';
    const mimeType = file.type || 'application/octet-stream';
    const sizeBytes = file.size || 0;

    // Validate document extension, size and MIME type
    try {
      validateDocumentUpload(originalName, mimeType, sizeBytes, DEFAULT_MAX_FILE_SIZE);
    } catch (valErr) {
      return NextResponse.json({ success: false, error: valErr.message }, { status: 400 });
    }

    // Convert file to Node Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate safe, collision-free storage path
    const docId = `srs_${crypto.randomUUID().replace(/-/g, '').substring(0, 14)}`;
    const ext = path.extname(originalName).toLowerCase();
    const storageKey = `projects/${projectId}/srs/${docId}${ext}`;

    const storage = getStorageProvider();
    const stored = await storage.save(storageKey, buffer, {
      mimeType,
      originalName,
    });

    const now = new Date().toISOString();

    // Insert record with initial state UPLOADED
    execute(
      `INSERT INTO srs_documents (
        id, project_id, filename, original_name, file_path, file_size, mime_type, 
        status, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PROCESSING', 1, ?, ?)`,
      [docId, projectId, `${docId}${ext}`, originalName, stored.key, sizeBytes, mimeType, now, now]
    );

    // Set any previous documents for this project to is_active = 0
    execute(
      `UPDATE srs_documents SET is_active = 0 WHERE project_id = ? AND id != ?`,
      [projectId, docId]
    );

    // Extract text from document
    let parsedResult = null;
    try {
      parsedResult = await parseDocument(buffer, originalName);
    } catch (parseErr) {
      // Record failure state in database
      execute(
        `UPDATE srs_documents 
         SET status = 'EXTRACTION_FAILED', error_message = ?, updated_at = ? 
         WHERE id = ?`,
        [parseErr.message, new Date().toISOString(), docId]
      );

      return NextResponse.json(
        {
          success: false,
          error: parseErr.message,
          documentId: docId,
          status: 'EXTRACTION_FAILED',
        },
        { status: 422 }
      );
    }

    // Update document record with extracted text and counts
    execute(
      `UPDATE srs_documents 
       SET extracted_text = ?, page_count = ?, paragraph_count = ?, status = 'EXTRACTED', updated_at = ?
       WHERE id = ?`,
      [
        parsedResult.fullText,
        parsedResult.pageCount || 1,
        parsedResult.paragraphCount || 1,
        new Date().toISOString(),
        docId,
      ]
    );

    // Advance project status if still CREATED
    if (project.status === 'CREATED') {
      execute(
        `UPDATE projects SET status = 'SRS_UPLOADED', updated_at = ? WHERE id = ?`,
        [new Date().toISOString(), projectId]
      );
    }

    const documentRecord = queryOne('SELECT * FROM srs_documents WHERE id = ?', [docId]);

    return NextResponse.json(
      {
        success: true,
        data: {
          id: documentRecord.id,
          original_name: documentRecord.original_name,
          file_size: documentRecord.file_size,
          mime_type: documentRecord.mime_type,
          page_count: documentRecord.page_count,
          paragraph_count: documentRecord.paragraph_count,
          status: documentRecord.status,
          word_count: parsedResult.wordCount,
          text_preview: parsedResult.fullText.slice(0, 300) + '...',
          created_at: documentRecord.created_at,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error during document upload/extraction:', error);
    return NextResponse.json(
      { success: false, error: 'Document upload failed', message: error.message },
      { status: 500 }
    );
  }
}

