import crypto from 'node:crypto';
import { queryOne, queryAll, execute, transaction } from '../db/index.js';
import { matchEvidenceForRequirement } from './evidenceMatcher.js';
import { verifyRequirementWithGemini } from './geminiVerifier.js';
import { verifyRequirementWithRules } from './rules/ruleBasedVerifier.js';
import { getAiStatus } from '../ai/gateway.js';
import { AI_CONFIG } from '../ai/config.js';

/**
 * Validates whether a project is eligible for verification.
 * @param {string} projectId
 * @returns {{ isEligible: boolean, reason?: string, project?: Object, approvedReqs?: Array, activeSubmission?: Object, srsDoc?: Object }}
 */
export function checkVerificationEligibility(projectId) {
  const project = queryOne('SELECT * FROM projects WHERE id = ?', [projectId]);
  if (!project) {
    return { isEligible: false, reason: 'Project not found.' };
  }

  // 1. Check for approved requirements
  const approvedReqs = queryAll(
    `SELECT * FROM requirements 
     WHERE project_id = ? AND approval_status = 'APPROVED'
     ORDER BY order_index ASC, req_code ASC`,
    [projectId]
  );

  if (approvedReqs.length === 0) {
    return {
      isEligible: false,
      reason: 'No approved requirements found. Please review and approve requirements in Phase 2 before verification.',
    };
  }

  // 2. Check for active code submission
  const activeSubmission = queryOne(
    `SELECT * FROM code_submissions WHERE project_id = ? AND is_active = 1`,
    [projectId]
  );

  if (!activeSubmission) {
    return {
      isEligible: false,
      reason: 'No active source code submission found. Please upload a developer ZIP archive in Phase 3.',
    };
  }

  if (activeSubmission.status !== 'ANALYZED') {
    return {
      isEligible: false,
      reason: `Active code submission "${activeSubmission.filename}" has status "${activeSubmission.status}". It must be ANALYZED before verification can proceed.`,
    };
  }

  const srsDoc = queryOne(
    `SELECT * FROM srs_documents WHERE project_id = ? AND is_active = 1`,
    [projectId]
  );

  return {
    isEligible: true,
    project,
    approvedReqs,
    activeSubmission,
    srsDoc,
  };
}

/**
 * Starts and coordinates an evidence-grounded verification run for a project.
 *
 * @param {string} projectId
 * @param {Object} [options]
 * @param {string} [options.runId] - Optional pre-created run ID
 * @param {Object} [options.jobContext] - Optional background job context for progress & cooperative cancel
 * @returns {Promise<Object>} Verification run summary and results
 */
export async function executeVerificationRun(projectId, options = {}) {
  // 1. Eligibility Check
  const eligibility = checkVerificationEligibility(projectId);
  if (!eligibility.isEligible) {
    throw new Error(eligibility.reason);
  }

  const { project, approvedReqs, activeSubmission, srsDoc } = eligibility;
  const runId = options.runId || `vrun_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
  const now = new Date().toISOString();
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

  // 2. Ensure verification_runs record exists with status RUNNING
  const existingRun = queryOne(`SELECT id FROM verification_runs WHERE id = ?`, [runId]);
  if (!existingRun) {
    execute(
      `INSERT INTO verification_runs (
        id, project_id, srs_document_id, submission_id, status,
        total_requirements, model_name, started_at
      ) VALUES (?, ?, ?, ?, 'RUNNING', ?, ?, ?)`,
      [
        runId,
        projectId,
        srsDoc?.id || null,
        activeSubmission.id,
        approvedReqs.length,
        modelName,
        now,
      ]
    );
  } else {
    execute(
      `UPDATE verification_runs
       SET status = 'RUNNING', started_at = ?, total_requirements = ?, model_name = ?
       WHERE id = ?`,
      [now, approvedReqs.length, modelName, runId]
    );
  }

  // 3. Fetch all code evidence records for this active submission
  const evidenceRows = queryAll(
    `SELECT * FROM code_evidence WHERE submission_id = ? AND project_id = ?`,
    [activeSubmission.id, projectId]
  );

  // Evidence lookup map for hydrating supporting evidence details
  const evidenceMap = new Map();
  for (const ev of evidenceRows) {
    evidenceMap.set(ev.id, ev);
  }

  // Parse codebase context
  let parsedLanguages = {};
  try {
    parsedLanguages = activeSubmission.languages ? JSON.parse(activeSubmission.languages) : {};
  } catch {}

  const codebaseContext = {
    analyzedFiles: activeSubmission.analyzed_files,
    skippedFiles: activeSubmission.skipped_files,
    totalLines: activeSubmission.total_lines,
    languages: parsedLanguages,
  };

  const results = [];
  let verifiedCount = 0;
  let partiallyCount = 0;
  let notImplementedCount = 0;
  let unverifiedCount = 0;
  let failedCount = 0;
  let aiCount = 0;
  let rulesCount = 0;

  try {
    // 4. Evaluate each approved requirement sequentially
    for (let reqIndex = 0; reqIndex < approvedReqs.length; reqIndex++) {
      const req = approvedReqs[reqIndex];

      // Cooperative cancellation check
      if (options.jobContext?.isCancelled?.()) {
        const cancelTime = new Date().toISOString();
        execute(
          `UPDATE verification_runs
           SET status = 'CANCELLED',
               verified_count = ?,
               partially_count = ?,
               not_implemented_count = ?,
               unverified_count = ?,
               failed_count = ?,
               ai_mode = ?,
               ai_count = ?,
               rules_count = ?,
               error_message = 'Verification run cancelled by user.',
               completed_at = ?
           WHERE id = ?`,
          [
            verifiedCount,
            partiallyCount,
            notImplementedCount,
            unverifiedCount,
            failedCount,
            rulesCount === 0 ? 'LIVE' : aiCount === 0 ? 'RULES_ONLY' : 'DEGRADED',
            aiCount,
            rulesCount,
            cancelTime,
            runId,
          ]
        );

        return {
          runId,
          projectId,
          status: 'CANCELLED',
          cancelled: true,
          aiMode: rulesCount === 0 ? 'LIVE' : aiCount === 0 ? 'RULES_ONLY' : 'DEGRADED',
          aiCount,
          rulesCount,
          totalRequirements: approvedReqs.length,
          verifiedCount,
          partiallyCount,
          notImplementedCount,
          unverifiedCount,
          failedCount,
          results,
        };
      }

      if (options.jobContext?.reportProgress) {
        options.jobContext.reportProgress({
          done: reqIndex,
          total: approvedReqs.length,
          label: `Evaluating requirement ${req.req_code} (${req.title})...`,
          metadata: {
            currentReqCode: req.req_code,
            aiCount,
            rulesCount,
            runId,
          },
        });
      }

      // Step A: Deterministic candidate evidence retrieval
      const candidateEvidence = matchEvidenceForRequirement(req, evidenceRows, {
        maxCandidates: options.maxCandidates || 12,
      });

      // Step B: Check AI status and decide between AI evaluation and fast rules fallback
      const aiStatus = getAiStatus();
      const forceRules = aiStatus.mode === 'RULES_ONLY' || aiStatus.breakerState === 'OPEN';

      let evalResult;
      let method = 'AI';
      let fallbackReason = null;

      if (forceRules) {
        evalResult = verifyRequirementWithRules(req, candidateEvidence, codebaseContext);
        method = 'RULES';
        fallbackReason = aiStatus.lastErrorReason || 'AI_UNAVAILABLE';
        rulesCount++;
      } else {
        try {
          evalResult = await verifyRequirementWithGemini(
            req,
            candidateEvidence,
            codebaseContext,
            { ...options, throwOnUnavailable: true }
          );
          method = 'AI';
          fallbackReason = null;
          aiCount++;
        } catch (err) {
          // Graceful degradation into deterministic rules verifier
          evalResult = verifyRequirementWithRules(req, candidateEvidence, codebaseContext);
          method = 'RULES';
          fallbackReason = err.reason || 'AI_UNAVAILABLE';
          rulesCount++;
        }
      }

      // Step C: Hydrate supporting evidence references
      const hydratedSupportingEvidence = (evalResult.supporting_evidence_ids || [])
        .map((evId) => {
          const rawEv = evidenceMap.get(evId);
          if (!rawEv) return null;
          return {
            id: rawEv.id,
            filePath: rawEv.file_path,
            startLine: rawEv.start_line,
            endLine: rawEv.end_line,
            identifier: rawEv.identifier,
            evidenceType: rawEv.evidence_type,
            codeSnippet: rawEv.code_snippet,
            contextSummary: rawEv.context_summary,
            analysisMethod: rawEv.analysis_method,
            confidence: rawEv.confidence,
          };
        })
        .filter(Boolean);

      const resultId = `vres_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
      const resNow = new Date().toISOString();
      const isCacheHit = Boolean(evalResult.cacheHit);

      // Step D: Insert result record with method and fallbackReason
      execute(
        `INSERT INTO verification_results (
          id, run_id, project_id, requirement_id, submission_id,
          status, confidence_score, confidence_reason, ai_explanation,
          method, fallback_reason,
          evidence_references, contradicting_evidence, criteria_assessment,
          limitations, model_name, analysis_version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          resultId,
          runId,
          projectId,
          req.id,
          activeSubmission.id,
          evalResult.status,
          evalResult.confidence_score,
          evalResult.confidence_reason || (isCacheHit ? '[Cache Hit] Evaluated with Grounded AI' : null),
          evalResult.explanation,
          method,
          fallbackReason,
          JSON.stringify(hydratedSupportingEvidence),
          JSON.stringify(evalResult.contradicting_evidence_ids || []),
          JSON.stringify(evalResult.acceptance_criteria_assessment || []),
          JSON.stringify(evalResult.limitations || []),
          modelName,
          isCacheHit ? '1.0.0-cached' : '1.0.0',
          resNow,
          resNow,
        ]
      );

      // Track metric counts
      if (evalResult.status === 'VERIFIED') verifiedCount++;
      else if (evalResult.status === 'PARTIALLY_IMPLEMENTED') partiallyCount++;
      else if (evalResult.status === 'NOT_IMPLEMENTED') notImplementedCount++;
      else unverifiedCount++;

      if (evalResult.isAiError) failedCount++;

      results.push({
        resultId,
        requirementId: req.id,
        reqCode: req.req_code,
        title: req.title,
        status: evalResult.status,
        confidenceScore: evalResult.confidence_score,
        supportingEvidenceCount: hydratedSupportingEvidence.length,
        method,
        fallbackReason,
        cacheHit: isCacheHit,
      });

      if (options.jobContext?.reportProgress) {
        options.jobContext.reportProgress({
          done: reqIndex + 1,
          total: approvedReqs.length,
          label: `Completed ${req.req_code} [${method}]`,
          metadata: {
            currentReqCode: req.req_code,
            aiCount,
            rulesCount,
            runId,
          },
        });
      }
    }

    // 5. Finalize verification_runs record
    const completedNow = new Date().toISOString();
    const finalRunStatus = failedCount === approvedReqs.length ? 'FAILED' : 'COMPLETED';
    const finalAiMode = rulesCount === 0 ? 'LIVE' : aiCount === 0 ? 'RULES_ONLY' : 'DEGRADED';

    execute(
      `UPDATE verification_runs
       SET status = ?,
           verified_count = ?,
           partially_count = ?,
           not_implemented_count = ?,
           unverified_count = ?,
           failed_count = ?,
           ai_mode = ?,
           ai_count = ?,
           rules_count = ?,
           completed_at = ?
       WHERE id = ?`,
      [
        finalRunStatus,
        verifiedCount,
        partiallyCount,
        notImplementedCount,
        unverifiedCount,
        failedCount,
        finalAiMode,
        aiCount,
        rulesCount,
        completedNow,
        runId,
      ]
    );

    // Update project status to VERIFIED only if the run COMPLETED
    if (finalRunStatus === 'COMPLETED') {
      execute(`UPDATE projects SET status = 'VERIFIED', updated_at = ? WHERE id = ?`, [
        completedNow,
        projectId,
      ]);
    }

    return {
      runId,
      projectId,
      status: finalRunStatus,
      aiMode: finalAiMode,
      aiCount,
      rulesCount,
      totalRequirements: approvedReqs.length,
      verifiedCount,
      partiallyCount,
      notImplementedCount,
      unverifiedCount,
      failedCount,
      results,
    };
  } catch (fatalError) {
    const errorNow = new Date().toISOString();
    execute(
      `UPDATE verification_runs
       SET status = 'FAILED', error_message = ?, completed_at = ?
       WHERE id = ?`,
      [fatalError.message, errorNow, runId]
    );
    throw fatalError;
  }
}

/**
 * Upgrades an existing run that contains RULES-based results to AI evaluation.
 * Creates a NEW run (preserving append-only history) linked via base_run_id.
 * Carries over successful AI results from the base run unchanged (referenced via carried_over_from_result_id)
 * and re-evaluates only RULES or failed requirements with Gemini (checking cache first).
 *
 * @param {string} projectId
 * @param {string} baseRunId
 * @param {Object} [options]
 * @returns {Promise<Object>} Upgraded run summary and results
 */
export async function executeVerificationUpgrade(projectId, baseRunId, options = {}) {
  // 1. Refusal check if AI Gateway is in RULES_ONLY mode or disabled
  const aiStatus = getAiStatus();
  if ((aiStatus.mode === 'RULES_ONLY' || AI_CONFIG.forceRulesMode) && !options.mockEvaluator) {
    const err = new Error(
      'Cannot upgrade verification run to AI while AI Gateway is running in rules-only mode or disabled.'
    );
    err.code = 'RULES_ONLY_MODE';
    err.status = 400;
    throw err;
  }

  // 2. Eligibility & Base Run Check
  const eligibility = checkVerificationEligibility(projectId);
  if (!eligibility.isEligible) {
    throw new Error(eligibility.reason);
  }

  const { project, approvedReqs, activeSubmission, srsDoc } = eligibility;

  const baseRun = queryOne(
    `SELECT * FROM verification_runs WHERE id = ? AND project_id = ?`,
    [baseRunId, projectId]
  );
  if (!baseRun) {
    throw new Error(`Base verification run "${baseRunId}" not found for project "${projectId}".`);
  }

  // Fetch results from base run to check which requirements had AI vs RULES
  const baseResults = queryAll(
    `SELECT * FROM verification_results WHERE run_id = ?`,
    [baseRunId]
  );
  const baseResultMap = new Map();
  for (const r of baseResults) {
    baseResultMap.set(r.requirement_id, r);
  }

  // 3. Create NEW run record with base_run_id recorded
  const runId = options.runId || `vrun_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
  const now = new Date().toISOString();
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

  const existingRun = queryOne(`SELECT id FROM verification_runs WHERE id = ?`, [runId]);
  if (!existingRun) {
    execute(
      `INSERT INTO verification_runs (
        id, project_id, srs_document_id, submission_id, status,
        total_requirements, model_name, base_run_id, started_at
      ) VALUES (?, ?, ?, ?, 'RUNNING', ?, ?, ?, ?)`,
      [
        runId,
        projectId,
        srsDoc?.id || null,
        activeSubmission.id,
        approvedReqs.length,
        modelName,
        baseRunId,
        now,
      ]
    );
  } else {
    execute(
      `UPDATE verification_runs
       SET status = 'RUNNING', started_at = ?, total_requirements = ?, model_name = ?, base_run_id = ?
       WHERE id = ?`,
      [now, approvedReqs.length, modelName, baseRunId, runId]
    );
  }

  // 4. Fetch evidence records
  const evidenceRows = queryAll(
    `SELECT * FROM code_evidence WHERE submission_id = ? AND project_id = ?`,
    [activeSubmission.id, projectId]
  );
  const evidenceMap = new Map();
  for (const ev of evidenceRows) {
    evidenceMap.set(ev.id, ev);
  }

  let parsedLanguages = {};
  try {
    parsedLanguages = activeSubmission.languages ? JSON.parse(activeSubmission.languages) : {};
  } catch {}

  const codebaseContext = {
    analyzedFiles: activeSubmission.analyzed_files,
    skippedFiles: activeSubmission.skipped_files,
    totalLines: activeSubmission.total_lines,
    languages: parsedLanguages,
  };

  const results = [];
  let verifiedCount = 0;
  let partiallyCount = 0;
  let notImplementedCount = 0;
  let unverifiedCount = 0;
  let failedCount = 0;
  let aiCount = 0;
  let rulesCount = 0;

  try {
    for (let reqIndex = 0; reqIndex < approvedReqs.length; reqIndex++) {
      const req = approvedReqs[reqIndex];

      // Cooperative cancellation check
      if (options.jobContext?.isCancelled?.()) {
        const cancelTime = new Date().toISOString();
        execute(
          `UPDATE verification_runs
           SET status = 'CANCELLED',
               verified_count = ?,
               partially_count = ?,
               not_implemented_count = ?,
               unverified_count = ?,
               failed_count = ?,
               ai_mode = ?,
               ai_count = ?,
               rules_count = ?,
               error_message = 'Upgrade run cancelled by user.',
               completed_at = ?
           WHERE id = ?`,
          [
            verifiedCount,
            partiallyCount,
            notImplementedCount,
            unverifiedCount,
            failedCount,
            rulesCount === 0 ? 'LIVE' : aiCount === 0 ? 'RULES_ONLY' : 'DEGRADED',
            aiCount,
            rulesCount,
            cancelTime,
            runId,
          ]
        );

        return {
          runId,
          projectId,
          baseRunId,
          status: 'CANCELLED',
          cancelled: true,
          results,
        };
      }

      const baseResult = baseResultMap.get(req.id);
      const isCandidateForCarryover =
        baseResult &&
        baseResult.method === 'AI' &&
        baseResult.status !== 'UNVERIFIED';

      const resultId = `vres_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
      const resNow = new Date().toISOString();

      if (isCandidateForCarryover) {
        // Carry over successful AI evaluation from base run unchanged
        execute(
          `INSERT INTO verification_results (
            id, run_id, project_id, requirement_id, submission_id,
            status, confidence_score, confidence_reason, ai_explanation,
            method, fallback_reason, carried_over_from_result_id,
            evidence_references, contradicting_evidence, criteria_assessment,
            limitations, model_name, analysis_version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'AI', NULL, ?, ?, ?, ?, ?, ?, '1.0.0-carried', ?, ?)`,
          [
            resultId,
            runId,
            projectId,
            req.id,
            activeSubmission.id,
            baseResult.status,
            baseResult.confidence_score,
            `Carried over from run ${baseRunId}`,
            baseResult.ai_explanation,
            baseResult.id,
            baseResult.evidence_references,
            baseResult.contradicting_evidence,
            baseResult.criteria_assessment,
            baseResult.limitations,
            baseResult.model_name || modelName,
            resNow,
            resNow,
          ]
        );

        // Copy active override from base run if present
        const activeBaseOverride = queryOne(
          `SELECT * FROM result_overrides WHERE result_id = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1`,
          [baseResult.id]
        );
        if (activeBaseOverride) {
          const newOvrId = `ovr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
          execute(
            `INSERT INTO result_overrides (
              id, project_id, run_id, result_id, requirement_id,
              previous_status, new_status, reason, reviewer_name, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              newOvrId,
              projectId,
              runId,
              resultId,
              req.id,
              activeBaseOverride.previous_status,
              activeBaseOverride.new_status,
              `[Carried over from run ${baseRunId}] ${activeBaseOverride.reason}`,
              activeBaseOverride.reviewer_name,
              resNow,
            ]
          );
        }

        aiCount++;
        if (baseResult.status === 'VERIFIED') verifiedCount++;
        else if (baseResult.status === 'PARTIALLY_IMPLEMENTED') partiallyCount++;
        else if (baseResult.status === 'NOT_IMPLEMENTED') notImplementedCount++;
        else unverifiedCount++;

        results.push({
          resultId,
          requirementId: req.id,
          reqCode: req.req_code,
          title: req.title,
          status: baseResult.status,
          method: 'AI',
          carriedOverFrom: baseResult.id,
        });
      } else {
        // Re-evaluate previously degraded RULES or failed requirement with Gemini (cache first)
        if (options.jobContext?.reportProgress) {
          options.jobContext.reportProgress({
            done: reqIndex,
            total: approvedReqs.length,
            label: `Upgrading requirement ${req.req_code} with Gemini AI...`,
            metadata: { currentReqCode: req.req_code, aiCount, rulesCount, runId },
          });
        }

        const candidateEvidence = matchEvidenceForRequirement(req, evidenceRows, {
          maxCandidates: options.maxCandidates || 12,
        });

        let evalResult;
        let method = 'AI';
        let fallbackReason = null;

        try {
          evalResult = await verifyRequirementWithGemini(
            req,
            candidateEvidence,
            codebaseContext,
            { ...options, throwOnUnavailable: true }
          );
          method = 'AI';
          fallbackReason = null;
          aiCount++;
        } catch (err) {
          // If Gemini fails during upgrade, fall back to rules
          evalResult = verifyRequirementWithRules(req, candidateEvidence, codebaseContext);
          method = 'RULES';
          fallbackReason = err.reason || 'AI_UNAVAILABLE';
          rulesCount++;
        }

        const hydratedSupportingEvidence = (evalResult.supporting_evidence_ids || [])
          .map((evId) => {
            const rawEv = evidenceMap.get(evId);
            if (!rawEv) return null;
            return {
              id: rawEv.id,
              filePath: rawEv.file_path,
              startLine: rawEv.start_line,
              endLine: rawEv.end_line,
              identifier: rawEv.identifier,
              evidenceType: rawEv.evidence_type,
              codeSnippet: rawEv.code_snippet,
              contextSummary: rawEv.context_summary,
              analysisMethod: rawEv.analysis_method,
              confidence: rawEv.confidence,
            };
          })
          .filter(Boolean);

        const isCacheHit = Boolean(evalResult.cacheHit);

        execute(
          `INSERT INTO verification_results (
            id, run_id, project_id, requirement_id, submission_id,
            status, confidence_score, confidence_reason, ai_explanation,
            method, fallback_reason, carried_over_from_result_id,
            evidence_references, contradicting_evidence, criteria_assessment,
            limitations, model_name, analysis_version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            resultId,
            runId,
            projectId,
            req.id,
            activeSubmission.id,
            evalResult.status,
            evalResult.confidence_score,
            evalResult.confidence_reason || (isCacheHit ? '[Cache Hit] Upgraded with Grounded AI' : null),
            evalResult.explanation,
            method,
            fallbackReason,
            JSON.stringify(hydratedSupportingEvidence),
            JSON.stringify(evalResult.contradicting_evidence_ids || []),
            JSON.stringify(evalResult.acceptance_criteria_assessment || []),
            JSON.stringify(evalResult.limitations || []),
            modelName,
            isCacheHit ? '1.0.0-cached' : '1.0.0',
            resNow,
            resNow,
          ]
        );

        if (evalResult.status === 'VERIFIED') verifiedCount++;
        else if (evalResult.status === 'PARTIALLY_IMPLEMENTED') partiallyCount++;
        else if (evalResult.status === 'NOT_IMPLEMENTED') notImplementedCount++;
        else unverifiedCount++;

        results.push({
          resultId,
          requirementId: req.id,
          reqCode: req.req_code,
          title: req.title,
          status: evalResult.status,
          method,
          fallbackReason,
          cacheHit: isCacheHit,
        });
      }

      if (options.jobContext?.reportProgress) {
        options.jobContext.reportProgress({
          done: reqIndex + 1,
          total: approvedReqs.length,
          label: `Completed upgrade for ${req.req_code} [${method}]`,
          metadata: { currentReqCode: req.req_code, aiCount, rulesCount, runId },
        });
      }
    }

    // 5. Finalize upgraded run record
    const completedNow = new Date().toISOString();
    const finalRunStatus = failedCount === approvedReqs.length ? 'FAILED' : 'COMPLETED';
    const finalAiMode = rulesCount === 0 ? 'LIVE' : aiCount === 0 ? 'RULES_ONLY' : 'DEGRADED';

    execute(
      `UPDATE verification_runs
       SET status = ?,
           verified_count = ?,
           partially_count = ?,
           not_implemented_count = ?,
           unverified_count = ?,
           failed_count = ?,
           ai_mode = ?,
           ai_count = ?,
           rules_count = ?,
           completed_at = ?
       WHERE id = ?`,
      [
        finalRunStatus,
        verifiedCount,
        partiallyCount,
        notImplementedCount,
        unverifiedCount,
        failedCount,
        finalAiMode,
        aiCount,
        rulesCount,
        completedNow,
        runId,
      ]
    );

    if (finalRunStatus === 'COMPLETED') {
      execute(`UPDATE projects SET status = 'VERIFIED', updated_at = ? WHERE id = ?`, [
        completedNow,
        projectId,
      ]);
    }

    return {
      runId,
      baseRunId,
      projectId,
      status: finalRunStatus,
      aiMode: finalAiMode,
      aiCount,
      rulesCount,
      totalRequirements: approvedReqs.length,
      verifiedCount,
      partiallyCount,
      notImplementedCount,
      unverifiedCount,
      failedCount,
      results,
    };
  } catch (fatalError) {
    const errorNow = new Date().toISOString();
    execute(
      `UPDATE verification_runs
       SET status = 'FAILED', error_message = ?, completed_at = ?
       WHERE id = ?`,
      [fatalError.message, errorNow, runId]
    );
    throw fatalError;
  }
}
