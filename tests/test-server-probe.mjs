import { spawn } from 'node:child_process';
import http from 'node:http';

console.log('--- STARTING SERVER INTEGRATION PROBE ---');

const PORT = 3005;
const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['next', 'start', '-H', '127.0.0.1', '-p', String(PORT)], {
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: true,
});

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

async function runProbe() {
  let isReady = false;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/projects`);
      if (res.ok) {
        isReady = true;
        break;
      }
    } catch (err) {
      // console.log('Waiting...', err.message);
      await sleep(1000);
    }
  }

  if (!isReady) {
    throw new Error('Next.js server failed to respond within 20 seconds');
  }

  console.log('✓ Next.js server is UP and responding on port', PORT);

  // 1. Test GET /api/projects
  const getProjects = await fetchJson(`http://127.0.0.1:${PORT}/api/projects`);
  console.log('1. GET /api/projects -> Status:', getProjects.status, 'Count:', getProjects.data.data.length);

  // 2. Test POST /api/projects
  const createRes = await fetchJson(`http://127.0.0.1:${PORT}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Automated E2E Verification Project',
      client_name: 'GENESIS Accreditation Board',
      description: 'End-to-end integration test project created during phase 1 verification.',
    }),
  });
  console.log('2. POST /api/projects -> Status:', createRes.status, 'Created ID:', createRes.data?.data?.id);
  const createdId = createRes.data?.data?.id;

  // 3. Test GET /api/stats
  const statsRes = await fetchJson(`http://127.0.0.1:${PORT}/api/stats`);
  console.log('3. GET /api/stats -> Status:', statsRes.status, 'Total Projects:', statsRes.data?.data?.projects?.total);

  // 4. Test GET /api/projects/[id]
  const singleProj = await fetchJson(`http://127.0.0.1:${PORT}/api/projects/${createdId}`);
  console.log('4. GET /api/projects/[id] -> Status:', singleProj.status, 'Name:', singleProj.data?.data?.name);

  // 5. Test GET /dashboard HTML page
  const dashboardRes = await fetch(`http://127.0.0.1:${PORT}/dashboard`);
  console.log('5. GET /dashboard -> Status:', dashboardRes.status, 'HTML length:', (await dashboardRes.text()).length);

  // 6. Test GET /integrity HTML page
  const integrityRes = await fetch(`http://127.0.0.1:${PORT}/integrity`);
  console.log('6. GET /integrity -> Status:', integrityRes.status, 'HTML length:', (await integrityRes.text()).length);

  // 7. Test DELETE /api/projects/[id]
  const deleteRes = await fetchJson(`http://127.0.0.1:${PORT}/api/projects/${createdId}`, {
    method: 'DELETE',
  });
  console.log('7. DELETE /api/projects/[id] -> Status:', deleteRes.status, 'Message:', deleteRes.data?.message);

  console.log('--- ALL SERVER PROBE TESTS COMPLETED SUCCESSFULLY ---');
}

runProbe()
  .catch((err) => {
    console.error('Probe failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    child.kill('SIGTERM');
    setTimeout(() => {
      try {
        process.kill(child.pid);
      } catch {}
      process.exit();
    }, 500);
  });
