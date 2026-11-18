import assert from 'node:assert';
import { getDb, queryOne, queryAll, execute, transaction } from '../src/lib/db/index.js';
import { getStorageProvider } from '../src/lib/storage/index.js';
import { LocalDiskStorage } from '../src/lib/storage/LocalDiskStorage.js';

console.log('--- STARTING GENESIS PHASE 1 VERIFICATION SUITE ---');

// 1. Verify SQLite Database & Tables
console.log('[1/5] Testing SQLite Schema & Initialization...');
const db = getDb();
assert.ok(db, 'Database instance should be initialized');

const tables = queryAll("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
const tableNames = tables.map((t) => t.name);
const expectedTables = [
  'projects',
  'srs_documents',
  'requirements',
  'code_submissions',
  'code_evidence',
  'verification_results',
  'verification_reports',
];

for (const exp of expectedTables) {
  assert.ok(tableNames.includes(exp), `Expected table "${exp}" to exist in SQLite`);
}
console.log('✓ SQLite database and all 7 tables verified successfully.');

// 2. Test Project CRUD Operations in SQLite
console.log('[2/5] Testing Project CRUD and Constraints...');
const testProjId = `test_proj_${Date.now()}`;
const now = new Date().toISOString();

execute(
  `INSERT INTO projects (id, name, description, client_name, status, created_at, updated_at)
   VALUES (?, ?, ?, ?, 'CREATED', ?, ?)`,
  [testProjId, 'Phase 1 Verification Project', 'Test Scope for MVP', 'Apex BioHealth', now, now]
);

const fetched = queryOne('SELECT * FROM projects WHERE id = ?', [testProjId]);
assert.ok(fetched, 'Project should be found by ID');
assert.strictEqual(fetched.name, 'Phase 1 Verification Project');
assert.strictEqual(fetched.client_name, 'Apex BioHealth');
assert.strictEqual(fetched.status, 'CREATED');

// Update project status
execute('UPDATE projects SET status = ? WHERE id = ?', ['SRS_UPLOADED', testProjId]);
const updated = queryOne('SELECT status FROM projects WHERE id = ?', [testProjId]);
assert.strictEqual(updated.status, 'SRS_UPLOADED');

console.log('✓ Project insertion, retrieval, and status update verified.');

// 3. Test Storage Abstraction
console.log('[3/5] Testing Modular Storage Abstraction...');
const storage = getStorageProvider();
assert.ok(storage, 'Storage provider should be resolved');

const testFileKey = `test/phase1_sample_${Date.now()}.txt`;
const testPayload = Buffer.from('GENESIS Phase 1 Storage Test Payload');

// Save
const savedMeta = await storage.save(testFileKey, testPayload, { mimeType: 'text/plain' });
assert.ok(savedMeta.uri, 'Save should return URI');
assert.strictEqual(savedMeta.size, testPayload.length);

// Exists
const exists = await storage.exists(testFileKey);
assert.strictEqual(exists, true, 'File should exist');

// Read back
const content = await storage.get(testFileKey);
assert.strictEqual(content.toString('utf8'), testPayload.toString('utf8'), 'Read content should match payload');

// Delete
const deleted = await storage.delete(testFileKey);
assert.strictEqual(deleted, true, 'Delete should return true');
const existsAfter = await storage.exists(testFileKey);
assert.strictEqual(existsAfter, false, 'File should no longer exist after delete');

console.log('✓ Modular Storage write, read, and delete operations verified.');

// 4. Test Path Traversal Security Protection
console.log('[4/5] Testing Storage Path Traversal Security Guards...');
let securityPassed = false;
try {
  await storage.save('../../../windows/system32/malicious.txt', Buffer.from('exploit'));
} catch (err) {
  securityPassed = true;
  assert.match(err.message, /Path traversal detected/, 'Should explicitly reject path traversal');
}
assert.strictEqual(securityPassed, true, 'Storage must prevent path traversal attacks');
console.log('✓ Storage security guard successfully blocked path traversal attempt.');

// 5. Clean up test record
console.log('[5/5] Cleaning up test database records...');
execute('DELETE FROM projects WHERE id = ?', [testProjId]);
const cleanCheck = queryOne('SELECT id FROM projects WHERE id = ?', [testProjId]);
assert.strictEqual(cleanCheck, undefined, 'Test project should be cleanly deleted');
console.log('✓ Test cleanup complete.');

console.log('====================================================');
console.log('ALL PHASE 1 ARCHITECTURAL & UNIT TESTS PASSED (5/5)!');
console.log('====================================================');
