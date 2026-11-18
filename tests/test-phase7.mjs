import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execute, queryOne, queryAll } from '../src/lib/db/index.js';
import {
  enqueueJob,
  getJob,
  getActiveJobForProject,
  requestJobCancellation,
  isJobCancelled,
  updateJobProgress,
  subscribeJobEvents,
  ensureJobWorker,
  triggerWorkerTick,
} from '../src/lib/jobs/jobQueue.js';
import {
  workerTick,
  recoverStaleJobs,
  initializeJobWorker,
} from '../src/lib/jobs/jobWorker.js';
import {
  computeVerificationCacheKey,
  getCachedAiResult,
  setCachedAiResult,
  isAiCacheEnabled,
  PROMPT_TEMPLATE_VERSION,
} from '../src/lib/ai/cache.js';
import {
  executeVerificationRun,
  executeVerificationUpgrade,
} from '../src/lib/verification/runOrchestrator.js';
import { resetAiGatewayState } from '../src/lib/ai/gateway.js';

console.log('--- STARTING GENESIS PHASE 7: DURABLE JOBS, AI CACHE & UPGRADE SUITE ---');

let passedTests = 0;
function logPass(msg) {
  passedTests++;
  console.log(`[${passedTests}] ${msg} ✓`);
}

async function runTests() {
  const testProjectId = `proj_p7_${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  // Create mock project
  execute(
    `INSERT INTO projects (id, name, description, status, created_at, updated_at)
     VALUES (?, 'Phase 7 Test Project', 'Testing jobs, cache, and upgrades', 'ANALYZED', ?, ?)`,
    [testProjectId, now, now]
  );

  // -------------------------------------------------------------
  // TEST 1: Job Lifecycle (Enqueue -> Queued -> Running -> Succeeded)
  // -------------------------------------------------------------
  const job1 = enqueueJob({
    type: 'VERIFICATION_RUN',
    projectId: testProjectId,
    payload: { test: true },
    metadata: { testMeta: 123 },
  });

  assert.equal(job1.status, 'QUEUED');
  assert.equal(job1.projectId, testProjectId);
  assert.equal(job1.progressDone, 0);

  const activeJob = getActiveJobForProject(testProjectId);
  assert.ok(activeJob);
  assert.equal(activeJob.id, job1.id);
  logPass('Job lifecycle: enqueue creates QUEUED job and associates with project');

  // -------------------------------------------------------------
  // TEST 2: One job per project at a time constraint
  // -------------------------------------------------------------
  let duplicateThrew = false;
  try {
    enqueueJob({
      type: 'VERIFICATION_RUN',
      projectId: testProjectId,
      payload: {},
    });
  } catch (err) {
    duplicateThrew = true;
    assert.equal(err.code, 'JOB_ALREADY_ACTIVE');
  }
  assert.ok(duplicateThrew, 'Second enqueue on active project must throw JOB_ALREADY_ACTIVE');
  logPass('One job per project at a time guard enforced');

  // -------------------------------------------------------------
  // TEST 3: Progress updates and Event Subscription
  // -------------------------------------------------------------
  let eventReceived = null;
  const unsubscribe = subscribeJobEvents(job1.id, (ev) => {
    eventReceived = ev;
  });

  updateJobProgress(job1.id, {
    done: 5,
    total: 10,
    label: 'Processed 5 of 10 requirements',
    metadata: { currentReq: 'REQ-005' },
  });

  const updatedJob = getJob(job1.id);
  assert.equal(updatedJob.progressDone, 5);
  assert.equal(updatedJob.progressTotal, 10);
  assert.equal(updatedJob.currentLabel, 'Processed 5 of 10 requirements');
  assert.equal(updatedJob.metadata.currentReq, 'REQ-005');
  assert.ok(eventReceived, 'Event subscriber must receive progress event');
  assert.equal(eventReceived.event, 'progress');
  unsubscribe();
  logPass('Progress updates and real-time event broadcasting verified');

  // -------------------------------------------------------------
  // TEST 4: No duplicate workers (Singleton check & ensureJobWorker)
  // -------------------------------------------------------------
  const workerInstance1 = initializeJobWorker();
  const workerInstance2 = initializeJobWorker();
  assert.equal(workerInstance1, workerInstance2, 'Worker must be a resilient singleton across calls');
  
  // ensureJobWorker must return the global singleton and handle concurrent calls
  const [ensured1, ensured2] = await Promise.all([ensureJobWorker(), ensureJobWorker()]);
  assert.equal(ensured1, workerInstance1, 'ensureJobWorker must return the existing singleton');
  assert.equal(ensured2, workerInstance1, 'concurrent ensureJobWorker calls must be idempotent');
  assert.ok(globalThis.__genesisJobWorkerSingleton, 'global singleton must be defined');

  // triggerWorkerTick must be safe to call at any time without throwing
  assert.doesNotThrow(() => {
    triggerWorkerTick();
  }, 'triggerWorkerTick must execute safely');
  logPass('Worker singleton pattern and ensureJobWorker runtime initialization verified');

  // -------------------------------------------------------------
  // TEST 5: Cooperative cancellation while queued
  // -------------------------------------------------------------
  const proj2Id = `proj_p7_cancel_${crypto.randomUUID().slice(0, 8)}`;
  execute(
    `INSERT INTO projects (id, name, description, status, created_at, updated_at)
     VALUES (?, 'Cancel Test', 'Testing cancellation', 'ANALYZED', ?, ?)`,
    [proj2Id, now, now]
  );

  const jobToCancel = enqueueJob({
    type: 'VERIFICATION_RUN',
    projectId: proj2Id,
    payload: {},
  });

  requestJobCancellation(jobToCancel.id);
  const cancelledJob = getJob(jobToCancel.id);
  assert.equal(cancelledJob.status, 'CANCELLED');
  assert.equal(cancelledJob.cancelRequested, true);
  assert.ok(isJobCancelled(jobToCancel.id));
  logPass('Cooperative cancellation cancels queued jobs immediately');

  // -------------------------------------------------------------
  // TEST 6: Stale-job boot crash recovery
  // -------------------------------------------------------------
  const staleJobId = `job_stale_${crypto.randomUUID().slice(0, 8)}`;
  const staleRunId = `vrun_stale_${crypto.randomUUID().slice(0, 8)}`;
  const oldTime = new Date(Date.now() - 120000).toISOString(); // 2 minutes ago

  execute(
    `INSERT INTO verification_runs (id, project_id, status, started_at)
     VALUES (?, ?, 'RUNNING', ?)`,
    [staleRunId, testProjectId, oldTime]
  );

  execute(
    `INSERT INTO jobs (id, type, project_id, status, metadata_json, created_at, started_at, heartbeat_at)
     VALUES (?, 'VERIFICATION_RUN', ?, 'RUNNING', ?, ?, ?, ?)`,
    [
      staleJobId,
      testProjectId,
      JSON.stringify({ runId: staleRunId }),
      oldTime,
      oldTime,
      oldTime,
    ]
  );

  recoverStaleJobs();

  const recoveredJob = getJob(staleJobId);
  assert.equal(recoveredJob.status, 'FAILED');
  assert.ok(recoveredJob.errorMessage.includes('server restart'));

  const recoveredRun = queryOne(`SELECT status, error_message FROM verification_runs WHERE id = ?`, [
    staleRunId,
  ]);
  assert.equal(recoveredRun.status, 'FAILED');
  assert.ok(recoveredRun.error_message.includes('terminated unexpectedly'));
  logPass('Crash safety: stale RUNNING jobs and orphan runs recovered to FAILED on boot');

  // Clean up job1 from test 1 so testProjectId is clear
  execute(`UPDATE jobs SET status = 'SUCCEEDED' WHERE id = ?`, [job1.id]);

  // -------------------------------------------------------------
  // TEST 7: AI Result Cache Key Stability
  // -------------------------------------------------------------
  const sampleReq = {
    title: 'User Authentication with JWT',
    description: 'System must issue secure JSON Web Tokens upon login.',
    acceptance_criteria: '- Token expires in 15 minutes\n- Must use SHA-256',
    category: 'SECURITY',
  };

  const sampleEvidence = [
    {
      filePath: 'src/auth/jwt.js',
      startLine: 10,
      endLine: 45,
      identifier: 'generateToken',
      evidenceType: 'FUNCTION',
      codeSnippet: 'const token = jwt.sign(payload, secret);',
    },
    {
      filePath: 'src/routes/auth.js',
      startLine: 20,
      endLine: 35,
      identifier: 'postLogin',
      evidenceType: 'API_ENDPOINT',
      codeSnippet: 'app.post("/login", async (req, res) => ...);',
    },
  ];

  const key1 = computeVerificationCacheKey({
    purpose: 'VERIFICATION',
    promptVersion: '1.0.0',
    modelName: 'gemini-2.0-flash',
    requirement: sampleReq,
    candidateEvidence: sampleEvidence,
  });

  // Re-ordering candidate evidence should NOT change the key (deterministic)
  const key1Reversed = computeVerificationCacheKey({
    purpose: 'VERIFICATION',
    promptVersion: '1.0.0',
    modelName: 'gemini-2.0-flash',
    requirement: sampleReq,
    candidateEvidence: [sampleEvidence[1], sampleEvidence[0]],
  });

  assert.equal(key1, key1Reversed, 'Cache key must be deterministic regardless of evidence candidate ordering');
  assert.equal(typeof key1, 'string');
  assert.equal(key1.length, 64);
  logPass('AI Cache key stability: deterministic SHA-256 key independent of candidate ordering');

  // -------------------------------------------------------------
  // TEST 8: Cache key invalidation on code snippet change
  // -------------------------------------------------------------
  const modifiedEvidence = [
    { ...sampleEvidence[0], codeSnippet: 'const token = jwt.sign(payload, newSecret, { algorithm: "RS256" });' },
    sampleEvidence[1],
  ];

  const keySnippetChange = computeVerificationCacheKey({
    purpose: 'VERIFICATION',
    promptVersion: '1.0.0',
    modelName: 'gemini-2.0-flash',
    requirement: sampleReq,
    candidateEvidence: modifiedEvidence,
  });

  assert.notEqual(key1, keySnippetChange, 'Changing code snippet must invalidate cache key');
  logPass('Cache key invalidation: changing code snippet creates cache miss');

  // -------------------------------------------------------------
  // TEST 9: Cache key invalidation on criteria, model, or prompt version change
  // -------------------------------------------------------------
  const keyCriteriaChange = computeVerificationCacheKey({
    purpose: 'VERIFICATION',
    promptVersion: '1.0.0',
    modelName: 'gemini-2.0-flash',
    requirement: { ...sampleReq, acceptance_criteria: '- Token expires in 60 minutes' },
    candidateEvidence: sampleEvidence,
  });
  assert.notEqual(key1, keyCriteriaChange, 'Changing criteria must invalidate cache key');

  const keyModelChange = computeVerificationCacheKey({
    purpose: 'VERIFICATION',
    promptVersion: '1.0.0',
    modelName: 'gemini-2.0-flash-lite',
    requirement: sampleReq,
    candidateEvidence: sampleEvidence,
  });
  assert.notEqual(key1, keyModelChange, 'Changing model name must invalidate cache key');

  const keyPromptVersionChange = computeVerificationCacheKey({
    purpose: 'VERIFICATION',
    promptVersion: '2.0.0',
    modelName: 'gemini-2.0-flash',
    requirement: sampleReq,
    candidateEvidence: sampleEvidence,
  });
  assert.notEqual(key1, keyPromptVersionChange, 'Bumping prompt version must invalidate cache key');
  logPass('Cache key invalidation: changing criteria, model, or prompt version causes cache miss');

  // -------------------------------------------------------------
  // TEST 10: Cache Policy: NEVER stores RULES or AI error outputs
  // -------------------------------------------------------------
  const testCacheKey = `test_ck_${crypto.randomUUID()}`;

  const rulesResult = {
    method: 'RULES',
    status: 'VERIFIED',
    confidence_score: 0.65,
    explanation: 'Rules evaluation',
  };
  const cachedRules = setCachedAiResult({
    cacheKey: testCacheKey,
    modelName: 'gemini-2.0-flash',
    result: rulesResult,
  });
  assert.equal(cachedRules, false, 'Must reject caching RULES method output');

  const errorResult = {
    method: 'AI',
    status: 'UNVERIFIED',
    isAiError: true,
    explanation: '503 High Demand',
  };
  const cachedError = setCachedAiResult({
    cacheKey: testCacheKey,
    modelName: 'gemini-2.0-flash',
    result: errorResult,
  });
  assert.equal(cachedError, false, 'Must reject caching error output');

  assert.equal(getCachedAiResult(testCacheKey), null);
  logPass('Cache policy: strictly rejects storing RULES results and AI error outputs');

  // -------------------------------------------------------------
  // TEST 11: Valid AI Result Cache Storage & Retrieval
  // -------------------------------------------------------------
  const validAiResult = {
    status: 'VERIFIED',
    confidence_score: 0.95,
    confidence_reason: 'Comprehensive implementation found',
    explanation: 'JWT tokens generated with proper expiry and secret verification.',
    supporting_evidence_ids: ['ev_1'],
    contradicting_evidence_ids: [],
    acceptance_criteria_assessment: [
      { criterion: 'Token expires in 15 minutes', assessment: 'SUPPORTED', evidence_ids: ['ev_1'] },
    ],
    limitations: [],
  };

  const stored = setCachedAiResult({
    cacheKey: testCacheKey,
    modelName: 'gemini-2.0-flash',
    result: validAiResult,
  });
  assert.equal(stored, true, 'Valid AI evaluation must be successfully stored in cache');

  const retrieved = getCachedAiResult(testCacheKey);
  assert.ok(retrieved);
  assert.equal(retrieved.result.status, 'VERIFIED');
  assert.equal(retrieved.result.confidence_score, 0.95);
  assert.equal(retrieved.hitCount, 1);
  logPass('AI Cache retrieval: valid AI results stored and retrieved with hit count tracking');

  // -------------------------------------------------------------
  // TEST 12: Upgrade Refused in RULES_ONLY mode
  // -------------------------------------------------------------
  // Set kill switch to force rules mode
  process.env.AI_FORCE_RULES_MODE = 'true';
  let upgradeRefused = false;
  try {
    await executeVerificationUpgrade(testProjectId, 'any_base_run_id');
  } catch (err) {
    upgradeRefused = true;
    assert.ok(
      err.message.includes('rules-only mode') || err.message.includes('disabled'),
      `Expected refusal message, got: ${err.message}`
    );
  }
  process.env.AI_FORCE_RULES_MODE = 'false';
  assert.ok(upgradeRefused, 'Upgrade must be refused when AI Gateway is in rules-only mode');
  logPass('Upgrade verification: refused with clear explanation when AI is in RULES_ONLY mode');

  // -------------------------------------------------------------
  // TEST 13: Upgrade Run Lineage & Carryover Verification
  // -------------------------------------------------------------
  // Setup project with 1 approved requirement and code submission
  const upgradeProjId = `proj_upg_${crypto.randomUUID().slice(0, 8)}`;
  execute(
    `INSERT INTO projects (id, name, description, status, created_at, updated_at)
     VALUES (?, 'Upgrade Test Project', 'Testing upgrade lineage', 'ANALYZED', ?, ?)`,
    [upgradeProjId, now, now]
  );

  const req1Id = `req_upg1_${crypto.randomUUID().slice(0, 8)}`;
  const req2Id = `req_upg2_${crypto.randomUUID().slice(0, 8)}`;

  execute(
    `INSERT INTO requirements (id, project_id, req_code, title, description, category, priority, approval_status, order_index, created_at, updated_at)
     VALUES (?, ?, 'REQ-UPG-01', 'Auth Endpoint', 'Authentication login endpoint', 'SECURITY', 'CRITICAL', 'APPROVED', 1, ?, ?),
            (?, ?, 'REQ-UPG-02', 'Data Export', 'CSV report export functionality', 'FUNCTIONAL', 'HIGH', 'APPROVED', 2, ?, ?)`,
    [req1Id, upgradeProjId, now, now, req2Id, upgradeProjId, now, now]
  );

  const subId = `sub_upg_${crypto.randomUUID().slice(0, 8)}`;
  execute(
    `INSERT INTO code_submissions (id, project_id, filename, file_size, storage_path, status, is_active, analyzed_files, total_lines, created_at)
     VALUES (?, ?, 'src.zip', 1024, 'submissions/src.zip', 'ANALYZED', 1, 2, 100, ?)`,
    [subId, upgradeProjId, now]
  );

  const evId1 = `ev_upg1_${crypto.randomUUID().slice(0, 8)}`;
  const evId2 = `ev_upg2_${crypto.randomUUID().slice(0, 8)}`;
  execute(
    `INSERT INTO code_evidence (id, submission_id, project_id, file_path, start_line, end_line, identifier, evidence_type, code_snippet, confidence, created_at)
     VALUES (?, ?, ?, 'src/auth.js', 1, 20, 'login', 'API_ENDPOINT', 'app.post("/login", authHandler);', 'HIGH', ?),
            (?, ?, ?, 'src/export.js', 1, 30, 'exportCsv', 'FUNCTION', 'function exportCsv(data) { return ""; }', 'HIGH', ?)`,
    [evId1, subId, upgradeProjId, now, evId2, subId, upgradeProjId, now]
  );

  // Base Run with 1 AI result and 1 RULES result
  const baseRunId = `vrun_base_${crypto.randomUUID().slice(0, 8)}`;
  execute(
    `INSERT INTO verification_runs (id, project_id, submission_id, status, total_requirements, verified_count, ai_mode, ai_count, rules_count, started_at, completed_at)
     VALUES (?, ?, ?, 'COMPLETED', 2, 1, 'DEGRADED', 1, 1, ?, ?)`,
    [baseRunId, upgradeProjId, subId, now, now]
  );

  const res1Id = `vres_base1_${crypto.randomUUID().slice(0, 8)}`;
  const res2Id = `vres_base2_${crypto.randomUUID().slice(0, 8)}`;

  // REQ-UPG-01 had successful AI verification
  execute(
    `INSERT INTO verification_results (id, run_id, project_id, requirement_id, submission_id, status, confidence_score, ai_explanation, method, analysis_version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'VERIFIED', 0.90, 'Evaluated by Gemini AI', 'AI', '1.0.0', ?, ?)`,
    [res1Id, baseRunId, upgradeProjId, req1Id, subId, now, now]
  );

  // REQ-UPG-02 was evaluated via deterministic RULES fallback
  execute(
    `INSERT INTO verification_results (id, run_id, project_id, requirement_id, submission_id, status, confidence_score, ai_explanation, method, fallback_reason, analysis_version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'PARTIALLY_IMPLEMENTED', 0.60, 'Rules-based assessment: CSV export', 'RULES', 'AI_UNAVAILABLE', '1.0.0', ?, ?)`,
    [res2Id, baseRunId, upgradeProjId, req2Id, subId, now, now]
  );

  // Execute upgrade with mock evaluator for Gemini
  const upgradeSummary = await executeVerificationUpgrade(upgradeProjId, baseRunId, {
    mockEvaluator: (req, candidates) => ({
      status: 'VERIFIED',
      confidence_score: 0.92,
      explanation: `AI upgraded assessment for ${req.req_code}`,
      supporting_evidence_ids: candidates.map((c) => c.evidenceId),
      contradicting_evidence_ids: [],
      acceptance_criteria_assessment: [],
      limitations: [],
    }),
  });

  assert.equal(upgradeSummary.status, 'COMPLETED');
  assert.equal(upgradeSummary.baseRunId, baseRunId);

  // Check the new run record in DB
  const upgradedRun = queryOne(`SELECT * FROM verification_runs WHERE id = ?`, [upgradeSummary.runId]);
  assert.equal(upgradedRun.base_run_id, baseRunId);
  assert.equal(upgradedRun.status, 'COMPLETED');

  // Check new verification results
  const upgradedResults = queryAll(
    `SELECT * FROM verification_results WHERE run_id = ? ORDER BY requirement_id ASC`,
    [upgradeSummary.runId]
  );
  assert.equal(upgradedResults.length, 2);

  // REQ-UPG-01 must have carried_over_from_result_id = res1Id
  const carriedOverRes = upgradedResults.find((r) => r.requirement_id === req1Id);
  assert.ok(carriedOverRes);
  assert.equal(carriedOverRes.carried_over_from_result_id, res1Id);
  assert.equal(carriedOverRes.method, 'AI');
  assert.equal(carriedOverRes.status, 'VERIFIED');

  // REQ-UPG-02 was upgraded with AI
  const upgradedRes = upgradedResults.find((r) => r.requirement_id === req2Id);
  assert.ok(upgradedRes);
  assert.equal(upgradedRes.carried_over_from_result_id, null);
  assert.equal(upgradedRes.method, 'AI');
  assert.equal(upgradedRes.status, 'VERIFIED');
  assert.ok(upgradedRes.ai_explanation.includes('AI upgraded assessment'));
  logPass('Upgrade verification: carries over successful AI results and upgrades RULES results with full lineage');

  // -------------------------------------------------------------
  // TEST 14: Mid-run cancellation preserves already-evaluated results
  // -------------------------------------------------------------
  let cancelTriggered = false;
  const cancelJobId = `job_midcancel_${crypto.randomUUID().slice(0, 8)}`;
  const cancelRunId = `vrun_midcancel_${crypto.randomUUID().slice(0, 8)}`;

  const midCancelJobContext = {
    jobId: cancelJobId,
    projectId: upgradeProjId,
    isCancelled: () => cancelTriggered,
    reportProgress: ({ done }) => {
      // After first requirement is completed, trigger cancellation
      if (done >= 1) {
        cancelTriggered = true;
      }
    },
  };

  const cancelResult = await executeVerificationRun(upgradeProjId, {
    runId: cancelRunId,
    jobContext: midCancelJobContext,
    mockEvaluator: (req, candidates) => ({
      status: 'VERIFIED',
      confidence_score: 0.85,
      explanation: 'Evaluated before cancel',
      supporting_evidence_ids: candidates.map((c) => c.evidenceId),
    }),
  });

  assert.equal(cancelResult.status, 'CANCELLED');
  assert.equal(cancelResult.cancelled, true);

  // Check database preserves already-computed result
  const preservedResults = queryAll(
    `SELECT * FROM verification_results WHERE run_id = ?`,
    [cancelRunId]
  );
  assert.ok(preservedResults.length >= 1, 'Cancelled run must preserve already-saved results');

  const cancelledRunDb = queryOne(`SELECT status FROM verification_runs WHERE id = ?`, [cancelRunId]);
  assert.equal(cancelledRunDb.status, 'CANCELLED');
  logPass('Cancellation mid-run stops execution and preserves already-computed results without stuck RUNNING states');

  // -------------------------------------------------------------
  // CLEANUP TEST RECORDS
  // -------------------------------------------------------------
  execute(`DELETE FROM projects WHERE id IN (?, ?, ?)`, [testProjectId, proj2Id, upgradeProjId]);
  execute(`DELETE FROM ai_cache WHERE cache_key = ?`, [testCacheKey]);
  console.log('Test records cleaned up successfully.');
  console.log('====================================================');
  console.log(`ALL PHASE 7 TESTS PASSED (${passedTests}/${passedTests})!`);
  console.log('====================================================');
}

runTests().catch((err) => {
  console.error('Phase 7 test failed:', err);
  process.exit(1);
});
