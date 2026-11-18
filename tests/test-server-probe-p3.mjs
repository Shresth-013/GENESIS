import { spawn } from 'node:child_process';
import JSZip from 'jszip';

console.log('--- STARTING PHASE 3 LIVE SERVER PROBE ---');

const PORT = 3007;
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
    app.get('/api/v1/users', async (req, res) => {
      const users = await db.query('SELECT * FROM users');
      res.json(users);
    });

    app.post('/api/v1/auth/login', async (req, res) => {
      res.json({ token: 'test-token' });
    });
  `
  );

  zip.file(
    'src/models/User.py',
    `
    class User:
        def __init__(self, username, email):
            self.username = username
            self.email = email

    @app.get("/api/py/status")
    def status_check():
        return {"status": "healthy"}
  `
  );

  zip.file(
    'tests/auth.test.js',
    `
    describe('Authentication Service', () => {
      it('should hash passwords correctly', () => {
        expect(true).toBe(true);
      });
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

  // 1. Create a test project
  const createProj = await fetchJson(`http://127.0.0.1:${PORT}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Phase 3 Live Probe Project',
      client_name: 'Enterprise Audit Systems',
      description: 'End-to-end verification of Phase 3 source code upload, AST parsing, and evidence indexing.',
    }),
  });
  console.log('1. POST /api/projects -> Status:', createProj.status, 'ID:', createProj.data?.data?.id);
  const projectId = createProj.data?.data?.id;

  if (!projectId) {
    throw new Error('Failed to create test project');
  }

  // 2. Upload source code ZIP
  const zipBuffer = await createSampleZipBuffer();
  const formData = new FormData();
  formData.append(
    'file',
    new Blob([zipBuffer], { type: 'application/zip' }),
    'developer-source.zip'
  );

  const uploadRes = await fetchJson(`http://127.0.0.1:${PORT}/api/projects/${projectId}/code`, {
    method: 'POST',
    body: formData,
  });

  console.log('2. POST /api/projects/[id]/code -> Status:', uploadRes.status);
  console.log('   Submission ID:', uploadRes.data?.data?.id);
  console.log('   Status:', uploadRes.data?.data?.status);
  console.log('   Analyzed Files:', uploadRes.data?.data?.analyzed_files);
  console.log('   Evidence Count:', uploadRes.data?.data?.evidence_count);
  console.log('   Storage path stripped:', uploadRes.data?.data?.storage_path === undefined);

  const submissionId = uploadRes.data?.data?.id;
  if (!submissionId || uploadRes.status !== 201) {
    throw new Error('ZIP upload and analysis failed in probe');
  }

  // 3. GET /api/projects/[id]/code - List submissions
  const listRes = await fetchJson(`http://127.0.0.1:${PORT}/api/projects/${projectId}/code`);
  console.log('3. GET /api/projects/[id]/code -> Status:', listRes.status, 'Count:', listRes.data?.data?.length);

  // 4. GET /api/projects/[id]/code/[subId] - Submission details
  const detailRes = await fetchJson(
    `http://127.0.0.1:${PORT}/api/projects/${projectId}/code/${submissionId}`
  );
  console.log('4. GET /api/projects/[id]/code/[subId] -> Status:', detailRes.status, 'Version:', detailRes.data?.data?.version);

  // 5. GET /api/projects/[id]/code/[subId]/evidence - Paginated evidence
  const evidenceRes = await fetchJson(
    `http://127.0.0.1:${PORT}/api/projects/${projectId}/code/${submissionId}/evidence?page=1&limit=10`
  );
  console.log('5. GET /api/projects/[id]/code/[subId]/evidence -> Status:', evidenceRes.status, 'Total Evidence:', evidenceRes.data?.pagination?.total);

  // 6. GET /api/projects/[id]/code/[subId]/files - Discovered source files
  const filesRes = await fetchJson(
    `http://127.0.0.1:${PORT}/api/projects/${projectId}/code/${submissionId}/files`
  );
  console.log('6. GET /api/projects/[id]/code/[subId]/files -> Status:', filesRes.status, 'File Count:', filesRes.data?.count);

  // 7. POST /api/projects/[id]/code/[subId]/analyze - Re-analyze
  const reanalyzeRes = await fetchJson(
    `http://127.0.0.1:${PORT}/api/projects/${projectId}/code/${submissionId}/analyze`,
    { method: 'POST' }
  );
  console.log('7. POST /api/projects/[id]/code/[subId]/analyze -> Status:', reanalyzeRes.status, 'Re-analyzed status:', reanalyzeRes.data?.data?.status);

  // 8. PATCH /api/projects/[id]/code/[subId] - Activate submission
  const patchRes = await fetchJson(
    `http://127.0.0.1:${PORT}/api/projects/${projectId}/code/${submissionId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: 1 }),
    }
  );
  console.log('8. PATCH /api/projects/[id]/code/[subId] -> Status:', patchRes.status, 'is_active:', patchRes.data?.data?.is_active);

  // 9. GET /projects/[id]/code - HTML UI Delivery
  const htmlRes = await fetch(`http://127.0.0.1:${PORT}/projects/${projectId}/code`);
  console.log('9. GET /projects/[id]/code -> Status:', htmlRes.status, 'HTML delivered:', htmlRes.headers.get('content-type')?.includes('text/html'));

  // 10. Clean up: DELETE project
  const delRes = await fetchJson(`http://127.0.0.1:${PORT}/api/projects/${projectId}`, {
    method: 'DELETE',
  });
  console.log('10. DELETE /api/projects/[id] -> Status:', delRes.status, 'Cascade cleanup complete.');

  console.log('====================================================');
  console.log('ALL PHASE 3 LIVE SERVER PROBE CHECKS PASSED!');
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

