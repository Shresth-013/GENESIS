-- GENESIS SQLite Database Schema
-- Academic Framework for Software Requirement Traceability and Implementation Verification

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  client_name TEXT,
  status TEXT NOT NULL DEFAULT 'CREATED',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS srs_documents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  extracted_text TEXT,
  page_count INTEGER DEFAULT 0,
  paragraph_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'UPLOADED',
  error_message TEXT,
  extraction_method TEXT DEFAULT 'AI',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS requirements (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  srs_document_id TEXT REFERENCES srs_documents(id) ON DELETE SET NULL,
  req_code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT DEFAULT 'FUNCTIONAL',
  priority TEXT DEFAULT 'MEDIUM',
  type TEXT DEFAULT 'FUNCTIONAL_REQUIREMENT',
  acceptance_criteria TEXT,
  source_reference TEXT,
  confidence TEXT DEFAULT 'HIGH',
  extraction_notes TEXT,
  extraction_method TEXT DEFAULT 'AI',
  approval_status TEXT NOT NULL DEFAULT 'PENDING',
  order_index INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS code_submissions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  archive_hash TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  total_files INTEGER DEFAULT 0,
  analyzed_files INTEGER DEFAULT 0,
  skipped_files INTEGER DEFAULT 0,
  total_lines INTEGER DEFAULT 0,
  evidence_count INTEGER DEFAULT 0,
  languages TEXT,
  analysis_summary TEXT,
  error_message TEXT,
  status TEXT NOT NULL DEFAULT 'UPLOADED',
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS code_files (
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
);

CREATE TABLE IF NOT EXISTS code_evidence (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES code_submissions(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  language TEXT,
  evidence_type TEXT NOT NULL,
  identifier TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  code_snippet TEXT,
  context_summary TEXT,
  analysis_method TEXT DEFAULT 'AST',
  confidence TEXT DEFAULT 'HIGH',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS verification_runs (
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
  base_run_id TEXT REFERENCES verification_runs(id) ON DELETE SET NULL,
  model_name TEXT,
  error_message TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS verification_results (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES verification_runs(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requirement_id TEXT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
  submission_id TEXT REFERENCES code_submissions(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK(status IN ('VERIFIED', 'PARTIALLY_IMPLEMENTED', 'NOT_IMPLEMENTED', 'UNVERIFIED')),
  confidence_score REAL DEFAULT 0.0,
  confidence_reason TEXT,
  ai_explanation TEXT NOT NULL,
  method TEXT DEFAULT 'AI',
  fallback_reason TEXT,
  carried_over_from_result_id TEXT REFERENCES verification_results(id) ON DELETE SET NULL,
  evidence_references TEXT,
  contradicting_evidence TEXT,
  criteria_assessment TEXT,
  limitations TEXT,
  model_name TEXT,
  analysis_version TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS verification_reports (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  verification_run_id TEXT REFERENCES verification_runs(id) ON DELETE SET NULL,
  report_name TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  report_path TEXT,
  report_sha256 TEXT,
  file_size INTEGER DEFAULT 0,
  report_version TEXT DEFAULT '1.0.0',
  summary_stats TEXT,
  metadata_json TEXT,
  generated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
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
);

CREATE TABLE IF NOT EXISTS ai_cache (
  cache_key TEXT PRIMARY KEY,
  purpose TEXT NOT NULL,
  model_name TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  hit_count INTEGER DEFAULT 0,
  last_hit_at TEXT
);

CREATE TABLE IF NOT EXISTS result_overrides (
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
);

CREATE INDEX IF NOT EXISTS idx_result_overrides_res ON result_overrides(result_id);
CREATE INDEX IF NOT EXISTS idx_result_overrides_run ON result_overrides(run_id);
CREATE INDEX IF NOT EXISTS idx_result_overrides_proj ON result_overrides(project_id);

CREATE INDEX IF NOT EXISTS idx_requirements_project ON requirements(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_requirements_proj_code ON requirements(project_id, req_code);
CREATE INDEX IF NOT EXISTS idx_requirements_doc ON requirements(srs_document_id);
CREATE INDEX IF NOT EXISTS idx_srs_project ON srs_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_code_submissions_project ON code_submissions(project_id);
CREATE INDEX IF NOT EXISTS idx_code_files_sub ON code_files(submission_id);
CREATE INDEX IF NOT EXISTS idx_evidence_project ON code_evidence(project_id);
CREATE INDEX IF NOT EXISTS idx_evidence_submission ON code_evidence(submission_id);
CREATE INDEX IF NOT EXISTS idx_evidence_type ON code_evidence(evidence_type);
CREATE INDEX IF NOT EXISTS idx_verification_runs_proj ON verification_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_verification_runs_base ON verification_runs(base_run_id);
CREATE INDEX IF NOT EXISTS idx_verification_project ON verification_results(project_id);
CREATE INDEX IF NOT EXISTS idx_verification_req ON verification_results(requirement_id);
CREATE INDEX IF NOT EXISTS idx_verification_run_id ON verification_results(run_id);
CREATE INDEX IF NOT EXISTS idx_verification_status ON verification_results(status);
CREATE INDEX IF NOT EXISTS idx_verification_reports_proj ON verification_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_verification_reports_run ON verification_reports(verification_run_id);
CREATE INDEX IF NOT EXISTS idx_jobs_project_status ON jobs(project_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_cache_purpose ON ai_cache(purpose);

