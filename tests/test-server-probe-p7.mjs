import assert from 'node:assert/strict';
import { execute, queryOne } from '../src/lib/db/index.js';

const PORT = 3012;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function runProbe() {
  console.log('--- STARTING GENESIS PHASE 7 LIVE SERVER PROBE ---');

  // 1. Health check
  const health = await fetchJson(`${BASE_URL}/api/health`);
  assert.equal(health.status, 200);
  console.log('1. GET /api/health -> Status:', health.status);

  // 2. Create project
  const createProj = await fetchJson(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Phase 7 Async Job Probe Project',
      description: 'Testing async job enqueue, progress, and AI upgrade',
      clientName: 'Enterprise QA Group',
    }),
  });
  assert.equal(createProj.status, 201);
  const projectId = createProj.data?.data?.id;
  console.log('2. POST /api/projects -> Status:', createProj.status, 'ID:', projectId);

  // 3. Create and approve requirement
  const createReq = await fetchJson(`${BASE_URL}/api/projects/${projectId}/requirements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reqCode: 'REQ-ASYNC-01',
      title: 'Authentication Middleware',
      description: 'API requests must be verified with secure JWT tokens.',
      category: 'SECURITY',
      priority: 'HIGH',
      acceptanceCriteria: ['Must validate token bearer', 'Must reject expired tokens'],
    }),
  });
  assert.equal(createReq.status, 201);
  const reqId = createReq.data?.data?.id;

  await fetchJson(`${BASE_URL}/api/projects/${projectId}/requirements/${reqId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approvalStatus: 'APPROVED' }),
  });
  console.log('3. POST /api/projects/[id]/requirements -> Approved Req:', reqId);

  // 4. Inject synthetic code submission and evidence
  const now = new Date().toISOString();
  const subId = `sub_probe7_${Date.now().toString(36)}`;
  execute(
    `INSERT INTO code_submissions (id, project_id, filename, file_size, storage_path, status, is_active, analyzed_files, total_lines, created_at)
     VALUES (?, ?, 'probe7.zip', 2048, 'submissions/probe7.zip', 'ANALYZED', 1, 1, 50, ?)`,
    [subId, projectId, now]
  );
  const evId = `ev_probe7_${Date.now().toString(36)}`;
  execute(
    `INSERT INTO code_evidence (id, submission_id, project_id, file_path, start_line, end_line, identifier, evidence_type, code_snippet, confidence, created_at)
     VALUES (?, ?, ?, 'src/auth.js', 1, 15, 'verifyToken', 'API_ENDPOINT', 'function verifyToken(req) { return true; }', 'HIGH', ?)`,
    [evId, subId, projectId, now]
  );
  console.log('4. Synthetic code submission & evidence registered.');

  // 5. POST /api/projects/[id]/verification (Async 202 enqueue)
  const verifyRes = await fetchJson(`${BASE_URL}/api/projects/${projectId}/verification`, {
    method: 'POST',
  });
  assert.equal(verifyRes.status, 202);
  assert.ok(verifyRes.data?.data?.jobId);
  const { jobId, runId } = verifyRes.data.data;
  console.log('5. POST /api/projects/[id]/verification -> Status: 202, Job ID:', jobId, 'Run ID:', runId);

  // 6. Poll job status
  let pollAttempts = 0;
  let jobState = null;
  while (pollAttempts < 20) {
    const jobRes = await fetchJson(`${BASE_URL}/api/projects/${projectId}/jobs/${jobId}`);
    assert.equal(jobRes.status, 200);
    jobState = jobRes.data?.data;
    if (jobState.status === 'SUCCEEDED' || jobState.status === 'FAILED') {
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
    pollAttempts++;
  }
  console.log('6. Polled Job -> Final Status:', jobState?.status, 'Progress:', `${jobState?.progressDone}/${jobState?.progressTotal}`);
  assert.ok(jobState?.status === 'SUCCEEDED' || jobState?.status === 'FAILED');

  // 7. GET /api/projects/[id]/matrix (Check matrix rows)
  const matrixRes = await fetchJson(`${BASE_URL}/api/projects/${projectId}/matrix?runId=${runId}`);
  assert.equal(matrixRes.status, 200);
  console.log('7. GET /api/projects/[id]/matrix -> Rows:', matrixRes.data?.data?.matrix?.length);

  // 8. Cleanup
  const delRes = await fetchJson(`${BASE_URL}/api/projects/${projectId}`, { method: 'DELETE' });
  assert.equal(delRes.status, 200);
  console.log('8. DELETE /api/projects/[id] -> Status:', delRes.status, 'Cleanup complete.');

  console.log('====================================================');
  console.log('PHASE 7 SERVER PROBE COMPLETED SUCCESSFULLY!');
  console.log('====================================================');
}

runProbe().catch((err) => {
  console.error('Phase 7 server probe failed:', err);
  process.exit(1);
});

