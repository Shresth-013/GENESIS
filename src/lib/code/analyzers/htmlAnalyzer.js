import { getExcerpt } from './javascriptAnalyzer.js';

/**
 * Analyzes HTML/CSS documents for interactive elements, forms, and client endpoints.
 *
 * @param {string} content - HTML/CSS source text
 * @param {string} filePath - Normalized relative path
 * @returns {Array<Object>} List of evidence objects
 */
export function analyzeHtml(content, filePath) {
  if (!content || typeof content !== 'string') return [];

  const lines = content.split('\n');
  const evidence = [];

  function getLineNumber(index) {
    return content.substring(0, index).split('\n').length;
  }

  // 1. Form elements with actions / endpoints
  const formRegex = /<form\s+[^>]*action=["']([^"']+)["'][^>]*method=["']([^"']+)["']|<form\s+[^>]*method=["']([^"']+)["'][^>]*action=["']([^"']+)["']|<form\s+[^>]*action=["']([^"']+)["']/gi;
  let match;
  while ((match = formRegex.exec(content)) !== null) {
    const startLine = getLineNumber(match.index);
    const action = match[1] || match[4] || match[5] || '/';
    const method = (match[2] || match[3] || 'POST').toUpperCase();

    evidence.push({
      filePath,
      language: 'html',
      evidenceType: 'API_ENDPOINT',
      identifier: `HTML FORM ${method} ${action}`,
      startLine,
      endLine: Math.min(startLine + 2, lines.length),
      codeSnippet: getExcerpt(lines, startLine, startLine + 2),
      contextSummary: `HTML form submission endpoint: ${method} "${action}"`,
      analysisMethod: 'PATTERN',
      confidence: 'MEDIUM',
    });
  }

  // 2. Password input fields (Authentication indicator)
  const passwordInputRegex = /<input\s+[^>]*type=["']password["']/gi;
  while ((match = passwordInputRegex.exec(content)) !== null) {
    const startLine = getLineNumber(match.index);
    evidence.push({
      filePath,
      language: 'html',
      evidenceType: 'AUTHENTICATION_INDICATOR',
      identifier: 'HTML Password Input',
      startLine,
      endLine: Math.min(startLine + 1, lines.length),
      codeSnippet: getExcerpt(lines, startLine, startLine + 1),
      contextSummary: `HTML password credential input field`,
      analysisMethod: 'PATTERN',
      confidence: 'HIGH',
    });
  }

  // 3. Email / required validation attributes (Validation indicator)
  const validationInputRegex = /<input\s+[^>]*required[^>]*>/gi;
  while ((match = validationInputRegex.exec(content)) !== null) {
    const startLine = getLineNumber(match.index);
    evidence.push({
      filePath,
      language: 'html',
      evidenceType: 'VALIDATION_INDICATOR',
      identifier: 'HTML Required Input',
      startLine,
      endLine: Math.min(startLine + 1, lines.length),
      codeSnippet: getExcerpt(lines, startLine, startLine + 1),
      contextSummary: `HTML5 form client-side input constraint (required)`,
      analysisMethod: 'PATTERN',
      confidence: 'MEDIUM',
    });
  }

  return evidence;
}

