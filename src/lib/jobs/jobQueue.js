import crypto from 'node:crypto';
import EventEmitter from 'node:events';
import { queryOne, queryAll, execute, transaction } from '../db/index.js';

// Global EventEmitter for real-time Server-Sent Events (SSE)
if (!globalThis.__genesisJobEventEmitter) {
  globalThis.__genesisJobEventEmitter = new EventEmitter();
  globalThis.__genesisJobEventEmitter.setMaxListeners(200);
}

export const jobEvents = globalThis.__genesisJobEventEmitter;

/**
 * Emits an event for a specific job ID.
 */
export function emitJobEvent(jobId, eventData) {
  try {
    jobEvents.emit(`job:${jobId}`, eventData);
  } catch (err) {
    console.error(`Failed to emit job event for ${jobId}:`, err);
  }
}

/**
 * Subscribes to events for a specific job ID.
 * Returns an unsubscribe cleanup function.
 */
export function subscribeJobEvents(jobId, callback) {
  const channel = `job:${jobId}`;
  jobEvents.on(channel, callback);
  return () => {
    jobEvents.off(channel, callback);
  };
}

/**
 * Checks if a project currently has an active (QUEUED or RUNNING) job.
 */
export function getActiveJobForProject(projectId) {
  const row = queryOne(
    `SELECT * FROM jobs 
     WHERE project_id = ? AND status IN ('QUEUED', 'RUNNING')
     ORDER BY created_at DESC LIMIT 1`,
    [projectId]
  );
  if (!row) return null;
  return formatJobRow(row);
}

/**
 * Enqueues a new background job.
 * Enforces one job per project at a time.
 *
 * @param {Object} params
 * @param {string} params.type - 'VERIFICATION_RUN' | 'VERIFICATION_UPGRADE'
 * @param {string} params.projectId
 * @param {Object} [params.payload={}]
 * @param {Object} [params.metadata={}]
 * @returns {Object} Enqueued job record
 */
export function enqueueJob({ type, projectId, payload = {}, metadata = {} }) {
  if (!type || !projectId) {
    throw new Error('Both type and projectId are required to enqueue a job.');
  }

  // 1. One job per project at a time guard
  const activeJob = getActiveJobForProject(projectId);
  if (activeJob) {
    const err = new Error(
      `Project already has an active job (${activeJob.id}, status: ${activeJob.status}). Please wait for it to complete or cancel it.`
    );
    err.code = 'JOB_ALREADY_ACTIVE';
    err.status = 409;
    err.activeJob = activeJob;
    throw err;
  }

  const jobId = `job_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
  const now = new Date().toISOString();

  execute(
    `INSERT INTO jobs (
      id, type, project_id, payload_json, status,
      progress_done, progress_total, current_label, error_message,
      cancel_requested, metadata_json, created_at, started_at, finished_at, heartbeat_at
    ) VALUES (?, ?, ?, ?, 'QUEUED', 0, 0, 'Queued in background', NULL, 0, ?, ?, NULL, NULL, ?)`,
    [
      jobId,
      type,
      projectId,
      JSON.stringify(payload),
      JSON.stringify(metadata),
      now,
      now,
    ]
  );

  const job = getJob(jobId);
  emitJobEvent(jobId, { event: 'queued', job });

  // Lazily trigger the job worker
  triggerWorkerTick();

  return job;
}

/**
 * Retrieves a single job by ID.
 */
export function getJob(jobId) {
  const row = queryOne(`SELECT * FROM jobs WHERE id = ?`, [jobId]);
  if (!row) return null;
  return formatJobRow(row);
}

/**
 * Updates progress and heartbeat of an active job.
 */
export function updateJobProgress(jobId, { done, total, label, metadata = null }) {
  const now = new Date().toISOString();
  const current = getJob(jobId);
  if (!current) return null;

  const newDone = done !== undefined ? done : current.progressDone;
  const newTotal = total !== undefined ? total : current.progressTotal;
  const newLabel = label !== undefined ? label : current.currentLabel;
  const mergedMeta = metadata
    ? JSON.stringify({ ...current.metadata, ...metadata })
    : JSON.stringify(current.metadata);

  execute(
    `UPDATE jobs
     SET progress_done = ?,
         progress_total = ?,
         current_label = ?,
         metadata_json = ?,
         heartbeat_at = ?
     WHERE id = ?`,
    [newDone, newTotal, newLabel, mergedMeta, now, jobId]
  );

  const updated = getJob(jobId);
  emitJobEvent(jobId, { event: 'progress', job: updated });
  return updated;
}

/**
 * Requests cooperative cancellation of an active or queued job.
 */
export function requestJobCancellation(jobId) {
  const job = getJob(jobId);
  if (!job) {
    throw new Error(`Job "${jobId}" not found.`);
  }

  if (job.status === 'SUCCEEDED' || job.status === 'FAILED' || job.status === 'CANCELLED') {
    return job; // already in terminal state
  }

  const now = new Date().toISOString();

  if (job.status === 'QUEUED') {
    // If still queued, immediately cancel
    execute(
      `UPDATE jobs
       SET status = 'CANCELLED',
           cancel_requested = 1,
           error_message = 'Job cancelled before execution started.',
           finished_at = ?
       WHERE id = ?`,
      [now, jobId]
    );
  } else {
    // If RUNNING, set flag for cooperative cooperative cancellation
    execute(`UPDATE jobs SET cancel_requested = 1 WHERE id = ?`, [jobId]);
  }

  const updated = getJob(jobId);
  emitJobEvent(jobId, { event: 'cancellation_requested', job: updated });
  return updated;
}

/**
 * Checks if cancellation was requested for a job.
 */
export function isJobCancelled(jobId) {
  const row = queryOne(`SELECT cancel_requested, status FROM jobs WHERE id = ?`, [jobId]);
  if (!row) return true;
  return Boolean(row.cancel_requested) || row.status === 'CANCELLED';
}

/**
 * Formats raw SQLite job row into camelCase API-safe object.
 */
export function formatJobRow(row) {
  let payload = {};
  let metadata = {};

  try {
    payload = row.payload_json ? JSON.parse(row.payload_json) : {};
  } catch {}

  try {
    metadata = row.metadata_json ? JSON.parse(row.metadata_json) : {};
  } catch {}

  return {
    id: row.id,
    type: row.type,
    projectId: row.project_id,
    status: row.status,
    progressDone: row.progress_done || 0,
    progressTotal: row.progress_total || 0,
    currentLabel: row.current_label || '',
    errorMessage: row.error_message || null,
    cancelRequested: Boolean(row.cancel_requested),
    payload,
    metadata,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    heartbeatAt: row.heartbeat_at,
  };
}

// Forward reference and lazy worker initialization to avoid circular dependencies
let workerTriggerFn = null;
let isWorkerInitializing = false;

export function registerWorkerTrigger(fn) {
  workerTriggerFn = fn;
}

/**
 * Ensures the background job worker singleton is initialized exactly once per server process.
 * Safe against concurrent invocations and circular imports.
 */
export async function ensureJobWorker() {
  if (globalThis.__genesisJobWorkerSingleton) {
    return globalThis.__genesisJobWorkerSingleton;
  }
  if (isWorkerInitializing) return;
  isWorkerInitializing = true;
  try {
    const workerModule = await import('./jobWorker.js');
    if (typeof workerModule.initializeJobWorker === 'function') {
      return workerModule.initializeJobWorker();
    }
  } catch (err) {
    console.error('[JobQueue] Failed to initialize job worker:', err);
  } finally {
    isWorkerInitializing = false;
  }
}

/**
 * Triggers an immediate worker tick. If the worker is not yet registered,
 * lazily initializes it and triggers processing.
 */
export function triggerWorkerTick() {
  if (typeof workerTriggerFn === 'function') {
    workerTriggerFn();
  } else {
    ensureJobWorker().then(() => {
      if (typeof workerTriggerFn === 'function') {
        workerTriggerFn();
      }
    });
  }
}

// Auto-initialize background worker when jobQueue module loads in server environment
if (typeof window === 'undefined') {
  ensureJobWorker().catch(() => {});
}

