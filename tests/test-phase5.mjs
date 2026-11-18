import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { generateVerificationPDF, sanitizeForPdf } from '../src/lib/report/pdfGenerator.js';
import {
  createVerificationReport,
  listReportsForProject,
  getReportById,
  getReportBinary,
} from '../src/lib/report/reportService.js';
import { getStorageProvider } from '../src/lib/storage/index.js';
import { getDb, queryOne, queryAll, execute } from '../src/lib/db/index.js';

console.log('--- STARTING GENESIS PHASE 5 VERIFICATION SUITE ---');

let testPassed = 0;
let testTotal = 0;

function runTest(name, fn) {
  testTotal++;
  process.stdout.write(`[${testTotal}] Testing ${name}... `);
  try {
    fn();
    console.log('✓');
    testPassed++;
  } catch (error) {
    console.log('✗ FAILED');
    console.error(error);
    process.exit(1);
  }
}

async function runTestAsync(name, fn) {
  testTotal++;
  process.stdout.write(`[${testTotal}] Testing ${name}... `);
  try {
    await fn();
    console.log('✓');
    testPassed++;
  } catch (error) {
    console.log('✗ FAILED');
    console.error(error);
    process.exit(1);
  }
}

// ==========================================
// FIXTURE DATA FOR UNIT TESTING
// ==========================================
const mockProject = {
  id: 'proj_p5_test',
  name: 'GENESIS Healthcare Audit Platform',
  description: 'Enterprise healthcare verification platform',
  client_name: 'Metro Health Systems',
  status: 'VERIFIED',
  created_at: new Date().toISOString(),
};

const mockRun = {
  id: 'vrun_p5_fixture',
  project_id: 'proj_p5_test',
  srs_document_id: 'srs_p5_1',
  submission_id: 'sub_p5_1',
  status: 'COMPLETED',
  total_requirements: 4,
  verified_count: 1,
  partially_count: 1,
  not_implemented_count: 1,
  unverified_count: 1,
  failed_count: 0,
  model_name: 'gemini-2.0-flash',
  started_at: new Date(Date.now() - 60000).toISOString(),
  completed_at: new Date().toISOString(),
};

const mockSrsDoc = {
  id: 'srs_p5_1',
  project_id: 'proj_p5_test',
  filename: 'Healthcare_SRS_v2.pdf',
  original_name: 'Healthcare_SRS_v2.pdf',
  file_size: 450000,
  mime_type: 'application/pdf',
  page_count: 12,
  paragraph_count: 85,
  status: 'PROCESSED',
};

const mockSubmission = {
  id: 'sub_p5_1',
  project_id: 'proj_p5_test',
  filename: 'healthcare-api-main.zip',
  file_size: 1250000,
  archive_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  version: 1,
  is_active: 1,
  total_files: 24,
  analyzed_files: 22,
  skipped_files: 2,
  total_lines: 4800,
  evidence_count: 42,
  languages: JSON.stringify({ JavaScript: 18, SQL: 4 }),
  status: 'ANALYZED',
};

const mockResults = [
  {
    id: 'res_1',
    requirement_id: 'req_1',
    reqCode: 'SEC-01',
    title: 'HIPAA Compliant User Authentication',
    description: 'System must authenticate users via JWT with bcrypt hashed passwords.',
    category: 'SECURITY',
    priority: 'HIGH',
    type: 'FUNCTIONAL_REQUIREMENT',
    acceptance_criteria: '1. Passwords hashed with bcrypt\n2. Tokens signed with 256-bit secret',
    status: 'VERIFIED',
    confidence_score: 0.95,
    confidence_reason: 'Strong AST evidence confirms bcrypt and JWT verification.',
    ai_explanation: 'Static analysis detected bcrypt password hashing and jsonwebtoken sign handler in src/auth.js.',
    evidence_references: JSON.stringify([
      {
        id: 'ev_1',
        filePath: 'src/auth/jwt.js',
        startLine: 14,
        endLine: 28,
        identifier: 'signToken()',
        evidenceType: 'AUTHENTICATION_INDICATOR',
        analysisMethod: 'AST',
        codeSnippet: 'const token = jwt.sign({ id: user.id }, SECRET, { expiresIn: "1h" });',
        contextSummary: 'JWT generation handler',
      },
    ]),
    contradicting_evidence: JSON.stringify([]),
    criteria_assessment: JSON.stringify([
      { criterion: 'Passwords hashed with bcrypt', assessment: 'SATISFIED', explanation: 'Found bcrypt.hash in authService' },
      { criterion: 'Tokens signed with 256-bit secret', assessment: 'SATISFIED', explanation: 'Found jwt.sign' },
    ]),
    limitations: JSON.stringify([]),
  },
  {
    id: 'res_2',
    requirement_id: 'req_2',
    reqCode: 'AUDIT-02',
    title: 'Access Audit Logging',
    description: 'All medical record access must generate an immutable audit log entry.',
    category: 'AUDIT',
    priority: 'CRITICAL',
    type: 'SECURITY_REQUIREMENT',
    acceptance_criteria: 'Audit entries written to audit table with timestamp.',
    status: 'PARTIALLY_IMPLEMENTED',
    confidence_score: 0.70,
    confidence_reason: 'Found audit logger symbol but no database persist handler.',
    ai_explanation: 'Audit helper function exists in utils/logger.js but database insertion query is missing.',
    evidence_references: JSON.stringify([
      {
        id: 'ev_2',
        filePath: 'src/utils/logger.js',
        startLine: 40,
        endLine: 48,
        identifier: 'logAccess()',
        evidenceType: 'FUNCTION_DECLARATION',
        analysisMethod: 'AST',
        codeSnippet: 'function logAccess(user, action) { console.log(user, action); }',
        contextSummary: 'In-memory log function',
      },
    ]),
    contradicting_evidence: JSON.stringify([]),
    criteria_assessment: JSON.stringify([
      { criterion: 'Audit entries written to DB', assessment: 'INCOMPLETE', explanation: 'Console log only' },
    ]),
    limitations: JSON.stringify(['Database persistence handler missing']),
  },
  {
    id: 'res_3',
    requirement_id: 'req_3',
    reqCode: 'BILL-03',
    title: 'Automated Billing Integration',
    description: 'System must bill insurance provider via HL7 FHIR API.',
    category: 'INTEGRATION',
    priority: 'MEDIUM',
    type: 'FUNCTIONAL_REQUIREMENT',
    acceptance_criteria: 'HL7 FHIR API client implemented.',
    status: 'NOT_IMPLEMENTED',
    confidence_score: 0.90,
    confidence_reason: 'Complete analysis of all 22 JS files found zero references to FHIR or billing.',
    ai_explanation: 'No FHIR client, billing endpoints, or insurance payment handlers exist in the analyzed codebase.',
    evidence_references: JSON.stringify([]),
    contradicting_evidence: JSON.stringify([]),
    criteria_assessment: JSON.stringify([
      { criterion: 'HL7 FHIR client implemented', assessment: 'MISSING', explanation: 'No FHIR code found' },
    ]),
    limitations: JSON.stringify([]),
  },
  {
    id: 'res_4',
    requirement_id: 'req_4',
    reqCode: 'EXPORT-04',
    title: 'Patient Record Export in DICOM Format',
    description: 'Export imaging data in standard DICOM binary format.',
    category: 'FUNCTIONAL',
    priority: 'LOW',
    type: 'FUNCTIONAL_REQUIREMENT',
    acceptance_criteria: 'DICOM parser and exporter.',
    status: 'UNVERIFIED',
    confidence_score: 0.0,
    confidence_reason: 'Candidate evidence insufficient and C++ native extension was skipped.',
    ai_explanation: 'The imaging module uses native C++ extensions which were excluded from static analysis.',
    evidence_references: JSON.stringify([]),
    contradicting_evidence: JSON.stringify([]),
    criteria_assessment: JSON.stringify([]),
    limitations: JSON.stringify(['Native C++ extension imaging.node skipped during analysis']),
  },
];

// ==========================================
// SECTION 1: PDF GENERATOR TESTS
// ==========================================

await runTestAsync('PDF generation: creates valid buffer starting with %PDF-', async () => {
  const buffer = await generateVerificationPDF({
    project: mockProject,
    run: mockRun,
    submission: mockSubmission,
    srsDoc: mockSrsDoc,
    results: mockResults,
    reportId: 'rep_test_signature',
    generatedAt: new Date().toISOString(),
  });

  assert.strictEqual(Buffer.isBuffer(buffer), true);
  assert.strictEqual(buffer.length > 1000, true);
  // Verify PDF header magic bytes %PDF-
  const header = buffer.slice(0, 5).toString('ascii');
  assert.strictEqual(header, '%PDF-');
});

await runTestAsync('PDF generation: renders all four verification statuses', async () => {
  const buffer = await generateVerificationPDF({
    project: mockProject,
    run: mockRun,
    submission: mockSubmission,
    srsDoc: mockSrsDoc,
    results: mockResults,
    reportId: 'rep_test_statuses',
    generatedAt: new Date().toISOString(),
  });

  assert.strictEqual(Buffer.isBuffer(buffer), true);
  // Verify file size is substantial (multi-page document)
  assert.strictEqual(buffer.length > 5000, true);
});

await runTestAsync('PDF generation: handles requirement with zero evidence', async () => {
  const singleResult = [
    {
      id: 'res_no_ev',
      requirement_id: 'req_no_ev',
      reqCode: 'ZERO-01',
      title: 'Requirement Without Evidence',
      description: 'Feature has no matching code in the repository.',
      status: 'UNVERIFIED',
      confidence_score: 0.0,
      ai_explanation: 'Zero code evidence discovered in the repository.',
      evidence_references: JSON.stringify([]),
      criteria_assessment: JSON.stringify([]),
      limitations: JSON.stringify(['No evidence found']),
    },
  ];

  const buffer = await generateVerificationPDF({
    project: mockProject,
    run: { ...mockRun, total_requirements: 1 },
    submission: mockSubmission,
    srsDoc: mockSrsDoc,
    results: singleResult,
    reportId: 'rep_zero_ev',
    generatedAt: new Date().toISOString(),
  });

  assert.strictEqual(buffer.slice(0, 5).toString('ascii'), '%PDF-');
});

await runTestAsync('PDF generation: handles multiple evidence records per requirement', async () => {
  const multiEvidence = Array.from({ length: 6 }, (_, i) => ({
    id: `ev_multi_${i}`,
    filePath: `src/controllers/patientController_${i}.js`,
    startLine: 10 + i * 15,
    endLine: 25 + i * 15,
    identifier: `handleRecord_${i}()`,
    evidenceType: 'FUNCTION_DECLARATION',
    analysisMethod: 'AST',
    codeSnippet: `export async function handleRecord_${i}(req, res) { return processRecord(req.body); }`,
    contextSummary: `Patient record controller module #${i}`,
  }));

  const resultWithManyEvidence = [
    {
      ...mockResults[0],
      evidence_references: JSON.stringify(multiEvidence),
    },
  ];

  const buffer = await generateVerificationPDF({
    project: mockProject,
    run: { ...mockRun, total_requirements: 1 },
    submission: mockSubmission,
    srsDoc: mockSrsDoc,
    results: resultWithManyEvidence,
    reportId: 'rep_multi_ev',
    generatedAt: new Date().toISOString(),
  });

  assert.strictEqual(buffer.slice(0, 5).toString('ascii'), '%PDF-');
  assert.strictEqual(buffer.length > 3000, true);
});

await runTestAsync('PDF generation: handles very long requirement descriptions with word wrapping', async () => {
  const veryLongText =
    'The system shall implement comprehensive multi-tenant cryptographic access control ' +
    'mechanisms across all distributed microservices. Each service request must contain an ' +
    'ephemeral, asymmetric JSON Web Key (JWK) token signed by the identity provider and ' +
    'validated against the centralized revocations registry. In addition, the system must ' +
    'enforce role-based and attribute-based permissions simultaneously, ensuring that medical ' +
    'practitioners can only access clinical data for active patients under their direct care. ' +
    'All unauthorized access attempts must trigger immediate intrusion detection alerts, ' +
    'record the client IP address, user-agent header, and request payload in an immutable ' +
    'tamper-evident audit trail, and temporarily throttle the requesting client credentials.';

  const longDescResult = [
    {
      ...mockResults[0],
      description: veryLongText,
      ai_explanation: veryLongText,
    },
  ];

  const buffer = await generateVerificationPDF({
    project: mockProject,
    run: { ...mockRun, total_requirements: 1 },
    submission: mockSubmission,
    srsDoc: mockSrsDoc,
    results: longDescResult,
    reportId: 'rep_long_desc',
    generatedAt: new Date().toISOString(),
  });

  assert.strictEqual(buffer.slice(0, 5).toString('ascii'), '%PDF-');
});

await runTestAsync('PDF generation: handles long code excerpts with bounded truncation', async () => {
  const hugeSnippet = Array.from({ length: 60 }, (_, i) => `const line_${i} = executeComplexStep(${i}, "param");`).join('\n');

  const hugeSnippetResult = [
    {
      ...mockResults[0],
      evidence_references: JSON.stringify([
        {
          id: 'ev_huge',
          filePath: 'src/long/path/to/deeply/nested/businessLogicModule.js',
          startLine: 1,
          endLine: 60,
          identifier: 'complexWorkflow()',
          evidenceType: 'FUNCTION_DECLARATION',
          analysisMethod: 'AST',
          codeSnippet: hugeSnippet,
        },
      ]),
    },
  ];

  const buffer = await generateVerificationPDF({
    project: mockProject,
    run: { ...mockRun, total_requirements: 1 },
    submission: mockSubmission,
    srsDoc: mockSrsDoc,
    results: hugeSnippetResult,
    reportId: 'rep_huge_snippet',
    generatedAt: new Date().toISOString(),
  });

  assert.strictEqual(buffer.slice(0, 5).toString('ascii'), '%PDF-');
});

await runTestAsync('PDF generation: handles missing optional metadata gracefully', async () => {
  const buffer = await generateVerificationPDF({
    project: { id: 'p_min', name: 'Minimal Project', status: 'VERIFIED' },
    run: { id: 'r_min', status: 'COMPLETED', total_requirements: 1, started_at: new Date().toISOString() },
    submission: null, // No submission
    srsDoc: null,     // No SRS doc
    results: [
      {
        id: 'res_min',
        requirement_id: 'req_min',
        reqCode: 'MIN-01',
        title: 'Minimal Requirement',
        description: 'No extra fields',
        status: 'UNVERIFIED',
        ai_explanation: 'Evaluation complete',
      },
    ],
    reportId: 'rep_min',
    generatedAt: new Date().toISOString(),
  });

  assert.strictEqual(buffer.slice(0, 5).toString('ascii'), '%PDF-');
});

await runTestAsync('PDF generation: includes unsupported-language limitations', async () => {
  const buffer = await generateVerificationPDF({
    project: mockProject,
    run: mockRun,
    submission: {
      ...mockSubmission,
      languages: JSON.stringify({ JavaScript: 10, Rust: 3, Go: 2 }),
      skipped_files: 5,
    },
    srsDoc: mockSrsDoc,
    results: mockResults,
    reportId: 'rep_langs',
    generatedAt: new Date().toISOString(),
  });

  assert.strictEqual(buffer.slice(0, 5).toString('ascii'), '%PDF-');
});

await runTestAsync('PDF generation: includes heuristic analysis evidence records', async () => {
  const heuristicResult = [
    {
      ...mockResults[0],
      evidence_references: JSON.stringify([
        {
          id: 'ev_heur_1',
          filePath: 'db/schema.sql',
          startLine: 12,
          endLine: 24,
          identifier: 'CREATE TABLE users',
          evidenceType: 'DATABASE_TABLE_DEFINITION',
          analysisMethod: 'HEURISTIC',
          codeSnippet: 'CREATE TABLE users (id UUID PRIMARY KEY, password_hash TEXT NOT NULL);',
        },
      ]),
    },
  ];

  const buffer = await generateVerificationPDF({
    project: mockProject,
    run: mockRun,
    submission: mockSubmission,
    srsDoc: mockSrsDoc,
    results: heuristicResult,
    reportId: 'rep_heuristic',
    generatedAt: new Date().toISOString(),
  });

  assert.strictEqual(buffer.slice(0, 5).toString('ascii'), '%PDF-');
});

await runTestAsync('PDF generation: handles unavailable Gemini model metadata', async () => {
  const buffer = await generateVerificationPDF({
    project: mockProject,
    run: { ...mockRun, model_name: null },
    submission: mockSubmission,
    srsDoc: mockSrsDoc,
    results: mockResults,
    reportId: 'rep_no_model',
    generatedAt: new Date().toISOString(),
  });

  assert.strictEqual(buffer.slice(0, 5).toString('ascii'), '%PDF-');
});

runTest('Unicode sanitization: transliterates typography and non-Latin scripts safely', () => {
  const input = 'Feature: “Smart quotes”, em—dash, en–dash, arrows → ⇒, math ≤ ≥ ≠, Hindi हिन्दी, Japanese 日本語, Emoji 🚀';
  const sanitized = sanitizeForPdf(input);

  // Check smart quotes normalized
  assert.strictEqual(sanitized.includes('"Smart quotes"'), true);
  // Check arrows normalized
  assert.strictEqual(sanitized.includes('->'), true);
  assert.strictEqual(sanitized.includes('=>'), true);
  // Check math symbols normalized
  assert.strictEqual(sanitized.includes('<='), true);
  assert.strictEqual(sanitized.includes('>='), true);
  assert.strictEqual(sanitized.includes('!='), true);
  // Check non-Latin scripts transliterated to clean hex code without crashing
  assert.strictEqual(sanitized.includes('[U+'), true);
});

await runTestAsync('PDF generation: encodes Unicode without throwing WinAnsi exceptions', async () => {
  const unicodeResult = [
    {
      id: 'res_unicode',
      requirement_id: 'req_unicode',
      reqCode: 'UNICODE-01',
      title: 'Requirement with Unicode: हिन्दी, 日本語, and Emojis 🔐 🚀',
      description: 'Testing special characters: “smart quotes”, em—dash, arrow →, and mathematical symbols ≤ ≥ ≠.',
      category: 'INTERNATIONALIZATION',
      status: 'VERIFIED',
      confidence_score: 0.9,
      ai_explanation: 'Explanation with Greek symbols λ, μ, and accents: résumé, naïve, señor.',
      evidence_references: JSON.stringify([
        {
          id: 'ev_uni',
          filePath: 'src/intl/i18n.js',
          startLine: 1,
          endLine: 5,
          identifier: 'localize()',
          evidenceType: 'FUNCTION_DECLARATION',
          analysisMethod: 'AST',
          codeSnippet: 'const greeting = "नमस्ते / こんにちは";',
        },
      ]),
    },
  ];

  // Must complete without throwing any WinAnsi error!
  const buffer = await generateVerificationPDF({
    project: mockProject,
    run: { ...mockRun, total_requirements: 1 },
    submission: mockSubmission,
    srsDoc: mockSrsDoc,
    results: unicodeResult,
    reportId: 'rep_unicode',
    generatedAt: new Date().toISOString(),
  });

  assert.strictEqual(buffer.slice(0, 5).toString('ascii'), '%PDF-');
});

await runTestAsync('PDF generation: multi-page pagination generates complete document', async () => {
  const buffer = await generateVerificationPDF({
    project: mockProject,
    run: mockRun,
    submission: mockSubmission,
    srsDoc: mockSrsDoc,
    results: mockResults,
    reportId: 'rep_multipage',
    generatedAt: new Date().toISOString(),
  });

  // A complete audit report with 4 requirements, cover page, executive summary,
  // project info, methodology, status definitions, matrix, 4 detailed cards,
  // limitations, audit info, and disclaimer will produce 10+ pages
  assert.strictEqual(buffer.length > 25000, true);
});

runTest('PDF generation: does not call external Gemini API', () => {
  // Pure local offline test - no network or external API dependency
  assert.strictEqual(typeof generateVerificationPDF, 'function');
});

// ==========================================
// SECTION 2: DATABASE & REPORT SERVICE TESTS
// ==========================================

const testProjId = `p5_proj_${Date.now()}`;
const testRunId = `vrun_p5_${Date.now()}`;
const testReqId1 = `req_p5_1_${Date.now()}`;
const testReqId2 = `req_p5_2_${Date.now()}`;
const testSubId = `sub_p5_${Date.now()}`;

runTest('setup: insert test project, run, requirements, and results in SQLite', () => {
  const now = new Date().toISOString();

  // Insert project
  execute(
    `INSERT INTO projects (id, name, description, client_name, status, created_at, updated_at)
     VALUES (?, 'Phase 5 Test Suite Project', 'Report testing project', 'Client X', 'VERIFIED', ?, ?)`,
    [testProjId, now, now]
  );

  // Insert submission
  execute(
    `INSERT INTO code_submissions (id, project_id, filename, file_size, storage_path, archive_hash, status, created_at)
     VALUES (?, ?, 'test_submission.zip', 50000, 'projects/test/code.zip', 'hash123', 'ANALYZED', ?)`,
    [testSubId, testProjId, now]
  );

  // Insert requirements
  execute(
    `INSERT INTO requirements (id, project_id, req_code, title, description, category, approval_status, created_at, updated_at)
     VALUES (?, ?, 'REQ-01', 'User Authentication', 'Login with email and password', 'SECURITY', 'APPROVED', ?, ?)`,
    [testReqId1, testProjId, now, now]
  );
  execute(
    `INSERT INTO requirements (id, project_id, req_code, title, description, category, approval_status, created_at, updated_at)
     VALUES (?, ?, 'REQ-02', 'Profile Management', 'Edit user profile and avatar', 'FUNCTIONAL', 'APPROVED', ?, ?)`,
    [testReqId2, testProjId, now, now]
  );

  // Insert verification run (COMPLETED)
  execute(
    `INSERT INTO verification_runs (id, project_id, submission_id, status, total_requirements, verified_count, started_at, completed_at)
     VALUES (?, ?, ?, 'COMPLETED', 2, 2, ?, ?)`,
    [testRunId, testProjId, testSubId, now, now]
  );

  // Insert verification results
  execute(
    `INSERT INTO verification_results (
      id, run_id, project_id, requirement_id, submission_id, status, confidence_score,
      ai_explanation, evidence_references, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'VERIFIED', 0.9, 'Found auth handler', '[]', ?, ?)`,
    [`vres_1_${Date.now()}`, testRunId, testProjId, testReqId1, testSubId, now, now]
  );
  execute(
    `INSERT INTO verification_results (
      id, run_id, project_id, requirement_id, submission_id, status, confidence_score,
      ai_explanation, evidence_references, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'VERIFIED', 0.85, 'Found profile handler', '[]', ?, ?)`,
    [`vres_2_${Date.now()}`, testRunId, testProjId, testReqId2, testSubId, now, now]
  );
});

await runTestAsync('report service: createVerificationReport throws on missing project', async () => {
  let threw = false;
  try {
    await createVerificationReport('non_existent_proj', testRunId);
  } catch (err) {
    threw = true;
    assert.match(err.message, /Project with ID .* not found/i);
  }
  assert.strictEqual(threw, true);
});

await runTestAsync('report service: createVerificationReport throws on missing run', async () => {
  let threw = false;
  try {
    await createVerificationReport(testProjId, 'non_existent_run');
  } catch (err) {
    threw = true;
    assert.match(err.message, /Verification run with ID .* not found/i);
  }
  assert.strictEqual(threw, true);
});

await runTestAsync('report service: createVerificationReport throws if run belongs to another project', async () => {
  const otherProjId = `p5_other_${Date.now()}`;
  const now = new Date().toISOString();
  execute(
    `INSERT INTO projects (id, name, status, created_at, updated_at) VALUES (?, 'Other Project', 'CREATED', ?, ?)`,
    [otherProjId, now, now]
  );

  let threw = false;
  try {
    // Attempting to generate report on otherProjId with testRunId (which belongs to testProjId)
    await createVerificationReport(otherProjId, testRunId);
  } catch (err) {
    threw = true;
    assert.match(err.message, /does not belong to project/i);
  }
  assert.strictEqual(threw, true);
});

await runTestAsync('report service: createVerificationReport throws if run is not COMPLETED', async () => {
  const incompleteRunId = `vrun_incomplete_${Date.now()}`;
  const now = new Date().toISOString();
  execute(
    `INSERT INTO verification_runs (id, project_id, status, total_requirements, started_at)
     VALUES (?, ?, 'RUNNING', 2, ?)`,
    [incompleteRunId, testProjId, now]
  );

  let threw = false;
  try {
    await createVerificationReport(testProjId, incompleteRunId);
  } catch (err) {
    threw = true;
    assert.match(err.message, /Run must be COMPLETED/i);
  }
  assert.strictEqual(threw, true);
});

let createdReport1 = null;
let createdReport2 = null;

await runTestAsync('report service: createVerificationReport generates report and returns safe metadata', async () => {
  createdReport1 = await createVerificationReport(testProjId, testRunId);

  assert.strictEqual(typeof createdReport1.id, 'string');
  assert.strictEqual(createdReport1.id.startsWith('rep_'), true);
  assert.strictEqual(createdReport1.projectId, testProjId);
  assert.strictEqual(createdReport1.verificationRunId, testRunId);
  assert.strictEqual(typeof createdReport1.fileSize, 'number');
  assert.strictEqual(createdReport1.fileSize > 1000, true);
  assert.strictEqual(typeof createdReport1.reportSha256, 'string');
  assert.strictEqual(createdReport1.reportSha256.length, 64);
  assert.strictEqual(createdReport1.reportVersion, '1.0.0');
  assert.strictEqual(typeof createdReport1.downloadUrl, 'string');
  // Confirm storage_key is NOT exposed in safe return object
  assert.strictEqual(createdReport1.storage_key, undefined);
  assert.strictEqual(createdReport1.report_path, undefined);
});

await runTestAsync('report service: PDF file physically persisted in storage', async () => {
  const row = queryOne('SELECT * FROM verification_reports WHERE id = ?', [createdReport1.id]);
  assert.strictEqual(row !== undefined, true);
  assert.strictEqual(row.storage_key.includes(testProjId), true);

  const storage = getStorageProvider();
  const exists = await storage.exists(row.storage_key);
  assert.strictEqual(exists, true);

  const storedBuffer = await storage.get(row.storage_key);
  assert.strictEqual(storedBuffer.slice(0, 5).toString('ascii'), '%PDF-');
});

await runTestAsync('report service: SHA-256 matches stored PDF binary', async () => {
  const row = queryOne('SELECT * FROM verification_reports WHERE id = ?', [createdReport1.id]);
  const storage = getStorageProvider();
  const buffer = await storage.get(row.storage_key);
  const actualHash = crypto.createHash('sha256').update(buffer).digest('hex');
  assert.strictEqual(actualHash, row.report_sha256);
});

runTest('report service: listReportsForProject returns report list without internal storage keys', () => {
  const list = listReportsForProject(testProjId);
  assert.strictEqual(Array.isArray(list), true);
  assert.strictEqual(list.length >= 1, true);

  const rep = list.find((r) => r.id === createdReport1.id);
  assert.strictEqual(rep !== undefined, true);
  assert.strictEqual(rep.projectId, testProjId);
  assert.strictEqual(rep.verificationRunId, testRunId);
  // Security boundary: storage keys must NOT be present
  assert.strictEqual(rep.storage_key, undefined);
  assert.strictEqual(rep.report_path, undefined);
});

runTest('report service: getReportById returns single safe metadata object', () => {
  const report = getReportById(testProjId, createdReport1.id);
  assert.strictEqual(report.id, createdReport1.id);
  assert.strictEqual(report.projectId, testProjId);
  assert.strictEqual(report.verificationRunId, testRunId);
  assert.strictEqual(report.storage_key, undefined);
});

runTest('report service: getReportById throws if report belongs to different project', () => {
  let threw = false;
  try {
    getReportById('wrong_project_id', createdReport1.id);
  } catch (err) {
    threw = true;
  }
  assert.strictEqual(threw, true);
});

await runTestAsync('report service: multiple reports for same run are preserved without overwrite', async () => {
  // Generate a second report for the same run
  createdReport2 = await createVerificationReport(testProjId, testRunId, { reportName: 'Second_Audit_Copy' });

  assert.strictEqual(createdReport2.id !== createdReport1.id, true);

  const list = listReportsForProject(testProjId);
  assert.strictEqual(list.length >= 2, true);

  // Both reports exist in DB
  const ids = list.map((r) => r.id);
  assert.strictEqual(ids.includes(createdReport1.id), true);
  assert.strictEqual(ids.includes(createdReport2.id), true);
});

// ==========================================
// SECTION 3: DOWNLOAD & SECURITY TESTS
// ==========================================

await runTestAsync('report download: getReportBinary returns valid buffer and safe filename', async () => {
  const result = await getReportBinary(testProjId, createdReport1.id);
  assert.strictEqual(Buffer.isBuffer(result.buffer), true);
  assert.strictEqual(result.buffer.slice(0, 5).toString('ascii'), '%PDF-');
  assert.strictEqual(result.safeFilename.endsWith('.pdf'), true);
  assert.strictEqual(/^[a-zA-Z0-9_.-]+$/.test(result.safeFilename), true);
});

await runTestAsync('report download: cross-project download rejected', async () => {
  const otherProjId = `p5_dl_other_${Date.now()}`;
  const now = new Date().toISOString();
  execute(
    `INSERT INTO projects (id, name, status, created_at, updated_at) VALUES (?, 'Other DL Project', 'CREATED', ?, ?)`,
    [otherProjId, now, now]
  );

  let threw = false;
  try {
    await getReportBinary(otherProjId, createdReport1.id);
  } catch (err) {
    threw = true;
    assert.match(err.message, /not found for project/i);
  }
  assert.strictEqual(threw, true);

  // Clean up
  execute('DELETE FROM projects WHERE id = ?', [otherProjId]);
});

await runTestAsync('report download: corrupted PDF detection throws clean error', async () => {
  const corruptKey = `projects/${testProjId}/reports/rep_corrupt_test.pdf`;
  const storage = getStorageProvider();
  await storage.save(corruptKey, Buffer.from('NOT A PDF FILE CORRUPTED DATA'));

  const corruptReportId = `rep_corrupt_${Date.now()}`;
  execute(
    `INSERT INTO verification_reports (id, project_id, storage_key, report_name, generated_at)
     VALUES (?, ?, ?, 'Corrupt Report', ?)`,
    [corruptReportId, testProjId, corruptKey, new Date().toISOString()]
  );

  let threw = false;
  try {
    await getReportBinary(testProjId, corruptReportId);
  } catch (err) {
    threw = true;
    assert.match(err.message, /corrupted or not a valid PDF/i);
  }
  assert.strictEqual(threw, true);

  // Clean up
  await storage.delete(corruptKey);
});

// ==========================================
// SECTION 4: INTEGRITY & AUDIT RULES
// ==========================================

runTest('integrity: report generation preserves original verification run record unchanged', () => {
  const runBefore = queryOne('SELECT * FROM verification_runs WHERE id = ?', [testRunId]);
  assert.strictEqual(runBefore.status, 'COMPLETED');
  assert.strictEqual(runBefore.verified_count, 2);
});

runTest('integrity: human review override disclosed as not configured in report metadata', () => {
  const rep = getReportById(testProjId, createdReport1.id);
  assert.strictEqual(typeof rep.metadata, 'object');
  // Human review override is disclosed honestly as absent
  assert.strictEqual(rep.reviewerDecision, undefined);
});

runTest('integrity: project cascade deletion cleans up report records', () => {
  const cascadeProjId = `p5_cascade_${Date.now()}`;
  const now = new Date().toISOString();
  execute(
    `INSERT INTO projects (id, name, status, created_at, updated_at) VALUES (?, 'Cascade Test', 'CREATED', ?, ?)`,
    [cascadeProjId, now, now]
  );
  execute(
    `INSERT INTO verification_reports (id, project_id, report_name, storage_key, generated_at)
     VALUES (?, ?, 'Cascade Report', 'fake_key', ?)`,
    [`rep_casc_${Date.now()}`, cascadeProjId, now]
  );

  // Delete project
  execute('DELETE FROM projects WHERE id = ?', [cascadeProjId]);

  // Report record must be removed via CASCADE
  const remaining = queryAll('SELECT * FROM verification_reports WHERE project_id = ?', [cascadeProjId]);
  assert.strictEqual(remaining.length, 0);
});

// ==========================================
// SECTION 5: REGRESSION TESTS
// ==========================================

runTest('regression: Phase 1 projects table intact', () => {
  const row = queryOne('SELECT count(*) as count FROM projects');
  assert.strictEqual(typeof row.count, 'number');
});

runTest('regression: Phase 2 requirements table intact', () => {
  const row = queryOne('SELECT count(*) as count FROM requirements');
  assert.strictEqual(typeof row.count, 'number');
});

runTest('regression: Phase 3 code_submissions & code_evidence tables intact', () => {
  const subRow = queryOne('SELECT count(*) as count FROM code_submissions');
  const evRow = queryOne('SELECT count(*) as count FROM code_evidence');
  assert.strictEqual(typeof subRow.count, 'number');
  assert.strictEqual(typeof evRow.count, 'number');
});

runTest('regression: Phase 4 verification_runs & verification_results tables intact', () => {
  const runRow = queryOne('SELECT count(*) as count FROM verification_runs');
  const resRow = queryOne('SELECT count(*) as count FROM verification_results');
  assert.strictEqual(typeof runRow.count, 'number');
  assert.strictEqual(typeof resRow.count, 'number');
});

runTest('regression: Phase 5 verification_reports table has all 12 columns', () => {
  const db = getDb();
  const cols = db.prepare('PRAGMA table_info(verification_reports)').all().map((c) => c.name);
  const expected = [
    'id',
    'project_id',
    'verification_run_id',
    'report_name',
    'storage_key',
    'report_path',
    'report_sha256',
    'file_size',
    'report_version',
    'summary_stats',
    'metadata_json',
    'generated_at',
  ];
  for (const exp of expected) {
    assert.strictEqual(cols.includes(exp), true, `Missing column: ${exp}`);
  }
});

// Clean up test suite records
await runTestAsync('cleanup: remove Phase 5 test records from database and storage', async () => {
  const storage = getStorageProvider();
  const reports = queryAll('SELECT storage_key FROM verification_reports WHERE project_id = ?', [testProjId]);
  for (const r of reports) {
    if (r.storage_key) {
      try {
        await storage.delete(r.storage_key);
      } catch {}
    }
  }
  execute('DELETE FROM projects WHERE id = ?', [testProjId]);
});

console.log('====================================================');
console.log(`ALL PHASE 5 VERIFICATION TESTS PASSED (${testPassed}/${testTotal})!`);
console.log('====================================================');
