import { NextResponse } from 'next/server';
import { queryOne, queryAll, execute } from '@/lib/db/index.js';
import { matchEvidenceForRequirement } from '@/lib/verification/evidenceMatcher.js';
import { verifyRequirementWithGemini } from '@/lib/verification/geminiVerifier.js';

// POST /api/projects/[id]/verification/[runId]/retry - Retry UNVERIFIED or failed evaluations in a run
export async function POST(request, { params }) {
  try {
    const { id: projectId, runId } = params;

    const run = queryOne(
      'SELECT * FROM verification_runs WHERE id = ? AND project_id = ?',
      [runId, projectId]
    );

    if (!run) {
      return NextResponse.json(
        { success: false, error: 'Verification run not found for this project.' },
        { status: 404 }
      );
    }

    // Find all results with status UNVERIFIED in this run
    const unverifiedResults = queryAll(
      `SELECT vr.*, r.title, r.description, r.category, r.priority, r.acceptance_criteria, r.extraction_notes, r.req_code
       FROM verification_results vr
       JOIN requirements r ON vr.requirement_id = r.id
       WHERE vr.run_id = ? AND vr.project_id = ? AND vr.status = 'UNVERIFIED'`,
      [runId, projectId]
    );

    if (unverifiedResults.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No UNVERIFIED requirements found to retry in this run.',
        retriedCount: 0,
      });
    }

    // Fetch code evidence records for the run's submission
    const evidenceRows = queryAll(
      'SELECT * FROM code_evidence WHERE submission_id = ? AND project_id = ?',
      [run.submission_id, projectId]
    );

    const evidenceMap = new Map();
    for (const ev of evidenceRows) {
      evidenceMap.set(ev.id, ev);
    }

    const sub = queryOne('SELECT * FROM code_submissions WHERE id = ?', [run.submission_id]);
    let parsedLanguages = {};
    try {
      parsedLanguages = sub?.languages ? JSON.parse(sub.languages) : {};
    } catch {}

    const codebaseContext = {
      analyzedFiles: sub?.analyzed_files || 0,
      skippedFiles: sub?.skipped_files || 0,
      totalLines: sub?.total_lines || 0,
      languages: parsedLanguages,
    };

    let retriedSuccess = 0;

    for (const item of unverifiedResults) {
      const req = {
        id: item.requirement_id,
        req_code: item.req_code,
        title: item.title,
        description: item.description,
        category: item.category,
        priority: item.priority,
        acceptance_criteria: item.acceptance_criteria,
        extraction_notes: item.extraction_notes,
      };

      const candidateEvidence = matchEvidenceForRequirement(req, evidenceRows);
      const evalResult = await verifyRequirementWithGemini(req, candidateEvidence, codebaseContext);

      const hydratedSupporting = (evalResult.supporting_evidence_ids || [])
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

      const now = new Date().toISOString();

      execute(
        `UPDATE verification_results
         SET status = ?,
             confidence_score = ?,
             confidence_reason = ?,
             ai_explanation = ?,
             evidence_references = ?,
             contradicting_evidence = ?,
             criteria_assessment = ?,
             limitations = ?,
             updated_at = ?
         WHERE id = ?`,
        [
          evalResult.status,
          evalResult.confidence_score,
          evalResult.confidence_reason || null,
          evalResult.explanation,
          JSON.stringify(hydratedSupporting),
          JSON.stringify(evalResult.contradicting_evidence_ids || []),
          JSON.stringify(evalResult.acceptance_criteria_assessment || []),
          JSON.stringify(evalResult.limitations || []),
          now,
          item.id,
        ]
      );

      retriedSuccess++;
    }

    // Recompute counts for the run
    const counts = queryOne(
      `SELECT 
        SUM(CASE WHEN status = 'VERIFIED' THEN 1 ELSE 0 END) as verified,
        SUM(CASE WHEN status = 'PARTIALLY_IMPLEMENTED' THEN 1 ELSE 0 END) as partially,
        SUM(CASE WHEN status = 'NOT_IMPLEMENTED' THEN 1 ELSE 0 END) as not_impl,
        SUM(CASE WHEN status = 'UNVERIFIED' THEN 1 ELSE 0 END) as unverified
       FROM verification_results
       WHERE run_id = ?`,
      [runId]
    );

    const nowCompleted = new Date().toISOString();
    execute(
      `UPDATE verification_runs
       SET verified_count = ?,
           partially_count = ?,
           not_implemented_count = ?,
           unverified_count = ?,
           completed_at = ?
       WHERE id = ?`,
      [
        counts.verified || 0,
        counts.partially || 0,
        counts.not_impl || 0,
        counts.unverified || 0,
        nowCompleted,
        runId,
      ]
    );

    return NextResponse.json({
      success: true,
      message: `Retried ${retriedSuccess} requirement evaluation(s).`,
      retriedCount: retriedSuccess,
      updatedCounts: counts,
    });
  } catch (error) {
    console.error('Retry verification failed:', error);
    return NextResponse.json(
      { success: false, error: 'Retry failed', message: error.message },
      { status: 500 }
    );
  }
}

