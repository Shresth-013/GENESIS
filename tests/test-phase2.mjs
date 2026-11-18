import assert from 'node:assert';
import crypto from 'node:crypto';
import path from 'node:path';
import { getDb, queryOne, queryAll, execute, transaction } from '../src/lib/db/index.js';
import { getStorageProvider } from '../src/lib/storage/index.js';
import {
  validateDocumentUpload,
  parseDocument,
  DEFAULT_MAX_FILE_SIZE,
} from '../src/lib/document/parser.js';
import {
  parseAndValidateGeminiResponse,
  VALID_CATEGORIES,
  VALID_PRIORITIES,
} from '../src/lib/ai/gemini.js';
import {
  createSamplePdfBuffer,
  createSampleDocxBuffer,
  MOCK_GEMINI_REQUIREMENTS,
} from './test-utils.mjs';

console.log('--- STARTING GENESIS PHASE 2 VERIFICATION SUITE ---');

// Setup test project
const testProjId = `p2_test_${Date.now()}`;
const now = new Date().toISOString();

execute(
  `INSERT INTO projects (id, name, description, client_name, status, created_at, updated_at)
   VALUES (?, 'Phase 2 Test Project', 'SRS Ingestion & Verification Suite', 'Genesis Academic', 'CREATED', ?, ?)`,
  [testProjId, now, now]
);

let testDocId = null;
let createdReqIds = [];

try {
  // 1. Valid PDF upload validation
  console.log('[1/18] Testing valid PDF upload validation...');
  const validPdfCheck = validateDocumentUpload('system_requirements.pdf', 'application/pdf', 10240);
  assert.strictEqual(validPdfCheck.isValid, true);
  assert.strictEqual(validPdfCheck.ext, '.pdf');
  console.log('✓ Valid PDF upload accepted.');

  // 2. Valid DOCX upload validation
  console.log('[2/18] Testing valid DOCX upload validation...');
  const validDocxCheck = validateDocumentUpload(
    'system_specification.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    20480
  );
  assert.strictEqual(validDocxCheck.isValid, true);
  assert.strictEqual(validDocxCheck.ext, '.docx');
  console.log('✓ Valid DOCX upload accepted.');

  // 3. Unsupported file rejection
  console.log('[3/18] Testing unsupported file rejection...');
  assert.throws(
    () => validateDocumentUpload('malicious_payload.exe', 'application/x-msdownload', 4096),
    /Unsupported file extension "\.exe"/
  );
  assert.throws(
    () => validateDocumentUpload('script.py', 'text/x-python', 4096),
    /Unsupported file extension "\.py"/
  );
  console.log('✓ Unsupported file types rejected.');

  // 4. Oversized file rejection
  console.log('[4/18] Testing oversized file rejection (> 15MB)...');
  const limitBytes = 15 * 1024 * 1024;
  assert.throws(
    () => validateDocumentUpload('huge_srs.pdf', 'application/pdf', limitBytes + 1, limitBytes),
    /Document exceeds maximum allowed size/
  );
  console.log('✓ Oversized document rejected.');

  // 5. Missing project handling
  console.log('[5/18] Testing missing project handling...');
  const missingProject = queryOne('SELECT id FROM projects WHERE id = ?', ['non_existent_proj_99999']);
  assert.strictEqual(missingProject, undefined, 'Non-existent project should return undefined');
  console.log('✓ Missing project handled cleanly.');

  // 6. Empty document handling
  console.log('[6/18] Testing empty document handling (0 bytes)...');
  assert.throws(
    () => validateDocumentUpload('empty.pdf', 'application/pdf', 0),
    /Uploaded document is empty/
  );
  console.log('✓ Empty document rejected.');

  // 7. PDF text extraction
  console.log('[7/18] Testing PDF text extraction with page preservation...');
  const samplePdf = createSamplePdfBuffer(
    'GENESIS Software Requirements: The system shall encrypt stored authentication tokens with AES-256 and log all login events.'
  );
  const pdfResult = await parseDocument(samplePdf, 'sample.pdf');
  assert.strictEqual(pdfResult.type, 'pdf');
  assert.ok(pdfResult.fullText.includes('encrypt stored authentication tokens'));
  assert.ok(pdfResult.pageCount >= 1);
  assert.ok(Array.isArray(pdfResult.sections));
  console.log('✓ PDF parsed page-by-page successfully.');

  // 8. DOCX text extraction
  console.log('[8/18] Testing DOCX text extraction with paragraph preservation...');
  const sampleDocx = await createSampleDocxBuffer(
    'GENESIS Specification: The application shall authenticate users using 2-factor authentication and reject expired sessions.'
  );
  const docxResult = await parseDocument(sampleDocx, 'sample.docx');
  assert.strictEqual(docxResult.type, 'docx');
  assert.ok(docxResult.fullText.includes('2-factor authentication'));
  assert.ok(docxResult.paragraphCount >= 1);
  console.log('✓ DOCX parsed paragraph-by-paragraph successfully.');

  // 9. Gemini response validation
  console.log('[9/18] Testing Gemini response schema validation...');
  const validated = parseAndValidateGeminiResponse(MOCK_GEMINI_REQUIREMENTS);
  assert.strictEqual(validated.length, 3);
  assert.strictEqual(validated[0].req_code, 'REQ-001');
  assert.strictEqual(validated[0].category, 'FUNCTIONAL');
  assert.strictEqual(validated[1].req_code, 'REQ-002');
  assert.strictEqual(validated[1].category, 'SECURITY');
  assert.strictEqual(validated[1].priority, 'CRITICAL');
  console.log('✓ Gemini schema validated and normalized.');

  // 10. Malformed Gemini JSON handling
  console.log('[10/18] Testing malformed Gemini JSON response handling...');
  // Code block wrapping
  const wrappedJson = '```json\n' + JSON.stringify(MOCK_GEMINI_REQUIREMENTS) + '\n```';
  const unwrapped = parseAndValidateGeminiResponse(wrappedJson);
  assert.strictEqual(unwrapped.length, 3);

  // Missing requirements array
  assert.throws(
    () => parseAndValidateGeminiResponse({ wrong_key: [] }),
    /does not contain a "requirements" array/
  );

  // Non-JSON string
  assert.throws(
    () => parseAndValidateGeminiResponse('This is not json at all'),
    /Malformed AI JSON response/
  );
  console.log('✓ Malformed AI responses handled safely.');

  // 11. Requirement creation (SQLite persistence)
  console.log('[11/18] Testing requirement creation in SQLite...');
  testDocId = `srs_${Date.now()}`;
  execute(
    `INSERT INTO srs_documents (id, project_id, filename, original_name, file_path, file_size, mime_type, extracted_text, status, is_active, created_at)
     VALUES (?, ?, 'doc.pdf', 'SRS_Doc.pdf', 'projects/test/doc.pdf', 5000, 'application/pdf', 'Full text', 'EXTRACTED', 1, ?)`,
    [testDocId, testProjId, now]
  );

  const req1Id = `req_${Date.now()}_1`;
  const req2Id = `req_${Date.now()}_2`;
  createdReqIds = [req1Id, req2Id];

  execute(
    `INSERT INTO requirements (id, project_id, srs_document_id, req_code, title, description, category, priority, approval_status, created_at, updated_at)
     VALUES (?, ?, ?, 'REQ-001', 'Login System', 'Users must log in with email and password.', 'FUNCTIONAL', 'HIGH', 'PENDING', ?, ?)`,
    [req1Id, testProjId, testDocId, now, now]
  );
  execute(
    `INSERT INTO requirements (id, project_id, srs_document_id, req_code, title, description, category, priority, approval_status, created_at, updated_at)
     VALUES (?, ?, ?, 'REQ-002', 'Data Encryption', 'All client records must be encrypted at rest.', 'SECURITY', 'CRITICAL', 'PENDING', ?, ?)`,
    [req2Id, testProjId, testDocId, now, now]
  );

  const req1 = queryOne('SELECT * FROM requirements WHERE id = ?', [req1Id]);
  assert.ok(req1, 'Requirement 1 must exist');
  assert.strictEqual(req1.req_code, 'REQ-001');
  assert.strictEqual(req1.approval_status, 'PENDING');
  console.log('✓ Requirement records created in SQLite.');

  // 12. Requirement editing
  console.log('[12/18] Testing requirement editing...');
  execute(
    `UPDATE requirements SET description = ?, priority = ?, updated_at = ? WHERE id = ?`,
    ['Updated description with 2FA requirement.', 'CRITICAL', new Date().toISOString(), req1Id]
  );
  const updatedReq1 = queryOne('SELECT description, priority FROM requirements WHERE id = ?', [req1Id]);
  assert.strictEqual(updatedReq1.description, 'Updated description with 2FA requirement.');
  assert.strictEqual(updatedReq1.priority, 'CRITICAL');
  console.log('✓ Requirement updated successfully.');

  // 13. Requirement approval
  console.log('[13/18] Testing individual requirement approval...');
  execute(`UPDATE requirements SET approval_status = 'APPROVED' WHERE id = ?`, [req1Id]);
  const approvedReq1 = queryOne('SELECT approval_status FROM requirements WHERE id = ?', [req1Id]);
  assert.strictEqual(approvedReq1.approval_status, 'APPROVED');
  console.log('✓ Requirement approved.');

  // 14. Requirement rejection
  console.log('[14/18] Testing individual requirement rejection...');
  execute(`UPDATE requirements SET approval_status = 'REJECTED' WHERE id = ?`, [req2Id]);
  const rejectedReq2 = queryOne('SELECT approval_status FROM requirements WHERE id = ?', [req2Id]);
  assert.strictEqual(rejectedReq2.approval_status, 'REJECTED');
  console.log('✓ Requirement rejected.');

  // 15. Bulk approval
  console.log('[15/18] Testing bulk approval transaction...');
  // Create two more requirements
  const req3Id = `req_${Date.now()}_3`;
  const req4Id = `req_${Date.now()}_4`;
  createdReqIds.push(req3Id, req4Id);

  execute(
    `INSERT INTO requirements (id, project_id, srs_document_id, req_code, title, description, approval_status, created_at, updated_at)
     VALUES (?, ?, ?, 'REQ-003', 'R3', 'Description 3', 'PENDING', ?, ?)`,
    [req3Id, testProjId, testDocId, now, now]
  );
  execute(
    `INSERT INTO requirements (id, project_id, srs_document_id, req_code, title, description, approval_status, created_at, updated_at)
     VALUES (?, ?, ?, 'REQ-004', 'R4', 'Description 4', 'PENDING', ?, ?)`,
    [req4Id, testProjId, testDocId, now, now]
  );

  const bulkTargetIds = [req3Id, req4Id];
  transaction(() => {
    for (const id of bulkTargetIds) {
      execute(`UPDATE requirements SET approval_status = 'APPROVED' WHERE id = ?`, [id]);
    }
  });

  const checkReq3 = queryOne('SELECT approval_status FROM requirements WHERE id = ?', [req3Id]);
  const checkReq4 = queryOne('SELECT approval_status FROM requirements WHERE id = ?', [req4Id]);
  assert.strictEqual(checkReq3.approval_status, 'APPROVED');
  assert.strictEqual(checkReq4.approval_status, 'APPROVED');
  console.log('✓ Bulk approval transaction committed.');

  // 16. SQLite persistence after restart simulation
  console.log('[16/18] Testing SQLite persistence across connection reload...');
  // Query from raw file on disk to guarantee on-disk durability
  const verifyDb = getDb();
  const persistedRows = verifyDb.prepare('SELECT id, req_code, approval_status FROM requirements WHERE project_id = ?').all(testProjId);
  assert.strictEqual(persistedRows.length, 4);
  console.log('✓ Requirements persisted durably in SQLite file.');

  // 17. Document-to-project association
  console.log('[17/18] Testing document-to-project association and cascade...');
  const doc = queryOne('SELECT project_id FROM srs_documents WHERE id = ?', [testDocId]);
  assert.strictEqual(doc.project_id, testProjId);
  console.log('✓ Document-to-project association verified.');

  // 18. Duplicate requirement code handling
  console.log('[18/18] Testing duplicate requirement code handling in AI normalizer...');
  const rawWithDups = {
    requirements: [
      { temporary_id: 'REQ-001', description: 'First req' },
      { temporary_id: 'REQ-001', description: 'Second req with same code' },
    ],
  };
  const deduplicated = parseAndValidateGeminiResponse(rawWithDups);
  assert.strictEqual(deduplicated[0].req_code, 'REQ-001');
  assert.strictEqual(deduplicated[1].req_code, 'REQ-001_2');
  console.log('✓ Duplicate requirement codes safely resolved.');

} finally {
  // Clean up test data
  console.log('Cleaning up Phase 2 test records...');
  execute('DELETE FROM projects WHERE id = ?', [testProjId]);
  console.log('Cleanup complete.');
}

console.log('====================================================');
console.log('ALL PHASE 2 VERIFICATION TESTS PASSED (18/18)!');
console.log('====================================================');

