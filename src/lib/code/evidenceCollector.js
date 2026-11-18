import crypto from 'node:crypto';
import { discoverSourceFiles } from './fileDiscovery.js';
import { analyzeSourceFile } from './analyzers/index.js';
import { getDb, transaction, execute } from '../db/index.js';

/**
 * Orchestrates static source code analysis and evidence collection for a code submission.
 *
 * Steps:
 * 1. Discovers and catalogs all eligible source files in extractDir.
 * 2. Parses and analyzes each file using the appropriate static analyzer.
 * 3. Records source files in the `code_files` table.
 * 4. Records evidence in the `code_evidence` table.
 * 5. Updates `code_submissions` with final metrics, language distribution, and analysis summary.
 *
 * @param {string} submissionId - Code submission identifier
 * @param {string} projectId - Project identifier
 * @param {string} extractDir - Isolated extraction directory on disk
 * @returns {Promise<Object>} Analysis summary and metric report
 */
export async function collectSubmissionEvidence(submissionId, projectId, extractDir) {
  const db = getDb();
  const now = new Date().toISOString();

  // 1. Mark submission state as ANALYZING
  execute(
    `UPDATE code_submissions 
     SET status = 'ANALYZING', error_message = NULL, updated_at = ?
     WHERE id = ?`,
    [now, submissionId]
  );

  try {
    // 2. Discover source files
    const discovery = discoverSourceFiles(extractDir);
    const { files, skipped, languages, totalFiles, totalLines, analyzedFiles, skippedFiles } = discovery;

    // 3. Analyze each file and gather evidence
    const allEvidence = [];
    const evidenceTypeCounts = {};

    for (const file of files) {
      const fileEvidence = analyzeSourceFile(file.content, file.filePath, file.language);

      for (const ev of fileEvidence) {
        allEvidence.push({
          id: `ev_${crypto.randomUUID()}`,
          submissionId,
          projectId,
          filePath: ev.filePath,
          language: ev.language,
          evidenceType: ev.evidenceType || 'OTHER',
          identifier: (ev.identifier || 'anonymous').slice(0, 255),
          startLine: Math.max(1, ev.startLine || 1),
          endLine: Math.max(1, ev.endLine || ev.startLine || 1),
          codeSnippet: (ev.codeSnippet || '').slice(0, 500),
          contextSummary: ev.contextSummary || null,
          analysisMethod: ev.analysisMethod || 'HEURISTIC',
          confidence: ev.confidence || 'HIGH',
          createdAt: now,
        });

        const type = ev.evidenceType || 'OTHER';
        evidenceTypeCounts[type] = (evidenceTypeCounts[type] || 0) + 1;
      }
    }

    const analysisSummaryObj = {
      evidenceByType: evidenceTypeCounts,
      languages,
      analyzedFiles,
      skippedFiles,
      totalLines,
      totalEvidence: allEvidence.length,
      skippedSummary: skipped.slice(0, 50), // Sample of skipped files for audit
    };

    // 4. Atomic database persistence via transaction
    transaction((txDb) => {
      // Clean up any previous analysis records for this submission (guarantees idempotency on re-analysis)
      txDb.prepare('DELETE FROM code_files WHERE submission_id = ?').run(submissionId);
      txDb.prepare('DELETE FROM code_evidence WHERE submission_id = ?').run(submissionId);

      // Insert discovered source files
      const insertFileStmt = txDb.prepare(`
        INSERT INTO code_files (
          id, submission_id, project_id, file_path, extension, language,
          file_size, line_count, file_hash, status, error_message, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ANALYZED', NULL, ?)
      `);

      for (const file of files) {
        insertFileStmt.run(
          `cf_${crypto.randomUUID()}`,
          submissionId,
          projectId,
          file.filePath,
          file.extension,
          file.language,
          file.fileSize,
          file.lineCount,
          file.fileHash,
          now
        );
      }

      // Insert collected evidence
      const insertEvidenceStmt = txDb.prepare(`
        INSERT INTO code_evidence (
          id, submission_id, project_id, file_path, language, evidence_type,
          identifier, start_line, end_line, code_snippet, context_summary,
          analysis_method, confidence, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const ev of allEvidence) {
        insertEvidenceStmt.run(
          ev.id,
          ev.submissionId,
          ev.projectId,
          ev.filePath,
          ev.language,
          ev.evidenceType,
          ev.identifier,
          ev.startLine,
          ev.endLine,
          ev.codeSnippet,
          ev.contextSummary,
          ev.analysisMethod,
          ev.confidence,
          ev.createdAt
        );
      }

      // Update submission record with final metrics
      txDb
        .prepare(`
          UPDATE code_submissions
          SET status = 'ANALYZED',
              total_files = ?,
              analyzed_files = ?,
              skipped_files = ?,
              total_lines = ?,
              evidence_count = ?,
              languages = ?,
              analysis_summary = ?,
              error_message = NULL,
              updated_at = ?
          WHERE id = ?
        `)
        .run(
          totalFiles,
          analyzedFiles,
          skippedFiles,
          totalLines,
          allEvidence.length,
          JSON.stringify(languages),
          JSON.stringify(analysisSummaryObj),
          now,
          submissionId
        );
    });

    return {
      submissionId,
      status: 'ANALYZED',
      totalFiles,
      analyzedFiles,
      skippedFiles,
      totalLines,
      evidenceCount: allEvidence.length,
      languages,
      analysisSummary: analysisSummaryObj,
    };
  } catch (error) {
    // Record failure in code_submissions
    const failNow = new Date().toISOString();
    execute(
      `UPDATE code_submissions 
       SET status = 'FAILED', error_message = ?, updated_at = ?
       WHERE id = ?`,
      [error.message, failNow, submissionId]
    );

    throw error;
  }
}

