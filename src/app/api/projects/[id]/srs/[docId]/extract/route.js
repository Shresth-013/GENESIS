import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { queryOne, queryAll, execute, transaction } from '@/lib/db/index.js';
import { extractRequirementsWithGemini } from '@/lib/ai/gemini.js';
import { extractRequirementsWithRules } from '@/lib/document/ruleExtractor.js';
import { getAiStatus, AiUnavailableError } from '@/lib/ai/gateway.js';

// POST /api/projects/[id]/srs/[docId]/extract - Run Gemini AI requirement extraction
export async function POST(request, { params }) {
  try {
    const { id: projectId, docId } = params;

    const project = queryOne('SELECT * FROM projects WHERE id = ?', [projectId]);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const document = queryOne(
      'SELECT * FROM srs_documents WHERE id = ? AND project_id = ?',
      [docId, projectId]
    );

    if (!document) {
      return NextResponse.json(
        { success: false, error: 'SRS document not found for this project.' },
        { status: 404 }
      );
    }

    if (!document.extracted_text || document.extracted_text.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Document contains no extracted text to analyze with Gemini.',
        },
        { status: 400 }
      );
    }

    // Set document state to PROCESSING
    const now = new Date().toISOString();
    execute(
      `UPDATE srs_documents SET status = 'PROCESSING', updated_at = ? WHERE id = ?`,
      [now, docId]
    );

    const aiStatus = getAiStatus();
    const forceRules = aiStatus.mode === 'RULES_ONLY' || aiStatus.breakerState === 'OPEN';

    let rawRequirements = [];
    let extractionMethod = 'AI';
    let extractionWarning = null;

    if (forceRules) {
      rawRequirements = extractRequirementsWithRules(document.extracted_text);
      extractionMethod = 'RULES';
      extractionWarning = 'AI service is currently unavailable or running in rules-only mode. Requirements were extracted via deterministic rules and require manual review.';
    } else {
      try {
        rawRequirements = await extractRequirementsWithGemini(document.extracted_text);
        extractionMethod = 'AI';
      } catch (aiError) {
        console.warn('[SRS Extract] AI extraction failed, falling back to rules extractor:', aiError.message);
        try {
          rawRequirements = extractRequirementsWithRules(document.extracted_text);
          extractionMethod = 'RULES';
          extractionWarning = `AI extraction failed (${aiError.message || 'service unavailable'}). Fallback rules extractor was automatically applied. Please review carefully.`;
        } catch (ruleErr) {
          // Record failure state on document without corrupting text or existing requirements
          const errorMsg = aiError.message || 'AI requirement extraction failed.';
          execute(
            `UPDATE srs_documents 
             SET status = 'EXTRACTION_FAILED', error_message = ?, updated_at = ? 
             WHERE id = ?`,
            [errorMsg, new Date().toISOString(), docId]
          );

          return NextResponse.json(
            {
              success: false,
              error: errorMsg,
              status: 'EXTRACTION_FAILED',
            },
            { status: 502 }
          );
        }
      }
    }

    // Handle case where document legitimately has 0 verifiable requirements
    if (!rawRequirements || rawRequirements.length === 0) {
      const timestamp = new Date().toISOString();
      execute(
        `UPDATE srs_documents 
         SET status = 'NO_REQUIREMENTS_FOUND', error_message = NULL, updated_at = ? 
         WHERE id = ?`,
        [timestamp, docId]
      );

      return NextResponse.json({
        success: true,
        count: 0,
        data: [],
        status: 'NO_REQUIREMENTS_FOUND',
        message: 'The AI analyzed the document successfully, but no concrete verifiable requirements were identified.',
      });
    }

    // Persist requirements into SQLite using an ACID transaction
    const savedRequirements = transaction(() => {
      // Clear previously extracted PENDING requirements for this document to prevent duplicate accumulation
      // Existing approved requirements are strictly preserved
      execute(
        `DELETE FROM requirements 
         WHERE srs_document_id = ? AND approval_status != 'APPROVED'`,
        [docId]
      );

      // Collect existing approved requirement codes to prevent code collisions
      const existingApproved = queryAll(
        `SELECT req_code FROM requirements WHERE project_id = ? AND approval_status = 'APPROVED'`,
        [projectId]
      );
      const approvedCodes = new Set(existingApproved.map((r) => r.req_code));

      const inserted = [];
      const timestamp = new Date().toISOString();

      rawRequirements.forEach((req, idx) => {
        // If this exact requirement code is already approved, avoid collision
        let safeReqCode = req.req_code;
        if (approvedCodes.has(safeReqCode)) {
          safeReqCode = `${safeReqCode}_new`;
        }

        const reqId = `req_${crypto.randomUUID().replace(/-/g, '').substring(0, 12)}`;

        execute(
          `INSERT INTO requirements (
            id, project_id, srs_document_id, req_code, title, description, 
            category, priority, type, acceptance_criteria, source_reference, 
            confidence, extraction_notes, extraction_method, approval_status, order_index, 
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
          [
            reqId,
            projectId,
            docId,
            safeReqCode,
            req.title,
            req.description,
            req.category,
            req.priority,
            req.type,
            req.acceptance_criteria,
            req.source_reference,
            req.confidence,
            req.extraction_notes,
            extractionMethod,
            idx,
            timestamp,
            timestamp,
          ]
        );

        inserted.push({
          id: reqId,
          project_id: projectId,
          srs_document_id: docId,
          req_code: req.req_code,
          title: req.title,
          description: req.description,
          category: req.category,
          priority: req.priority,
          type: req.type,
          acceptance_criteria: req.acceptance_criteria ? JSON.parse(req.acceptance_criteria) : [],
          source_reference: req.source_reference ? JSON.parse(req.source_reference) : null,
          confidence: req.confidence,
          extraction_notes: req.extraction_notes,
          extraction_method: extractionMethod,
          approval_status: 'PENDING',
          order_index: idx,
          created_at: timestamp,
          updated_at: timestamp,
        });
      });

      // Update document status
      execute(
        `UPDATE srs_documents 
         SET status = 'REQUIREMENTS_GENERATED', extraction_method = ?, error_message = NULL, updated_at = ? 
         WHERE id = ?`,
        [extractionMethod, timestamp, docId]
      );

      // Advance project status if still CREATED or SRS_UPLOADED
      if (project.status === 'CREATED' || project.status === 'SRS_UPLOADED') {
        execute(
          `UPDATE projects SET status = 'REQUIREMENTS_EXTRACTED', updated_at = ? WHERE id = ?`,
          [timestamp, projectId]
        );
      }

      return inserted;
    });

    return NextResponse.json({
      success: true,
      count: savedRequirements.length,
      method: extractionMethod,
      warning: extractionWarning,
      data: savedRequirements,
    });
  } catch (error) {
    console.error('AI requirement extraction error:', error);
    return NextResponse.json(
      { success: false, error: 'Extraction failed', message: error.message },
      { status: 500 }
    );
  }
}

