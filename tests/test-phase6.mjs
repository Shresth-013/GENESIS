/**
 * GENESIS Phase 6 Test Suite: AI Gateway Resilience & Deterministic Rules Fallback
 * Verifies circuit breaker, model fallback, rate limiting, kill switch,
 * deterministic rules verifier, rules extractor, and total outage recovery.
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import {
  executeAiCall,
  getAiStatus,
  configureAiGatewayForTesting,
  resetAiGatewayState,
  AiUnavailableError,
} from '../src/lib/ai/gateway.js';
import { AI_CONFIG } from '../src/lib/ai/config.js';
import {
  verifyRequirementWithRules,
  MAX_RULES_CONFIDENCE,
  MIN_CRITERIA_COVERAGE_FOR_VERIFIED,
} from '../src/lib/verification/rules/ruleBasedVerifier.js';
import { extractRequirementsWithRules } from '../src/lib/document/ruleExtractor.js';
import { executeVerificationRun } from '../src/lib/verification/runOrchestrator.js';
import { getDb, queryOne, queryAll, execute, transaction } from '../src/lib/db/index.js';

console.log('--- STARTING GENESIS PHASE 6 RESILIENCE & RULES SUITE ---');

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

// Ensure DB is initialized
getDb();

// ============================================================
// 1. GATEWAY & CIRCUIT BREAKER TESTS
// ============================================================

await runTestAsync('Breaker opens after threshold and makes ZERO transport calls when OPEN', async () => {
  resetAiGatewayState();

  let callCount = 0;
  const mockTransport = {
    generateContent: async () => {
      callCount++;
      const err = new Error('503 Service Unavailable: High demand');
      err.status = 503;
      throw err;
    },
  };

  // Virtual clock
  let currentTime = 100000;
  const virtualClock = {
    now: () => currentTime,
    sleep: async (ms) => {
      currentTime += ms;
    },
  };

  configureAiGatewayForTesting({ transport: mockTransport, clock: virtualClock });

  // Threshold is 5 failures
  for (let i = 0; i < 5; i++) {
    try {
      await executeAiCall({ model: 'gemini-2.0-flash', contents: [] }, { maxAttempts: 1 });
      assert.fail('Should have thrown 503');
    } catch (e) {
      assert.ok(e instanceof AiUnavailableError);
    }
  }

  const callsAtThreshold = callCount;
  assert.strictEqual(callsAtThreshold, 5, 'Transport should have been called 5 times');

  const status = getAiStatus();
  assert.strictEqual(status.breakerState, 'OPEN', 'Breaker must be OPEN');
  assert.strictEqual(status.mode, 'DEGRADED');

  // Next call while OPEN must fail instantly without touching transport
  try {
    await executeAiCall({ model: 'gemini-2.0-flash', contents: [] });
    assert.fail('Should short-circuit when OPEN');
  } catch (e) {
    assert.strictEqual(e.reason, 'BREAKER_OPEN');
  }

  assert.strictEqual(callCount, callsAtThreshold, 'ZERO transport calls must be made while breaker is OPEN');
});

await runTestAsync('Circuit breaker half-open probe recovery', async () => {
  let currentTime = 200000;
  const virtualClock = {
    now: () => currentTime,
    sleep: async (ms) => {
      currentTime += ms;
    },
  };

  let shouldSucceed = false;
  let callCount = 0;
  const mockTransport = {
    generateContent: async () => {
      callCount++;
      if (!shouldSucceed) {
        const err = new Error('503 Unavailable');
        err.status = 503;
        throw err;
      }
      return '{"requirements": []}';
    },
  };

  configureAiGatewayForTesting({ transport: mockTransport, clock: virtualClock });
  resetAiGatewayState();

  // Trip the breaker
  for (let i = 0; i < 5; i++) {
    try {
      await executeAiCall({ model: 'gemini-2.0-flash', contents: [] }, { maxAttempts: 1 });
    } catch {}
  }
  assert.strictEqual(getAiStatus().breakerState, 'OPEN');

  // Advance clock beyond cooldown period
  currentTime += 70000;

  // Next call acts as half-open probe
  shouldSucceed = true;
  const result = await executeAiCall({ model: 'gemini-2.0-flash', contents: [] }, { maxAttempts: 1 });
  assert.strictEqual(result, '{"requirements": []}');

  const newStatus = getAiStatus();
  assert.strictEqual(newStatus.breakerState, 'CLOSED', 'Breaker must reset to CLOSED on successful probe');
  assert.strictEqual(newStatus.consecutiveFailures, 0);
  assert.strictEqual(newStatus.mode, 'LIVE');
});

await runTestAsync('429 Retry-After is respected during retries', async () => {
  resetAiGatewayState();
  let currentTime = 300000;
  let sleptTime = 0;

  const virtualClock = {
    now: () => currentTime,
    sleep: async (ms) => {
      sleptTime += ms;
      currentTime += ms;
    },
  };

  let attempts = 0;
  const mockTransport = {
    generateContent: async () => {
      attempts++;
      if (attempts === 1) {
        const err = new Error('429 Resource Exhausted');
        err.status = 429;
        err.response = {
          headers: new Map([['retry-after', '4']]),
        };
        // Mock get method for headers
        err.response.headers.get = (name) => (name.toLowerCase() === 'retry-after' ? '4' : null);
        throw err;
      }
      return 'OK';
    },
  };

  configureAiGatewayForTesting({ transport: mockTransport, clock: virtualClock });

  const res = await executeAiCall({ model: 'gemini-2.0-flash', contents: [] }, { maxAttempts: 2, initialDelayMs: 1000 });
  assert.strictEqual(res, 'OK');
  assert.ok(sleptTime >= 4000, `Expected sleep >= 4000ms for Retry-After 4, got ${sleptTime}ms`);
});

await runTestAsync('Model-chain fallback switches models on 503/429/404', async () => {
  resetAiGatewayState();
  const modelsCalled = [];

  const originalFallback = process.env.GEMINI_FALLBACK_MODELS;
  process.env.GEMINI_FALLBACK_MODELS = 'gemini-2.0-flash-lite,gemini-1.5-flash';

  const mockTransport = {
    generateContent: async ({ model }) => {
      modelsCalled.push(model);
      if (model === 'gemini-2.0-flash') {
        const err = new Error('503 Overloaded');
        err.status = 503;
        throw err;
      }
      return 'Fallback Success';
    },
  };

  configureAiGatewayForTesting({ transport: mockTransport });

  const res = await executeAiCall({ model: 'gemini-2.0-flash', contents: [] }, { maxAttempts: 1 });
  assert.strictEqual(res, 'Fallback Success');
  assert.deepStrictEqual(modelsCalled, ['gemini-2.0-flash', 'gemini-2.0-flash-lite']);

  process.env.GEMINI_FALLBACK_MODELS = originalFallback || '';
});

await runTestAsync('Auth error skips retries and trips straight to RULES_ONLY', async () => {
  resetAiGatewayState();
  let calls = 0;

  const mockTransport = {
    generateContent: async () => {
      calls++;
      const err = new Error('API key not valid. Please pass a valid API key.');
      err.status = 401;
      throw err;
    },
  };

  configureAiGatewayForTesting({ transport: mockTransport });

  try {
    await executeAiCall({ model: 'gemini-2.0-flash', contents: [] }, { maxAttempts: 3 });
    assert.fail('Should fail on 401');
  } catch (e) {
    assert.strictEqual(e.reason, 'AUTH');
  }

  assert.strictEqual(calls, 1, 'Auth error must never retry');
  const status = getAiStatus();
  assert.strictEqual(status.mode, 'RULES_ONLY', 'Auth error must lock status to RULES_ONLY');
});

await runTestAsync('Kill switch AI_FORCE_RULES_MODE short-circuits immediately', async () => {
  resetAiGatewayState();
  let calls = 0;
  const mockTransport = {
    generateContent: async () => {
      calls++;
      return 'OK';
    },
  };
  configureAiGatewayForTesting({ transport: mockTransport });

  const originalEnv = process.env.AI_FORCE_RULES_MODE;
  process.env.AI_FORCE_RULES_MODE = 'true';

  try {
    await executeAiCall({ model: 'gemini-2.0-flash', contents: [] });
    assert.fail('Should throw KILL_SWITCH error');
  } catch (e) {
    assert.strictEqual(e.reason, 'KILL_SWITCH');
  }

  assert.strictEqual(calls, 0, 'No transport calls allowed under kill switch');
  assert.strictEqual(getAiStatus().mode, 'RULES_ONLY');

  process.env.AI_FORCE_RULES_MODE = originalEnv || '';
});

await runTestAsync('Concurrency limit semaphore bounds parallel in-flight requests', async () => {
  resetAiGatewayState();
  let inFlight = 0;
  let maxSeenInFlight = 0;

  const originalConcurrency = process.env.AI_MAX_CONCURRENCY;
  process.env.AI_MAX_CONCURRENCY = '2';

  const mockTransport = {
    generateContent: async () => {
      inFlight++;
      maxSeenInFlight = Math.max(maxSeenInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 50));
      inFlight--;
      return 'Done';
    },
  };

  configureAiGatewayForTesting({ transport: mockTransport });

  // Launch 5 parallel requests
  const promises = [1, 2, 3, 4, 5].map(() => executeAiCall({ model: 'gemini-2.0-flash', contents: [] }));
  await Promise.all(promises);

  assert.ok(maxSeenInFlight <= 2, `Max concurrency exceeded: saw ${maxSeenInFlight}, allowed 2`);

  process.env.AI_MAX_CONCURRENCY = originalConcurrency || '';
});

// ============================================================
// 2. DETERMINISTIC RULES VERIFIER TESTS
// ============================================================

runTest('Rules verifier is deterministic: identical input gives byte-identical output', () => {
  const req = {
    id: 'req_auth_test',
    req_code: 'AUTH-01',
    title: 'User Authentication with JWT and Password Hashing',
    description: 'The system must authenticate users using bcrypt password hashing and issue signed JWT tokens.',
    acceptance_criteria: JSON.stringify([
      'Passwords hashed with bcrypt',
      'Valid JWT tokens issued upon successful credentials check',
    ]),
  };

  const candidates = [
    {
      evidenceId: 'ev_2',
      filePath: 'src/auth/jwt.js',
      evidenceType: 'AUTHENTICATION_INDICATOR',
      identifier: 'jwt.sign()',
      codeSnippet: 'const token = jwt.sign({ id: user.id }, secret);',
      analysisMethod: 'AST',
    },
    {
      evidenceId: 'ev_1',
      filePath: 'src/auth/login.js',
      evidenceType: 'API_ENDPOINT',
      identifier: 'POST /api/login',
      codeSnippet: 'const match = await bcrypt.compare(password, hash);',
      analysisMethod: 'AST',
    },
  ];

  const res1 = verifyRequirementWithRules(req, candidates);
  const res2 = verifyRequirementWithRules(req, candidates);

  assert.strictEqual(JSON.stringify(res1), JSON.stringify(res2), 'Output must be byte-identical');
  assert.strictEqual(res1.status, 'VERIFIED');
  assert.strictEqual(res1.method, 'RULES');
  assert.ok(res1.confidence_score <= MAX_RULES_CONFIDENCE);
  assert.ok(res1.explanation.startsWith('Rules-based assessment (AI unavailable):'));
  assert.ok(res1.limitations.includes('Not AI-reviewed; re-run with AI when available.'));
});

runTest('Rules verifier NEVER returns NOT_IMPLEMENTED', () => {
  const req = {
    id: 'req_absent',
    req_code: 'ABS-01',
    title: 'Biometric Iris Scanner',
    description: 'System must scan user retinas.',
    acceptance_criteria: '[]',
  };

  // Even with zero evidence or mismatched evidence, never NOT_IMPLEMENTED
  const resZero = verifyRequirementWithRules(req, []);
  assert.strictEqual(resZero.status, 'UNVERIFIED');

  const resMismatch = verifyRequirementWithRules(req, [
    {
      evidenceId: 'ev_other',
      filePath: 'src/utils.js',
      evidenceType: 'OTHER',
      identifier: 'formatDate',
      codeSnippet: 'return d.toISOString();',
    },
  ]);
  assert.strictEqual(resMismatch.status, 'UNVERIFIED');
});

runTest('Rules verifier evidence IDs are strictly within candidate set', () => {
  const req = {
    id: 'req_scope',
    req_code: 'SC-01',
    title: 'Input Validation Schema',
    description: 'System validates user registration schema using Zod.',
    acceptance_criteria: JSON.stringify(['Validate email and password']),
  };

  const candidates = [
    {
      evidenceId: 'ev_zod_valid',
      filePath: 'src/schemas.js',
      evidenceType: 'VALIDATION_INDICATOR',
      identifier: 'z.object()',
      codeSnippet: 'const schema = z.object({ email: z.string().email() });',
      analysisMethod: 'AST',
    },
  ];

  const res = verifyRequirementWithRules(req, candidates);
  const validIds = new Set(['ev_zod_valid']);

  for (const id of res.supporting_evidence_ids) {
    assert.ok(validIds.has(id), `Evidence ID ${id} was not in candidate set`);
  }
});

runTest('Rules verifier caps confidence at 0.65', () => {
  const req = {
    id: 'req_cap',
    req_code: 'CAP-01',
    title: 'CRUD API Endpoints and Database Persistence',
    description: 'Create and update users in database with endpoints.',
    acceptance_criteria: JSON.stringify(['POST /api/users', 'db.query INSERT']),
  };

  const candidates = [
    {
      evidenceId: 'ev_1',
      filePath: 'src/routes/users.js',
      evidenceType: 'API_ENDPOINT',
      identifier: 'POST /api/users',
      codeSnippet: 'router.post("/api/users", handler);',
      analysisMethod: 'AST',
    },
    {
      evidenceId: 'ev_2',
      filePath: 'src/db/userRepo.js',
      evidenceType: 'DATABASE_OPERATION',
      identifier: 'db.query()',
      codeSnippet: 'await db.query("INSERT INTO users VALUES (...)");',
      analysisMethod: 'AST',
    },
  ];

  const res = verifyRequirementWithRules(req, candidates);
  assert.ok(res.confidence_score <= 0.65, `Confidence was ${res.confidence_score}, must be <= 0.65`);
});

runTest('Rules verifier caps status at PARTIALLY_IMPLEMENTED when stubs are present', () => {
  const req = {
    id: 'req_stub',
    req_code: 'STUB-01',
    title: 'File Upload and Storage',
    description: 'Upload files to S3 bucket.',
    acceptance_criteria: JSON.stringify(['Upload files']),
  };

  const candidates = [
    {
      evidenceId: 'ev_stub_1',
      filePath: 'src/upload.js',
      evidenceType: 'API_ENDPOINT',
      identifier: 'POST /upload',
      codeSnippet: '// TODO: implement file upload logic here\nthrow new Error("not implemented");',
      analysisMethod: 'AST',
    },
  ];

  const res = verifyRequirementWithRules(req, candidates);
  assert.strictEqual(res.status, 'PARTIALLY_IMPLEMENTED');
  assert.ok(res.limitations.some((l) => l.includes('stubs detected')));
});

// ============================================================
// 3. DETERMINISTIC SRS RULE EXTRACTOR TESTS
// ============================================================

runTest('Rule extractor extracts requirements with PENDING status and LOW/MEDIUM confidence', () => {
  const sampleSrs = `
Software Requirements Specification

1. User Authentication
AUTH-01: The system shall authenticate users using username and password credentials.
- Passwords must be encrypted
- Lock account after 5 failed attempts

2. Performance
PERF-01: The system response time shall be under 2 seconds for 95% of queries.

3. General
The application should provide an export report feature in PDF format.
  `;

  const extracted = extractRequirementsWithRules(sampleSrs);
  assert.ok(extracted.length >= 3, `Expected >= 3 requirements, got ${extracted.length}`);

  for (const r of extracted) {
    assert.strictEqual(r.approval_status, 'PENDING');
    assert.ok(['LOW', 'MEDIUM'].includes(r.confidence));
    assert.strictEqual(r.extraction_method, 'RULES');
    assert.ok(r.extraction_notes.includes('Extracted by rules'));
  }

  const authReq = extracted.find((r) => r.req_code === 'AUTH-01');
  assert.ok(authReq);
  assert.strictEqual(authReq.category, 'SECURITY');
  assert.strictEqual(authReq.priority, 'HIGH');
  assert.ok(authReq.acceptance_criteria);
  const parsedCriteria = JSON.parse(authReq.acceptance_criteria);
  assert.strictEqual(parsedCriteria.length, 2);
});

// ============================================================
// 4. FULL OFFLINE VERIFICATION RUN INTEGRATION TEST
// ============================================================

await runTestAsync('Verification run over 30 requirements under total AI outage completes in <2s labeled RULES', async () => {
  const uid = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  const projectId = `proj_outage_${uid}`;
  const now = new Date().toISOString();

  // Create project in SQLite
  execute(
    `INSERT INTO projects (id, name, description, status, created_at, updated_at)
     VALUES (?, 'Total Outage Verification Test', 'Test project', 'CREATED', ?, ?)`,
    [projectId, now, now]
  );

  // Insert 30 approved requirements
  const reqCategories = ['SECURITY', 'FUNCTIONAL', 'PERFORMANCE', 'BUSINESS_RULE'];
  for (let i = 1; i <= 30; i++) {
    const code = `REQ-${String(i).padStart(3, '0')}`;
    const category = reqCategories[i % reqCategories.length];
    execute(
      `INSERT INTO requirements (
        id, project_id, req_code, title, description, category, priority,
        acceptance_criteria, approval_status, order_index, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'HIGH', ?, 'APPROVED', ?, ?, ?)`,
      [
        `req_outage_${uid}_${i}`,
        projectId,
        code,
        `System Feature ${i} for ${category}`,
        `The system shall implement feature ${i} satisfying security and persistence standards.`,
        category,
        JSON.stringify([`Acceptance criterion for feature ${i}`]),
        i - 1,
        now,
        now,
      ]
    );
  }

  // Insert active code submission
  const subId = `sub_outage_${uid}`;
  execute(
    `INSERT INTO code_submissions (
      id, project_id, filename, file_size, storage_path, version, is_active,
      status, analyzed_files, total_lines, languages, created_at
    ) VALUES (?, ?, 'outage_code.zip', 1024, 'dummy_path', 1, 1, 'ANALYZED', 10, 500, ?, ?)`,
    [subId, projectId, JSON.stringify({ javascript: 10 }), now]
  );

  // Insert candidate code evidence records
  for (let i = 1; i <= 15; i++) {
    execute(
      `INSERT INTO code_evidence (
        id, submission_id, project_id, file_path, language, evidence_type,
        identifier, start_line, end_line, code_snippet, analysis_method, confidence, created_at
      ) VALUES (?, ?, ?, ?, 'javascript', 'API_ENDPOINT', ?, 10, 20, ?, 'AST', 'HIGH', ?)`,
      [
        `ev_outage_${uid}_${i}`,
        subId,
        projectId,
        `src/api/feature_${i}.js`,
        `POST /api/feature/${i}`,
        `app.post('/api/feature/${i}', async (req, res) => { return res.json({ ok: true }); });`,
        now,
      ]
    );
  }

  // Simulate total AI outage via mock transport throwing 503 with instant test clock
  resetAiGatewayState();
  let simTime = Date.now();
  const failingTransport = {
    generateContent: async () => {
      const err = new Error('Total Gemini Outage (503)');
      err.status = 503;
      throw err;
    },
  };
  configureAiGatewayForTesting({
    transport: failingTransport,
    clock: {
      now: () => simTime,
      sleep: async () => {}, // Instant sleep during test
    },
  });

  const startTime = Date.now();
  const runResult = await executeVerificationRun(projectId);
  const elapsedMs = Date.now() - startTime;

  console.log(`(Completed 30 requirements in ${elapsedMs}ms)`);
  assert.ok(elapsedMs < 2000, `Execution took ${elapsedMs}ms, must be < 2000ms`);

  assert.strictEqual(runResult.status, 'COMPLETED');
  assert.strictEqual(runResult.totalRequirements, 30);
  assert.strictEqual(runResult.rulesCount, 30);
  assert.strictEqual(runResult.aiCount, 0);
  assert.strictEqual(runResult.aiMode, 'RULES_ONLY');

  // Verify all 30 results in DB are labeled with method='RULES'
  const dbResults = queryAll('SELECT * FROM verification_results WHERE run_id = ?', [runResult.runId]);
  assert.strictEqual(dbResults.length, 30);

  for (const r of dbResults) {
    assert.strictEqual(r.method, 'RULES');
    assert.ok(r.fallback_reason, 'Must have a fallback reason');
    assert.ok(r.confidence_score <= 0.65);
    assert.notStrictEqual(r.status, 'NOT_IMPLEMENTED', 'Rules mode must never produce NOT_IMPLEMENTED');
  }

  // Cleanup test project
  execute('DELETE FROM projects WHERE id = ?', [projectId]);
});

// Reset gateway after testing
resetAiGatewayState();
configureAiGatewayForTesting({ transport: null, clock: null });

console.log('====================================================');
console.log(`ALL PHASE 6 RESILIENCE TESTS PASSED (${testPassed}/${testTotal})!`);
console.log('====================================================');
