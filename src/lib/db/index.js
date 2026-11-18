import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

let dbInstance = null;

/**
 * Initializes and returns the singleton SQLite database instance.
 * Automatically runs database migrations defined in schema.sql.
 */
export function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'genesis.sqlite');
  const dbDir = path.dirname(path.resolve(dbPath));

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  dbInstance = new DatabaseSync(path.resolve(dbPath));

  // Enable foreign keys and write-ahead logging
  dbInstance.exec('PRAGMA foreign_keys = ON;');
  dbInstance.exec('PRAGMA journal_mode = WAL;');

  // First run migrations to ensure existing tables have all columns
  runMigrations(dbInstance);

  // Load and apply schema
  const schemaPath = path.join(process.cwd(), 'src', 'lib', 'db', 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    dbInstance.exec(schemaSql);
  }

  return dbInstance;
}

/**
 * Ensures missing columns exist on existing databases without dropping tables or losing data.
 * @param {DatabaseSync} db
 */
function runMigrations(db) {
  const tableNames = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);

  if (tableNames.includes('srs_documents')) {
    const srsCols = db.prepare('PRAGMA table_info(srs_documents)').all().map(c => c.name);
    if (!srsCols.includes('page_count')) {
      db.exec('ALTER TABLE srs_documents ADD COLUMN page_count INTEGER DEFAULT 0;');
    }
    if (!srsCols.includes('paragraph_count')) {
      db.exec('ALTER TABLE srs_documents ADD COLUMN paragraph_count INTEGER DEFAULT 0;');
    }
    if (!srsCols.includes('error_message')) {
      db.exec('ALTER TABLE srs_documents ADD COLUMN error_message TEXT;');
    }
    if (!srsCols.includes('extraction_method')) {
      db.exec("ALTER TABLE srs_documents ADD COLUMN extraction_method TEXT DEFAULT 'AI';");
    }
    if (!srsCols.includes('is_active')) {
      db.exec('ALTER TABLE srs_documents ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;');
    }
    if (!srsCols.includes('updated_at')) {
      db.exec('ALTER TABLE srs_documents ADD COLUMN updated_at TEXT;');
    }
  }

  if (tableNames.includes('requirements')) {
    const reqCols = db.prepare('PRAGMA table_info(requirements)').all().map(c => c.name);
    if (!reqCols.includes('srs_document_id')) {
      db.exec('ALTER TABLE requirements ADD COLUMN srs_document_id TEXT REFERENCES srs_documents(id) ON DELETE SET NULL;');
    }
    if (!reqCols.includes('type')) {
      db.exec("ALTER TABLE requirements ADD COLUMN type TEXT DEFAULT 'FUNCTIONAL_REQUIREMENT';");
    }
    if (!reqCols.includes('acceptance_criteria')) {
      db.exec('ALTER TABLE requirements ADD COLUMN acceptance_criteria TEXT;');
    }
    if (!reqCols.includes('source_reference')) {
      db.exec('ALTER TABLE requirements ADD COLUMN source_reference TEXT;');
    }
    if (!reqCols.includes('confidence')) {
      db.exec("ALTER TABLE requirements ADD COLUMN confidence TEXT DEFAULT 'HIGH';");
    }
    if (!reqCols.includes('extraction_notes')) {
      db.exec('ALTER TABLE requirements ADD COLUMN extraction_notes TEXT;');
    }
    if (!reqCols.includes('extraction_method')) {
      db.exec("ALTER TABLE requirements ADD COLUMN extraction_method TEXT DEFAULT 'AI';");
    }
  }

  if (tableNames.includes('code_submissions')) {
    const codeCols = db.prepare('PRAGMA table_info(code_submissions)').all().map(c => c.name);
    if (!codeCols.includes('archive_hash')) {
      db.exec('ALTER TABLE code_submissions ADD COLUMN archive_hash TEXT;');
    }
    if (!codeCols.includes('version')) {
      db.exec('ALTER TABLE code_submissions ADD COLUMN version INTEGER NOT NULL DEFAULT 1;');
    }
    if (!codeCols.includes('is_active')) {
      db.exec('ALTER TABLE code_submissions ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;');
    }
    if (!codeCols.includes('analyzed_files')) {
      db.exec('ALTER TABLE code_submissions ADD COLUMN analyzed_files INTEGER DEFAULT 0;');
    }
    if (!codeCols.includes('skipped_files')) {
      db.exec('ALTER TABLE code_submissions ADD COLUMN skipped_files INTEGER DEFAULT 0;');
    }
    if (!codeCols.includes('evidence_count')) {
      db.exec('ALTER TABLE code_submissions ADD COLUMN evidence_count INTEGER DEFAULT 0;');
    }
    if (!codeCols.includes('analysis_summary')) {
      db.exec('ALTER TABLE code_submissions ADD COLUMN analysis_summary TEXT;');
    }
    if (!codeCols.includes('error_message')) {
      db.exec('ALTER TABLE code_submissions ADD COLUMN error_message TEXT;');
    }
    if (!codeCols.includes('updated_at')) {
      db.exec('ALTER TABLE code_submissions ADD COLUMN updated_at TEXT;');
    }
  }

  if (tableNames.includes('code_evidence')) {
    const evCols = db.prepare('PRAGMA table_info(code_evidence)').all().map(c => c.name);
    if (!evCols.includes('language')) {
      db.exec('ALTER TABLE code_evidence ADD COLUMN language TEXT;');
    }
    if (!evCols.includes('analysis_method')) {
      db.exec("ALTER TABLE code_evidence ADD COLUMN analysis_method TEXT DEFAULT 'AST';");
    }
    if (!evCols.includes('confidence')) {
      db.exec("ALTER TABLE code_evidence ADD COLUMN confidence TEXT DEFAULT 'HIGH';");
    }
  }

  // Create code_files table if missing
  db.exec(`CREATE TABLE IF NOT EXISTS code_files (
    id TEXT PRIMARY KEY,
    submission_id TEXT NOT NULL REFERENCES code_submissions(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    extension TEXT NOT NULL,
    language TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    line_count INTEGER NOT NULL,
    file_hash TEXT,
    status TEXT NOT NULL DEFAULT 'ANALYZED',
    error_message TEXT,
    created_at TEXT NOT NULL
  );`);

  // Create verification_runs table if missing
  db.exec(`CREATE TABLE IF NOT EXISTS verification_runs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    srs_document_id TEXT REFERENCES srs_documents(id) ON DELETE SET NULL,
    submission_id TEXT REFERENCES code_submissions(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'RUNNING',
    total_requirements INTEGER NOT NULL DEFAULT 0,
    verified_count INTEGER NOT NULL DEFAULT 0,
    partially_count INTEGER NOT NULL DEFAULT 0,
    not_implemented_count INTEGER NOT NULL DEFAULT 0,
    unverified_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    ai_mode TEXT DEFAULT 'LIVE',
    ai_count INTEGER DEFAULT 0,
    rules_count INTEGER DEFAULT 0,
    model_name TEXT,
    error_message TEXT,
    started_at TEXT NOT NULL,
    completed_at TEXT
  );`);

  if (tableNames.includes('verification_runs')) {
    const vrCols = db.prepare('PRAGMA table_info(verification_runs)').all().map(c => c.name);
    if (!vrCols.includes('ai_mode')) {
      db.exec("ALTER TABLE verification_runs ADD COLUMN ai_mode TEXT DEFAULT 'LIVE';");
    }
    if (!vrCols.includes('ai_count')) {
      db.exec('ALTER TABLE verification_runs ADD COLUMN ai_count INTEGER DEFAULT 0;');
    }
    if (!vrCols.includes('rules_count')) {
      db.exec('ALTER TABLE verification_runs ADD COLUMN rules_count INTEGER DEFAULT 0;');
    }
    if (!vrCols.includes('base_run_id')) {
      db.exec('ALTER TABLE verification_runs ADD COLUMN base_run_id TEXT REFERENCES verification_runs(id) ON DELETE SET NULL;');
    }
  }

  if (tableNames.includes('verification_results')) {
    const vrCols = db.prepare('PRAGMA table_info(verification_results)').all().map(c => c.name);
    if (!vrCols.includes('run_id')) {
      db.exec('ALTER TABLE verification_results ADD COLUMN run_id TEXT REFERENCES verification_runs(id) ON DELETE CASCADE;');
    }
    if (!vrCols.includes('submission_id')) {
      db.exec('ALTER TABLE verification_results ADD COLUMN submission_id TEXT REFERENCES code_submissions(id) ON DELETE SET NULL;');
    }
    if (!vrCols.includes('criteria_assessment')) {
      db.exec('ALTER TABLE verification_results ADD COLUMN criteria_assessment TEXT;');
    }
    if (!vrCols.includes('contradicting_evidence')) {
      db.exec('ALTER TABLE verification_results ADD COLUMN contradicting_evidence TEXT;');
    }
    if (!vrCols.includes('model_name')) {
      db.exec('ALTER TABLE verification_results ADD COLUMN model_name TEXT;');
    }
    if (!vrCols.includes('analysis_version')) {
      db.exec('ALTER TABLE verification_results ADD COLUMN analysis_version TEXT;');
    }
    if (!vrCols.includes('method')) {
      db.exec("ALTER TABLE verification_results ADD COLUMN method TEXT DEFAULT 'AI';");
    }
    if (!vrCols.includes('fallback_reason')) {
      db.exec('ALTER TABLE verification_results ADD COLUMN fallback_reason TEXT;');
    }
    if (!vrCols.includes('carried_over_from_result_id')) {
      db.exec('ALTER TABLE verification_results ADD COLUMN carried_over_from_result_id TEXT REFERENCES verification_results(id) ON DELETE SET NULL;');
    }
  }

  if (tableNames.includes('verification_reports')) {
    const repCols = db.prepare('PRAGMA table_info(verification_reports)').all().map(c => c.name);
    if (!repCols.includes('verification_run_id')) {
      db.exec('ALTER TABLE verification_reports ADD COLUMN verification_run_id TEXT REFERENCES verification_runs(id) ON DELETE SET NULL;');
    }
    if (!repCols.includes('report_name')) {
      db.exec('ALTER TABLE verification_reports ADD COLUMN report_name TEXT;');
    }
    if (!repCols.includes('storage_key')) {
      db.exec('ALTER TABLE verification_reports ADD COLUMN storage_key TEXT;');
    }
    if (!repCols.includes('report_sha256')) {
      db.exec('ALTER TABLE verification_reports ADD COLUMN report_sha256 TEXT;');
    }
    if (!repCols.includes('file_size')) {
      db.exec('ALTER TABLE verification_reports ADD COLUMN file_size INTEGER DEFAULT 0;');
    }
    if (!repCols.includes('report_version')) {
      db.exec("ALTER TABLE verification_reports ADD COLUMN report_version TEXT DEFAULT '1.0.0';");
    }
    if (!repCols.includes('metadata_json')) {
      db.exec('ALTER TABLE verification_reports ADD COLUMN metadata_json TEXT;');
    }
  }

  // Create jobs table if missing
  db.exec(`CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    payload_json TEXT,
    status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
    progress_done INTEGER DEFAULT 0,
    progress_total INTEGER DEFAULT 0,
    current_label TEXT,
    error_message TEXT,
    cancel_requested INTEGER DEFAULT 0,
    metadata_json TEXT,
    created_at TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    heartbeat_at TEXT
  );`);

  if (tableNames.includes('jobs')) {
    const jobCols = db.prepare('PRAGMA table_info(jobs)').all().map(c => c.name);
    if (!jobCols.includes('cancel_requested')) {
      db.exec('ALTER TABLE jobs ADD COLUMN cancel_requested INTEGER DEFAULT 0;');
    }
    if (!jobCols.includes('metadata_json')) {
      db.exec('ALTER TABLE jobs ADD COLUMN metadata_json TEXT;');
    }
    if (!jobCols.includes('current_label')) {
      db.exec('ALTER TABLE jobs ADD COLUMN current_label TEXT;');
    }
    if (!jobCols.includes('heartbeat_at')) {
      db.exec('ALTER TABLE jobs ADD COLUMN heartbeat_at TEXT;');
    }
  }

  // Create ai_cache table if missing
  db.exec(`CREATE TABLE IF NOT EXISTS ai_cache (
    cache_key TEXT PRIMARY KEY,
    purpose TEXT NOT NULL,
    model_name TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    hit_count INTEGER DEFAULT 0,
    last_hit_at TEXT
  );`);

  if (tableNames.includes('ai_cache')) {
    const cacheCols = db.prepare('PRAGMA table_info(ai_cache)').all().map(c => c.name);
    if (!cacheCols.includes('hit_count')) {
      db.exec('ALTER TABLE ai_cache ADD COLUMN hit_count INTEGER DEFAULT 0;');
    }
    if (!cacheCols.includes('last_hit_at')) {
      db.exec('ALTER TABLE ai_cache ADD COLUMN last_hit_at TEXT;');
    }
  }

  // Create result_overrides table if missing
  db.exec(`CREATE TABLE IF NOT EXISTS result_overrides (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    run_id TEXT NOT NULL REFERENCES verification_runs(id) ON DELETE CASCADE,
    result_id TEXT NOT NULL REFERENCES verification_results(id) ON DELETE CASCADE,
    requirement_id TEXT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
    previous_status TEXT NOT NULL,
    new_status TEXT NOT NULL CHECK (new_status IN ('VERIFIED', 'PARTIALLY_IMPLEMENTED', 'NOT_IMPLEMENTED', 'UNVERIFIED')),
    reason TEXT NOT NULL,
    reviewer_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    revoked_at TEXT,
    revoked_by TEXT,
    revoke_reason TEXT
  );`);

  // Ensure indexes for code submissions, evidence, runs, reports, jobs, ai_cache, and result_overrides
  db.exec('CREATE INDEX IF NOT EXISTS idx_code_submissions_project ON code_submissions(project_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_code_files_sub ON code_files(submission_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_evidence_submission ON code_evidence(submission_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_evidence_type ON code_evidence(evidence_type);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_verification_runs_proj ON verification_runs(project_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_verification_runs_base ON verification_runs(base_run_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_verification_run_id ON verification_results(run_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_verification_status ON verification_results(status);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_verification_reports_proj ON verification_reports(project_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_verification_reports_run ON verification_reports(verification_run_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_project_status ON jobs(project_id, status);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs(status, created_at);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_ai_cache_purpose ON ai_cache(purpose);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_result_overrides_res ON result_overrides(result_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_result_overrides_run ON result_overrides(run_id);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_result_overrides_proj ON result_overrides(project_id);');
}

/**
 * Run a SELECT query returning all matching rows as an array of objects.
 * @param {string} sql
 * @param {Array} [params]
 * @returns {Array<Object>}
 */
export function queryAll(sql, params = []) {
  const db = getDb();
  const statement = db.prepare(sql);
  return statement.all(...params);
}

/**
 * Run a SELECT query returning a single row or undefined.
 * @param {string} sql
 * @param {Array} [params]
 * @returns {Object|undefined}
 */
export function queryOne(sql, params = []) {
  const db = getDb();
  const statement = db.prepare(sql);
  return statement.get(...params);
}

/**
 * Execute an INSERT, UPDATE, or DELETE statement.
 * @param {string} sql
 * @param {Array} [params]
 * @returns {{ changes: number, lastInsertRowid: number|bigint }}
 */
export function execute(sql, params = []) {
  const db = getDb();
  const statement = db.prepare(sql);
  return statement.run(...params);
}

/**
 * Run a sequence of operations inside an ACID transaction.
 * @param {Function} callback
 * @returns {*}
 */
export function transaction(callback) {
  const db = getDb();
  db.exec('BEGIN TRANSACTION;');
  try {
    const result = callback(db);
    db.exec('COMMIT;');
    return result;
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}

