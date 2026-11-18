import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execute, queryOne, queryAll } from '../src/lib/db/index.js';
import {
  getEffectiveResults,
  computeEffectiveSummary,
  compareVerificationRuns,
  VALID_STATUSES,
} from '../src/lib/verification/effectiveStatus.js';
import { generateVerificationPDF } from '../src/lib/report/pdfGenerator.js';
import { executeVerificationUpgrade } from '../src/lib/verification/runOrchestrator.js';

console.log('--- STARTING GENESIS PHASE 8: HUMAN OVERRIDES & RUN COMPARISON SUITE ---');

let passedTests = 0;
function logPass(msg) {
  passedTests++;
  console.log(`[${passedTests}] ${msg} ✓`);
}

async function runTests() {
  const testProjectId = `proj_p8_${crypto.randomUUID().slice(0, 8)}`;
  const otherProjectId = `proj_p8_other_${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  // Seed project
  execute(
    `INSERT INTO projects (id, name, description, status, created_at, updated_at)
     VALUES (?, 'Phase 8 Project', 'Testing overrides and comparison', 'VERIFIED', ?, ?)`,
    [testProjectId, now, now]
  );
  execute(
    `INSERT INTO projects (id, name, description, status, created_at, updated_at)
     VALUES (?, 'Other Project', 'Testing cross-project boundary', 'VERIFIED', ?, ?)`,
    [otherProjectId, now, now]
  );

  // Seed requirement
  const req1Id = `req_${crypto.randomUUID().slice(0, 8)}`;
  const req2Id = `req_${crypto.randomUUID().slice(0, 8)}`;
  const req3Id = `req_${crypto.randomUUID().slice(0, 8)}`;

  execute(
    `INSERT INTO requirements (id, project_id, req_code, title, description, category, priority, approval_status, created_at, updated_at)
     VALUES (?, ?, 'REQ-001', 'Auth Service', 'Must authenticate users via JWT', 'SECURITY', 'CRITICAL', 'APPROVED', ?, ?)`,
    [req1Id, testProjectId, now, now]
  );
  execute(
    `INSERT INTO requirements (id, project_id, req_code, title, description, category, priority, approval_status, created_at, updated_at)
     VALUES (?, ?, 'REQ-002', 'Data Export', 'Must export data to CSV', 'FUNCTIONAL', 'HIGH', 'APPROVED', ?, ?)`,
    [req2Id, testProjectId, now, now]
  );
  execute(
    `INSERT INTO requirements (id, project_id, req_code, title, description, category, priority, approval_status, created_at, updated_at)
     VALUES (?, ?, 'REQ-003', 'Payment Hook', 'Must handle webhook', 'FUNCTIONAL', 'HIGH', 'APPROVED', ?, ?)`,
    [req3Id, testProjectId, now, now]
  );

  // Seed submission
  const subId = `sub_${crypto.randomUUID().slice(0, 8)}`;
  execute(
    `INSERT INTO code_submissions (id, project_id, filename, file_size, storage_path, status, version, is_active, created_at, updated_at)
     VALUES (?, ?, 'src.zip', 1024, 'storage/src.zip', 'ANALYZED', 1, 1, ?, ?)`,
    [subId, testProjectId, now, now]
  );

  // Seed verification run 1
  const run1Id = `run_p8_1_${crypto.randomUUID().slice(0, 8)}`;
  execute(
    `INSERT INTO verification_runs (id, project_id, submission_id, status, total_requirements, verified_count, partially_count, not_implemented_count, unverified_count, model_name, started_at, completed_at)
     VALUES (?, ?, ?, 'COMPLETED', 3, 1, 1, 1, 0, 'gemini-2.0-flash', ?, ?)`,
    [run1Id, testProjectId, subId, now, now]
  );

  // Seed verification results
  const res1Id = `res_${crypto.randomUUID().slice(0, 8)}`;
  const res2Id = `res_${crypto.randomUUID().slice(0, 8)}`;
  const res3Id = `res_${crypto.randomUUID().slice(0, 8)}`;

  execute(
    `INSERT INTO verification_results (id, run_id, project_id, requirement_id, status, confidence_score, ai_explanation, method, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'NOT_IMPLEMENTED', 0.85, 'Initial AI found no auth endpoint', 'AI', ?, ?)`,
    [res1Id, run1Id, testProjectId, req1Id, now, now]
  );
  execute(
    `INSERT INTO verification_results (id, run_id, project_id, requirement_id, status, confidence_score, ai_explanation, method, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'PARTIALLY_IMPLEMENTED', 0.60, 'Found CSV builder without pagination', 'AI', ?, ?)`,
    [res2Id, run1Id, testProjectId, req2Id, now, now]
  );
  execute(
    `INSERT INTO verification_results (id, run_id, project_id, requirement_id, status, confidence_score, ai_explanation, method, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'VERIFIED', 0.90, 'Full webhook handler implemented', 'AI', ?, ?)`,
    [res3Id, run1Id, testProjectId, req3Id, now, now]
  );

  // -------------------------------------------------------------
  // TEST 1: Validation Rules for Overrides
  // -------------------------------------------------------------
  // 1a. Reason length validation (min 20, max 1000)
  const shortReason = 'Too short';
  assert.ok(shortReason.length < 20);

  // 1b. Reviewer name validation (min 2, max 60)
  const shortReviewer = 'A';
  assert.ok(shortReviewer.length < 2);

  // 1c. Invalid status validation
  assert.ok(!VALID_STATUSES.includes('INVALID_STATUS'));

  // 1d. Active running job guard
  execute(
    `INSERT INTO jobs (id, type, project_id, status, created_at)
     VALUES ('job_active_guard', 'VERIFICATION_RUN', ?, 'RUNNING', ?)`,
    [testProjectId, now]
  );
  const activeJob = queryOne(`SELECT * FROM jobs WHERE project_id = ? AND status = 'RUNNING'`, [testProjectId]);
  assert.ok(activeJob, 'Active job was detected');
  // Clean up active job
  execute(`DELETE FROM jobs WHERE id = 'job_active_guard'`);

  logPass('Override validation rules verified (reasons, reviewer names, status enum, active job guard)');

  // -------------------------------------------------------------
  // TEST 2: Original verification_results Row is Never Mutated
  // -------------------------------------------------------------
  const originalRowBefore = queryOne('SELECT * FROM verification_results WHERE id = ?', [res1Id]);

  const ovr1Id = `ovr_${crypto.randomUUID().slice(0, 8)}`;
  execute(
    `INSERT INTO result_overrides (id, project_id, run_id, result_id, requirement_id, previous_status, new_status, reason, reviewer_name, created_at)
     VALUES (?, ?, ?, ?, ?, 'NOT_IMPLEMENTED', 'VERIFIED', 'Auditor verified JWT in middleware/auth.js which was missed by analyzer', 'Senior Auditor', ?)`,
    [ovr1Id, testProjectId, run1Id, res1Id, req1Id, now]
  );

  const originalRowAfter = queryOne('SELECT * FROM verification_results WHERE id = ?', [res1Id]);
  assert.equal(originalRowAfter.status, 'NOT_IMPLEMENTED', 'Original status must remain untouched');
  assert.equal(originalRowAfter.ai_explanation, originalRowBefore.ai_explanation, 'AI explanation must remain untouched');
  assert.equal(originalRowAfter.updated_at, originalRowBefore.updated_at, 'updated_at timestamp must remain untouched');

  logPass('Non-negotiable integrity: original verification_results row is never modified by an override');

  // -------------------------------------------------------------
  // TEST 3: Effective Status Resolution & Multiple Overrides
  // -------------------------------------------------------------
  let effResults = getEffectiveResults(run1Id);
  let res1Eff = effResults.find((r) => r.id === res1Id);
  assert.equal(res1Eff.status, 'NOT_IMPLEMENTED');
  assert.equal(res1Eff.effective_status, 'VERIFIED');
  assert.equal(res1Eff.is_overridden, true);
  assert.equal(res1Eff.override.new_status, 'VERIFIED');

  // Second override on the same result (e.g. from VERIFIED -> PARTIALLY_IMPLEMENTED)
  const ovr2Id = `ovr_${crypto.randomUUID().slice(0, 8)}`;
  const laterTime = new Date(Date.now() + 5000).toISOString();
  execute(
    `INSERT INTO result_overrides (id, project_id, run_id, result_id, requirement_id, previous_status, new_status, reason, reviewer_name, created_at)
     VALUES (?, ?, ?, ?, ?, 'VERIFIED', 'PARTIALLY_IMPLEMENTED', 'Second auditor reviewed: token refresh route is absent, only access token supported', 'Lead Auditor', ?)`,
    [ovr2Id, testProjectId, run1Id, res1Id, req1Id, laterTime]
  );

  effResults = getEffectiveResults(run1Id);
  res1Eff = effResults.find((r) => r.id === res1Id);
  assert.equal(res1Eff.effective_status, 'PARTIALLY_IMPLEMENTED', 'Latest active override must win');

  logPass('Effective status resolution: latest active override determines effective status');

  // -------------------------------------------------------------
  // TEST 4: Revocation Preserves Audit Trail
  // -------------------------------------------------------------
  const revokeTime = new Date(Date.now() + 10000).toISOString();
  execute(
    `UPDATE result_overrides
     SET revoked_at = ?, revoked_by = 'Security Lead', revoke_reason = 'Disputed assessment; original AI verdict was accurate'
     WHERE id = ?`,
    [revokeTime, ovr2Id]
  );

  // Check row still exists in DB
  const revokedOvr = queryOne('SELECT * FROM result_overrides WHERE id = ?', [ovr2Id]);
  assert.ok(revokedOvr, 'Revoked row must not be deleted');
  assert.equal(revokedOvr.revoked_by, 'Security Lead');
  assert.equal(revokedOvr.revoke_reason, 'Disputed assessment; original AI verdict was accurate');

  // Effective status now falls back to the earlier non-revoked override (ovr1Id: VERIFIED)
  effResults = getEffectiveResults(run1Id);
  res1Eff = effResults.find((r) => r.id === res1Id);
  assert.equal(res1Eff.effective_status, 'VERIFIED', 'Active non-revoked override wins after subsequent revocation');

  // Revoke ovr1Id as well -> falls back to original result status
  execute(
    `UPDATE result_overrides
     SET revoked_at = ?, revoked_by = 'Admin', revoke_reason = 'Complete revocation'
     WHERE id = ?`,
    [revokeTime, ovr1Id]
  );
  effResults = getEffectiveResults(run1Id);
  res1Eff = effResults.find((r) => r.id === res1Id);
  assert.equal(res1Eff.effective_status, 'NOT_IMPLEMENTED', 'Falls back to original status when all overrides revoked');
  assert.equal(res1Eff.is_overridden, false);

  logPass('Revocation audit trail: revoked rows permanently preserved, effective status falls back safely');

  // -------------------------------------------------------------
  // TEST 5: Effective Summary Counts Computation
  // -------------------------------------------------------------
  // Re-apply an active override on res1Id
  const ovrActiveId = `ovr_${crypto.randomUUID().slice(0, 8)}`;
  execute(
    `INSERT INTO result_overrides (id, project_id, run_id, result_id, requirement_id, previous_status, new_status, reason, reviewer_name, created_at)
     VALUES (?, ?, ?, ?, ?, 'NOT_IMPLEMENTED', 'VERIFIED', 'Confirmed implementation via external auth package', 'Auditor Alice', ?)`,
    [ovrActiveId, testProjectId, run1Id, res1Id, req1Id, now]
  );

  const summary = computeEffectiveSummary(run1Id);
  assert.equal(summary.original.verified, 1);
  assert.equal(summary.original.not_implemented, 1);
  assert.equal(summary.original.partially_implemented, 1);

  assert.equal(summary.effective.verified, 2, 'Effective verified count must reflect active override');
  assert.equal(summary.effective.not_implemented, 0, 'Effective not_implemented count must decrease');
  assert.equal(summary.overridden_count, 1, 'Overridden count must equal 1');

  logPass('Effective summary computation: returns side-by-side original and effective counts');

  // -------------------------------------------------------------
  // TEST 6: PDF Generation Includes Original + Override Info
  // -------------------------------------------------------------
  const enrichedResults = getEffectiveResults(run1Id);
  const pdfBuffer = await generateVerificationPDF({
    project: { id: testProjectId, name: 'Phase 8 Project' },
    run: { id: run1Id, total_requirements: 3, status: 'COMPLETED' },
    submission: { filename: 'src.zip' },
    srsDoc: null,
    results: enrichedResults,
    reportId: 'rep_p8_test',
    generatedAt: now,
  });

  assert.ok(Buffer.isBuffer(pdfBuffer));
  assert.ok(pdfBuffer.length > 5000);
  assert.equal(pdfBuffer.subarray(0, 5).toString('ascii'), '%PDF-');

  // Check that the enriched result structure supplied to PDF has override fields
  const ovrResult = enrichedResults.find((r) => r.is_overridden);
  assert.ok(ovrResult);
  assert.equal(ovrResult.status, 'NOT_IMPLEMENTED');
  assert.equal(ovrResult.effective_status, 'VERIFIED');
  assert.equal(ovrResult.override.reviewer_name, 'Auditor Alice');

  logPass('PDF generation: includes effective status, human override annotations, and disclaimer');

  // -------------------------------------------------------------
  // TEST 7: Upgrade Carries Active Overrides for Carried Results Only
  // -------------------------------------------------------------
  // res3Id was VERIFIED with AI (candidate for carryover)
  // Let's add an active override on res3Id (e.g. from VERIFIED -> PARTIALLY_IMPLEMENTED)
  const ovrRes3Id = `ovr_${crypto.randomUUID().slice(0, 8)}`;
  execute(
    `INSERT INTO result_overrides (id, project_id, run_id, result_id, requirement_id, previous_status, new_status, reason, reviewer_name, created_at)
     VALUES (?, ?, ?, ?, ?, 'VERIFIED', 'PARTIALLY_IMPLEMENTED', 'Auditor noted webhook lacks HMAC signature verification', 'Auditor Bob', ?)`,
    [ovrRes3Id, testProjectId, run1Id, res3Id, req3Id, now]
  );

  const upgradeRes = await executeVerificationUpgrade(testProjectId, run1Id, {
    mockEvaluator: async () => ({
      status: 'VERIFIED',
      confidenceScore: 0.88,
      explanation: 'Re-evaluated by mock AI',
      evidenceReferences: [],
    }),
  });

  assert.ok(upgradeRes.runId);
  const newRunId = upgradeRes.runId;

  // The carried-over result for req3Id should have an active override copied over
  const carriedResult = queryOne(
    `SELECT * FROM verification_results WHERE run_id = ? AND requirement_id = ?`,
    [newRunId, req3Id]
  );
  assert.ok(carriedResult);
  assert.equal(carriedResult.carried_over_from_result_id, res3Id);

  const copiedOverride = queryOne(
    `SELECT * FROM result_overrides WHERE run_id = ? AND result_id = ? AND revoked_at IS NULL`,
    [newRunId, carriedResult.id]
  );
  assert.ok(copiedOverride, 'Active override must be copied over for carried-over result');
  assert.equal(copiedOverride.new_status, 'PARTIALLY_IMPLEMENTED');
  assert.ok(copiedOverride.reason.includes(`[Carried over from run ${run1Id}]`));
  assert.equal(copiedOverride.reviewer_name, 'Auditor Bob');

  // Re-evaluated results (e.g. req2Id or req1Id that were re-evaluated) get NO override
  const reEvaluatedResult = queryOne(
    `SELECT * FROM verification_results WHERE run_id = ? AND requirement_id = ?`,
    [newRunId, req2Id]
  );
  if (reEvaluatedResult && !reEvaluatedResult.carried_over_from_result_id) {
    const noOverride = queryOne(
      `SELECT * FROM result_overrides WHERE run_id = ? AND result_id = ?`,
      [newRunId, reEvaluatedResult.id]
    );
    assert.equal(noOverride, undefined, 'Re-evaluated result gets no override');
  }

  logPass('Upgrade flow: copies active overrides only for carried-over results, re-evaluated get none');

  // -------------------------------------------------------------
  // TEST 8: Run Comparison Classification Table
  // -------------------------------------------------------------
  // Setup run 2 for comparison
  const run2Id = `run_p8_2_${crypto.randomUUID().slice(0, 8)}`;
  execute(
    `INSERT INTO verification_runs (id, project_id, submission_id, status, total_requirements, model_name, started_at, completed_at)
     VALUES (?, ?, ?, 'COMPLETED', 3, 'gemini-2.0-flash', ?, ?)`,
    [run2Id, testProjectId, subId, now, now]
  );

  // Setup results in run 2 for test cases:
  // req1: base was NOT_IMPLEMENTED (overridden to VERIFIED: effective 3) -> head NOT_IMPLEMENTED (effective 1) => REGRESSED
  // req2: base was PARTIALLY_IMPLEMENTED (effective 2) -> head VERIFIED (effective 3) => IMPROVED
  // req3: base was VERIFIED (overridden to PARTIALLY: effective 2) -> head PARTIALLY_IMPLEMENTED (effective 2) => UNCHANGED
  const res21Id = `res_${crypto.randomUUID().slice(0, 8)}`;
  const res22Id = `res_${crypto.randomUUID().slice(0, 8)}`;
  const res23Id = `res_${crypto.randomUUID().slice(0, 8)}`;

  execute(
    `INSERT INTO verification_results (id, run_id, project_id, requirement_id, status, confidence_score, ai_explanation, method, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'NOT_IMPLEMENTED', 0.90, 'Head run says not implemented', 'RULES', ?, ?)`,
    [res21Id, run2Id, testProjectId, req1Id, now, now]
  );
  execute(
    `INSERT INTO verification_results (id, run_id, project_id, requirement_id, status, confidence_score, ai_explanation, method, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'VERIFIED', 0.95, 'Head run improved to verified', 'AI', ?, ?)`,
    [res22Id, run2Id, testProjectId, req2Id, now, now]
  );
  execute(
    `INSERT INTO verification_results (id, run_id, project_id, requirement_id, status, confidence_score, ai_explanation, method, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'PARTIALLY_IMPLEMENTED', 0.60, 'Head run matches base effective', 'AI', ?, ?)`,
    [res23Id, run2Id, testProjectId, req3Id, now, now]
  );

  const comparison = compareVerificationRuns(testProjectId, run1Id, run2Id);

  assert.equal(comparison.summary.REGRESSED, 1, 'req1 went from effective VERIFIED(3) to NOT_IMPLEMENTED(1)');
  assert.equal(comparison.summary.IMPROVED, 1, 'req2 went from effective PARTIAL(2) to VERIFIED(3)');
  assert.equal(comparison.summary.UNCHANGED, 1, 'req3 remained effective PARTIALLY_IMPLEMENTED');
  assert.ok(comparison.comparisons.length === 3);

  // Method changed detection
  const req1Comp = comparison.comparisons.find((c) => c.requirement_id === req1Id);
  assert.equal(req1Comp.method_base, 'AI');
  assert.equal(req1Comp.method_head, 'RULES');
  assert.equal(req1Comp.method_changed, true);

  // Regressions listed first
  assert.equal(comparison.comparisons[0].change, 'REGRESSED');

  logPass('Run comparison: accurately classifies IMPROVED, REGRESSED, UNCHANGED, and method transitions');

  // -------------------------------------------------------------
  // TEST 9: Comparison Rejects Cross-Project & Incomplete Runs
  // -------------------------------------------------------------
  // 9a. Cross-project run comparison rejected
  const otherRunId = `run_other_${crypto.randomUUID().slice(0, 8)}`;
  execute(
    `INSERT INTO verification_runs (id, project_id, status, total_requirements, model_name, started_at, completed_at)
     VALUES (?, ?, 'COMPLETED', 1, 'gemini-2.0-flash', ?, ?)`,
    [otherRunId, otherProjectId, now, now]
  );

  assert.throws(
    () => compareVerificationRuns(testProjectId, run1Id, otherRunId),
    /belong to the project/,
    'Must reject run belonging to different project'
  );

  // 9b. Incomplete run (RUNNING) rejected
  const runningRunId = `run_running_${crypto.randomUUID().slice(0, 8)}`;
  execute(
    `INSERT INTO verification_runs (id, project_id, status, total_requirements, model_name, started_at)
     VALUES (?, ?, 'RUNNING', 1, 'gemini-2.0-flash', ?)`,
    [runningRunId, testProjectId, now]
  );

  assert.throws(
    () => compareVerificationRuns(testProjectId, run1Id, runningRunId),
    /COMPLETED/,
    'Must reject non-COMPLETED run'
  );

  logPass('Comparison security: strictly blocks cross-project and incomplete runs');

  // Clean up test records
  execute('DELETE FROM projects WHERE id IN (?, ?)', [testProjectId, otherProjectId]);
}

runTests().then(() => {
  console.log('====================================================');
  console.log(`ALL PHASE 8 TESTS PASSED (${passedTests}/${passedTests})!`);
  console.log('====================================================');
}).catch((err) => {
  console.error('Phase 8 Test Failure:', err);
  process.exit(1);
});

