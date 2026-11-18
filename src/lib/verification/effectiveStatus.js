import { queryAll, queryOne } from '../db/index.js';

export const VALID_STATUSES = ['VERIFIED', 'PARTIALLY_IMPLEMENTED', 'NOT_IMPLEMENTED', 'UNVERIFIED'];

export const STATUS_RANKS = {
  VERIFIED: 3,
  PARTIALLY_IMPLEMENTED: 2,
  NOT_IMPLEMENTED: 1,
};

/**
 * Returns verification results for a run merged with their latest active (non-revoked) override.
 * Non-destructive: original verification_results row is never modified.
 *
 * @param {string} runId
 * @returns {Array<Object>}
 */
export function getEffectiveResults(runId) {
  const results = queryAll(
    `SELECT vr.*, r.req_code, r.title, r.category, r.priority, r.type
     FROM verification_results vr
     JOIN requirements r ON vr.requirement_id = r.id
     WHERE vr.run_id = ?
     ORDER BY r.order_index ASC, r.req_code ASC`,
    [runId]
  );

  // Fetch all active overrides for this run
  const activeOverrides = queryAll(
    `SELECT * FROM result_overrides
     WHERE run_id = ? AND revoked_at IS NULL
     ORDER BY created_at ASC`,
    [runId]
  );

  // Map latest active override per result_id
  const overrideMap = new Map();
  for (const ov of activeOverrides) {
    overrideMap.set(ov.result_id, ov);
  }

  return results.map((res) => {
    const override = overrideMap.get(res.id) || null;
    const isOverridden = Boolean(override);
    const effectiveStatus = isOverridden ? override.new_status : res.status;

    return {
      ...res,
      effective_status: effectiveStatus,
      is_overridden: isOverridden,
      override: override
        ? {
            id: override.id,
            previous_status: override.previous_status,
            new_status: override.new_status,
            reason: override.reason,
            reviewer_name: override.reviewer_name,
            created_at: override.created_at,
          }
        : null,
    };
  });
}

/**
 * Computes side-by-side original and effective summary counts for a verification run.
 * Does not mutate verification_runs table.
 *
 * @param {string} runId
 * @returns {Object}
 */
export function computeEffectiveSummary(runId) {
  const run = queryOne('SELECT * FROM verification_runs WHERE id = ?', [runId]);
  if (!run) return null;

  const effectiveResults = getEffectiveResults(runId);

  const effectiveCounts = {
    verified: 0,
    partially_implemented: 0,
    not_implemented: 0,
    unverified: 0,
  };

  const originalCounts = {
    verified: 0,
    partially_implemented: 0,
    not_implemented: 0,
    unverified: 0,
  };

  let overriddenCount = 0;

  for (const res of effectiveResults) {
    // Count original
    if (res.status === 'VERIFIED') originalCounts.verified++;
    else if (res.status === 'PARTIALLY_IMPLEMENTED') originalCounts.partially_implemented++;
    else if (res.status === 'NOT_IMPLEMENTED') originalCounts.not_implemented++;
    else if (res.status === 'UNVERIFIED') originalCounts.unverified++;

    // Count effective
    if (res.effective_status === 'VERIFIED') effectiveCounts.verified++;
    else if (res.effective_status === 'PARTIALLY_IMPLEMENTED') effectiveCounts.partially_implemented++;
    else if (res.effective_status === 'NOT_IMPLEMENTED') effectiveCounts.not_implemented++;
    else if (res.effective_status === 'UNVERIFIED') effectiveCounts.unverified++;

    if (res.is_overridden) {
      overriddenCount++;
    }
  }

  return {
    runId: run.id,
    projectId: run.project_id,
    total: effectiveResults.length,
    overridden_count: overriddenCount,
    original: originalCounts,
    effective: effectiveCounts,
  };
}

/**
 * Compares two completed verification runs within the same project.
 * Uses EFFECTIVE status for both runs.
 *
 * @param {string} projectId
 * @param {string} baseRunId
 * @param {string} headRunId
 * @returns {Object}
 */
export function compareVerificationRuns(projectId, baseRunId, headRunId) {
  const baseRun = queryOne(
    'SELECT * FROM verification_runs WHERE id = ? AND project_id = ?',
    [baseRunId, projectId]
  );
  const headRun = queryOne(
    'SELECT * FROM verification_runs WHERE id = ? AND project_id = ?',
    [headRunId, projectId]
  );

  if (!baseRun || !headRun) {
    throw new Error('Both base and head runs must exist and belong to the project.');
  }

  if (baseRun.status !== 'COMPLETED' || headRun.status !== 'COMPLETED') {
    throw new Error('Both runs must be COMPLETED to perform a comparison.');
  }

  const baseResults = getEffectiveResults(baseRunId);
  const headResults = getEffectiveResults(headRunId);

  const baseMap = new Map(baseResults.map((r) => [r.requirement_id, r]));
  const headMap = new Map(headResults.map((r) => [r.requirement_id, r]));

  // Collect all unique requirement IDs
  const allReqIds = Array.from(new Set([...baseMap.keys(), ...headMap.keys()]));

  const summary = {
    IMPROVED: 0,
    REGRESSED: 0,
    UNCHANGED: 0,
    CHANGED_UNKNOWN: 0,
    ADDED: 0,
    REMOVED: 0,
  };

  const comparisons = [];

  for (const reqId of allReqIds) {
    const b = baseMap.get(reqId);
    const h = headMap.get(reqId);

    let change = 'UNCHANGED';
    let baseStatus = b ? b.effective_status : null;
    let headStatus = h ? h.effective_status : null;
    let methodBase = b ? (b.method || 'AI') : null;
    let methodHead = h ? (h.method || 'AI') : null;
    let confidenceDelta = 0;

    if (!b && h) {
      change = 'ADDED';
    } else if (b && !h) {
      change = 'REMOVED';
    } else {
      confidenceDelta = Number(((h.confidence_score || 0) - (b.confidence_score || 0)).toFixed(4));

      if (baseStatus === headStatus) {
        change = 'UNCHANGED';
      } else if (baseStatus === 'UNVERIFIED' || headStatus === 'UNVERIFIED') {
        // Any transition involving UNVERIFIED is CHANGED_UNKNOWN
        change = 'CHANGED_UNKNOWN';
      } else {
        const baseRank = STATUS_RANKS[baseStatus] || 0;
        const headRank = STATUS_RANKS[headStatus] || 0;

        if (headRank > baseRank) {
          change = 'IMPROVED';
        } else if (headRank < baseRank) {
          change = 'REGRESSED';
        } else {
          change = 'UNCHANGED';
        }
      }
    }

    summary[change]++;

    const reqCode = h?.req_code || b?.req_code || 'REQ';
    const reqTitle = h?.title || b?.title || '';

    comparisons.push({
      requirement_id: reqId,
      req_code: reqCode,
      title: reqTitle,
      base_status: baseStatus,
      head_status: headStatus,
      change,
      confidence_delta: confidenceDelta,
      method_base: methodBase,
      method_head: methodHead,
      method_changed: methodBase !== methodHead,
      base_overridden: b?.is_overridden || false,
      head_overridden: h?.is_overridden || false,
    });
  }

  // Sort comparisons: REGRESSED first, then CHANGED_UNKNOWN, IMPROVED, ADDED, REMOVED, UNCHANGED
  const order = { REGRESSED: 0, CHANGED_UNKNOWN: 1, IMPROVED: 2, ADDED: 3, REMOVED: 4, UNCHANGED: 5 };
  comparisons.sort((a, b) => (order[a.change] ?? 99) - (order[b.change] ?? 99));

  // Determine warnings
  const warnings = [];
  if (baseRun.srs_document_id && headRun.srs_document_id && baseRun.srs_document_id !== headRun.srs_document_id) {
    warnings.push('Runs evaluate different SRS document versions.');
  }
  if (baseRun.submission_id && headRun.submission_id && baseRun.submission_id !== headRun.submission_id) {
    warnings.push('Runs evaluate different source code submissions.');
  }
  if ((baseRun.rules_count || 0) > 0 || (headRun.rules_count || 0) > 0) {
    warnings.push('One or both runs contain deterministic RULES-evaluated results.');
  }

  return {
    base_run: {
      id: baseRun.id,
      ai_mode: baseRun.ai_mode,
      started_at: baseRun.started_at,
      completed_at: baseRun.completed_at,
    },
    head_run: {
      id: headRun.id,
      ai_mode: headRun.ai_mode,
      started_at: headRun.started_at,
      completed_at: headRun.completed_at,
    },
    warnings,
    summary,
    comparisons,
  };
}

