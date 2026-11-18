import crypto from 'node:crypto';
import { queryOne, queryAll, execute, transaction } from '../db/index.js';
import { getStorageProvider } from '../storage/index.js';
import { generateVerificationPDF } from './pdfGenerator.js';

/**
 * Creates and persists a new verification report for a completed run.
 *
 * @param {string} projectId
 * @param {string} runId
 * @param {Object} [options]
 * @returns {Promise<Object>} Safe report metadata
 */
export async function createVerificationReport(projectId, runId, options = {}) {
  // 1. Validate project
  const project = queryOne('SELECT * FROM projects WHERE id = ?', [projectId]);
  if (!project) {
    throw new Error(`Project with ID "${projectId}" not found.`);
  }

  // 2. Validate run
  const run = queryOne('SELECT * FROM verification_runs WHERE id = ?', [runId]);
  if (!run) {
    throw new Error(`Verification run with ID "${runId}" not found.`);
  }

  // 3. Validate project/run association
  if (run.project_id !== projectId) {
    throw new Error(`Verification run "${runId}" does not belong to project "${projectId}".`);
  }

  // 4. Validate run completion
  if (run.status !== 'COMPLETED') {
    throw new Error(
      `Cannot generate report for run with status "${run.status}". Run must be COMPLETED before generating an audit report.`
    );
  }

  // 5. Fetch associated SRS document & code submission
  const srsDoc = run.srs_document_id
    ? queryOne('SELECT * FROM srs_documents WHERE id = ?', [run.srs_document_id])
    : queryOne('SELECT * FROM srs_documents WHERE project_id = ? AND is_active = 1', [projectId]);

  const submission = run.submission_id
    ? queryOne('SELECT * FROM code_submissions WHERE id = ?', [run.submission_id])
    : queryOne('SELECT * FROM code_submissions WHERE project_id = ? AND is_active = 1', [projectId]);

  // 6. Fetch results joined with requirement details
  const results = queryAll(
    `SELECT 
       vr.*,
       r.req_code,
       r.title,
       r.description,
       r.category,
       r.priority,
       r.type,
       r.acceptance_criteria,
       r.source_reference
     FROM verification_results vr
     JOIN requirements r ON vr.requirement_id = r.id
     WHERE vr.run_id = ?
     ORDER BY r.order_index ASC, r.req_code ASC`,
    [runId]
  );

  if (results.length === 0) {
    throw new Error(`No verification results found for run "${runId}".`);
  }

  // 6.5 Fetch active overrides for this run
  const activeOverrides = queryAll(
    `SELECT * FROM result_overrides
     WHERE run_id = ? AND revoked_at IS NULL
     ORDER BY created_at ASC`,
    [runId]
  );
  const overrideMap = new Map();
  for (const ov of activeOverrides) {
    overrideMap.set(ov.result_id, ov);
  }

  const enrichedResults = results.map((r) => {
    const ov = overrideMap.get(r.id) || null;
    return {
      ...r,
      effective_status: ov ? ov.new_status : r.status,
      is_overridden: Boolean(ov),
      override: ov,
    };
  });

  // 7. Prepare report identifiers & metadata
  const reportId = `rep_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
  const now = new Date().toISOString();
  const safeProjectName = project.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const reportName = options.reportName || `GENESIS_Report_${safeProjectName}_${run.id.slice(0, 8)}`;
  const storageKey = `projects/${projectId}/reports/${reportId}.pdf`;

  // 8. Generate PDF binary buffer
  const pdfBuffer = await generateVerificationPDF({
    project,
    run,
    submission: submission || null,
    srsDoc: srsDoc || null,
    results: enrichedResults,
    reportId,
    generatedAt: now,
  });

  // 9. Compute SHA-256 of the PDF binary
  const reportSha256 = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  const fileSize = pdfBuffer.length;

  // 10. Persist PDF to storage
  const storage = getStorageProvider();
  await storage.save(storageKey, pdfBuffer, { mimeType: 'application/pdf' });

  // 11. Summary statistics & metadata JSON
  const summaryStats = JSON.stringify({
    totalRequirements: run.total_requirements || results.length,
    verified: run.verified_count || 0,
    partiallyImplemented: run.partially_count || 0,
    notImplemented: run.not_implemented_count || 0,
    unverified: run.unverified_count || 0,
    failed: run.failed_count || 0,
  });

  const metadataJson = JSON.stringify({
    modelName: run.model_name || 'N/A',
    submissionHash: submission?.archive_hash || 'Not recorded',
    submissionFilename: submission?.filename || 'N/A',
    srsDocumentName: srsDoc?.original_name || srsDoc?.filename || 'N/A',
    reportVersion: '1.0.0',
    analysisVersion: '1.0.0',
    options,
  });

  // 12. Persist report record in database
  execute(
    `INSERT INTO verification_reports (
      id, project_id, verification_run_id, report_name, storage_key,
      report_path, report_sha256, file_size, report_version,
      summary_stats, metadata_json, generated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '1.0.0', ?, ?, ?)`,
    [
      reportId,
      projectId,
      runId,
      reportName,
      storageKey,
      storageKey, // backward compatibility
      reportSha256,
      fileSize,
      summaryStats,
      metadataJson,
      now,
    ]
  );

  return {
    id: reportId,
    projectId,
    verificationRunId: runId,
    reportName,
    fileSize,
    reportSha256,
    reportVersion: '1.0.0',
    generatedAt: now,
    downloadUrl: `/api/projects/${projectId}/reports/${reportId}/download`,
    summaryStats: JSON.parse(summaryStats),
  };
}

/**
 * Lists all reports for a project, safely omitting storage keys.
 *
 * @param {string} projectId
 * @returns {Array<Object>} Safe report listings
 */
export function listReportsForProject(projectId) {
  const project = queryOne('SELECT id FROM projects WHERE id = ?', [projectId]);
  if (!project) {
    throw new Error(`Project with ID "${projectId}" not found.`);
  }

  const rows = queryAll(
    `SELECT 
       id, project_id, verification_run_id, report_name,
       report_sha256, file_size, report_version, summary_stats,
       metadata_json, generated_at
     FROM verification_reports
     WHERE project_id = ?
     ORDER BY generated_at DESC`,
    [projectId]
  );

  return rows.map((row) => {
    let summary = {};
    try {
      summary = row.summary_stats ? JSON.parse(row.summary_stats) : {};
    } catch {}

    let meta = {};
    try {
      meta = row.metadata_json ? JSON.parse(row.metadata_json) : {};
    } catch {}

    return {
      id: row.id,
      projectId: row.project_id,
      verificationRunId: row.verification_run_id,
      reportName: row.report_name || `Report ${row.id.slice(0, 8)}`,
      fileSize: row.file_size || 0,
      reportSha256: row.report_sha256,
      reportVersion: row.report_version || '1.0.0',
      generatedAt: row.generated_at,
      downloadUrl: `/api/projects/${row.project_id}/reports/${row.id}/download`,
      summaryStats: summary,
      metadata: {
        modelName: meta.modelName,
        submissionHash: meta.submissionHash,
        submissionFilename: meta.submissionFilename,
        srsDocumentName: meta.srsDocumentName,
      },
    };
  });
}

/**
 * Gets metadata for a single report.
 *
 * @param {string} projectId
 * @param {string} reportId
 * @returns {Object} Safe report metadata
 */
export function getReportById(projectId, reportId) {
  const project = queryOne('SELECT id FROM projects WHERE id = ?', [projectId]);
  if (!project) {
    throw new Error(`Project with ID "${projectId}" not found.`);
  }

  const row = queryOne(
    `SELECT 
       id, project_id, verification_run_id, report_name,
       report_sha256, file_size, report_version, summary_stats,
       metadata_json, generated_at
     FROM verification_reports
     WHERE id = ? AND project_id = ?`,
    [reportId, projectId]
  );

  if (!row) {
    throw new Error(`Report "${reportId}" not found for project "${projectId}".`);
  }

  let summary = {};
  try {
    summary = row.summary_stats ? JSON.parse(row.summary_stats) : {};
  } catch {}

  let meta = {};
  try {
    meta = row.metadata_json ? JSON.parse(row.metadata_json) : {};
  } catch {}

  return {
    id: row.id,
    projectId: row.project_id,
    verificationRunId: row.verification_run_id,
    reportName: row.report_name,
    fileSize: row.file_size,
    reportSha256: row.report_sha256,
    reportVersion: row.report_version || '1.0.0',
    generatedAt: row.generated_at,
    downloadUrl: `/api/projects/${row.project_id}/reports/${row.id}/download`,
    summaryStats: summary,
    metadata: meta,
  };
}

/**
 * Retrieves the raw PDF binary buffer for a report, validating ownership.
 *
 * @param {string} projectId
 * @param {string} reportId
 * @returns {Promise<{ buffer: Buffer, report: Object, safeFilename: string }>}
 */
export async function getReportBinary(projectId, reportId) {
  const project = queryOne('SELECT id, name FROM projects WHERE id = ?', [projectId]);
  if (!project) {
    throw new Error(`Project with ID "${projectId}" not found.`);
  }

  const row = queryOne(
    `SELECT * FROM verification_reports WHERE id = ? AND project_id = ?`,
    [reportId, projectId]
  );

  if (!row) {
    throw new Error(`Report "${reportId}" not found for project "${projectId}".`);
  }

  if (!row.storage_key && !row.report_path) {
    throw new Error(`Report "${reportId}" has no valid storage key recorded.`);
  }

  const key = row.storage_key || row.report_path;
  const storage = getStorageProvider();

  const exists = await storage.exists(key);
  if (!exists) {
    throw new Error(`Stored report file could not be found on disk.`);
  }

  const buffer = await storage.get(key);

  // Validate PDF header signature
  if (!buffer || buffer.length < 5 || buffer.slice(0, 5).toString() !== '%PDF-') {
    throw new Error(`Stored report file is corrupted or not a valid PDF.`);
  }

  const safeFilename = `${(row.report_name || `GENESIS_Report_${reportId}`).replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;

  return {
    buffer,
    report: {
      id: row.id,
      projectId: row.project_id,
      verificationRunId: row.verification_run_id,
      reportName: row.report_name,
      fileSize: row.file_size,
      reportSha256: row.report_sha256,
      generatedAt: row.generated_at,
    },
    safeFilename,
  };
}
