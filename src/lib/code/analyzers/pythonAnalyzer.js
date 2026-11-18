import { getExcerpt } from './javascriptAnalyzer.js';

/**
 * Analyzes Python source code using robust heuristic regex analysis.
 * Clearly marked with analysisMethod = 'HEURISTIC' and confidence.
 *
 * @param {string} content - Full source code text
 * @param {string} filePath - Normalized relative path
 * @returns {Array<Object>} List of evidence objects
 */
export function analyzePython(content, filePath) {
  if (!content || typeof content !== 'string') return [];

  const lines = content.split('\n');
  const evidence = [];

  // Helper to get 1-based line number from string index
  function getLineNumber(index) {
    return content.substring(0, index).split('\n').length;
  }

  // 1. Function definitions: def func_name(...)
  const funcRegex = /def\s+([a-zA-Z0-9_]+)\s*\((.*?)\)\s*(?:->\s*[^:]+)?\s*:/g;
  let match;
  while ((match = funcRegex.exec(content)) !== null) {
    const startLine = getLineNumber(match.index);
    const funcName = match[1];

    // Check if test function
    if (funcName.startsWith('test_') || funcName.endsWith('_test')) {
      evidence.push({
        filePath,
        language: 'python',
        evidenceType: 'TEST_REFERENCE',
        identifier: funcName,
        startLine,
        endLine: Math.min(startLine + 3, lines.length),
        codeSnippet: getExcerpt(lines, startLine, startLine + 3),
        contextSummary: `Heuristic: Python test function '${funcName}'`,
        analysisMethod: 'HEURISTIC',
        confidence: 'HIGH',
      });
    } else {
      evidence.push({
        filePath,
        language: 'python',
        evidenceType: 'FUNCTION',
        identifier: funcName,
        startLine,
        endLine: Math.min(startLine + 4, lines.length),
        codeSnippet: getExcerpt(lines, startLine, startLine + 4),
        contextSummary: `Heuristic: Python function '${funcName}'`,
        analysisMethod: 'HEURISTIC',
        confidence: 'HIGH',
      });
    }
  }

  // 2. Class definitions: class ClassName(...)
  const classRegex = /class\s+([a-zA-Z0-9_]+)(?:\s*\((.*?)\))?\s*:/g;
  while ((match = classRegex.exec(content)) !== null) {
    const startLine = getLineNumber(match.index);
    const className = match[1];
    const bases = match[2] ? match[2].trim() : '';

    if (bases.includes('TestCase') || className.includes('Test')) {
      evidence.push({
        filePath,
        language: 'python',
        evidenceType: 'TEST_REFERENCE',
        identifier: className,
        startLine,
        endLine: Math.min(startLine + 4, lines.length),
        codeSnippet: getExcerpt(lines, startLine, startLine + 4),
        contextSummary: `Heuristic: Python test case class '${className}'`,
        analysisMethod: 'HEURISTIC',
        confidence: 'HIGH',
      });
    } else {
      evidence.push({
        filePath,
        language: 'python',
        evidenceType: 'CLASS',
        identifier: className,
        startLine,
        endLine: Math.min(startLine + 4, lines.length),
        codeSnippet: getExcerpt(lines, startLine, startLine + 4),
        contextSummary: `Heuristic: Python class '${className}'${bases ? ` (inherits: ${bases})` : ''}`,
        analysisMethod: 'HEURISTIC',
        confidence: 'HIGH',
      });
    }
  }

  // 3. Flask / FastAPI / Bottle / Django route decorators
  // FastAPI: @app.get("/path") or @router.post("/path")
  const fastApiRegex = /@(?:app|router|api)\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/g;
  while ((match = fastApiRegex.exec(content)) !== null) {
    const startLine = getLineNumber(match.index);
    const method = match[1].toUpperCase();
    const route = match[2];

    evidence.push({
      filePath,
      language: 'python',
      evidenceType: 'API_ENDPOINT',
      identifier: `${method} ${route}`,
      startLine,
      endLine: Math.min(startLine + 3, lines.length),
      codeSnippet: getExcerpt(lines, startLine, startLine + 3),
      contextSummary: `Heuristic: FastAPI endpoint route ${method} "${route}"`,
      analysisMethod: 'HEURISTIC',
      confidence: 'HIGH',
    });
  }

  // Flask: @app.route("/path", methods=["GET", "POST"])
  const flaskRegex = /@(?:app|api|bp)\.route\(\s*['"]([^'"]+)['"](?:\s*,\s*methods\s*=\s*\[(.*?)\])?/g;
  while ((match = flaskRegex.exec(content)) !== null) {
    const startLine = getLineNumber(match.index);
    const route = match[1];
    const methods = match[2] ? match[2].replace(/['"\s]/g, '') : 'GET';

    evidence.push({
      filePath,
      language: 'python',
      evidenceType: 'API_ENDPOINT',
      identifier: `${methods.toUpperCase()} ${route}`,
      startLine,
      endLine: Math.min(startLine + 3, lines.length),
      codeSnippet: getExcerpt(lines, startLine, startLine + 3),
      contextSummary: `Heuristic: Flask endpoint route "${route}" [${methods}]`,
      analysisMethod: 'HEURISTIC',
      confidence: 'HIGH',
    });
  }

  // 4. Database operations: SQLAlchemy / Cursor / Django ORM
  const dbRegex = /(?:session|cursor|db)\.(?:execute|query|commit|rollback|add|delete)\(|models\.(?:Model|CharField|IntegerField)/g;
  while ((match = dbRegex.exec(content)) !== null) {
    const startLine = getLineNumber(match.index);
    evidence.push({
      filePath,
      language: 'python',
      evidenceType: 'DATABASE_OPERATION',
      identifier: match[0].replace('(', '()'),
      startLine,
      endLine: Math.min(startLine + 2, lines.length),
      codeSnippet: getExcerpt(lines, startLine, startLine + 2),
      contextSummary: `Heuristic: Python database call / model definition`,
      analysisMethod: 'HEURISTIC',
      confidence: 'MEDIUM',
    });
  }

  // 5. Authentication indicators: bcrypt, hashlib, @login_required, jwt
  const authRegex = /(?:bcrypt|hashlib|argon2|jwt)\.(?:hash|check_password_hash|encode|decode|sha256)|@login_required|@jwt_required/g;
  while ((match = authRegex.exec(content)) !== null) {
    const startLine = getLineNumber(match.index);
    evidence.push({
      filePath,
      language: 'python',
      evidenceType: 'AUTHENTICATION_INDICATOR',
      identifier: match[0],
      startLine,
      endLine: Math.min(startLine + 2, lines.length),
      codeSnippet: getExcerpt(lines, startLine, startLine + 2),
      contextSummary: `Heuristic: Python authentication / cryptographic indicator`,
      analysisMethod: 'HEURISTIC',
      confidence: 'HIGH',
    });
  }

  // 6. Validation indicators: Pydantic BaseModel, Field, validator
  const valRegex = /class\s+[a-zA-Z0-9_]+\s*\(\s*BaseModel\s*\)|@field_validator|@validator/g;
  while ((match = valRegex.exec(content)) !== null) {
    const startLine = getLineNumber(match.index);
    evidence.push({
      filePath,
      language: 'python',
      evidenceType: 'VALIDATION_INDICATOR',
      identifier: match[0],
      startLine,
      endLine: Math.min(startLine + 3, lines.length),
      codeSnippet: getExcerpt(lines, startLine, startLine + 3),
      contextSummary: `Heuristic: Pydantic validation schema / validator`,
      analysisMethod: 'HEURISTIC',
      confidence: 'HIGH',
    });
  }

  return evidence;
}

