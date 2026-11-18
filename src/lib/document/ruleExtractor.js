/**
 * GENESIS Heuristic & Deterministic SRS Requirement Extractor
 * Fallback parser used when Gemini AI is overloaded, down, or running in rules mode.
 *
 * Identifies:
 * - Requirement identifier patterns (e.g. REQ-001, FR-1, AUTH-01, 3.2.1)
 * - Modal requirement statements (shall, must, should, will)
 * - Structured requirement lists and section headers
 * - Deterministic categorization, MoSCoW prioritization, and criteria extraction
 *
 * Guarantees:
 * - approval_status is ALWAYS 'PENDING'
 * - confidence is strictly 'LOW' or 'MEDIUM'
 * - extraction_notes clearly states rules-based extraction
 */

import { VALID_CATEGORIES, VALID_PRIORITIES } from '../ai/gemini.js';

// Category keyword dictionary
const CATEGORY_MAP = [
  {
    category: 'SECURITY',
    keywords: ['security', 'auth', 'authentication', 'authorization', 'encrypt', 'password', 'token', 'rbac', 'csrf', 'xss'],
  },
  {
    category: 'PERFORMANCE',
    keywords: ['performance', 'latency', 'throughput', 'response time', 'seconds', 'concurrency', 'scalable', 'speed'],
  },
  {
    category: 'USABILITY',
    keywords: ['usability', 'ui', 'ux', 'accessible', 'responsive', 'interface', 'user-friendly', 'wcag', 'theme'],
  },
  {
    category: 'BUSINESS_RULE',
    keywords: ['billing', 'payment', 'subscription', 'tax', 'policy', 'compliance', 'pricing', 'legal', 'audit trail'],
  },
  {
    category: 'CONSTRAINT',
    keywords: ['constraint', 'platform', 'browser', 'database', 'must be written in', 'framework', 'operating system'],
  },
  {
    category: 'NON_FUNCTIONAL',
    keywords: ['availability', 'reliability', 'maintainability', 'backup', 'disaster recovery', 'uptime', 'sla'],
  },
  {
    category: 'FUNCTIONAL',
    keywords: ['system shall', 'user can', 'allow', 'create', 'read', 'update', 'delete', 'manage', 'send', 'export', 'upload'],
  },
];

// Requirement ID regular expressions
const REQ_ID_REGEX = /^\s*(?:[-*•]\s*)?(?:(?:\[|\()?\b((?:REQ|FR|NFR|SEC|PERF|AUTH|BR|UC)[-_]?[0-9A-Z]+|\d+(?:\.\d+)+)(?:\]|\))?[:\s.-]+)/i;

// Modal statement check
const MODAL_REGEX = /\b(shall|must|should|will|requires|is required to|needs to)\b/i;

/**
 * Categorizes requirement text using keyword frequency.
 * @param {string} text
 * @returns {string}
 */
export function categorizeText(text) {
  const lower = text.toLowerCase();
  for (const entry of CATEGORY_MAP) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return entry.category;
    }
  }
  return 'FUNCTIONAL';
}

/**
 * Infers requirement priority using MoSCoW / RFC 2119 keywords.
 * @param {string} text
 * @returns {string}
 */
export function inferPriority(text) {
  const lower = text.toLowerCase();
  if (/\b(?:critical|blocker|p0|essential)\b/i.test(lower)) return 'CRITICAL';
  if (/\b(?:must|shall|mandatory|high priority|p1)\b/i.test(lower)) return 'HIGH';
  if (/\b(?:should|recommended|medium priority|p2)\b/i.test(lower)) return 'MEDIUM';
  if (/\b(?:could|may|optional|low priority|nice to have|p3)\b/i.test(lower)) return 'LOW';
  return 'MEDIUM';
}

/**
 * Extracts structured requirements from plain or sectioned SRS document text.
 *
 * @param {string} documentText
 * @param {Array<{ reference: string, text: string }>} [sections]
 * @returns {Array<Object>}
 */
export function extractRequirementsWithRules(documentText, sections = []) {
  if (!documentText || typeof documentText !== 'string' || documentText.trim().length === 0) {
    return [];
  }

  const rawLines = documentText.split(/\r?\n/);
  const candidates = [];
  let currentSection = 'General';
  let currentPage = 1;
  let counter = 1;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line) continue;

    // Detect section headers
    if (/^(?:[0-9]+(?:\.[0-9]+)*\s+)?[A-Z][A-Za-z0-9\s/_-]{2,40}:?$/.test(line) && line.length < 50) {
      currentSection = line.replace(/:$/, '').trim();
      continue;
    }

    // Detect page markers if present (e.g. "--- Page 2 ---" or "[Page 2]")
    const pageMatch = line.match(/(?:page|--- page)\s+(\d+)/i);
    if (pageMatch) {
      currentPage = parseInt(pageMatch[1], 10);
      continue;
    }

    let reqCode = null;
    let description = '';

    const idMatch = line.match(REQ_ID_REGEX);
    if (idMatch) {
      reqCode = idMatch[1].toUpperCase();
      description = line.slice(idMatch[0].length).trim();
    } else if (MODAL_REGEX.test(line) && line.length >= 20) {
      // Line contains modal words and is substantial
      description = line.replace(/^[-*•\d.)\s]+/, '').trim();
    }

    if (description && description.length >= 15) {
      if (!reqCode) {
        reqCode = `REQ-${String(counter).padStart(3, '0')}`;
      }

      // Check if subsequent lines are bulleted acceptance criteria
      const acceptanceCriteria = [];
      let j = i + 1;
      while (j < rawLines.length) {
        const nextLine = rawLines[j].trim();
        if (/^[-*•]\s+/.test(nextLine) && !REQ_ID_REGEX.test(nextLine)) {
          acceptanceCriteria.push(nextLine.replace(/^[-*•]\s+/, '').trim());
          j++;
        } else {
          break;
        }
      }

      // If we consumed criteria lines, advance outer loop
      if (j > i + 1) {
        i = j - 1;
      }

      const category = categorizeText(`${currentSection} ${description}`);
      const priority = inferPriority(description);
      const title = description.length > 80 ? description.slice(0, 77) + '...' : description;

      candidates.push({
        req_code: reqCode,
        title,
        description,
        category,
        priority,
        type: `${category}_REQUIREMENT`,
        source_reference: JSON.stringify({
          section: currentSection,
          page: currentPage,
        }),
        acceptance_criteria: acceptanceCriteria.length > 0 ? JSON.stringify(acceptanceCriteria) : null,
        confidence: acceptanceCriteria.length > 0 ? 'MEDIUM' : 'LOW',
        extraction_notes: 'Extracted by rules (AI unavailable) — review carefully',
        approval_status: 'PENDING',
        order_index: counter - 1,
        extraction_method: 'RULES',
      });

      counter++;
    }
  }

  // Deduplicate requirement codes
  const seenCodes = new Set();
  const result = [];
  for (const item of candidates) {
    let safeCode = item.req_code;
    let dupIndex = 1;
    while (seenCodes.has(safeCode)) {
      safeCode = `${item.req_code}_${dupIndex++}`;
    }
    seenCodes.add(safeCode);
    item.req_code = safeCode;
    result.push(item);
  }

  return result;
}

