# GENESIS

> **An Evidence‑Grounded AI Framework for Software Requirement Traceability and Implementation Verification**

## 📖 Project Overview
GENESIS is an academic research prototype and enterprise‑grade SaaS platform that bridges the gap between software specifications and their actual implementation.  Users upload a **Software Requirements Specification (SRS)** document (PDF or DOCX) and a **source‑code ZIP** archive.  The system:
1. Parses the SRS and extracts structured requirements via Gemini (or deterministic rules when AI is unavailable).
2. Statically analyses the uploaded code base, building deterministic **evidence** (file paths, line ranges, identifiers, code snippets).
3. Matches evidence to each requirement and runs a **grounded Gemini verification** that never hallucinates — every AI‑generated claim is cross‑checked against real evidence.
4. Degrades gracefully into a **deterministic Rules Mode** when Gemini is overloaded, misconfigured, or deliberately disabled — results are always labeled with their evaluation method.
5. Generates an **audit‑grade PDF report** containing a full traceability matrix, detailed rationale, evaluation method breakdown, and reproducibility metadata.

All phases are implemented in pure **JavaScript (ESM)** on **Next.js 14 (App Router)**, using **SQLite** for persistence and a **modular storage abstraction** that currently stores files locally but can be swapped for cloud object storage.

---

## 🗂️ Phase‑by‑Phase Summary
| Phase | Description | Status |
|------|-------------|--------|
| **Phase 1** | Core foundation — project CRUD, dashboard, SQLite + WAL, modular storage, UI shell | ✅ Completed & Verified |
| **Phase 2** | SRS ingestion, PDF/DOCX parsing, Gemini requirement extraction, review & approval workflow | ✅ Completed & Verified |
| **Phase 3** | Secure ZIP upload, extraction sandbox, multi‑language static analysis, evidence indexing, submission versioning | ✅ Completed & Verified |
| **Phase 4** | Deterministic evidence matching, grounded Gemini verification, 4‑status audit model, traceability matrix UI | ✅ Completed & Verified |
| **Phase 5** | PDF report generation (`pdf‑lib`), secure binary download API, report history UI, deployment readiness, full regression test suite | ✅ Completed & Verified |
| **Phase 6** | AI Resilience & Rules Mode — circuit breaker, deterministic rules fallback, AI gateway, kill switch, method labeling everywhere | ✅ Completed & Verified |
| **Phase 7** | Durable Jobs, AI Result Cache & Rules→AI Upgrade | ✅ Completed & Verified |
| **Phase 8** | Human Overrides with Audit Trail & Run Comparison | ✅ Completed & Verified |

---

## 🛠️ Technology Stack
| Layer | Choice | Rationale |
|------|--------|-----------| 
| **Framework** | Next.js 14 (App Router) | Server‑side routing, API handlers, React SSR |
| **Language** | JavaScript (ESM) | Spec explicitly prohibits TypeScript |
| **Styling** | Tailwind CSS 3.4 | Fast utility‑first design, enterprise palette |
| **Icons** | Lucide React | Consistent, accessible SVG icons |
| **AI SDK** | `@google/genai` (Gemini 2.0 Flash) | Official Google GenAI client, server‑only usage |
| **Database** | `node:sqlite` (`DatabaseSync`) | Zero‑config, WAL mode, foreign‑key enforcement |
| **Storage** | `LocalDiskStorage` (modular `StorageInterface`) | Simple local dev storage, ready for S3/R2 adapters |
| **PDF Generation** | `pdf-lib` | Pure‑JS binary PDF creation, no native deps |
| **Archive Handling** | `jszip` | Magic‑byte validation, ZIP‑Slip & bomb defenses |
| **Static Analysis** | `@babel/parser` (JS/JSX) + heuristic regex for Python/Java/SQL/HTML | AST‑based precision where possible |
| **Document Parsing** | `pdf-parse` + `mammoth` | Reliable PDF & DOCX text extraction |

---

## 📂 Repository Layout
```
GENESIS/
├─ .env.example               # env template (Gemini API key, AI gateway limits)
├─ jsconfig.json              # path alias @/* → ./src/*
├─ next.config.mjs            # Next.js config, external packages
├─ package.json               # deps & npm scripts
├─ README.md                  # **this file**
├─ PROJECT_STATUS.md          # living status & next‑step tracker
├─ tests/                     # automated test suites (phases 1–8)
│   ├─ test-phase1.mjs        # Phase 1 — 5 tests
│   ├─ test-phase2.mjs        # Phase 2 — 18 tests
│   ├─ test-phase3.mjs        # Phase 3 — 40 tests
│   ├─ test-phase4.mjs        # Phase 4 — 39 tests
│   ├─ test-phase5.mjs        # Phase 5 — 38 tests
│   ├─ test-phase6.mjs        # Phase 6 — 14 tests (AI gateway & rules mode)
│   ├─ test-phase7.mjs        # Phase 7 — 14 tests (durable jobs, AI cache & upgrade)
│   ├─ test-phase8.mjs        # Phase 8 — 9 tests (human overrides, audit trail & run comparison)
│   ├─ test-server-probe.mjs
│   ├─ test-server-probe-p2.mjs
│   ├─ test-server-probe-p3.mjs
│   ├─ test-server-probe-p4.mjs
│   ├─ test-server-probe-p5.mjs
│   ├─ test-server-probe-p6.mjs  # Phase 6 live probe (run with AI_FORCE_RULES_MODE=true)
│   └─ test-server-probe-p7.mjs  # Phase 7 live probe (jobs, cache & upgrade pipeline)
├─ data/                      # git‑ignored runtime data
│   ├─ genesis.sqlite
│   ├─ storage/               # uploaded SRS, ZIPs, PDFs
│   └─ extractions/           # temporary sandbox workspaces
└─ src/
    ├─ app/                   # Next.js pages & API routes
    ├─ components/            # React UI components (layout, cards, modals)
    └─ lib/                   # core libraries
        ├─ ai/
            │   ├─ config.js      # single source of truth for all AI env vars & thresholds
            │   ├─ constants.js   # zero-dependency client/server shared categories & priorities
            │   ├─ cache.js       # SHA-256 AI response caching with deterministic candidate normalization
            │   ├─ gateway.js     # circuit breaker, rate limiter, model fallback chain, AbortSignal timeout
            │   └─ gemini.js      # Gemini extraction — routes through gateway
        ├─ code/…             # ZIP validator, extractor, analyzers
        ├─ db/…               # DB singleton & migrations
        ├─ document/
        │   ├─ parser.js
        │   └─ ruleExtractor.js  # deterministic SRS requirement extractor (AI fallback)
        ├─ jobs/
        │   ├─ jobQueue.js       # SQLite-backed job queue, state transitions, SSE event broadcasting
        │   └─ jobWorker.js      # in-process worker singleton, crash recovery, cooperative cancellation
        ├─ report/
        │   ├─ pdfGenerator.js
        │   └─ reportService.js
        ├─ storage/…
        └─ verification/
            ├─ effectiveStatus.js  # override resolution, ranking, run comparison & effective summary
            ├─ evidenceMatcher.js
            ├─ geminiVerifier.js
            ├─ runOrchestrator.js
            └─ rules/
                ├─ ruleCatalog.js       # 16 deterministic verification rules
                └─ ruleBasedVerifier.js # never NOT_IMPLEMENTED, confidence ≤ 0.65
```

---

## 📊 Database Overview (12 Tables)
1. **projects** — project metadata (name, description, timestamps).
2. **srs_documents** — uploaded SRS files & extracted text. *(+ `extraction_method` column)*
3. **requirements** — AI‑extracted rows, categories, priorities, approval status. *(+ `extraction_method` column)*
4. **code_submissions** — uploaded ZIP metadata, language breakdown, active flag.
5. **code_files** — discovered source files with language & hash.
6. **code_evidence** — concrete evidence records (file, line range, identifier, snippet).
7. **verification_runs** — each run links a project, SRS version, submission, model used. *(+ `ai_mode`, `ai_count`, `rules_count`, `base_run_id` lineage columns)*
8. **verification_results** — requirement‑level outcomes (VERIFIED, PARTIALLY_IMPLEMENTED, NOT_IMPLEMENTED, UNVERIFIED). *(+ `method`, `fallback_reason`, `carried_over_from_result_id` columns)*
9. **verification_reports** — persisted PDF reports, storage key, SHA‑256 checksum, version, JSON summary.
10. **jobs** — durable background task queue for verification runs with status (`QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED`), progress tracking, heartbeat timestamp, and cooperative cancellation flag.
11. **ai_cache** — SHA-256 hashed prompt/criteria cache storing validated AI responses, model name, prompt template version, hit count, and access timestamps.
12. **result_overrides** — permanent audit log of manual auditor adjustments (previous status, new status, mandatory justification reason, reviewer name, timestamp, and optional revocation metadata).

---

## 🚀 Installation & Setup
### Prerequisites
- **Node.js** ≥ 22 (Node 23 recommended)
- **npm** ≥ 10
- **Windows/macOS/Linux** — local dev works on any OS.

### Steps
```bash
# Clone / navigate
cd C:\Users\shres.SHRESTH\Downloads\GENESIS

# Install deps
npm install

# Create env file
cp .env.example .env.local
# Edit .env.local — set your Gemini API key
#   GEMINI_API_KEY=xxxxxxxx
#   GEMINI_MODEL=gemini-2.0-flash

# Run the full test suite (all six phases — 154 tests)
npm test

# Start dev server
npm run dev
# Open http://localhost:3000 in a browser
```

---

## 🛡️ Phase 6: AI Resilience & Rules Mode

GENESIS stays fully useful when Gemini is overloaded (503/429), slow, misconfigured, or deliberately disabled. Instead of producing empty `UNVERIFIED` rows, it degrades into a **deterministic Rules Mode** that is completely honest about what it is.

### New Environment Variables

All variables are documented in `.env.example`.

| Variable | Default | Description |
|---|---|---|
| `GEMINI_FALLBACK_MODELS` | *(empty)* | Comma-separated fallback model IDs tried in order if the primary model fails |
| `AI_MAX_CONCURRENCY` | `2` | Maximum simultaneous Gemini API calls |
| `AI_RPM` | `10` | Token-bucket rate limit (requests per minute) |
| `AI_CALL_TIMEOUT_MS` | `45000` | Per-call AbortSignal timeout in milliseconds |
| `AI_BREAKER_THRESHOLD` | `5` | Consecutive retryable failures before the circuit breaker opens |
| `AI_BREAKER_COOLDOWN_MS` | `60000` | Time (ms) the breaker stays OPEN before attempting HALF_OPEN recovery |
| `AI_FORCE_RULES_MODE` | `false` | Kill switch — set `true` to disable AI entirely and force rules mode |

### Circuit Breaker States

| State | Behaviour |
|---|---|
| `CLOSED` | Normal — AI calls proceed through the gateway |
| `OPEN` | Tripped — all AI calls short-circuit instantly with zero network calls; rules verifier handles all requirements |
| `HALF_OPEN` | Recovery probe — one test call attempted; success → CLOSED, failure → OPEN |

Only **retryable errors** (503, 429, network errors, timeouts) count toward the threshold.  
Auth errors (401/403), bad requests (400), and model-not-found (404) do **not** trigger the breaker.

### Rules Mode Policy (Integrity Constraints — never violated)

- Rules mode **never** returns `NOT_IMPLEMENTED`. Absence of a keyword match does not prove absence of implementation.
- Rules mode `VERIFIED` requires **≥ 2 independent evidence items** AND **≥ 75% criteria coverage** AND **no stub-only evidence**.
- Confidence is **capped at 0.65** for all rules-mode results.
- Every rules-mode result is labeled with `method: 'RULES'` and a `fallbackReason` **everywhere** it appears — database, API responses, matrix UI, PDF report.
- Limitations text always states: *"Not AI-reviewed; re-run with AI when available."*
- Evidence IDs in any result come **exclusively** from the retrieved candidate set. Nothing is fabricated.

### How to Force Rules Mode (testing / AI-down scenarios)

```bash
# In .env.local
AI_FORCE_RULES_MODE=true

# Or inline (macOS / Linux bash)
AI_FORCE_RULES_MODE=true npm run dev

# Or inline (Windows PowerShell)
$env:AI_FORCE_RULES_MODE="true"; npm run dev
```

### AI Status API

`GET /api/health` now returns an `ai` object alongside the standard health fields:

```json
{
  "status": "ok",
  "ai": {
    "mode": "LIVE",
    "breakerState": "CLOSED",
    "isConfigured": true
  }
}
```

Possible `mode` values: `LIVE` | `RULES_ONLY` | `NOT_CONFIGURED`  
Possible `breakerState` values: `CLOSED` | `OPEN` | `HALF_OPEN`

### Global UI Banner

When `mode !== 'LIVE'`, an amber banner is displayed at the top of every page:

> *"AI is under high load — running in rules mode. Results are labeled and can be re-verified with AI later."*

The banner polls `/api/health` every 30 seconds and disappears automatically when AI recovers.

---

## ⚙️ Phase 7: Durable Jobs, AI Cache & Upgrade

### Durable Background Job System (`src/lib/jobs/`)
Verification runs no longer require a single client HTTP request to stay open across tens of requirements. Long-running verification runs are delegated to a SQLite-backed asynchronous job worker:
- **Job Lifecycle States:** `QUEUED` → `RUNNING` → `SUCCEEDED` / `FAILED` / `CANCELLED`.
- **Project Isolation:** Enforces strictly **one active job per project at a time** (returns 409 Conflict if another verification is already running).
- **Concurrency & Inline Execution:**
  - `JOB_MAX_CONCURRENCY` (default: `1`): Bounds maximum concurrent worker threads across all projects.
  - `JOBS_INLINE` (default: `false`): When set to `true` (or when `?inline=true` query param is provided), verification runs synchronously within the request lifecycle. This preserves zero-latency synchronous testing for automated test suites and CLI probes.
- **Crash Safety & Stale Job Recovery:** On system startup/worker boot, any jobs left in `RUNNING` with expired heartbeats (>60s stale) are automatically identified and safely marked `FAILED`, while orphaned verification runs are finalized.
- **Cooperative Cancellation:** Users can cancel an active run mid-flight via UI or API. The orchestrator checks cancellation flags between individual requirement evaluations, immediately halting further AI calls and finalizing the run as `CANCELLED` while preserving all already-completed results.

### Job API Endpoints
- `GET /api/projects/[id]/jobs/[jobId]` — Returns job state, progress percentage, current requirement label, error details, and timestamps.
- `POST /api/projects/[id]/jobs/[jobId]/cancel` — Signals cancellation for an in-flight or queued job.
- `GET /api/projects/[id]/jobs/[jobId]/events` — Server-Sent Events (SSE) stream for real-time live progress updates with automatic polling fallback; cleans up client listeners immediately on disconnect.
- `GET /api/projects/[id]/jobs/active` — Detects currently active background jobs for a project upon navigating to the matrix page.
- `POST /api/projects/[id]/verification` — Enqueues the verification task and immediately returns `202 Accepted` with `{ jobId, runId }`.

### AI Result Cache (`src/lib/ai/cache.js`)
Prevents paying twice for identical requirements evaluated against the same evidence set:
- **Deterministic Cache Key:** Computes a SHA-256 hash across:
  - Project SRS requirement text, category, and parsed criteria.
  - Candidate code evidence coordinates (file path, line ranges, identifier, and snippet content hash) — sorted deterministically and independent of volatile database IDs.
  - Gemini model name and prompt template version (`PROMPT_TEMPLATE_VERSION = '1.0.0'`).
- **Strict Integrity Cache Policy:**
  - Only valid, schema-compliant `AI` verification outcomes are stored.
  - **NEVER caches** `RULES` mode results or `AI_ERROR` outputs.
  - Cached hits are re-validated through the hallucination filter before acceptance, guaranteeing zero fabricated evidence IDs even from cache.
- **Cache Environment Controls:**
  - `AI_CACHE_ENABLED` (default: `true`): Enable or disable the caching layer.
  - `AI_CACHE_TTL_DAYS` (default: `30`): Automatic expiration TTL for cached verification judgments.

### RULES → AI Upgrade Mechanism
Allows projects verified during AI degradation (e.g. Gemini outages or high traffic) to be elevated to full AI evaluation later without discarding historical audit trails:
- `POST /api/projects/[id]/verification/[runId]/upgrade` — Initiates an upgrade job targeting an existing degraded run.
- **Append-Only Run Lineage:** Creates a **new** verification run linked to the original via `base_run_id` (original run is never modified or deleted).
- **Carry-Over of AI Results:** Any requirements already verified by `AI` are copied directly into the new run with `carried_over_from_result_id`, avoiding unnecessary re-computation.
- **Selective Evaluation:** Only requirements marked `RULES` or `AI_ERROR` are dispatched to Gemini for fresh AI verification.
- **Guard:** If AI is currently in `RULES_ONLY` mode or killed via `AI_FORCE_RULES_MODE`, upgrade requests are refused immediately with an explanatory error.
- **UI & PDF Visibility:** The Traceability Matrix UI and exported PDF reports display run lineage (`Upgraded from Run #...`) and highlight carried-over AI results.

---

## ⚖️ Phase 8: Human Overrides with Audit Trail & Run Comparison

### Human Review & Immutable Override Policy
To satisfy enterprise audit requirements, compliance engineers and lead auditors can manually review and override verification outcomes without compromising scientific integrity:
- **Zero In-Place Mutation:** Original rows in `verification_results` are **never modified** by an override. The AI/rules evaluation constitutes primary evidentiary record and remains immutable.
- **Append-Only Audit Trail (`result_overrides`):** Every manual adjustment creates a new row with:
  - `id`, `project_id`, `run_id`, `result_id`, `requirement_id`
  - `previous_status` (status before this override was applied)
  - `new_status` (`VERIFIED`, `PARTIALLY_IMPLEMENTED`, `NOT_IMPLEMENTED`, `UNVERIFIED`)
  - `reason` (mandatory technical rationale, 20–1000 characters)
  - `reviewer_name` (auditor identity, 2–60 characters)
  - `created_at` timestamp
- **Non-Destructive Revocation:** Overrides are never deleted. Revoking an override marks the record with `revoked_at`, `revoked_by`, and `revoke_reason`, causing the effective status to safely revert to the previous active override or the original automated result.
- **Active Job Guard:** Manual overrides cannot be created while a verification job is currently running on the project.
- **Upgrade Carry-Over:** When degraded runs are upgraded to AI, active overrides on carried-over results are duplicated onto the new run with lineage note `[Carried over from run ...]`. Re-evaluated results receive no override.

### Endpoints (Phase 8)
- `POST /api/projects/[id]/verification/[runId]/results/[resultId]/override` — Create an override.
- `POST /api/projects/[id]/verification/[runId]/results/[resultId]/override/revoke` — Revoke active override with reason.
- `GET /api/projects/[id]/verification/[runId]/results/[resultId]/overrides` — Full history of overrides for a single result.
- `GET /api/projects/[id]/verification/[runId]/overrides` — Run-level audit log across all requirements.
- `GET /api/projects/[id]/verification/compare?base=<runId>&head=<runId>` — Compare two completed runs within the project.

### Run Comparison Engine (`src/lib/verification/effectiveStatus.js`)
Enables regression testing and release auditing by diffing two completed runs using their **effective statuses**:
- **Strict Transition Matrix:**
  - Rank hierarchy: `VERIFIED` (3) > `PARTIALLY_IMPLEMENTED` (2) > `NOT_IMPLEMENTED` (1).
  - Higher rank in head = `IMPROVED`.
  - Lower rank in head = `REGRESSED` (listed first in UI).
  - Identical status = `UNCHANGED`.
  - Any transition involving `UNVERIFIED` (e.g. `UNVERIFIED` → `VERIFIED` or `VERIFIED` → `UNVERIFIED`) is classified as `CHANGED_UNKNOWN` (loss or gain of certainty, never counted as improvement or regression).
  - Requirement in head but not base = `ADDED`; in base but not head = `REMOVED`.
- **Confidence & Method Deltas:** Computes `confidence_delta` and detects `method_changed` (e.g. `RULES` → `AI`).
- **Context Warnings:** Prominently alerts auditors when comparing runs evaluated against different SRS revisions, different code archives, or containing rules-mode fallbacks.

---

## 📦 Production Build & Deployment
```bash
npm run build   # creates .next output
npm start       # start the compiled server
```
**Deployment considerations**
| Concern | Local (dev) | Production recommendation |
|---------|-------------|---------------------------|
| Database | SQLite file (`./data/genesis.sqlite`) | Managed PostgreSQL / MySQL / Turso |
| Storage | `./data/storage` (local disk) | Cloud object storage (S3, R2, GCS) — just swap the `StorageInterface` implementation |
| Filesystem | Writable, persistent | In serverless environments use `/tmp` for temporary workspaces and a cloud storage adapter for permanent assets |
| AI Resilience | Single-process circuit breaker (in-memory) | For multi-instance: back the rate limiter and breaker state with Redis |

---

## 🛡️ Security & Academic‑Integrity Principles
1. **Zero untrusted execution** — uploaded code is never executed; only static analysis runs.
2. **Evidence‑grounded AI** — Gemini receives only deterministic evidence IDs; any hallucinated ID is stripped.
3. **Rules mode integrity** — deterministic verifier only references evidence IDs from the retrieved candidate set; nothing is fabricated.
4. **ZIP‑Slip & Bomb defenses** — strict path normalization, entry count limits, size caps.
5. **Credential confidentiality** — Gemini API key never leaves the server; never logged or returned in API responses.
6. **Historical immutability** — all runs, evidence, and reports are append‑only; nothing is overwritten.

---

## 📈 Known Limitations
- Scanned‑image PDFs require OCR — not included.
- Dynamic runtime constructs (`eval`, reflection) cannot be resolved statically.
- Full AST support exists only for JavaScript/JSX; other languages rely on heuristics.
- Reviewer identities in human overrides are self-declared (no authentication/RBAC).
- For serverless deployments, local disk persistence must be replaced with cloud storage adapters.
- **Rules Mode** is a structural heuristic, not AI reasoning. Confidence is capped at 0.65. Always re-verify with Gemini AI when it becomes available.
- The in-memory circuit breaker resets on process restart; for multi-instance production deployments, back it with Redis.

---

## 📅 Next Steps & Future Enhancements
| Area | Planned Work |
|------|--------------|
| **Second AI Provider** | Modular AI client abstraction supporting Anthropic Claude and OpenAI fallback alongside Gemini. |
| **GitHub Repo Import** | Ingest source code repositories directly via GitHub API and webhooks in addition to ZIP archives. |
| **CSV / Jira Export** | Bidirectional synchronization exporting verification matrix results to Jira issues and CSV audit spreadsheets. |
| **Cloud‑Ready Storage** | Implement `S3Storage` and `R2Storage` adapters, add configuration flag `STORAGE_PROVIDER`. |
| **Database Migration** | Provide migration scripts for moving from SQLite to PostgreSQL/MySQL/Turso. |
| **Enhanced Language Coverage** | Integrate full parsers for Python (`ast` via `pyodide`?) and Java (via `java-parser`). |
| **CI/CD Pipeline** | GitHub Actions workflow: lint → test → build → Docker image publish. |

---

## 📚 Additional Resources
- **API Reference** — See `README.md` → *Complete API Reference* section for all endpoints.
- **Architecture Diagram** — Located in `docs/architecture.svg` (not version‑controlled, generate with `npm run diagram`).
- **Academic Paper** — *GENESIS: An Evidence‑Grounded AI Framework* (PDF in `papers/GENESIS.pdf`).

---

*All code is open‑source under the MIT License. Contributions are welcome via pull requests.*
