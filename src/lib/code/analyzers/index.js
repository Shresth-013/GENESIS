import { analyzeJavaScript } from './javascriptAnalyzer.js';
import { analyzePython } from './pythonAnalyzer.js';
import { analyzeJava } from './javaAnalyzer.js';
import { analyzeSql } from './sqlAnalyzer.js';
import { analyzeHtml } from './htmlAnalyzer.js';

/**
 * Dispatches source code to the appropriate static analyzer based on language.
 *
 * Supported analyzers:
 * - JavaScript / JSX / MJS / CJS: AST-based (Babel parser) with heuristic fallback
 * - Python: Heuristic regex analysis
 * - Java: Heuristic regex and annotation analysis
 * - SQL: Pattern-based schema and query analysis
 * - HTML: Pattern-based form and input constraint analysis
 *
 * @param {string} content - Source code content
 * @param {string} filePath - Normalized relative path
 * @param {string} language - Detected language
 * @returns {Array<Object>} Collected evidence records
 */
export function analyzeSourceFile(content, filePath, language) {
  if (!content || typeof content !== 'string') return [];

  const lang = (language || '').toLowerCase();

  switch (lang) {
    case 'javascript':
      return analyzeJavaScript(content, filePath);
    case 'python':
      return analyzePython(content, filePath);
    case 'java':
      return analyzeJava(content, filePath);
    case 'sql':
      return analyzeSql(content, filePath);
    case 'html':
      return analyzeHtml(content, filePath);
    case 'css':
      // CSS is cataloged in code_files, but does not produce structural logic evidence
      return [];
    default:
      return [];
  }
}

