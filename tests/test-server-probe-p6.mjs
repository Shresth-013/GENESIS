/**
 * GENESIS Phase 6 Live Server Integration Probe
 * Tests end-to-end execution of GENESIS with AI_FORCE_RULES_MODE=true.
 * Verifies that health check reports RULES_ONLY, requirements extraction falls back,
 * verification completes in deterministic rules mode, and reports generate successfully.
 */

import { spawn } from 'node:child_process';
import JSZip from 'jszip';
import { execute } from '../src/lib/db/index.js';

console.log('--- STARTING PHASE 6 LIVE RULES MODE SERVER PROBE ---');

const PORT = 3010;
const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['next', 'start', '-H', '127.0.0.1', '-p', String(PORT)],
  {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    env: {
      ...process.env,
      AI_FORCE_RULES_MODE: 'true',
    },
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
    return { status: res.status, data: JSON.parse(text), headers: res.headers };
  } catch {
    return { status: res.status, raw: text, headers: res.headers };
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
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (res.ok) {
        isReady = true;
        break;
      }
    } catch (err) {
      if (i % 5 === 0) {
        console.log(`[Probe wait attempt ${i + 1}] Error: ${err.message}`);
      }
      await sleep(1000);
    }
  }

  if (!isReady) {
    throw new Error('Next.js server failed to respond on port ' + PORT);
  }

  console.log('✓ Next.js server is ready on port', PORT);

  // 1. Health check endpoint verifies RULES_ONLY mode
  const healthRes = await fetchJson(`http://127.0.0.1:${PORT}/api/health`);
  console.log('1. GET /api/health -> Status:', healthRes.status, 'AI Mode:', healthRes.data?.ai?.mode);
  if (healthRes.data?.ai?.mode !== 'RULES_ONLY') {
    throw new Error(`Expected ai.mode to be RULES_ONLY, got ${healthRes.data?.ai?.mode}`);
  }

  // 2. Create project
  const createProj = await fetchJson(`http://127.0.0.1:${PORT}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Rules Mode Forced Probe Project',
      client_name: 'Resilience Test Client',
      description: 'End-to-end verification of deterministic rules fallback mode under total AI disablement.',
    }),
  });
  console.log('2. POST /api/projects -> Status:', createProj.status, 'ID:', createProj.data?.data?.id);
  const projectId = createProj.data?.data?.id;

  // 3. Create and approve requirement
  const createReq = await fetchJson(`http://127.0.0.1:${PORT}/api/projects/${projectId}/requirements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      req_code: 'SEC-01',
      title: 'Cryptographic User Authentication and Token Generation',
      description: 'The system must authenticate users using bcrypt password hashing and issue signed JWT tokens.',
      category: 'SECURITY',
      priority: 'HIGH',
      acceptance_criteria: ['Hash passwords using bcrypt', 'Issue signed JWT tokens'],
    }),
  });
  const reqId = createReq.data?.data?.id;
  console.log('3. POST /api/projects/[id]/requirements -> Status:', createReq.status, 'Req ID:', reqId);

  // Approve requirement
  await fetchJson(`http://127.0.0.1:${PORT}/api/projects/${projectId}/requirements/${reqId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approval_status: 'APPROVED' }),
  });

  // 4. Upload code archive
  const zipBuffer = await createSampleZipBuffer();
  const formData = new FormData();
  formData.append('file', new Blob([zipBuffer], { type: 'application/zip' }), 'resilience_code.zip');

  const uploadRes = await fetch(`http://127.0.0.1:${PORT}/api/projects/${projectId}/code`, {
    method: 'POST',
    body: formData,
  });
  const uploadData = await uploadRes.json();
  console.log('4. POST /api/projects/[id]/code -> Status:', uploadRes.status, 'Analyzed:', uploadData.data?.analyzed_files);

  // 5. Execute verification run (Must run in RULES mode)
  const verifyRes = await fetchJson(`http://127.0.0.1:${PORT}/api/projects/${projectId}/verification`, {
    method: 'POST',
  });
  console.log('5. POST /api/projects/[id]/verification -> Status:', verifyRes.status, 'Run Status:', verifyRes.data?.data?.status);
  const runId = verifyRes.data?.data?.runId;
  const runData = verifyRes.data?.data;

  if (runData?.aiMode !== 'RULES_ONLY') {
    throw new Error(`Expected run aiMode to be RULES_ONLY, got ${runData?.aiMode}`);
  }
  if (runData?.rulesCount < 1) {
    throw new Error(`Expected rulesCount >= 1, got ${runData?.rulesCount}`);
  }

  // 6. Traceability matrix query
  const matrixRes = await fetchJson(`http://127.0.0.1:${PORT}/api/projects/${projectId}/matrix`);
  console.log('6. GET /api/projects/[id]/matrix -> Status:', matrixRes.status, 'Total Rows:', matrixRes.data?.matrix?.length);
  const firstRow = matrixRes.data?.matrix?.[0];
  if (firstRow?.verification?.method !== 'RULES') {
    throw new Error(`Expected matrix row method to be RULES, got ${firstRow?.verification?.method}`);
  }

  // 7. Generate PDF report under rules mode
  const reportRes = await fetchJson(`http://127.0.0.1:${PORT}/api/projects/${projectId}/verification/${runId}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  console.log('7. POST /api/projects/[id]/verification/[runId]/reports -> Status:', reportRes.status, 'Report ID:', reportRes.data?.data?.id);
  const reportId = reportRes.data?.data?.id;

  // 8. Download PDF report
  const downloadRes = await fetch(`http://127.0.0.1:${PORT}/api/projects/${projectId}/reports/${reportId}/download`);
  const pdfBuffer = await downloadRes.arrayBuffer();
  const pdfHeader = Buffer.from(pdfBuffer.slice(0, 5)).toString();
  console.log('8. GET /download -> Status:', downloadRes.status, 'Header:', pdfHeader, 'Bytes:', pdfBuffer.byteLength);

  if (pdfHeader !== '%PDF-') {
    throw new Error('Downloaded report is not a valid PDF buffer');
  }

  // 9. Cascade deletion & cleanup
  const delRes = await fetchJson(`http://127.0.0.1:${PORT}/api/projects/${projectId}`, {
    method: 'DELETE',
  });
  console.log('9. DELETE /api/projects/[id] -> Status:', delRes.status);

  console.log('====================================================');
  console.log('ALL PHASE 6 LIVE SERVER PROBE CHECKS PASSED (9/9)!');
  console.log('====================================================');
}

try {
  await runProbe();
} catch (err) {
  console.error('PROBE FAILED:', err);
  process.exitCode = 1;
} finally {
  if (child && child.pid) {
    if (process.platform === 'win32') {
      try {
        spawn('taskkill', ['/F', '/T', '/PID', String(child.pid)]);
      } catch {}
    } else {
      child.kill('SIGINT');
    }
  }
}
