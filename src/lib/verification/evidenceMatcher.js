/**
 * Deterministic Evidence Retrieval & Scoring Engine
 *
 * Maps approved requirements against Phase 3 static code evidence records
 * using lexical tokenization, semantic category alignment, and identifier matching.
 * Produces bounded candidate sets for AI interpretation without fabricating references.
 */

// Common grammatical stop words to ignore during tokenization
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
  'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were',
  'will', 'with', 'must', 'shall', 'should', 'can', 'could', 'may',
  'all', 'any', 'or', 'such', 'this',
]);

/**
 * Splits text into normalized, distinct keywords.
 * Expands camelCase and snake_case tokens.
 * @param {string} text
 * @returns {Set<string>}
 */
export function extractKeywords(text) {
  if (!text || typeof text !== 'string') return new Set();

  const words = text
    .replace(/[^\w\s/.-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const keywords = new Set();

  for (const rawWord of words) {
    const word = rawWord.toLowerCase();
    if (word.length >= 2 && !STOP_WORDS.has(word)) {
      keywords.add(word);
    }

    // Split camelCase: e.g. authenticateUser -> authenticate, user
    const camelParts = rawWord.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/\s+/);
    if (camelParts.length > 1) {
      for (const part of camelParts) {
        if (part.length >= 2 && !STOP_WORDS.has(part)) {
          keywords.add(part);
        }
      }
    }

    // Split snake_case or kebab-case or path segments: auth_service / auth-service / api/users
    const subParts = rawWord.split(/[_\-/.]+/);
    if (subParts.length > 1) {
      for (const part of subParts) {
        const lowerPart = part.toLowerCase();
        if (lowerPart.length >= 2 && !STOP_WORDS.has(lowerPart)) {
          keywords.add(lowerPart);
        }
      }
    }
  }

  return keywords;
}

/**
 * Parses acceptance criteria from string or JSON format.
 * @param {string|Array} rawCriteria
 * @returns {Array<string>}
 */
export function parseAcceptanceCriteria(rawCriteria) {
  if (!rawCriteria) return [];
  if (Array.isArray(rawCriteria)) return rawCriteria.map(String).filter(Boolean);
  if (typeof rawCriteria === 'string') {
    try {
      const parsed = JSON.parse(rawCriteria);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {}
    return [rawCriteria.trim()];
  }
  return [];
}

/**
 * Matches a single requirement against all code evidence records for a submission.
 * Deterministic scoring based on keyword overlap, identifier matches, and category alignment.
 *
 * @param {Object} requirement - Approved requirement record
 * @param {Array<Object>} evidenceList - List of code_evidence records
 * @param {Object} [options]
 * @returns {Array<Object>} Ranked list of candidate evidence items
 */
export function matchEvidenceForRequirement(requirement, evidenceList, options = {}) {
  const maxCandidates = options.maxCandidates || 12;
  const minScoreThreshold = options.minScoreThreshold || 4;

  if (!requirement || !Array.isArray(evidenceList) || evidenceList.length === 0) {
    return [];
  }

  // 1. Extract requirement keywords
  const titleKeywords = extractKeywords(requirement.title);
  const descKeywords = extractKeywords(requirement.description);
  const criteriaList = parseAcceptanceCriteria(requirement.acceptance_criteria);
  const criteriaKeywords = extractKeywords(criteriaList.join(' '));
  const category = (requirement.category || '').toUpperCase();

  // Combine all requirement keywords with weightings
  const allReqKeywords = new Set([...titleKeywords, ...descKeywords, ...criteriaKeywords]);

  const candidates = [];

  for (const ev of evidenceList) {
    let score = 0;
    const matchReasons = [];

    const evIdentifierKeywords = extractKeywords(ev.identifier);
    const evPathKeywords = extractKeywords(ev.file_path);
    const evSummaryKeywords = extractKeywords(ev.context_summary);
    const evSnippetLower = (ev.code_snippet || '').toLowerCase();
    const evType = (ev.evidence_type || 'OTHER').toUpperCase();

    // A. Identifier direct matches (highest relevance)
    let identifierMatches = 0;
    for (const kw of allReqKeywords) {
      if (evIdentifierKeywords.has(kw)) {
        score += 8;
        identifierMatches++;
      } else if (ev.identifier.toLowerCase().includes(kw) && kw.length >= 3) {
        score += 4;
        identifierMatches++;
      }
    }
    if (identifierMatches > 0) {
      matchReasons.push(`Identifier matches ${identifierMatches} requirement keyword(s)`);
    }

    // B. Acceptance criteria specific matches
    let criteriaMatches = 0;
    for (const kw of criteriaKeywords) {
      if (evIdentifierKeywords.has(kw) || evSnippetLower.includes(kw)) {
        score += 5;
        criteriaMatches++;
      }
    }
    if (criteriaMatches > 0) {
      matchReasons.push(`Matches ${criteriaMatches} acceptance criterion keyword(s)`);
    }

    // C. File path matches
    let pathMatches = 0;
    for (const kw of titleKeywords) {
      if (evPathKeywords.has(kw)) {
        score += 3;
        pathMatches++;
      }
    }
    if (pathMatches > 0) {
      matchReasons.push(`File path reflects feature keyword`);
    }

    // D. Context summary matches
    for (const kw of titleKeywords) {
      if (evSummaryKeywords.has(kw)) {
        score += 2;
      }
    }

    // E. Category / Evidence Type alignment bonus
    if (category === 'SECURITY' && (evType === 'AUTHENTICATION_INDICATOR' || evType === 'VALIDATION_INDICATOR')) {
      score += 6;
      matchReasons.push(`Evidence type '${evType}' aligns with SECURITY requirement`);
    } else if ((category === 'DATA' || category === 'DATABASE') && evType === 'DATABASE_OPERATION') {
      score += 6;
      matchReasons.push(`Evidence type 'DATABASE_OPERATION' aligns with DATA requirement`);
    } else if (category === 'FUNCTIONAL' && (evType === 'API_ENDPOINT' || evType === 'FUNCTION' || evType === 'METHOD')) {
      score += 3;
    }

    // F. AST vs Heuristic method bonus (higher confidence in AST-derived structural nodes)
    if (ev.analysis_method === 'AST') {
      score += 1;
    }

    // Only include candidate if score meets threshold
    if (score >= minScoreThreshold) {
      candidates.push({
        evidenceId: ev.id,
        requirementId: requirement.id,
        relevanceScore: Math.min(100, score),
        matchingReason: matchReasons.join('; ') || 'Lexical keyword overlap',
        evidenceType: ev.evidence_type,
        identifier: ev.identifier,
        filePath: ev.file_path,
        startLine: ev.start_line,
        endLine: ev.end_line,
        codeSnippet: ev.code_snippet,
        contextSummary: ev.context_summary,
        analysisMethod: ev.analysis_method,
        confidence: ev.confidence,
      });
    }
  }

  // Sort candidates strictly by relevance score descending
  candidates.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Return top N bounded candidates
  return candidates.slice(0, maxCandidates);
}
