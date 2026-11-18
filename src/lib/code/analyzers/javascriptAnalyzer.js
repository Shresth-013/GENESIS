import { parse } from '@babel/parser';

/**
 * Extracts a sliced code excerpt from source lines.
 * @param {Array<string>} lines - 0-indexed array of lines
 * @param {number} startLine - 1-based start line
 * @param {number} endLine - 1-based end line
 * @param {number} maxChars - Maximum characters to return
 * @returns {string}
 */
export function getExcerpt(lines, startLine, endLine, maxChars = 500) {
  const startIdx = Math.max(0, startLine - 1);
  const endIdx = Math.min(lines.length, endLine);
  const snippet = lines.slice(startIdx, endIdx).join('\n').trim();
  if (snippet.length > maxChars) {
    return snippet.slice(0, maxChars - 3) + '...';
  }
  return snippet;
}

/**
 * Heuristic fallback parser for JavaScript/JSX when AST parser encounters errors.
 * Uses regex patterns to identify obvious structural markers.
 *
 * @param {string} content
 * @param {string} filePath
 * @param {Array<string>} lines
 * @returns {Array<Object>}
 */
export function heuristicJsAnalysis(content, filePath, lines) {
  const evidence = [];

  // 1. Function declarations: function name(...)
  const funcRegex = /function\s+([a-zA-Z0-9_$]+)\s*\((.*?)\)/g;
  let match;
  while ((match = funcRegex.exec(content)) !== null) {
    const startLine = content.substring(0, match.index).split('\n').length;
    evidence.push({
      filePath,
      language: 'javascript',
      evidenceType: 'FUNCTION',
      identifier: match[1],
      startLine,
      endLine: startLine,
      codeSnippet: getExcerpt(lines, startLine, startLine + 3),
      contextSummary: `Heuristic match: function '${match[1]}'`,
      analysisMethod: 'HEURISTIC',
      confidence: 'MEDIUM',
    });
  }

  // 2. Class declarations: class Name
  const classRegex = /class\s+([a-zA-Z0-9_$]+)/g;
  while ((match = classRegex.exec(content)) !== null) {
    const startLine = content.substring(0, match.index).split('\n').length;
    evidence.push({
      filePath,
      language: 'javascript',
      evidenceType: 'CLASS',
      identifier: match[1],
      startLine,
      endLine: startLine,
      codeSnippet: getExcerpt(lines, startLine, startLine + 3),
      contextSummary: `Heuristic match: class '${match[1]}'`,
      analysisMethod: 'HEURISTIC',
      confidence: 'MEDIUM',
    });
  }

  // 3. API endpoints: app.get('/path', ...) or router.post(...)
  const routeRegex = /(?:app|router|server)\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]/g;
  while ((match = routeRegex.exec(content)) !== null) {
    const startLine = content.substring(0, match.index).split('\n').length;
    const method = match[1].toUpperCase();
    const route = match[2];
    evidence.push({
      filePath,
      language: 'javascript',
      evidenceType: 'API_ENDPOINT',
      identifier: `${method} ${route}`,
      startLine,
      endLine: startLine,
      codeSnippet: getExcerpt(lines, startLine, startLine + 2),
      contextSummary: `Heuristic match: Express/Router endpoint ${method} ${route}`,
      analysisMethod: 'HEURISTIC',
      confidence: 'MEDIUM',
    });
  }

  return evidence;
}

/**
 * Analyzes JavaScript/JSX source code using Babel AST parser.
 * Identifies functions, classes, methods, API endpoints, DB queries, auth indicators,
 * validation indicators, and test references.
 *
 * @param {string} content - Full source code text
 * @param {string} filePath - Normalized relative path
 * @returns {Array<Object>} List of evidence objects
 */
export function analyzeJavaScript(content, filePath) {
  if (!content || typeof content !== 'string') return [];

  const lines = content.split('\n');
  const evidence = [];

  let ast;
  try {
    ast = parse(content, {
      sourceType: 'unambiguous',
      plugins: [
        'jsx',
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        'dynamicImport',
        'optionalChaining',
        'nullishCoalescingOperator',
        'topLevelAwait',
        'exportDefaultFrom',
      ],
      errorRecovery: true,
    });
  } catch (parseError) {
    // Record parse error honestly
    evidence.push({
      filePath,
      language: 'javascript',
      evidenceType: 'OTHER',
      identifier: 'PARSE_ERROR',
      startLine: parseError.loc?.line || 1,
      endLine: parseError.loc?.line || 1,
      codeSnippet: getExcerpt(lines, parseError.loc?.line || 1, (parseError.loc?.line || 1) + 2),
      contextSummary: `Babel parser syntax error: ${parseError.message}`,
      analysisMethod: 'AST',
      confidence: 'LOW',
    });

    // Run heuristic fallback
    const fallbackEvidence = heuristicJsAnalysis(content, filePath, lines);
    return [...evidence, ...fallbackEvidence];
  }

  // AST Recursive Walker
  function walk(node, parent) {
    if (!node || typeof node !== 'object') return;

    // 1. Function Declarations
    if (node.type === 'FunctionDeclaration') {
      const name = node.id ? node.id.name : 'anonymous';
      const startLine = node.loc?.start?.line || 1;
      const endLine = node.loc?.end?.line || startLine;

      evidence.push({
        filePath,
        language: 'javascript',
        evidenceType: 'FUNCTION',
        identifier: name,
        startLine,
        endLine,
        codeSnippet: getExcerpt(lines, startLine, endLine),
        contextSummary: `Function declaration '${name}' with ${node.params?.length || 0} parameter(s)`,
        analysisMethod: 'AST',
        confidence: 'HIGH',
      });
    }

    // 2. Arrow Functions or Function Expressions bound to Variables
    if (
      node.type === 'VariableDeclarator' &&
      node.init &&
      (node.init.type === 'ArrowFunctionExpression' || node.init.type === 'FunctionExpression')
    ) {
      const name = node.id?.name || 'anonymous';
      const startLine = node.loc?.start?.line || 1;
      const endLine = node.init.loc?.end?.line || startLine;

      evidence.push({
        filePath,
        language: 'javascript',
        evidenceType: 'FUNCTION',
        identifier: name,
        startLine,
        endLine,
        codeSnippet: getExcerpt(lines, startLine, endLine),
        contextSummary: `Variable function '${name}' (${node.init.type})`,
        analysisMethod: 'AST',
        confidence: 'HIGH',
      });
    }

    // 3. Class Declarations
    if (node.type === 'ClassDeclaration') {
      const name = node.id ? node.id.name : 'anonymous';
      const startLine = node.loc?.start?.line || 1;
      const endLine = node.loc?.end?.line || startLine;

      evidence.push({
        filePath,
        language: 'javascript',
        evidenceType: 'CLASS',
        identifier: name,
        startLine,
        endLine,
        codeSnippet: getExcerpt(lines, startLine, Math.min(startLine + 5, endLine)),
        contextSummary: `Class declaration '${name}'`,
        analysisMethod: 'AST',
        confidence: 'HIGH',
      });
    }

    // 4. Class Methods
    if (node.type === 'ClassMethod') {
      const name = node.key ? node.key.name || node.key.value : 'method';
      const startLine = node.loc?.start?.line || 1;
      const endLine = node.loc?.end?.line || startLine;

      evidence.push({
        filePath,
        language: 'javascript',
        evidenceType: 'METHOD',
        identifier: name,
        startLine,
        endLine,
        codeSnippet: getExcerpt(lines, startLine, endLine),
        contextSummary: `Class method '${name}' (${node.kind || 'method'})`,
        analysisMethod: 'AST',
        confidence: 'HIGH',
      });
    }

    // 5. Next.js App Router HTTP Route Handlers (export async function GET / POST ...)
    if (node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'FunctionDeclaration') {
      const funcName = node.declaration.id?.name;
      const httpMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
      if (httpMethods.includes(funcName)) {
        const startLine = node.loc?.start?.line || 1;
        const endLine = node.declaration.loc?.end?.line || startLine;

        evidence.push({
          filePath,
          language: 'javascript',
          evidenceType: 'API_ENDPOINT',
          identifier: `${funcName} Route Handler`,
          startLine,
          endLine,
          codeSnippet: getExcerpt(lines, startLine, endLine),
          contextSummary: `Next.js App Router HTTP ${funcName} route handler`,
          analysisMethod: 'AST',
          confidence: 'HIGH',
        });
      }
    }

    // 6. CallExpressions: Express endpoints, DB calls, Auth, Validation, Test suites
    if (node.type === 'CallExpression') {
      const startLine = node.loc?.start?.line || 1;
      const endLine = node.loc?.end?.line || startLine;

      // Direct identifier calls: describe(), it(), test()
      if (node.callee.type === 'Identifier') {
        const calleeName = node.callee.name;

        // Test references
        if (['describe', 'it', 'test'].includes(calleeName)) {
          let testTitle = '';
          if (node.arguments[0]?.type === 'StringLiteral') {
            testTitle = node.arguments[0].value;
          }
          evidence.push({
            filePath,
            language: 'javascript',
            evidenceType: 'TEST_REFERENCE',
            identifier: `${calleeName}: "${testTitle.slice(0, 60)}"`,
            startLine,
            endLine: Math.min(startLine + 3, endLine),
            codeSnippet: getExcerpt(lines, startLine, Math.min(startLine + 3, endLine)),
            contextSummary: `Test specification (${calleeName})`,
            analysisMethod: 'AST',
            confidence: 'HIGH',
          });
        }
      }

      // MemberExpression calls: app.get(), db.query(), bcrypt.hash()
      if (node.callee.type === 'MemberExpression') {
        const propName = node.callee.property?.name?.toLowerCase();
        let objName = '';
        if (node.callee.object.type === 'Identifier') {
          objName = node.callee.object.name.toLowerCase();
        } else if (node.callee.object.type === 'MemberExpression' && node.callee.object.property?.name) {
          objName = node.callee.object.property.name.toLowerCase();
        }

        // Express / Fastify / HTTP Routes
        if (
          ['get', 'post', 'put', 'delete', 'patch'].includes(propName) &&
          ['app', 'router', 'server', 'api', 'route'].includes(objName)
        ) {
          let routePath = '/';
          if (node.arguments[0]?.type === 'StringLiteral') {
            routePath = node.arguments[0].value;
          }
          evidence.push({
            filePath,
            language: 'javascript',
            evidenceType: 'API_ENDPOINT',
            identifier: `${propName.toUpperCase()} ${routePath}`,
            startLine,
            endLine: Math.min(startLine + 3, endLine),
            codeSnippet: getExcerpt(lines, startLine, Math.min(startLine + 3, endLine)),
            contextSummary: `HTTP Endpoint route ${propName.toUpperCase()} "${routePath}" via ${objName}`,
            analysisMethod: 'AST',
            confidence: 'HIGH',
          });
        }

        // Database operations
        else if (
          ['query', 'execute', 'find', 'findone', 'findbyid', 'create', 'updateone', 'deleteone', 'save'].includes(
            propName
          ) &&
          ['db', 'client', 'pool', 'prisma', 'connection', 'knex', 'sequelize', 'model', 'database'].some((k) =>
            objName.includes(k)
          )
        ) {
          evidence.push({
            filePath,
            language: 'javascript',
            evidenceType: 'DATABASE_OPERATION',
            identifier: `${objName}.${node.callee.property?.name}()`,
            startLine,
            endLine: Math.min(startLine + 2, endLine),
            codeSnippet: getExcerpt(lines, startLine, Math.min(startLine + 2, endLine)),
            contextSummary: `Database operation: ${objName}.${node.callee.property?.name}()`,
            analysisMethod: 'AST',
            confidence: 'HIGH',
          });
        }

        // Authentication indicators
        else if (
          ['hash', 'compare', 'sign', 'verify', 'authenticate', 'login'].includes(propName) &&
          ['bcrypt', 'jwt', 'passport', 'argon2', 'crypto', 'auth', 'session'].some((k) =>
            objName.includes(k)
          )
        ) {
          evidence.push({
            filePath,
            language: 'javascript',
            evidenceType: 'AUTHENTICATION_INDICATOR',
            identifier: `${objName}.${node.callee.property?.name}()`,
            startLine,
            endLine: Math.min(startLine + 2, endLine),
            codeSnippet: getExcerpt(lines, startLine, Math.min(startLine + 2, endLine)),
            contextSummary: `Authentication / cryptographic security call: ${objName}.${node.callee.property?.name}()`,
            analysisMethod: 'AST',
            confidence: 'HIGH',
          });
        }

        // Validation indicators
        else if (
          ['validate', 'object', 'string', 'number', 'array', 'isemail', 'check', 'body'].includes(propName) &&
          ['z', 'joi', 'yup', 'validator', 'schema'].some((k) => objName === k || objName.includes('validator'))
        ) {
          evidence.push({
            filePath,
            language: 'javascript',
            evidenceType: 'VALIDATION_INDICATOR',
            identifier: `${objName}.${node.callee.property?.name}()`,
            startLine,
            endLine: Math.min(startLine + 2, endLine),
            codeSnippet: getExcerpt(lines, startLine, Math.min(startLine + 2, endLine)),
            contextSummary: `Data validation schema / rule: ${objName}.${node.callee.property?.name}()`,
            analysisMethod: 'AST',
            confidence: 'HIGH',
          });
        }
      }
    }

    // Traverse child nodes
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'comments' || key === 'tokens') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          walk(item, node);
        }
      } else if (child && typeof child === 'object') {
        walk(child, node);
      }
    }
  }

  walk(ast.program, null);

  return evidence;
}

