/**
 * GENESIS Deterministic Rule-Based Verifier
 * Static evaluation engine activated when AI (Gemini) is unavailable,
 * overloaded, misconfigured, or running in rules-only mode.
 *
 * Adheres strictly to GENESIS academic integrity rules:
 * - Evidence IDs MUST come from candidate set; never hallucinate.
 * - NEVER returns NOT_IMPLEMENTED (rules cannot prove absolute absence).
 * - VERIFIED requires >= 2 independent evidence items, >= 75% criteria coverage, and no stubs.
 * - Confidence is capped at 0.65.
 * - Fully deterministic: byte-identical outputs for identical inputs.
 */

import { RULE_CATALOG, STUB_PATTERNS } from './ruleCatalog.js';
import { extractKeywords, parseAcceptanceCriteria } from '../evidenceMatcher.js';

// Status and Policy Named Constants
export const MAX_RULES_CONFIDENCE = 0.65;
export const MIN_CRITERIA_COVERAGE_FOR_VERIFIED = 0.75;
export const MIN_INDEPENDENT_EVIDENCE_FOR_VERIFIED = 2;
export const VERIFIED_STATUS = 'VERIFIED';
export const PARTIALLY_IMPLEMENTED_STATUS = 'PARTIALLY_IMPLEMENTED';
export const UNVERIFIED_STATUS = 'UNVERIFIED';

/**
 * Checks if a code snippet contains incomplete implementation markers.
 * @param {string} snippet
 * @returns {boolean}
 */
export function containsStubMarker(snippet) {
  if (!snippet || typeof snippet !== 'string') return false;
  return STUB_PATTERNS.some((pattern) => pattern.test(snippet));
}

/**
 * Evaluates whether two evidence items qualify as independent.
 * Independent if:
 * 1) They come from distinct files, OR
 * 2) One is AST-derived and the other is type-aligned with the target rule.
 */
export function evaluateEvidenceIndependence(supportingEvidence, primaryRule) {
  if (!supportingEvidence || supportingEvidence.length < 2) return false;

  const distinctFiles = new Set(supportingEvidence.map((e) => e.filePath || e.file_path)).size;
  if (distinctFiles >= MIN_INDEPENDENT_EVIDENCE_FOR_VERIFIED) {
    return true;
  }

  const hasAst = supportingEvidence.some((e) => (e.analysisMethod || e.analysis_method) === 'AST');
  const hasTypeAligned = supportingEvidence.some((e) => {
    const type = e.evidenceType || e.evidence_type;
    return primaryRule?.expectedSignals?.evidenceTypes?.includes(type);
  });

  return hasAst && hasTypeAligned;
}

/**
 * Executes deterministic rules-based verification for an approved requirement.
 *
 * @param {Object} requirement - Approved requirement record
 * @param {Array<Object>} candidateEvidence - Candidate evidence items retrieved for requirement
 * @param {Object} [codebaseContext]
 * @returns {Object} Deterministic verification result matching standard schema
 */
export function verifyRequirementWithRules(requirement, candidateEvidence = [], codebaseContext = {}) {
  if (!requirement || !requirement.id) {
    throw new Error('Invalid requirement: requirement object with ID is required.');
  }

  // Ensure deterministic candidate evidence sorting by evidenceId
  const sortedCandidates = [...candidateEvidence].sort((a, b) => {
    const idA = String(a.evidenceId || a.id || '');
    const idB = String(b.evidenceId || b.id || '');
    return idA.localeCompare(idB);
  });

  const criteriaList = parseAcceptanceCriteria(requirement.acceptance_criteria);
  const reqText = `${requirement.title || ''} ${requirement.description || ''} ${criteriaList.join(' ')}`;

  // 1. Identify matched catalog rules
  const matchedRules = RULE_CATALOG.filter((rule) =>
    rule.triggerRegexes.some((regex) => regex.test(reqText))
  ).sort((a, b) => a.id.localeCompare(b.id));

  const matchedRuleIds = matchedRules.map((r) => r.id);

  // If no candidate evidence at all, return UNVERIFIED immediately
  if (sortedCandidates.length === 0) {
    return {
      requirement_id: requirement.id,
      status: UNVERIFIED_STATUS,
      confidence_score: 0.15,
      confidence_reason: 'No candidate evidence discovered matching requirement keywords.',
      explanation: `Rules-based assessment (AI unavailable): No candidate code evidence was identified for requirement ${requirement.req_code} ("${requirement.title}"). In accordance with core integrity rules, absence of keyword matches alone cannot prove non-implementation without full dynamic execution. Status is UNVERIFIED.`,
      supporting_evidence_ids: [],
      contradicting_evidence_ids: [],
      acceptance_criteria_assessment: criteriaList.map((c) => ({
        criterion: c,
        assessment: 'INCONCLUSIVE',
        evidence_ids: [],
        explanation: 'No candidate evidence discovered for this criterion.',
      })),
      limitations: [
        'Not AI-reviewed; re-run with AI when available.',
        'Rules engine found no candidate symbols or endpoints.',
      ],
      method: 'RULES',
      matched_rule_ids: matchedRuleIds,
    };
  }

  // 2. Score and filter candidate evidence against matched rules
  const supportingEvidence = [];
  let foundAnyStub = false;
  let allSupportingAreStubs = true;

  for (const cand of sortedCandidates) {
    const evType = cand.evidenceType || cand.evidence_type;
    const identifier = cand.identifier || '';
    const snippet = cand.codeSnippet || cand.code_snippet || '';
    const evId = cand.evidenceId || cand.id;

    const isStub = containsStubMarker(snippet);
    if (isStub) foundAnyStub = true;

    // Check if candidate matches any matched rule's signals
    let alignsWithRule = false;
    if (matchedRules.length > 0) {
      for (const rule of matchedRules) {
        const typeMatch = rule.expectedSignals.evidenceTypes.includes(evType);
        const identMatch = rule.expectedSignals.identifierPatterns.some((p) => p.test(identifier));
        const snippetMatch = rule.expectedSignals.snippetPatterns.some((p) => p.test(snippet));

        if (typeMatch || identMatch || snippetMatch) {
          alignsWithRule = true;
          break;
        }
      }
    } else {
      // General alignment when requirement did not match specific specialized rules
      const reqKeywords = extractKeywords(reqText);
      const evKeywords = extractKeywords(`${identifier} ${snippet}`);
      let overlap = 0;
      for (const kw of reqKeywords) {
        if (evKeywords.has(kw)) overlap++;
      }
      if (overlap >= 2) alignsWithRule = true;
    }

    if (alignsWithRule) {
      supportingEvidence.push(cand);
      if (!isStub) {
        allSupportingAreStubs = false;
      }
    }
  }

  const supportingIds = supportingEvidence
    .map((e) => String(e.evidenceId || e.id))
    .sort();

  // 3. Criteria Keyword Coverage Assessment
  const criteriaAssessments = [];
  let supportedCriteriaCount = 0;

  if (criteriaList.length > 0) {
    for (const criterion of criteriaList) {
      const critKeywords = extractKeywords(criterion);
      const matchingForCrit = supportingEvidence.filter((e) => {
        const text = `${e.identifier || ''} ${e.codeSnippet || e.code_snippet || ''}`;
        const kwSet = extractKeywords(text);
        let count = 0;
        for (const kw of critKeywords) {
          if (kwSet.has(kw)) count++;
        }
        return count >= 1;
      });

      const critEvIds = matchingForCrit.map((e) => String(e.evidenceId || e.id)).sort();
      let assessment = 'INCONCLUSIVE';
      let explanation = 'No code evidence directly addressed this criterion.';

      if (critEvIds.length > 0) {
        const hasStub = matchingForCrit.some((e) => containsStubMarker(e.codeSnippet || e.code_snippet));
        if (hasStub) {
          assessment = 'PARTIALLY_SUPPORTED';
          explanation = 'Candidate evidence discovered but contains implementation stub markers.';
          supportedCriteriaCount += 0.5;
        } else {
          assessment = 'SUPPORTED';
          explanation = `Supported by deterministic evidence in ${matchingForCrit.map((e) => e.filePath).slice(0, 2).join(', ')}.`;
          supportedCriteriaCount += 1.0;
        }
      }

      criteriaAssessments.push({
        criterion,
        assessment,
        evidence_ids: critEvIds,
        explanation,
      });
    }
  }

  const criteriaCoverage = criteriaList.length > 0
    ? supportedCriteriaCount / criteriaList.length
    : (supportingEvidence.length >= 2 ? 0.8 : supportingEvidence.length === 1 ? 0.5 : 0.0);

  // 4. Determine Status based on Policy
  const primaryRule = matchedRules[0] || null;
  const isIndependent = evaluateEvidenceIndependence(supportingEvidence, primaryRule);
  let status = UNVERIFIED_STATUS;
  let confidenceScore = 0.2;

  if (supportingEvidence.length === 0) {
    status = UNVERIFIED_STATUS;
    confidenceScore = 0.2;
  } else if (allSupportingAreStubs) {
    // Stubs only -> capped at PARTIALLY_IMPLEMENTED
    status = PARTIALLY_IMPLEMENTED_STATUS;
    confidenceScore = Math.min(0.4, MAX_RULES_CONFIDENCE);
  } else if (
    isIndependent &&
    criteriaCoverage >= MIN_CRITERIA_COVERAGE_FOR_VERIFIED &&
    !foundAnyStub
  ) {
    status = VERIFIED_STATUS;
    // Compute calibrated confidence <= MAX_RULES_CONFIDENCE
    confidenceScore = Math.min(
      MAX_RULES_CONFIDENCE,
      0.50 + (criteriaCoverage * 0.10) + (isIndependent ? 0.05 : 0)
    );
  } else {
    // Some signal exists but not sufficient for full VERIFIED
    status = PARTIALLY_IMPLEMENTED_STATUS;
    confidenceScore = Math.min(
      0.50,
      0.30 + (criteriaCoverage * 0.15)
    );
  }

  // Ensure confidence score is strictly clamped
  confidenceScore = Math.max(0.1, Math.min(MAX_RULES_CONFIDENCE, parseFloat(confidenceScore.toFixed(2))));

  // 5. Construct Explanation and Limitations
  const ruleSummary = matchedRules.length > 0
    ? `Matched deterministic rule(s): ${matchedRules.map((r) => r.name).join(', ')}.`
    : 'Evaluated using generalized lexical and semantic identifier alignment.';

  const evidenceSummary = supportingIds.length > 0
    ? `Identified ${supportingIds.length} supporting code evidence item(s) across ${new Set(supportingEvidence.map((e) => e.filePath)).size} file(s).`
    : 'No candidate evidence satisfactorily matched the expected structural signals.';

  const stubNotice = foundAnyStub
    ? ' Note: One or more candidate evidence snippets contained TODO/FIXME or incomplete stub markers.'
    : '';

  const explanation = `Rules-based assessment (AI unavailable): ${ruleSummary} ${evidenceSummary}${stubNotice}`;

  const limitations = [
    'Not AI-reviewed; re-run with AI when available.',
    'Status determined strictly via deterministic pattern and signal heuristics.',
  ];

  if (foundAnyStub) {
    limitations.push('Implementation stubs detected in matching code blocks.');
  }

  return {
    requirement_id: requirement.id,
    status,
    confidence_score: confidenceScore,
    confidence_reason: `Deterministic rules evaluation (${matchedRules.length} rules matched, ${supportingIds.length} evidence signals).`,
    explanation,
    supporting_evidence_ids: supportingIds,
    contradicting_evidence_ids: [],
    acceptance_criteria_assessment: criteriaAssessments,
    limitations,
    method: 'RULES',
    matched_rule_ids: matchedRuleIds,
  };
}

