import { queryOne, queryAll, execute } from '../db/index.js';
import {
  getJob,
  formatJobRow,
  emitJobEvent,
  isJobCancelled,
  updateJobProgress,
  registerWorkerTrigger,
} from './jobQueue.js';

let isTickScheduled = false;
let isProcessing = false;

/**
 * Recovers stale jobs left in RUNNING state upon server boot or process restart.
 * Any job whose heartbeat is older than 60 seconds (or was in RUNNING on boot)
 * is cleanly marked FAILED, ensuring runs do not remain stuck in RUNNING.
 */
export function recoverStaleJobs() {
  try {
    const runningJobs = queryAll(`SELECT * FROM jobs WHERE status = 'RUNNING'`);
    const now = new Date().toISOString();

    for (const job of runningJobs) {
      console.warn(`[JobWorker] Recovering stale RUNNING job ${job.id} on project ${job.project_id}`);

      execute(
        `UPDATE jobs
         SET status = 'FAILED',
             error_message = 'Job terminated: server restart or stale heartbeat.',
             finished_at = ?
         WHERE id = ?`,
        [now, job.id]
      );

      emitJobEvent(job.id, {
        event: 'failed',
        job: getJob(job.id),
        error: 'Job terminated: server restart or stale heartbeat.',
      });

      // Also recover associated verification run if it was left in RUNNING
      let metadata = {};
      try {
        metadata = job.metadata_json ? JSON.parse(job.metadata_json) : {};
      } catch {}

      if (metadata.runId) {
        execute(
          `UPDATE verification_runs
           SET status = 'FAILED',
               error_message = 'Verification process terminated unexpectedly (worker restart).',
               completed_at = ?
           WHERE id = ? AND status = 'RUNNING'`,
          [now, metadata.runId]
        );
      }
    }
  } catch (err) {
    console.error('[JobWorker] Error recovering stale jobs:', err);
  }
}

/**
 * Gets configured max concurrency (default 1).
 */
function getMaxConcurrency() {
  const val = parseInt(process.env.JOB_MAX_CONCURRENCY, 10);
  return isNaN(val) || val <= 0 ? 1 : val;
}

/**
 * Main worker tick loop.
 * Evaluates queue, honors project-level serialization, and respects global concurrency.
 */
export async function workerTick() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const maxConcurrency = getMaxConcurrency();

    // Count currently running jobs
    const runningCountRow = queryOne(`SELECT COUNT(*) as count FROM jobs WHERE status = 'RUNNING'`);
    const runningCount = runningCountRow?.count || 0;

    const availableSlots = Math.max(0, maxConcurrency - runningCount);
    if (availableSlots <= 0) {
      return;
    }

    // Pick next QUEUED jobs where no job is already RUNNING for the same project
    const nextJobs = queryAll(
      `SELECT j.* FROM jobs j
       WHERE j.status = 'QUEUED'
         AND NOT EXISTS (
           SELECT 1 FROM jobs r 
           WHERE r.project_id = j.project_id AND r.status = 'RUNNING'
         )
       ORDER BY j.created_at ASC
       LIMIT ?`,
      [availableSlots]
    );

    for (const rawJob of nextJobs) {
      // Start job execution asynchronously (fire and manage)
      executeJob(rawJob).catch((err) => {
        console.error(`[JobWorker] Unhandled error in job ${rawJob.id}:`, err);
      });
    }
  } catch (err) {
    console.error('[JobWorker] Error in worker tick:', err);
  } finally {
    isProcessing = false;
  }
}

/**
 * Executes a single job to completion or cooperative cancellation.
 */
async function executeJob(rawJob) {
  const jobId = rawJob.id;
  const projectId = rawJob.project_id;
  const now = new Date().toISOString();

  // Check if cancellation was already requested while queued
  if (rawJob.cancel_requested) {
    execute(
      `UPDATE jobs
       SET status = 'CANCELLED',
           finished_at = ?
       WHERE id = ?`,
      [now, jobId]
    );
    emitJobEvent(jobId, { event: 'cancelled', job: getJob(jobId) });
    return;
  }

  // Transition to RUNNING
  execute(
    `UPDATE jobs
     SET status = 'RUNNING',
         started_at = ?,
         heartbeat_at = ?,
         current_label = 'Starting execution...'
     WHERE id = ?`,
    [now, now, jobId]
  );

  let job = getJob(jobId);
  emitJobEvent(jobId, { event: 'started', job });

  // Dynamically import orchestrator to prevent circular imports
  const { executeVerificationRun, executeVerificationUpgrade } = await import(
    '../verification/runOrchestrator.js'
  );

  const jobContext = {
    jobId,
    projectId,
    isCancelled: () => isJobCancelled(jobId),
    reportProgress: ({ done, total, label, metadata }) => {
      updateJobProgress(jobId, { done, total, label, metadata });
    },
  };

  try {
    let result = null;

    if (job.type === 'VERIFICATION_RUN') {
      result = await executeVerificationRun(projectId, {
        ...job.payload,
        runId: job.metadata?.runId,
        jobContext,
      });
    } else if (job.type === 'VERIFICATION_UPGRADE') {
      result = await executeVerificationUpgrade(projectId, job.payload.baseRunId, {
        ...job.payload,
        runId: job.metadata?.runId,
        jobContext,
      });
    } else {
      throw new Error(`Unsupported job type: "${job.type}"`);
    }

    const finishedNow = new Date().toISOString();
    const finalStatus = isJobCancelled(jobId) ? 'CANCELLED' : 'SUCCEEDED';

    execute(
      `UPDATE jobs
       SET status = ?,
           progress_done = progress_total,
           current_label = ?,
           finished_at = ?,
           metadata_json = ?
       WHERE id = ?`,
      [
        finalStatus,
        finalStatus === 'CANCELLED' ? 'Cancelled by user' : 'Completed successfully',
        finishedNow,
        JSON.stringify({ ...job.metadata, result }),
        jobId,
      ]
    );

    const completedJob = getJob(jobId);
    emitJobEvent(jobId, {
      event: finalStatus.toLowerCase(),
      job: completedJob,
      result,
    });
  } catch (err) {
    const errorNow = new Date().toISOString();
    const wasCancelled = isJobCancelled(jobId) || err.message?.includes('cancelled');
    const finalStatus = wasCancelled ? 'CANCELLED' : 'FAILED';

    execute(
      `UPDATE jobs
       SET status = ?,
           error_message = ?,
           current_label = ?,
           finished_at = ?
       WHERE id = ?`,
      [
        finalStatus,
        err.message,
        wasCancelled ? 'Cancelled by user' : 'Failed with error',
        errorNow,
        jobId,
      ]
    );

    const failedJob = getJob(jobId);
    emitJobEvent(jobId, {
      event: finalStatus.toLowerCase(),
      job: failedJob,
      error: err.message,
    });
  } finally {
    // Schedule next tick to process any remaining queued jobs
    setTimeout(workerTick, 50);
  }
}

/**
 * Initializes the background job worker singleton.
 * Safe against Next.js hot-reloads and duplicate initializations.
 */
export function initializeJobWorker() {
  if (globalThis.__genesisJobWorkerSingleton) {
    return globalThis.__genesisJobWorkerSingleton;
  }

  // Register worker tick trigger with queue
  registerWorkerTrigger(() => {
    if (!isTickScheduled) {
      isTickScheduled = true;
      setTimeout(() => {
        isTickScheduled = false;
        workerTick();
      }, 20);
    }
  });

  // Run crash recovery on startup
  recoverStaleJobs();

  // Setup periodic polling interval (e.g. every 2 seconds) to guarantee ticks
  const intervalId = setInterval(workerTick, 2000);
  if (intervalId.unref) {
    intervalId.unref(); // Don't prevent Node process exit
  }

  const singleton = {
    initialized: true,
    triggerTick: workerTick,
    stop: () => clearInterval(intervalId),
  };

  globalThis.__genesisJobWorkerSingleton = singleton;
  return singleton;
}

// Auto-initialize worker lazily
initializeJobWorker();

