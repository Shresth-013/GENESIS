import { spawn } from 'node:child_process';
import { createSamplePdfBuffer, createSampleDocxBuffer } from './test-utils.mjs';

console.log('--- STARTING PHASE 2 LIVE SERVER PROBE ---');

const PORT = 3006;
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
    } catch {
      await sleep(1000);
    }
  }

  if (!isReady) {
    throw new Error('Next.js server failed to respond on port ' + PORT);
  }

  console.log('✓ Next.js server is ready on port', PORT);

  // 1. Create a verification project
  const createProj = await fetchJson(`http://127.0.0.1:${PORT}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Phase 2 Live Audit Project',
      client_name: 'HealthCare Systems International',
      description: 'End-to-end Phase 2 probe for SRS upload and requirement management.',
    }),
  });
  console.log('1. POST /api/projects -> Status:', createProj.status, 'ID:', createProj.data?.data?.id);
  const projectId = createProj.data?.data?.id;

  // 2. Upload valid PDF
  const pdfBuffer = createSamplePdfBuffer('Requirement SRS-1: The hospital system shall authenticate doctors via SSO.');
  const pdfFormData = new FormData();
  pdfFormData.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), 'clinical_srs.pdf');

  const uploadPdfRes = await fetchJson(`http://127.0.0.1:${PORT}/api/projects/${projectId}/srs`, {
    method: 'POST',
    body: pdfFormData,
  });
  console.log('2. POST /api/projects/[id]/srs (PDF) -> Status:', uploadPdfRes.status, 'Data:', uploadPdfRes.data);
  const doc1Id = uploadPdfRes.data?.data?.id;

  // 3. Upload valid DOCX
  const docxBuffer = await createSampleDocxBuffer('Requirement SRS-2: The clinical database shall store encrypted patient records.');
  const docxFormData = new FormData();
  docxFormData.append('file', new Blob([docxBuffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'clinical_spec_v2.docx');

  const uploadDocxRes = await fetchJson(`http://127.0.0.1:${PORT}/api/projects/${projectId}/srs`, {
    method: 'POST',
    body: docxFormData,
  });
  console.log('3. POST /api/projects/[id]/srs (DOCX) -> Status:', uploadDocxRes.status, 'Doc ID:', uploadDocxRes.data?.data?.id, 'Paras:', uploadDocxRes.data?.data?.paragraph_count);
  const doc2Id = uploadDocxRes.data?.data?.id;

  // 4. GET /api/projects/[id]/srs (List documents)
  const listDocs = await fetchJson(`http://127.0.0.1:${PORT}/api/projects/${projectId}/srs`);
  console.log('4. GET /api/projects/[id]/srs -> Status:', listDocs.status, 'Count:', listDocs.data?.data?.length);

  // 5. Test Manual Requirement Creation
  const createReq = await fetchJson(`http://127.0.0.1:${PORT}/api/projects/${projectId}/requirements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      req_code: 'REQ-AUTH-01',
      description: 'The system shall enforce multi-factor authentication for all clinical staff.',
      category: 'SECURITY',
      priority: 'CRITICAL',
      acceptance_criteria: ['Staff receive an SMS OTP', 'Login fails after 3 invalid attempts'],
    }),
  });
  console.log('5. POST /api/projects/[id]/requirements -> Status:', createReq.status, 'Req ID:', createReq.data?.data?.id);
  const reqId = createReq.data?.data?.id;

  // 6. Test Requirement Update (Edit details)
  const updateReq = await fetchJson(`http://127.0.0.1:${PORT}/api/projects/${projectId}/requirements/${reqId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: 'The system shall enforce multi-factor authentication with 2FA tokens for all clinical staff.',
      priority: 'HIGH',
    }),
  });
  console.log('6. PATCH /api/projects/[id]/requirements/[reqId] (Edit) -> Status:', updateReq.status, 'Priority:', updateReq.data?.data?.priority);

  // 7. Test Requirement Approval
  const approveReq = await fetchJson(`http://127.0.0.1:${PORT}/api/projects/${projectId}/requirements/${reqId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approval_status: 'APPROVED' }),
  });
  console.log('7. PATCH /api/projects/[id]/requirements/[reqId] (Approve) -> Status:', approveReq.status, 'Approval Status:', approveReq.data?.data?.approval_status);

  // 8. Test Bulk Approval with another requirement
  const createReq2 = await fetchJson(`http://127.0.0.1:${PORT}/api/projects/${projectId}/requirements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      req_code: 'REQ-AUDIT-02',
      description: 'The system shall log all record accesses to an immutable audit ledger.',
      category: 'SECURITY',
      priority: 'HIGH',
    }),
  });
  const req2Id = createReq2.data?.data?.id;

  const bulkRes = await fetchJson(`http://127.0.0.1:${PORT}/api/projects/${projectId}/requirements/bulk-approval`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [req2Id], action: 'APPROVE' }),
  });
  console.log('8. POST /api/projects/[id]/requirements/bulk-approval -> Status:', bulkRes.status, 'Affected:', bulkRes.data?.count);

  // 9. Query Requirements with Filters
  const listReqs = await fetchJson(`http://127.0.0.1:${PORT}/api/projects/${projectId}/requirements?status=APPROVED`);
  console.log('9. GET /api/projects/[id]/requirements?status=APPROVED -> Status:', listReqs.status, 'Count:', listReqs.data?.count, 'Summary Approved:', listReqs.data?.summary?.approved);

  // 10. Check UI Pages
  const srsPage = await fetch(`http://127.0.0.1:${PORT}/projects/${projectId}/srs`);
  console.log('10. GET /projects/[id]/srs -> Status:', srsPage.status);

  const reqPage = await fetch(`http://127.0.0.1:${PORT}/projects/${projectId}/requirements`);
  console.log('11. GET /projects/[id]/requirements -> Status:', reqPage.status);

  // 12. Delete requirement
  const deleteReq = await fetchJson(`http://127.0.0.1:${PORT}/api/projects/${projectId}/requirements/${reqId}`, {
    method: 'DELETE',
  });
  console.log('12. DELETE /api/projects/[id]/requirements/[reqId] -> Status:', deleteReq.status);

  // 13. Clean up project
  const deleteProj = await fetchJson(`http://127.0.0.1:${PORT}/api/projects/${projectId}`, {
    method: 'DELETE',
  });
  console.log('13. DELETE /api/projects/[id] -> Status:', deleteProj.status);

  console.log('--- ALL PHASE 2 LIVE SERVER PROBES COMPLETED SUCCESSFULLY ---');
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
