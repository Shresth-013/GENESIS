import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db/index.js';
import { getStorageProvider } from '@/lib/storage/index.js';
import { extractZipSafely, cleanupExtraction } from '@/lib/code/zipExtractor.js';
import { collectSubmissionEvidence } from '@/lib/code/evidenceCollector.js';

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

// POST /api/projects/[id]/code/[submissionId]/analyze - Re-trigger or retry static code analysis
export async function POST(request, { params }) {
  let extractDir = null;

  try {
    const { id: projectId, submissionId } = params;

    const submission = queryOne(
      'SELECT * FROM code_submissions WHERE id = ? AND project_id = ?',
      [submissionId, projectId]
    );

    if (!submission) {
      return NextResponse.json(
        { success: false, error: 'Code submission not found for this project.' },
        { status: 404 }
      );
    }

    if (!submission.storage_path) {
      return NextResponse.json(
        { success: false, error: 'Archive storage reference is missing for this submission.' },
        { status: 400 }
      );
    }

    // Retrieve original archive buffer from storage abstraction
    const storage = getStorageProvider();
    const buffer = await storage.get(submission.storage_path);

    // Safely extract archive
    const extractResult = await extractZipSafely(buffer, submissionId);
    extractDir = extractResult.extractDir;

    // Run static AST & pattern analysis and collect evidence
    await collectSubmissionEvidence(submissionId, projectId, extractDir);

    // Clean up temporary extraction folder
    cleanupExtraction(extractDir);
    extractDir = null;

    // Query updated submission record
    const updated = queryOne('SELECT * FROM code_submissions WHERE id = ?', [submissionId]);

    return NextResponse.json({
      success: true,
      message: 'Source code re-analyzed successfully.',
      data: sanitizeSubmission(updated),
    });
  } catch (error) {
    if (extractDir) {
      cleanupExtraction(extractDir);
    }
    console.error('Re-analysis failed:', error);
    return NextResponse.json(
      { success: false, error: 'Re-analysis failed', message: error.message },
      { status: 500 }
    );
  }
}

