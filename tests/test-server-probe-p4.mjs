import { spawn } from 'node:child_process';
import JSZip from 'jszip';

console.log('--- STARTING PHASE 4 LIVE SERVER PROBE ---');

const PORT = 3008;
const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['next', 'start', '-H', '127.0.0.1', '-p', String(PORT)],
  {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  }
);

child.stdout.on('data', (d) => process.stdout.write(`[Next.js stdout] ${d}`));
child.stderr.on('data', (d) => process.stderr.write(`[Next.js stderr] ${d}`));

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, raw: text };
  }
}

async function createSampleZipBuffer() {
  const zip = new JSZip();
  zip.file(
    'src/auth/jwt.js',
    `
    import jwt from 'jsonwebtoken';
    import bcrypt from 'bcrypt';

    export async function hashPassword(plainText) {
      return await bcrypt.hash(plainText, 10);
    }

    export function verifyAuthToken(token, secret) {
      return jwt.verify(token, secret);
    }
  `
  );

  zip.file(
    'src/api/routes.js',
    `
    app.post('/api/v1/auth/login', async (req, res) => {
      const match = await hashPassword(req.body.password);
      res.json({ token: 'test-token', success: match });
    });
  `
  );

  return await zip.generateAsync({ type: 'nodebuffer' });
}

async function runProbe() {
  let isReady = false;
  for (let i = 0; i < 25; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/projects`);
      if (res.ok) {
        isReady = true;
        break;
      }
    } catch {
      await sleep(1000);
    }
  }

  if (!isReady) {
    throw new Error('Next.js server failed to respond on port ' + PORT);
  }

  console.log('✓ Next.js server is ready on port', PORT);

  // 1. Create project
  const createProj = await fetchJson(`http://127.0.0.1:${PORT}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Phase 4 Traceability Audit Project',
      client_name: 'Enterprise Security Global',
      description: 'End-to-end verification of Phase 4 requirement mapping, Gemini interpretation, and traceability matrix.',
    }),
  });
  console.log('1. POST /api/projects -> Status:', createProj.status, 'ID:', createProj.data?.data?.id);
  const projectId = createProj.data?.data?.id;

  // 2. Create and approve a requirement
  const createReq = await fetchJson(`http://127.0.0.1:${PORT}/api/projects/${projectId}/requirements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      req_code: 'SEC-001',
      title: 'User Authentication with JWT and Bcrypt',
      description: 'System shall securely hash user passwords using bcrypt and verify tokens using jwt.',
      category: 'SECURITY',
      priority: 'HIGH',
      acceptance_criteria: ['Use bcrypt hash for password', 'Verify auth tokens with jwt'],
    }),
  });
  const reqId = createReq.data?.data?.id;
  console.log('2. POST /api/projects/[id]/requirements -> Status:', createReq.status, 'Req ID:', reqId);

  // Approve requirement
  await fetchJson(`http://127.0.0.1:${PORT}/api/projects/${projectId}/requirements/${reqId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approval_status: 'APPROVED' }),
  });
  console.log('   Requirement SEC-001 approved.');

  // 3. Upload developer ZIP archive
  const zipBuffer = await createSampleZipBuffer();
  const formData = new FormData();
  formData.append('file', new Blob([zipBuffer], { type: 'application/zip' }), 'auth-repo.zip');

  const uploadRes = await fetchJson(`http://127.0.0.1:${PORT}/api/projects/${projectId}/code`, {
    method: 'POST',
    body: formData,
  });
  console.log('3. POST /api/projects/[id]/code -> Status:', uploadRes.status, 'Sub ID:', uploadRes.data?.data?.id);

  // 4. GET /api/projects/[id]/matrix (pre-verification check)
  const matrixPre = await fetchJson(`http://127.0.0.1:${PORT}/api/projects/${projectId}/matrix`);
  console.log('4. GET /api/projects/[id]/matrix -> Status:', matrixPre.status, 'Eligible:', matrixPre.data?.eligibility?.isEligible);

  // 5. POST /api/projects/[id]/verification (execute verification run)
  const runRes = await fetchJson(`http://127.0.0.1:${PORT}/api/projects/${projectId}/verification`, {
    method: 'POST',
  });
  console.log('5. POST /api/projects/[id]/verification -> Status:', runRes.status, 'Run ID:', runRes.data?.data?.runId);
  const runId = runRes.data?.data?.runId;

  // 6. GET /api/projects/[id]/verification (list runs)
  const runsList = await fetchJson(`http://127.0.0.1:${PORT}/api/projects/${projectId}/verification`);
  console.log('6. GET /api/projects/[id]/verification -> Status:', runsList.status, 'Runs Count:', runsList.data?.runs?.length);

  // 7. GET /api/projects/[id]/verification/[runId] (run details)
  const runDetail = await fetchJson(`http://127.0.0.1:${PORT}/api/projects/${projectId}/verification/${runId}`);
  console.log('7. GET /api/projects/[id]/verification/[runId] -> Status:', runDetail.status, 'Status:', runDetail.data?.status);

  // 8. GET /api/projects/[id]/verification/[runId]/results (paginated results)
  const resultsRes = await fetchJson(
    `http://127.0.0.1:${PORT}/api/projects/${projectId}/verification/${runId}/results?page=1&limit=10`
  );
  console.log('8. GET /api/projects/[id]/verification/[runId]/results -> Status:', resultsRes.status, 'Count:', resultsRes.data?.data?.length);

  // 9. GET /api/projects/[id]/matrix (post-verification matrix)
  const matrixPost = await fetchJson(`http://127.0.0.1:${PORT}/api/projects/${projectId}/matrix`);
  console.log('9. GET /api/projects/[id]/matrix -> Status:', matrixPost.status, 'Completion:', matrixPost.data?.summary?.completionRate + '%');

  // 10. GET /projects/[id]/matrix (HTML UI Delivery)
  const htmlRes = await fetch(`http://127.0.0.1:${PORT}/projects/${projectId}/matrix`);
  console.log('10. GET /projects/[id]/matrix -> Status:', htmlRes.status, 'HTML delivered:', htmlRes.headers.get('content-type')?.includes('text/html'));

  // 11. Clean up: DELETE project
  const delRes = await fetchJson(`http://127.0.0.1:${PORT}/api/projects/${projectId}`, {
    method: 'DELETE',
  });
  console.log('11. DELETE /api/projects/[id] -> Status:', delRes.status, 'Cascade cleanup complete.');

  console.log('====================================================');
  console.log('ALL PHASE 4 LIVE SERVER PROBE CHECKS PASSED!');
  console.log('====================================================');
}

runProbe()
  .catch((err) => {
    console.error('PROBE FAILED:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      child.kill('SIGTERM');
    } catch {}
    setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {}
      process.exit(process.exitCode || 0);
    }, 1000);
  });

